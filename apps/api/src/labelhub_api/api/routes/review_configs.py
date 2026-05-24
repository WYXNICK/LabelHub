from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from labelhub_api.api.deps import get_current_user
from labelhub_api.api.routes._stage1_contract import raise_contract_only
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.review_configs import (
    PublishReviewConfigVersionRequest,
    ReviewConfigDraftVO,
    ReviewConfigVersionVO,
    SaveReviewConfigDraftRequest,
)

router = APIRouter(prefix="/api/tasks/{taskId}", tags=["stage1-review-configs"])


@router.get(
    "/review-config-draft",
    response_model=ReviewConfigDraftVO,
    response_model_by_alias=True,
)
def get_review_config_draft(
    taskId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
) -> ReviewConfigDraftVO:
    raise_contract_only(request, "审核配置草稿查询")


@router.put(
    "/review-config-draft",
    response_model=ReviewConfigDraftVO,
    response_model_by_alias=True,
)
def save_review_config_draft(
    taskId: str,
    request: Request,
    body: SaveReviewConfigDraftRequest,
    user: UserVO = Depends(get_current_user),
) -> ReviewConfigDraftVO:
    raise_contract_only(request, "审核配置草稿保存")


@router.post(
    "/review-config-versions",
    response_model=ReviewConfigVersionVO,
    response_model_by_alias=True,
    status_code=201,
)
def publish_review_config_version(
    taskId: str,
    request: Request,
    body: PublishReviewConfigVersionRequest,
    user: UserVO = Depends(get_current_user),
) -> ReviewConfigVersionVO:
    raise_contract_only(request, "审核配置版本发布")


@router.get(
    "/review-config-versions",
    response_model=PageVO[ReviewConfigVersionVO],
    response_model_by_alias=True,
)
def list_review_config_versions(
    taskId: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
) -> PageVO[ReviewConfigVersionVO]:
    raise_contract_only(request, "审核配置版本列表")
