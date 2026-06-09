from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.review_configs import (
    PublishReviewConfigVersionRequest,
    ReviewConfigDraftVO,
    ReviewConfigVersionVO,
    SaveReviewConfigDraftRequest,
)
from labelhub_api.services.review_config_service import ReviewConfigService

router = APIRouter(prefix="/api/tasks/{taskId}", tags=["review-configs"])


@router.get(
    "/review-config-draft",
    response_model=ReviewConfigDraftVO,
    response_model_by_alias=True,
)
def get_review_config_draft(
    taskId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewConfigDraftVO:
    return ReviewConfigService(db).get_draft(task_id=taskId, user=user)


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
    db: Session = Depends(get_db_session),
) -> ReviewConfigDraftVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return ReviewConfigService(db).save_draft(
        task_id=taskId,
        user=user,
        request_id=request_id,
        body=body,
    )


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
    db: Session = Depends(get_db_session),
) -> ReviewConfigVersionVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return ReviewConfigService(db).publish_version(
        task_id=taskId,
        user=user,
        request_id=request_id,
        body=body,
    )


@router.get(
    "/review-config-versions",
    response_model=PageVO[ReviewConfigVersionVO],
    response_model_by_alias=True,
)
def list_review_config_versions(
    taskId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ReviewConfigVersionVO]:
    return ReviewConfigService(db).list_versions(
        task_id=taskId,
        user=user,
        page=page,
        page_size=page_size,
    )
