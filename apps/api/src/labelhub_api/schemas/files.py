from __future__ import annotations

from datetime import datetime

from pydantic import Field

from labelhub_api.core.enums import FilePurpose
from labelhub_api.schemas.common import CamelModel


class CreateFileObjectRequest(CamelModel):
    bucket: str = Field(min_length=1, max_length=120)
    object_key: str = Field(min_length=1, max_length=512)
    file_name: str = Field(min_length=1, max_length=255)
    mime_type: str | None = Field(default=None, max_length=120)
    size_bytes: int = Field(ge=0)
    checksum: str | None = Field(default=None, max_length=128)
    purpose: FilePurpose
    content_text: str | None = None
    content_base64: str | None = None


class FileObjectVO(CamelModel):
    id: str
    bucket: str
    object_key: str
    file_name: str
    mime_type: str | None
    size_bytes: int
    checksum: str | None
    purpose: FilePurpose
    download_url: str
    preview_url: str | None
    is_image: bool
    created_by: str
    created_at: datetime
