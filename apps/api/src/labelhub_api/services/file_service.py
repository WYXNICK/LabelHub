from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from labelhub_api.core.enums import FilePurpose
from labelhub_api.core.errors import ApiException
from labelhub_api.models.file import FileObjectEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.files import CreateFileObjectRequest, FileObjectVO


MAX_EVIDENCE_FILE_SIZE_BYTES = 100 * 1024 * 1024


class FileService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._upload_root = Path.cwd() / "tmp" / "uploads"

    def create_file_object(
        self,
        *,
        user: UserVO,
        request: CreateFileObjectRequest,
        request_id: str,
    ) -> FileObjectVO:
        content = self._decode_upload_content(request, request_id)
        if content is not None and len(content) != request.size_bytes:
            raise ApiException(
                status_code=422,
                code="FILE_SIZE_MISMATCH",
                message="文件大小与上传内容不一致，请重新选择文件。",
                request_id=request_id,
            )
        if request.purpose == FilePurpose.EVIDENCE and request.size_bytes > MAX_EVIDENCE_FILE_SIZE_BYTES:
            raise ApiException(
                status_code=422,
                code="FILE_TOO_LARGE",
                message="证据文件不能超过 100 MB。",
                request_id=request_id,
            )

        file_object = FileObjectEntity(
            id=self._new_id("file"),
            bucket=request.bucket,
            object_key=request.object_key,
            file_name=request.file_name,
            mime_type=request.mime_type,
            size_bytes=request.size_bytes,
            checksum=request.checksum,
            purpose=request.purpose.value,
            created_by=user.id,
            created_at=datetime.now(UTC),
        )
        self._db.add(file_object)
        if content is not None:
            self.write_file_bytes(file_object, content, request_id=request_id)
        self._db.commit()
        self._db.refresh(file_object)
        return self.to_file_vo(file_object)

    def get_file_object(self, file_id: str, *, request_id: str) -> FileObjectEntity:
        file_object = self._db.get(FileObjectEntity, file_id)
        if file_object is None:
            raise ApiException(
                status_code=404,
                code="FILE_NOT_FOUND",
                message="文件不存在或已被删除。",
                request_id=request_id,
            )
        return file_object

    def get_file_vo(self, file_id: str, *, request_id: str) -> FileObjectVO:
        return self.to_file_vo(self.get_file_object(file_id, request_id=request_id))

    def read_file_bytes(self, file_object: FileObjectEntity, *, request_id: str) -> bytes:
        path = self._resolve_upload_path(file_object.bucket, file_object.object_key, request_id)
        if not path.exists():
            raise ApiException(
                status_code=422,
                code="FILE_CONTENT_NOT_FOUND",
                message="导入文件内容不存在，请重新上传文件后再导入。",
                request_id=request_id,
            )
        return path.read_bytes()

    def create_generated_file_object(
        self,
        *,
        bucket: str,
        object_key: str,
        file_name: str,
        mime_type: str,
        content: bytes,
        checksum: str,
        purpose: FilePurpose,
        created_by: str,
        request_id: str,
    ) -> FileObjectEntity:
        file_object = FileObjectEntity(
            id=self._new_id("file"),
            bucket=bucket,
            object_key=object_key,
            file_name=file_name,
            mime_type=mime_type,
            size_bytes=len(content),
            checksum=checksum,
            purpose=purpose.value,
            created_by=created_by,
            created_at=datetime.now(UTC),
        )
        self._db.add(file_object)
        self.write_file_bytes(file_object, content, request_id=request_id)
        # 先落库文件对象，后续任务表回填 file_object_id 时 MySQL 外键才能立即通过。
        self._db.flush()
        return file_object

    def write_file_bytes(self, file_object: FileObjectEntity, content: bytes, *, request_id: str) -> Path:
        path = self._resolve_upload_path(file_object.bucket, file_object.object_key, request_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def get_local_path(self, file_object: FileObjectEntity, *, request_id: str) -> Path:
        return self._resolve_upload_path(file_object.bucket, file_object.object_key, request_id)

    def to_file_vo(self, file_object: FileObjectEntity) -> FileObjectVO:
        download_url = f"/api/files/{file_object.id}/download"
        is_image = self._is_image_mime(file_object.mime_type)
        return FileObjectVO(
            id=file_object.id,
            bucket=file_object.bucket,
            object_key=file_object.object_key,
            file_name=file_object.file_name,
            mime_type=file_object.mime_type,
            size_bytes=file_object.size_bytes,
            checksum=file_object.checksum,
            purpose=file_object.purpose,
            download_url=download_url,
            preview_url=f"{download_url}?inline=true" if is_image else None,
            is_image=is_image,
            created_by=file_object.created_by,
            created_at=file_object.created_at,
        )

    def _decode_upload_content(
        self,
        request: CreateFileObjectRequest,
        request_id: str,
    ) -> bytes | None:
        if request.content_text is not None and request.content_base64 is not None:
            raise ApiException(
                status_code=422,
                code="FILE_CONTENT_CONFLICT",
                message="contentText 与 contentBase64 只能提供一个。",
                request_id=request_id,
            )
        if request.content_text is not None:
            return request.content_text.encode("utf-8")
        if request.content_base64 is not None:
            try:
                return base64.b64decode(request.content_base64, validate=True)
            except (ValueError, binascii.Error) as exc:
                raise ApiException(
                    status_code=422,
                    code="INVALID_BASE64_CONTENT",
                    message="文件内容不是合法的 base64 字符串。",
                    request_id=request_id,
                ) from exc
        return None

    def _resolve_upload_path(self, bucket: str, object_key: str, request_id: str) -> Path:
        candidate = (self._upload_root / bucket / object_key).resolve()
        root = self._upload_root.resolve()
        if root != candidate and root not in candidate.parents:
            raise ApiException(
                status_code=422,
                code="INVALID_OBJECT_KEY",
                message="文件路径不合法。",
                request_id=request_id,
            )
        return candidate

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"

    def _is_image_mime(self, mime_type: str | None) -> bool:
        return bool(mime_type and mime_type.lower().startswith("image/"))
