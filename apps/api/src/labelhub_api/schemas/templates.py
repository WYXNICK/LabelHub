from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from labelhub_api.core.enums import TemplateComponentType, TemplateVersionStatus
from labelhub_api.schemas.common import CamelModel


class TemplateComponentDTO(CamelModel):
    id: str = Field(min_length=1, max_length=64)
    type: TemplateComponentType
    field_key: str | None = Field(default=None, max_length=128)
    label: str = Field(min_length=1, max_length=120)
    props: dict[str, Any] = Field(default_factory=dict)
    validation: dict[str, Any] = Field(default_factory=dict)
    visibility: dict[str, Any] = Field(default_factory=dict)


class TemplateSchemaVO(CamelModel):
    schema_version: str = Field(default="labelhub-template/v1", min_length=1, max_length=64)
    components: list[TemplateComponentDTO] = Field(default_factory=list)
    layout: dict[str, Any] = Field(default_factory=lambda: {"root": []})
    llm_actions: list[dict[str, Any]] = Field(default_factory=list)
    show_items: list[dict[str, Any]] = Field(default_factory=list)


class TemplateSchemaValidationErrorVO(CamelModel):
    field: str
    message: str


class TemplateSchemaValidationVO(CamelModel):
    valid: bool
    errors: list[TemplateSchemaValidationErrorVO] = Field(default_factory=list)


class TemplateDraftVO(CamelModel):
    id: str
    task_id: str
    template_schema: TemplateSchemaVO = Field(alias="schema")
    updated_by: str
    created_at: datetime
    updated_at: datetime


class TemplateVersionVO(CamelModel):
    id: str
    task_id: str
    version_no: int
    template_schema: TemplateSchemaVO = Field(alias="schema")
    status: TemplateVersionStatus
    version_note: str | None
    published_by: str
    published_at: datetime
    created_at: datetime
    updated_at: datetime


class SaveTemplateDraftRequest(CamelModel):
    template_schema: TemplateSchemaVO = Field(alias="schema")


class ValidateTemplateSchemaRequest(CamelModel):
    template_schema: TemplateSchemaVO = Field(alias="schema")


class PublishTemplateVersionRequest(CamelModel):
    draft_id: str
    version_note: str | None = Field(default=None, max_length=500)
