from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import ReviewConfigVersionStatus
from labelhub_api.schemas.common import CamelModel


class ReviewDimensionDTO(CamelModel):
    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    max_score: int = Field(default=5, ge=1, le=100)
    weight: float = Field(default=1.0, gt=0, le=10)


class ReviewThresholdDTO(CamelModel):
    pass_min_score: float = Field(ge=0)
    return_below_score: float = Field(ge=0)
    human_review_min_score: float | None = Field(default=None, ge=0)


class ReviewConfigDraftVO(CamelModel):
    id: str
    task_id: str
    prompt_template: str
    dimensions: list[ReviewDimensionDTO]
    thresholds: ReviewThresholdDTO
    output_schema: dict[str, Any]
    updated_by: str
    created_at: datetime
    updated_at: datetime


class ReviewConfigVersionVO(CamelModel):
    id: str
    task_id: str
    version_no: int
    prompt_template: str
    dimensions: list[ReviewDimensionDTO]
    thresholds: ReviewThresholdDTO
    output_schema: dict[str, Any]
    status: ReviewConfigVersionStatus
    published_by: str
    published_at: datetime
    created_at: datetime
    updated_at: datetime


class SaveReviewConfigDraftRequest(CamelModel):
    prompt_template: str = Field(min_length=1, max_length=8000)
    dimensions: list[ReviewDimensionDTO] = Field(min_length=1, max_length=20)
    thresholds: ReviewThresholdDTO
    output_schema: dict[str, Any] = Field(default_factory=dict)


class PublishReviewConfigVersionRequest(CamelModel):
    draft_id: str
    version_note: str | None = Field(default=None, max_length=500)
