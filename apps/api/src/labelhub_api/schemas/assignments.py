from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import AssignmentStatus, DistributionStrategy, SubmissionStatus
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
    review_feedback: dict[str, Any] | None = None
    navigation: AssignmentNavigationVO
