from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.core.errors import ApiException
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.files import CreateFileObjectRequest, FileObjectVO
from labelhub_api.services.file_service import FileService

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("", response_model=FileObjectVO, response_model_by_alias=True, status_code=201)
def create_file_object(
    request: Request,
    body: CreateFileObjectRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FileObjectVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return FileService(db).create_file_object(user=user, request=body, request_id=request_id)


@router.get("/{file_id}", response_model=FileObjectVO, response_model_by_alias=True)
def get_file_object(
    file_id: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FileObjectVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return FileService(db).get_file_vo(file_id, request_id=request_id)


@router.get("/{file_id}/download")
def download_file_object(
    file_id: str,
    request: Request,
    inline: bool = Query(False),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FileResponse:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    service = FileService(db)
    file_object = service.get_file_object(file_id, request_id=request_id)
    path = service.get_local_path(file_object, request_id=request_id)
    if not path.exists():
        raise ApiException(
            status_code=404,
            code="FILE_CONTENT_NOT_FOUND",
            message="文件内容不存在，请重新上传或重新生成。",
            request_id=request_id,
        )

    media_type = file_object.mime_type or "application/octet-stream"
    disposition = "inline" if inline and media_type.lower().startswith("image/") else "attachment"
    return FileResponse(
        path=path,
        media_type=media_type,
        filename=file_object.file_name,
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(file_object.file_name)}"},
    )
