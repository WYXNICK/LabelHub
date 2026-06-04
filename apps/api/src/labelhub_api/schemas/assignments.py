from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import AssignmentStatus, DistributionStrategy
from labelhub_api.schemas.common import CamelModel


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
