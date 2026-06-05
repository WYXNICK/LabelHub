from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.core.enums import AssignmentStatus, ContributionBucket
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.assignments import (
    AssignmentContextVO,
    AssignmentVO,
    ContributionItemVO,
    ContributionStatsVO,
    CreateAssignmentRequest,
    CreateSubmissionRequest,
    MarketplaceTaskVO,
    SaveAssignmentDraftRequest,
    SubmissionVO,
)
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.services.assignment_service import AssignmentService

marketplace_router = APIRouter(prefix="/api/marketplace", tags=["stage3-marketplace"])
task_assignment_router = APIRouter(prefix="/api/tasks", tags=["stage3-assignments"])
assignment_router = APIRouter(prefix="/api/assignments", tags=["stage3-assignments"])
me_router = APIRouter(prefix="/api/me", tags=["stage3-contributions"])


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


@assignment_router.get("", response_model=PageVO[AssignmentVO], response_model_by_alias=True)
def list_assignments(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: AssignmentStatus | None = Query(default=None),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[AssignmentVO]:
    return AssignmentService(db).list_assignments(
        user=user,
        page=page,
        page_size=page_size,
        status=status,
    )


@me_router.get("/contribution-stats", response_model=ContributionStatsVO, response_model_by_alias=True)
def get_contribution_stats(
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ContributionStatsVO:
    return AssignmentService(db).get_contribution_stats(user=user)


@me_router.get("/contributions", response_model=PageVO[ContributionItemVO], response_model_by_alias=True)
def list_contributions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    bucket: ContributionBucket = Query(default=ContributionBucket.ALL),
    keyword: str | None = Query(default=None, max_length=120),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ContributionItemVO]:
    return AssignmentService(db).list_contributions(
        user=user,
        page=page,
        page_size=page_size,
        bucket=bucket,
        keyword=keyword,
    )


@assignment_router.put(
    "/{assignmentId}/draft",
    response_model=AssignmentVO,
    response_model_by_alias=True,
)
def save_assignment_draft(
    assignmentId: str,
    body: SaveAssignmentDraftRequest,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> AssignmentVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return AssignmentService(db).save_assignment_draft(
        assignment_id=assignmentId,
        user=user,
        body=body,
        request_id=request_id,
    )


@assignment_router.post(
    "/{assignmentId}/submissions",
    response_model=SubmissionVO,
    response_model_by_alias=True,
    status_code=201,
)
def create_submission(
    assignmentId: str,
    body: CreateSubmissionRequest,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SubmissionVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return AssignmentService(db).create_submission(
        assignment_id=assignmentId,
        user=user,
        body=body,
        request_id=request_id,
    )


@assignment_router.get(
    "/{assignmentId}",
    response_model=AssignmentContextVO,
    response_model_by_alias=True,
)
def get_assignment_context(
    assignmentId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> AssignmentContextVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return AssignmentService(db).get_assignment_context(
        assignment_id=assignmentId,
        user=user,
        request_id=request_id,
    )
