from __future__ import annotations

import base64
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from labelhub_api.core.errors import ApiException
from labelhub_api.models.file import FileObjectEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.files import CreateFileObjectRequest, FileObjectVO


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
        if request.content_text is not None and request.content_base64 is not None:
            raise ApiException(
                status_code=422,
                code="FILE_CONTENT_CONFLICT",
                message="contentText 与 contentBase64 只能提供一个。",
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
        self._write_local_upload_if_present(file_object, request, request_id)
        self._db.commit()
        self._db.refresh(file_object)
        return self.to_file_vo(file_object)

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

    def to_file_vo(self, file_object: FileObjectEntity) -> FileObjectVO:
        return FileObjectVO(
            id=file_object.id,
            bucket=file_object.bucket,
            object_key=file_object.object_key,
            file_name=file_object.file_name,
            mime_type=file_object.mime_type,
            size_bytes=file_object.size_bytes,
            checksum=file_object.checksum,
            purpose=file_object.purpose,
            created_by=file_object.created_by,
            created_at=file_object.created_at,
        )

    def _write_local_upload_if_present(
        self,
        file_object: FileObjectEntity,
        request: CreateFileObjectRequest,
        request_id: str,
    ) -> None:
        content: bytes | None = None
        if request.content_text is not None:
            content = request.content_text.encode("utf-8")
        elif request.content_base64 is not None:
            try:
                content = base64.b64decode(request.content_base64, validate=True)
            except ValueError as exc:
                raise ApiException(
                    status_code=422,
                    code="INVALID_BASE64_CONTENT",
                    message="文件内容不是合法的 base64 字符串。",
                    request_id=request_id,
                ) from exc

        if content is None:
            return

        path = self._resolve_upload_path(file_object.bucket, file_object.object_key, request_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

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
