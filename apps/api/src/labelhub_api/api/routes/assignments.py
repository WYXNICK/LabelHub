from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.assignments import AssignmentVO, CreateAssignmentRequest, MarketplaceTaskVO
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.services.assignment_service import AssignmentService

marketplace_router = APIRouter(prefix="/api/marketplace", tags=["stage3-marketplace"])
task_assignment_router = APIRouter(prefix="/api/tasks", tags=["stage3-assignments"])


@marketplace_router.get("/tasks", response_model=PageVO[MarketplaceTaskVO], response_model_by_alias=True)
def list_marketplace_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    keyword: str | None = Query(default=None, max_length=120),
    tag: str | None = Query(default=None, max_length=64),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[MarketplaceTaskVO]:
    return AssignmentService(db).list_marketplace_tasks(
        user=user,
        page=page,
        page_size=page_size,
        keyword=keyword,
        tag=tag,
    )


@task_assignment_router.post(
    "/{taskId}/assignments",
    response_model=AssignmentVO,
    response_model_by_alias=True,
    status_code=201,
)
def claim_assignment(
    taskId: str,
    request: Request,
    body: CreateAssignmentRequest | None = None,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> AssignmentVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return AssignmentService(db).claim_assignment(
        task_id=taskId,
        user=user,
        request=body or CreateAssignmentRequest(),
        request_id=request_id,
    )
