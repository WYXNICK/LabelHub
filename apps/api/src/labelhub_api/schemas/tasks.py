from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import (
    DistributionStrategy,
    PublishBlockerCode,
    TaskStatus,
)
from labelhub_api.schemas.common import CamelModel


class TaskStatsVO(CamelModel):
    dataset_count: int = 0
    item_count: int = 0
    enabled_item_count: int = 0
    template_version_count: int = 0
    review_config_version_count: int = 0


class TaskSummaryVO(CamelModel):
    total_task_count: int = 0
    draft_task_count: int = 0
    published_task_count: int = 0
    paused_task_count: int = 0
    ended_task_count: int = 0
    total_quota: int = 0
    total_claimed_count: int = 0
    total_submitted_count: int = 0
    total_approved_count: int = 0
    ready_dataset_count: int = 0
    enabled_item_count: int = 0
    template_ready_task_count: int = 0
    review_config_ready_task_count: int = 0


class TaskVO(CamelModel):
    id: str
    title: str
    description: str | None
    tags: list[str]
    quota: int
    claimed_count: int
    submitted_count: int
    approved_count: int
    deadline_at: datetime | None
    distribution_strategy: DistributionStrategy
    status: TaskStatus
    current_template_version_id: str | None = None
    current_review_config_version_id: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime


class TaskDetailVO(TaskVO):
    instruction_rich_text: dict[str, Any] | None
    reward_rule: dict[str, Any] | None
    version: int
    stats: TaskStatsVO


class CreateTaskRequest(CamelModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    instruction_rich_text: dict[str, Any] | None = None
    tags: list[str] = Field(default_factory=list, max_length=20)
    reward_rule: dict[str, Any] | None = None
    quota: int = Field(gt=0, le=100_000)
    deadline_at: datetime | None = None
    distribution_strategy: DistributionStrategy = DistributionStrategy.FIRST_COME_FIRST_SERVED


class UpdateTaskRequest(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    instruction_rich_text: dict[str, Any] | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    reward_rule: dict[str, Any] | None = None
    quota: int | None = Field(default=None, gt=0, le=100_000)
    deadline_at: datetime | None = None
    distribution_strategy: DistributionStrategy | None = None
    version: int = Field(ge=0)


class TaskStateTransitionRequest(CamelModel):
    target_status: TaskStatus
    reason: str | None = Field(default=None, max_length=500)
    version: int = Field(ge=0)


class PublishBlockerVO(CamelModel):
    code: PublishBlockerCode
    message: str
    field: str | None = None


class PublishCheckVO(CamelModel):
    task_id: str
    can_publish: bool
    blockers: list[PublishBlockerVO]
    checked_at: datetime
