from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import ExportFieldSource, ExportFormat, ExportJobStatus
from labelhub_api.schemas.common import CamelModel


class ExportFieldOptionVO(CamelModel):
    source: ExportFieldSource
    path: str = Field(min_length=1, max_length=255)
    label: str = Field(min_length=1, max_length=120)
    sample_value: Any | None = None
    default_selected: bool = False


class ExportFieldOptionsVO(CamelModel):
    task_id: str
    task_title: str
    approved_count: int
    latest_approved_at: datetime | None = None
    options: list[ExportFieldOptionVO] = Field(default_factory=list)


class ExportFieldMappingDTO(CamelModel):
    source: ExportFieldSource
    path: str = Field(min_length=1, max_length=255)
    output_key: str = Field(min_length=1, max_length=120)
    label: str | None = Field(default=None, max_length=120)
    order: int = Field(ge=0)
    selected: bool = True


class CreateExportJobRequest(CamelModel):
    format: ExportFormat
    field_mappings: list[ExportFieldMappingDTO] = Field(min_length=1)
    include_review_records: bool = False
    include_audit_timeline: bool = False
    idempotency_key: str | None = Field(default=None, max_length=128)


class ExportJobVO(CamelModel):
    id: str
    task_id: str
    task_title: str
    format: ExportFormat
    status: ExportJobStatus
    total_rows: int
    exported_rows: int
    field_mappings: list[ExportFieldMappingDTO]
    include_review_records: bool
    include_audit_timeline: bool
    file_object_id: str | None = None
    file_name: str | None = None
    file_size_bytes: int | None = None
    error_message: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
