from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import (
    DatasetItemStatus,
    DatasetSourceFormat,
    DatasetStatus,
    DatasetType,
    ImportStatus,
)
from labelhub_api.schemas.common import CamelModel


class DatasetVO(CamelModel):
    id: str
    task_id: str
    name: str
    dataset_type: DatasetType
    source_format: DatasetSourceFormat
    item_count: int
    enabled_item_count: int
    disabled_item_count: int
    status: DatasetStatus
    created_by: str
    created_at: datetime
    updated_at: datetime


class MediaRefVO(CamelModel):
    kind: str
    url: str
    field_path: str | None = None


class DatasetItemVO(CamelModel):
    id: str
    dataset_id: str
    task_id: str
    external_item_id: str | None
    source_format: DatasetSourceFormat
    source_row_number: int | None
    payload: dict[str, Any]
    media_refs: list[MediaRefVO]
    checksum: str | None
    status: DatasetItemStatus
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class CreateImportJobRequest(CamelModel):
    dataset_name: str = Field(min_length=1, max_length=120)
    dataset_type: DatasetType = DatasetType.CUSTOM
    source_format: DatasetSourceFormat
    file_object_id: str
    idempotency_key: str | None = Field(default=None, max_length=128)


class ImportJobVO(CamelModel):
    id: str
    task_id: str
    dataset_id: str | None
    file_object_id: str
    source_format: DatasetSourceFormat
    status: ImportStatus
    success_count: int
    failed_count: int
    error_summary: dict[str, Any] | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class ImportErrorRowVO(CamelModel):
    id: str
    import_job_id: str
    task_id: str
    dataset_id: str | None
    source_row_number: int | None
    field_path: str | None
    error_code: str
    error_message: str
    raw_fragment: dict[str, Any] | None
    created_at: datetime


class BatchUpdateDatasetItemsRequest(CamelModel):
    item_ids: list[str] = Field(min_length=1, max_length=500)
    enabled: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    reason: str | None = Field(default=None, max_length=500)
    expected_version: int | None = Field(default=None, ge=0)


class BatchUpdateDatasetItemsVO(CamelModel):
    updated_count: int
    skipped_count: int
    audit_log_id: str | None
