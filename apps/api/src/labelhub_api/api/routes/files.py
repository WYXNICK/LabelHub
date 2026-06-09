from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
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
