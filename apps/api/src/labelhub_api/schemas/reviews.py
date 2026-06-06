from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import (
    AiReviewConclusion,
    HumanReviewDecision,
    ReviewJobStatus,
    ReviewStatus,
)
from labelhub_api.schemas.assignments import AssignmentVO, SubmissionVO
from labelhub_api.schemas.common import CamelModel
from labelhub_api.schemas.review_configs import ReviewConfigVersionVO
from labelhub_api.schemas.tasks import TaskVO
from labelhub_api.schemas.templates import TemplateSchemaVO


class ReviewJobVO(CamelModel):
    id: str
    task_id: str
    assignment_id: str
    submission_id: str
    review_config_version_id: str
    status: ReviewJobStatus
    attempt_count: int
    max_attempts: int
    idempotency_key: str
    last_error: str | None = None
    locked_by: str | None = None
    locked_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ClaimReviewJobRequest(CamelModel):
    worker_id: str = Field(default="labelhub-agent", min_length=1, max_length=120)


class AiReviewIssueDTO(CamelModel):
    field: str | None = Field(default=None, max_length=128)
    code: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)


class AiReviewResultDTO(CamelModel):
    conclusion: AiReviewConclusion
    scores: dict[str, int] = Field(default_factory=dict)
    summary: str = Field(min_length=1, max_length=4000)
    issues: list[AiReviewIssueDTO] = Field(default_factory=list, max_length=50)
    suggestions: str | None = Field(default=None, max_length=4000)
    raw_output: dict[str, Any] | None = None
    prompt_snapshot: str | None = Field(default=None, max_length=12000)


class CompleteReviewJobRequest(CamelModel):
    result: AiReviewResultDTO | None = None
    error_message: str | None = Field(default=None, max_length=2000)


class ClaimReviewJobResponse(CamelModel):
    job: ReviewJobVO | None = None
    submission: SubmissionVO | None = None
    assignment: AssignmentVO | None = None
    task: TaskVO | None = None
    dataset_item_payload: dict[str, Any] | None = None
    template_schema: TemplateSchemaVO | None = None
    review_config_version: ReviewConfigVersionVO | None = None


class ReviewVO(CamelModel):
    id: str
    task_id: str
    submission_id: str
    assignment_id: str
    review_job_id: str
    status: ReviewStatus
    ai_conclusion: AiReviewConclusion | None = None
    ai_scores: dict[str, int]
    ai_comment: str | None = None
    ai_issues: list[AiReviewIssueDTO]
    ai_suggestions: str | None = None
    human_conclusion: HumanReviewDecision | None = None
    reviewer_id: str | None = None
    human_comment: str | None = None
    dimension_comments: dict[str, str]
    review_round: int
    version: int
    created_at: datetime
    updated_at: datetime


class ReviewTimelineItemVO(CamelModel):
    actor_role: str
    action: str
    from_state: str | None = None
    to_state: str | None = None
    reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ReviewDetailVO(CamelModel):
    review: ReviewVO
    task: TaskVO
    assignment: AssignmentVO
    submission: SubmissionVO
    dataset_item_payload: dict[str, Any]
    template_schema: TemplateSchemaVO
    review_config_version: ReviewConfigVersionVO
    timeline: list[ReviewTimelineItemVO]


class CreateReviewDecisionRequest(CamelModel):
    decision: HumanReviewDecision
    reason: str | None = Field(default=None, max_length=2000)
    dimension_comments: dict[str, str] = Field(default_factory=dict)
    expected_version: int = Field(ge=0)


class BatchReviewDecisionRequest(CamelModel):
    review_ids: list[str] = Field(min_length=1, max_length=100)
    decision: HumanReviewDecision
    reason: str | None = Field(default=None, max_length=2000)
    expected_versions: dict[str, int] = Field(default_factory=dict)


class BatchReviewDecisionVO(CamelModel):
    succeeded_ids: list[str]
    failed: dict[str, str]


class AcceptanceStatsVO(CamelModel):
    task_id: str
    submitted_count: int
    pending_review_count: int
    approved_count: int
    returned_count: int
    ai_conclusion_distribution: dict[str, int]
    latest_reviewed_at: datetime | None = None
