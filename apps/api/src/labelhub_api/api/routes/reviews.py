from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user, get_request_id, get_system_user
from labelhub_api.core.enums import AiReviewConclusion, ReviewJobStatus, ReviewStatus
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.reviews import (
    ClaimReviewJobRequest,
    ClaimReviewJobResponse,
    CompleteReviewJobRequest,
    ReviewDetailVO,
    ReviewJobVO,
    ReviewVO,
)
from labelhub_api.services.review_service import ReviewService

review_job_router = APIRouter(prefix="/api/review-jobs", tags=["stage4-review-jobs"])
internal_review_job_router = APIRouter(prefix="/api/internal", tags=["stage4-internal-review-jobs"])
review_router = APIRouter(prefix="/api/reviews", tags=["stage4-reviews"])


@review_job_router.get("", response_model=PageVO[ReviewJobVO], response_model_by_alias=True)
def list_review_jobs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: ReviewJobStatus | None = Query(default=None),
    task_id: str | None = Query(default=None, alias="taskId"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ReviewJobVO]:
    return ReviewService(db).list_review_jobs(
        user=user,
        page=page,
        page_size=page_size,
        status=status,
        task_id=task_id,
    )


@internal_review_job_router.post("/review-jobs:claim", response_model=ClaimReviewJobResponse, response_model_by_alias=True)
def claim_review_job(
    body: ClaimReviewJobRequest | None = None,
    request_id: str = Depends(get_request_id),
    user: UserVO = Depends(get_system_user),
    db: Session = Depends(get_db_session),
) -> ClaimReviewJobResponse:
    payload = body or ClaimReviewJobRequest()
    return ReviewService(db).claim_review_job(
        user=user,
        worker_id=payload.worker_id,
        request_id=request_id,
    )


@internal_review_job_router.post("/review-jobs/{jobId}/results", response_model=ReviewJobVO, response_model_by_alias=True)
def complete_review_job(
    jobId: str,
    body: CompleteReviewJobRequest,
    request: Request,
    user: UserVO = Depends(get_system_user),
    db: Session = Depends(get_db_session),
) -> ReviewJobVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return ReviewService(db).complete_review_job(
        job_id=jobId,
        user=user,
        body=body,
        request_id=request_id,
    )


@review_router.get("", response_model=PageVO[ReviewVO], response_model_by_alias=True)
def list_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: ReviewStatus | None = Query(default=None),
    task_id: str | None = Query(default=None, alias="taskId"),
    ai_conclusion: AiReviewConclusion | None = Query(default=None, alias="aiConclusion"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ReviewVO]:
    return ReviewService(db).list_reviews(
        user=user,
        page=page,
        page_size=page_size,
        status=status,
        task_id=task_id,
        ai_conclusion=ai_conclusion,
    )


@review_router.get("/{reviewId}", response_model=ReviewDetailVO, response_model_by_alias=True)
def get_review_detail(
    reviewId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewDetailVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return ReviewService(db).get_review_detail(review_id=reviewId, user=user, request_id=request_id)
