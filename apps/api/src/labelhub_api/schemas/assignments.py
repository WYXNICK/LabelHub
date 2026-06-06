from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import (
    AssignmentStatus,
    ContributionBucket,
    DistributionStrategy,
    LlmActionRunStatus,
    SubmissionStatus,
)
from labelhub_api.schemas.common import CamelModel
from labelhub_api.schemas.tasks import TaskVO
from labelhub_api.schemas.templates import TemplateSchemaVO


class MarketplaceTaskVO(CamelModel):
    id: str
    title: str
    description: str | None
    tags: list[str]
    reward_rule: dict[str, Any] | None
    quota: int
    claimed_count: int
    submitted_count: int
    approved_count: int
    available_item_count: int
    claimed_by_me_count: int
    submitted_by_me_count: int
    active_assignment_id: str | None = None
    deadline_at: datetime | None
    distribution_strategy: DistributionStrategy
    current_template_version_id: str
    current_review_config_version_id: str
    updated_at: datetime


class CreateAssignmentRequest(CamelModel):
    idempotency_key: str | None = Field(default=None, max_length=128)


class SaveAssignmentDraftRequest(CamelModel):
    values: dict[str, Any] = Field(default_factory=dict)
    client_version: int = Field(ge=0)


class CreateSubmissionRequest(CamelModel):
    values: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=128)
    client_draft_version: int | None = Field(default=None, ge=0)


class RunLlmActionRequest(CamelModel):
    input_values: dict[str, Any] = Field(default_factory=dict)
    target_field_key: str | None = Field(default=None, max_length=128)
    idempotency_key: str | None = Field(default=None, max_length=128)


class AssignmentVO(CamelModel):
    id: str
    task_id: str
    dataset_item_id: str
    template_version_id: str
    review_config_version_id: str
    labeler_id: str
    status: AssignmentStatus
    draft_values: dict[str, Any] | None = None
    draft_saved_at: datetime | None = None
    current_submission_id: str | None = None
    claimed_at: datetime
    submitted_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class SubmissionVO(CamelModel):
    id: str
    assignment_id: str
    task_id: str
    dataset_item_id: str
    labeler_id: str
    template_version_id: str
    submission_version: int
    values: dict[str, Any]
    status: SubmissionStatus
    idempotency_key: str | None = None
    submitted_at: datetime
    created_at: datetime
    updated_at: datetime


class LlmActionRunVO(CamelModel):
    id: str
    assignment_id: str
    task_id: str
    component_id: str
    status: LlmActionRunStatus
    input_values: dict[str, Any]
    output_value: Any | None = None
    output_values: dict[str, Any] | None = None
    error_message: str | None = None
    idempotency_key: str | None = None
    created_at: datetime


class ReviewFeedbackVO(CamelModel):
    reason: str
    source: str
    reviewer_id: str | None = None
    reviewer_role: str | None = None
    returned_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContributionStatsVO(CamelModel):
    total_assignments: int
    draft_count: int
    in_review_count: int
    submitted_count: int
    approved_count: int
    returned_count: int
    revision_required_count: int
    total_submission_count: int
    pass_rate: float
    latest_updated_at: datetime | None = None


class ContributionItemVO(CamelModel):
    assignment_id: str
    task_id: str
    task_title: str
    task_description: str | None = None
    dataset_item_id: str
    dataset_item_preview: str
    status: AssignmentStatus
    latest_submission_id: str | None = None
    latest_submission_version: int | None = None
    latest_submission_status: SubmissionStatus | None = None
    claimed_at: datetime
    draft_saved_at: datetime | None = None
    submitted_at: datetime | None = None
    updated_at: datetime
    can_continue: bool
    can_revise: bool
    review_feedback: ReviewFeedbackVO | None = None


class ListContributionsRequest(CamelModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    bucket: ContributionBucket = ContributionBucket.ALL
    keyword: str | None = Field(default=None, max_length=120)


class AssignmentNavigationVO(CamelModel):
    previous_assignment_id: str | None = None
    next_assignment_id: str | None = None
    current_index: int
    total_count: int
    can_claim_next: bool
    next_claimable_task_id: str | None = None


class AssignmentContextVO(CamelModel):
    assignment: AssignmentVO
    task: TaskVO
    dataset_item_payload: dict[str, Any]
    template_schema: TemplateSchemaVO
    latest_submission: SubmissionVO | None = None
    review_feedback: ReviewFeedbackVO | None = None
    navigation: AssignmentNavigationVO
