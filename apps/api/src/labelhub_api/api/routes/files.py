from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from labelhub_api.api.deps import get_current_user
from labelhub_api.api.routes._stage1_contract import raise_contract_only
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.files import CreateFileObjectRequest, FileObjectVO

router = APIRouter(prefix="/api/files", tags=["stage1-files"])


@router.post("", response_model=FileObjectVO, response_model_by_alias=True, status_code=201)
def create_file_object(
    request: Request,
    body: CreateFileObjectRequest,
    user: UserVO = Depends(get_current_user),
) -> FileObjectVO:
    raise_contract_only(request, "文件上传记录创建")
