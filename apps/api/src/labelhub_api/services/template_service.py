from __future__ import annotations

import re
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    TaskStatus,
    TemplateComponentType,
    TemplateVersionStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateDraftEntity, TemplateVersionEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.templates import (
    PublishTemplateVersionRequest,
    SaveTemplateDraftRequest,
    TemplateDraftVO,
    TemplateSchemaValidationErrorVO,
    TemplateSchemaValidationVO,
    TemplateSchemaVO,
    TemplateVersionVO,
    ValidateTemplateSchemaRequest,
)

COLLECTABLE_TYPES = {
    TemplateComponentType.TEXT_INPUT.value,
    TemplateComponentType.TEXTAREA.value,
    TemplateComponentType.RADIO.value,
    TemplateComponentType.CHECKBOX.value,
    TemplateComponentType.TAG_SELECT.value,
    TemplateComponentType.RICH_TEXT.value,
    TemplateComponentType.FILE_UPLOAD.value,
    TemplateComponentType.IMAGE_UPLOAD.value,
    TemplateComponentType.JSON_EDITOR.value,
}
CONTAINER_TYPES = {TemplateComponentType.GROUP.value, TemplateComponentType.TABS.value}
NON_FIELD_TYPES = {TemplateComponentType.SHOW_ITEM.value, TemplateComponentType.LLM_ACTION.value, *CONTAINER_TYPES}
SUPPORTED_SCHEMA_VERSION = "labelhub-template/v1"
RULE_LOGICS = {"ALL", "ANY"}
CONDITION_OPERATORS = {"EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "NOT_EMPTY", "EMPTY"}
CUSTOM_RULE_IDS = {"NO_EMOJI", "NO_URL", "TRIMMED_NON_EMPTY", "JSON_OBJECT"}


class TemplateService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_draft(self, *, task_id: str, user: UserVO) -> TemplateDraftVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        draft = self._get_draft_entity(task.id)
        if draft is None:
            draft = self._create_default_draft(task, user)
            self._db.commit()
            self._db.refresh(draft)
        return self._to_draft_vo(draft)

    def save_draft(
        self,
        *,
        task_id: str,
        user: UserVO,
        request_id: str,
        body: SaveTemplateDraftRequest,
    ) -> TemplateDraftVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_editable(task)
        validation = self._validate_request(body=ValidateTemplateSchemaRequest(schema=body.template_schema))
        if not validation.valid:
            raise ApiException(
                status_code=422,
                code="INVALID_TEMPLATE_SCHEMA",
                message="模板 schema 校验失败。",
                details={"errors": [error.model_dump(by_alias=True) for error in validation.errors]},
                request_id=request_id,
            )

        now = datetime.now(UTC)
        schema_json = self._dump_schema(body.template_schema)
        draft = self._get_draft_entity(task.id)
        if draft is None:
            draft = TemplateDraftEntity(
                id=self._new_id("template_draft"),
                task_id=task.id,
                schema_json=schema_json,
                updated_by=user.id,
                created_at=now,
                updated_at=now,
            )
            self._db.add(draft)
        else:
            draft.schema_json = schema_json
            draft.updated_by = user.id
            draft.updated_at = now

        self._append_audit(
            entity_id=draft.id,
            actor=user,
            action=AuditAction.TEMPLATE_SAVE,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "componentCount": len(body.template_schema.components),
                "schemaVersion": body.template_schema.schema_version,
            },
        )
        self._db.commit()
        self._db.refresh(draft)
        return self._to_draft_vo(draft)

    def validate_schema(self, *, body: ValidateTemplateSchemaRequest, user: UserVO) -> TemplateSchemaValidationVO:
        self._require_owner(user)
        return self._validate_request(body=body)

    def publish_version(
        self,
        *,
        task_id: str,
        user: UserVO,
        request_id: str,
        body: PublishTemplateVersionRequest,
    ) -> TemplateVersionVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_editable(task)
        draft = self._get_draft_entity(task.id)
        if draft is None or draft.id != body.draft_id:
            raise ApiException(
                status_code=404,
                code="NOT_FOUND",
                message="模板草稿不存在。",
                request_id=request_id,
            )

        schema = TemplateSchemaVO.model_validate(draft.schema_json)
        validation = self._validate_request(body=ValidateTemplateSchemaRequest(schema=schema))
        publish_errors = self._validate_publishable_schema(schema)
        if not validation.valid or publish_errors:
            errors = [*validation.errors, *publish_errors]
            raise ApiException(
                status_code=422,
                code="INVALID_TEMPLATE_SCHEMA",
                message="模板 schema 校验失败。",
                details={"errors": [error.model_dump(by_alias=True) for error in errors]},
                request_id=request_id,
            )

        now = datetime.now(UTC)
        next_version_no = (
            self._db.scalar(
                select(func.max(TemplateVersionEntity.version_no)).where(TemplateVersionEntity.task_id == task.id)
            )
            or 0
        ) + 1
        version_note = body.version_note.strip() if body.version_note else None
        version_note = version_note or None
        self._db.execute(
            update(TemplateVersionEntity)
            .where(
                TemplateVersionEntity.task_id == task.id,
                TemplateVersionEntity.status == TemplateVersionStatus.ACTIVE.value,
            )
            .values(status=TemplateVersionStatus.DISABLED.value, updated_at=now)
        )
        version = TemplateVersionEntity(
            id=self._new_id("template_version"),
            task_id=task.id,
            version_no=next_version_no,
            schema_json=self._dump_schema(schema),
            status=TemplateVersionStatus.ACTIVE.value,
            version_note=version_note,
            published_by=user.id,
            published_at=now,
            created_at=now,
            updated_at=now,
        )
        task.current_template_version_id = version.id
        task.version += 1
        task.updated_at = now
        self._db.add(version)
        self._append_audit(
            entity_id=version.id,
            actor=user,
            action=AuditAction.TEMPLATE_PUBLISH,
            request_id=request_id,
            reason=version_note,
            metadata={
                "taskId": task.id,
                "draftId": draft.id,
                "versionNo": next_version_no,
                "componentCount": len(schema.components),
                "fieldKeys": self._collect_field_keys(schema),
            },
        )
        self._db.commit()
        self._db.refresh(version)
        return self._to_version_vo(version)

    def list_versions(
        self,
        *,
        task_id: str,
        user: UserVO,
        page: int,
        page_size: int,
    ) -> PageVO[TemplateVersionVO]:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        query = select(TemplateVersionEntity).where(TemplateVersionEntity.task_id == task.id)
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        versions = list(
            self._db.scalars(
                query.order_by(TemplateVersionEntity.version_no.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_version_vo(version) for version in versions],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def get_version(self, *, template_version_id: str, user: UserVO) -> TemplateVersionVO:
        self._require_owner(user)
        version = self._db.get(TemplateVersionEntity, template_version_id)
        if version is None:
            raise ApiException(status_code=404, code="NOT_FOUND", message="模板版本不存在。")
        task = self._db.get(TaskEntity, version.task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="模板版本不存在。")
        return self._to_version_vo(version)

    def _validate_request(self, *, body: ValidateTemplateSchemaRequest) -> TemplateSchemaValidationVO:
        errors = self._validate_schema(body.template_schema)
        return TemplateSchemaValidationVO(valid=not errors, errors=errors)

    def _validate_schema(self, schema: TemplateSchemaVO) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        if schema.schema_version != SUPPORTED_SCHEMA_VERSION:
            errors.append(
                self._error(
                    "schemaVersion",
                    f"仅支持 {SUPPORTED_SCHEMA_VERSION}。",
                )
            )

        allowed_types = {component_type.value for component_type in TemplateComponentType}
        component_ids: set[str] = set()
        duplicate_component_ids: set[str] = set()
        field_keys: set[str] = set()
        duplicate_field_keys: set[str] = set()
        component_index_by_id: dict[str, int] = {}

        for index, component in enumerate(schema.components):
            field_prefix = f"components.{index}"
            component_id = component.id.strip()
            component_type = component.type.strip()
            field_key = component.field_key.strip() if component.field_key else None

            if component_id in component_ids:
                duplicate_component_ids.add(component_id)
            component_ids.add(component_id)
            component_index_by_id[component_id] = index

            if component_type not in allowed_types:
                errors.append(self._error(f"{field_prefix}.type", f"不支持的物料类型：{component_type}。"))
                continue

            if component_type in COLLECTABLE_TYPES and not field_key:
                errors.append(self._error(f"{field_prefix}.fieldKey", "采集类物料必须配置 fieldKey。"))
            if component_type in NON_FIELD_TYPES and field_key:
                errors.append(self._error(f"{field_prefix}.fieldKey", "展示、容器或动作类物料不应配置 fieldKey。"))
            if field_key:
                if field_key in field_keys:
                    duplicate_field_keys.add(field_key)
                field_keys.add(field_key)
            errors.extend(
                self._validate_component_properties(
                    field_prefix=field_prefix,
                    component_type=component_type,
                    props=component.props,
                    validation=component.validation,
                )
            )
            errors.extend(self._validate_visibility_rules(field_prefix, component.visibility))
            errors.extend(self._validate_validation_rules(field_prefix, component.validation))

        for component_id in sorted(duplicate_component_ids):
            errors.append(self._error("components", f"component.id 重复：{component_id}。"))
        for field_key in sorted(duplicate_field_keys):
            errors.append(self._error("components", f"fieldKey 重复：{field_key}。"))

        errors.extend(self._validate_llm_field_references(schema.components, field_keys))
        errors.extend(self._validate_rule_field_references(schema.components, field_keys))
        errors.extend(
            self._validate_layout(
                schema.layout,
                component_ids,
                {c.id: c.type for c in schema.components},
                {c.id: c.props for c in schema.components},
                component_index_by_id,
            )
        )
        return errors

    def _validate_publishable_schema(self, schema: TemplateSchemaVO) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        if not schema.components:
            errors.append(self._error("components", "发布模板至少需要 1 个物料。"))
        if not schema.layout.get("root"):
            errors.append(self._error("layout.root", "发布模板布局不能为空。"))
        if not self._collect_field_keys(schema):
            errors.append(self._error("components", "发布模板至少需要 1 个可提交字段。"))
        return errors

    def _validate_component_properties(
        self,
        *,
        field_prefix: str,
        component_type: str,
        props: dict[str, Any],
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        # Designer 保存的是后续 Renderer 的唯一契约，这里把基础物料的语义错误提前拦住。
        errors: list[TemplateSchemaValidationErrorVO] = []
        if component_type == TemplateComponentType.SHOW_ITEM.value:
            path = props.get("path")
            if path is not None and path != "" and (not isinstance(path, str) or not path.startswith("$")):
                errors.append(self._error(f"{field_prefix}.props.path", "ShowItem path 必须为空或以 $ 开头。"))
            return errors

        if component_type in {TemplateComponentType.TEXT_INPUT.value, TemplateComponentType.TEXTAREA.value}:
            errors.extend(self._validate_text_component(field_prefix, component_type, props, validation))
            return errors

        if component_type == TemplateComponentType.RICH_TEXT.value:
            errors.extend(self._validate_text_component(field_prefix, component_type, props, validation))
            toolbar_preset = props.get("toolbarPreset")
            if toolbar_preset is not None and not isinstance(toolbar_preset, str):
                errors.append(self._error(f"{field_prefix}.props.toolbarPreset", "toolbarPreset 必须是字符串。"))
            return errors

        if component_type in {TemplateComponentType.FILE_UPLOAD.value, TemplateComponentType.IMAGE_UPLOAD.value}:
            errors.extend(self._validate_upload_component(field_prefix, component_type, props, validation))
            return errors

        if component_type == TemplateComponentType.JSON_EDITOR.value:
            errors.extend(self._validate_json_editor_component(field_prefix, props, validation))
            return errors

        if component_type == TemplateComponentType.LLM_ACTION.value:
            errors.extend(self._validate_llm_action_component(field_prefix, props))
            return errors

        if component_type == TemplateComponentType.GROUP.value:
            errors.extend(self._validate_group_component(field_prefix, props))
            return errors

        if component_type == TemplateComponentType.TABS.value:
            errors.extend(self._validate_tabs_component(field_prefix, props))
            return errors

        if component_type in {
            TemplateComponentType.RADIO.value,
            TemplateComponentType.CHECKBOX.value,
            TemplateComponentType.TAG_SELECT.value,
        }:
            errors.extend(self._validate_option_component(field_prefix, component_type, props, validation))
        return errors

    def _validate_group_component(
        self,
        field_prefix: str,
        props: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        description = props.get("description")
        if description is not None and not isinstance(description, str):
            errors.append(self._error(f"{field_prefix}.props.description", "description 必须是字符串。"))
        elif isinstance(description, str) and len(description) > 500:
            errors.append(self._error(f"{field_prefix}.props.description", "description 不能超过 500 字符。"))

        collapsible = props.get("collapsible")
        if collapsible is not None and not isinstance(collapsible, bool):
            errors.append(self._error(f"{field_prefix}.props.collapsible", "collapsible 必须是布尔值。"))
        return errors

    def _validate_tabs_component(
        self,
        field_prefix: str,
        props: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        default_tab_id = props.get("defaultTabId")
        if default_tab_id is not None and not isinstance(default_tab_id, str):
            return [self._error(f"{field_prefix}.props.defaultTabId", "defaultTabId 必须是字符串。")]
        if isinstance(default_tab_id, str) and len(default_tab_id) > 64:
            return [self._error(f"{field_prefix}.props.defaultTabId", "defaultTabId 不能超过 64 字符。")]
        return []

    def _validate_visibility_rules(
        self,
        field_prefix: str,
        visibility: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        return self._validate_rule_set_shape(f"{field_prefix}.visibility", visibility)

    def _validate_validation_rules(
        self,
        field_prefix: str,
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        pattern = validation.get("pattern")
        if pattern is not None:
            if not isinstance(pattern, str):
                errors.append(self._error(f"{field_prefix}.validation.pattern", "pattern 必须是字符串。"))
            else:
                try:
                    re.compile(pattern)
                except re.error:
                    errors.append(self._error(f"{field_prefix}.validation.pattern", "pattern 不是合法正则。"))

        pattern_message = validation.get("patternMessage")
        if pattern_message is not None and not isinstance(pattern_message, str):
            errors.append(self._error(f"{field_prefix}.validation.patternMessage", "patternMessage 必须是字符串。"))

        custom_rule_ids = validation.get("customRuleIds")
        if custom_rule_ids is not None:
            if not isinstance(custom_rule_ids, list):
                errors.append(self._error(f"{field_prefix}.validation.customRuleIds", "customRuleIds 必须是字符串数组。"))
            else:
                for index, rule_id in enumerate(custom_rule_ids):
                    if not isinstance(rule_id, str) or rule_id not in CUSTOM_RULE_IDS:
                        errors.append(
                            self._error(
                                f"{field_prefix}.validation.customRuleIds.{index}",
                                f"customRuleId 不在白名单：{rule_id}。",
                            )
                        )

        required_when = validation.get("requiredWhen")
        if required_when is not None:
            if not isinstance(required_when, dict):
                errors.append(self._error(f"{field_prefix}.validation.requiredWhen", "requiredWhen 必须是对象。"))
            else:
                errors.extend(self._validate_rule_set_shape(f"{field_prefix}.validation.requiredWhen", required_when))
                message = required_when.get("message")
                if message is not None and not isinstance(message, str):
                    errors.append(self._error(f"{field_prefix}.validation.requiredWhen.message", "message 必须是字符串。"))
        return errors

    def _validate_rule_set_shape(
        self,
        field_prefix: str,
        rule_set: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        logic = rule_set.get("logic")
        if logic is not None and logic not in RULE_LOGICS:
            errors.append(self._error(f"{field_prefix}.logic", "logic 只能是 ALL 或 ANY。"))

        conditions = rule_set.get("conditions")
        if conditions is None:
            return errors
        if not isinstance(conditions, list):
            return [self._error(f"{field_prefix}.conditions", "conditions 必须是数组。")]

        for index, condition in enumerate(conditions):
            condition_prefix = f"{field_prefix}.conditions.{index}"
            if not isinstance(condition, dict):
                errors.append(self._error(condition_prefix, "condition 必须是对象。"))
                continue

            field_key = condition.get("fieldKey")
            if not isinstance(field_key, str) or not field_key.strip():
                errors.append(self._error(f"{condition_prefix}.fieldKey", "fieldKey 不能为空。"))

            operator = condition.get("operator")
            if operator not in CONDITION_OPERATORS:
                errors.append(self._error(f"{condition_prefix}.operator", "operator 不在支持范围内。"))

            value = condition.get("value")
            if operator in {"IN", "NOT_IN"}:
                if not isinstance(value, list) or not value or not all(isinstance(item, str) for item in value):
                    errors.append(self._error(f"{condition_prefix}.value", "IN/NOT_IN 的 value 必须是非空字符串数组。"))
            elif operator in {"EQUALS", "NOT_EQUALS"} and not isinstance(value, (str, int, float, bool, type(None))):
                errors.append(self._error(f"{condition_prefix}.value", "EQUALS/NOT_EQUALS 的 value 类型不合法。"))
        return errors

    def _validate_text_component(
        self,
        field_prefix: str,
        component_type: str,
        props: dict[str, Any],
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        for prop_key in ("placeholder", "defaultValue"):
            prop_value = props.get(prop_key)
            if prop_value is not None and not isinstance(prop_value, str):
                errors.append(self._error(f"{field_prefix}.props.{prop_key}", f"{prop_key} 必须是字符串。"))
        errors.extend(self._validate_required_and_max_length(field_prefix, component_type, validation))
        return errors

    def _validate_option_component(
        self,
        field_prefix: str,
        component_type: str,
        props: dict[str, Any],
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        option_values, option_errors = self._validate_options(field_prefix, props)
        errors.extend(option_errors)
        errors.extend(self._validate_required_and_max_length(field_prefix, component_type, validation))
        default_value = props.get("defaultValue")
        if component_type == TemplateComponentType.RADIO.value:
            if default_value not in (None, ""):
                if not isinstance(default_value, str):
                    errors.append(self._error(f"{field_prefix}.props.defaultValue", "单选默认值必须是字符串。"))
                elif default_value not in option_values:
                    errors.append(self._error(f"{field_prefix}.props.defaultValue", "单选默认值必须来自 options。"))
            return errors

        if default_value in (None, ""):
            return errors
        if not isinstance(default_value, list):
            errors.append(self._error(f"{field_prefix}.props.defaultValue", "多选默认值必须是字符串数组。"))
            return errors
        for index, item in enumerate(default_value):
            if not isinstance(item, str):
                errors.append(self._error(f"{field_prefix}.props.defaultValue.{index}", "多选默认值必须是字符串数组。"))
            elif item not in option_values:
                errors.append(self._error(f"{field_prefix}.props.defaultValue.{index}", "多选默认值必须来自 options。"))
        return errors

    def _validate_required_and_max_length(
        self,
        field_prefix: str,
        component_type: str,
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        required = validation.get("required")
        if required is not None and not isinstance(required, bool):
            errors.append(self._error(f"{field_prefix}.validation.required", "required 必须是布尔值。"))

        max_length = validation.get("maxLength")
        if max_length is None:
            return errors
        if component_type == TemplateComponentType.RICH_TEXT.value:
            max_allowed = 10000
        elif component_type == TemplateComponentType.TEXTAREA.value:
            max_allowed = 5000
        else:
            max_allowed = 500
        if not isinstance(max_length, int) or isinstance(max_length, bool):
            errors.append(self._error(f"{field_prefix}.validation.maxLength", "maxLength 必须是整数。"))
        elif max_length < 1 or max_length > max_allowed:
            errors.append(self._error(f"{field_prefix}.validation.maxLength", f"maxLength 必须在 1-{max_allowed} 之间。"))
        return errors

    def _validate_required_only(
        self,
        field_prefix: str,
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        required = validation.get("required")
        if required is not None and not isinstance(required, bool):
            return [self._error(f"{field_prefix}.validation.required", "required 必须是布尔值。")]
        return []

    def _validate_upload_component(
        self,
        field_prefix: str,
        component_type: str,
        props: dict[str, Any],
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors = self._validate_required_only(field_prefix, validation)
        errors.extend(self._validate_upload_accept(field_prefix, component_type, props))
        errors.extend(self._validate_bounded_int_prop(field_prefix, props, "maxFiles", 1, 20))
        errors.extend(self._validate_bounded_int_prop(field_prefix, props, "maxSizeMb", 1, 100))

        default_value = props.get("defaultValue")
        if default_value is not None and default_value != "":
            if not isinstance(default_value, list):
                errors.append(self._error(f"{field_prefix}.props.defaultValue", "上传默认值必须是字符串数组。"))
            else:
                for index, item in enumerate(default_value):
                    if not isinstance(item, str):
                        errors.append(self._error(f"{field_prefix}.props.defaultValue.{index}", "上传默认值必须是字符串数组。"))
        return errors

    def _validate_upload_accept(
        self,
        field_prefix: str,
        component_type: str,
        props: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        raw_accept = props.get("accept")
        if raw_accept in (None, ""):
            return []
        if not isinstance(raw_accept, list) or len(raw_accept) == 0:
            return [self._error(f"{field_prefix}.props.accept", "accept 必须是非空字符串数组。")]

        errors: list[TemplateSchemaValidationErrorVO] = []
        for index, item in enumerate(raw_accept):
            if not isinstance(item, str) or not item.strip():
                errors.append(self._error(f"{field_prefix}.props.accept.{index}", "accept 项必须是非空字符串。"))
                continue
            if component_type == TemplateComponentType.IMAGE_UPLOAD.value and not self._is_image_accept_value(item.strip()):
                errors.append(self._error(f"{field_prefix}.props.accept.{index}", "图片上传只允许图片 MIME 或图片扩展名。"))
        return errors

    def _validate_bounded_int_prop(
        self,
        field_prefix: str,
        props: dict[str, Any],
        prop_key: str,
        minimum: int,
        maximum: int,
    ) -> list[TemplateSchemaValidationErrorVO]:
        value = props.get(prop_key)
        if value is None:
            return []
        if not isinstance(value, int) or isinstance(value, bool):
            return [self._error(f"{field_prefix}.props.{prop_key}", f"{prop_key} 必须是整数。")]
        if value < minimum or value > maximum:
            return [self._error(f"{field_prefix}.props.{prop_key}", f"{prop_key} 必须在 {minimum}-{maximum} 之间。")]
        return []

    def _validate_json_editor_component(
        self,
        field_prefix: str,
        props: dict[str, Any],
        validation: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors = self._validate_required_only(field_prefix, validation)
        placeholder = props.get("placeholder")
        if placeholder is not None and not isinstance(placeholder, str):
            errors.append(self._error(f"{field_prefix}.props.placeholder", "placeholder 必须是字符串。"))

        default_value = props.get("defaultValue")
        if default_value is not None and not isinstance(default_value, (dict, list)):
            errors.append(self._error(f"{field_prefix}.props.defaultValue", "JSON 默认值必须是 Object 或 Array。"))
        return errors

    def _validate_llm_action_component(
        self,
        field_prefix: str,
        props: dict[str, Any],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        prompt_template = props.get("promptTemplate")
        if not isinstance(prompt_template, str) or not prompt_template.strip():
            errors.append(self._error(f"{field_prefix}.props.promptTemplate", "LLM promptTemplate 不能为空。"))
        elif len(prompt_template) > 8000:
            errors.append(self._error(f"{field_prefix}.props.promptTemplate", "LLM promptTemplate 不能超过 8000 字符。"))

        for prop_key, max_length in (("actionLabel", 80), ("helperText", 500), ("outputFieldKey", 128)):
            value = props.get(prop_key)
            if value is not None and not isinstance(value, str):
                errors.append(self._error(f"{field_prefix}.props.{prop_key}", f"{prop_key} 必须是字符串。"))
            elif isinstance(value, str) and len(value) > max_length:
                errors.append(self._error(f"{field_prefix}.props.{prop_key}", f"{prop_key} 不能超过 {max_length} 字符。"))

        input_field_keys = props.get("inputFieldKeys")
        if input_field_keys is not None:
            if not isinstance(input_field_keys, list):
                errors.append(self._error(f"{field_prefix}.props.inputFieldKeys", "inputFieldKeys 必须是字符串数组。"))
            else:
                for index, item in enumerate(input_field_keys):
                    if not isinstance(item, str) or not item.strip():
                        errors.append(self._error(f"{field_prefix}.props.inputFieldKeys.{index}", "inputFieldKeys 项不能为空。"))
        return errors

    def _validate_llm_field_references(
        self,
        components: list[Any],
        field_keys: set[str],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        for index, component in enumerate(components):
            if component.type != TemplateComponentType.LLM_ACTION.value:
                continue
            input_field_keys = component.props.get("inputFieldKeys")
            if isinstance(input_field_keys, list):
                for item_index, item in enumerate(input_field_keys):
                    if isinstance(item, str) and item.strip() and item not in field_keys:
                        errors.append(
                            self._error(
                                f"components.{index}.props.inputFieldKeys.{item_index}",
                                f"LLM 输入字段不存在：{item}。",
                            )
                        )
            output_field_key = component.props.get("outputFieldKey")
            if isinstance(output_field_key, str) and output_field_key.strip() and output_field_key not in field_keys:
                errors.append(
                    self._error(
                        f"components.{index}.props.outputFieldKey",
                        f"LLM 输出字段不存在：{output_field_key}。",
                    )
                )
        return errors

    def _validate_rule_field_references(
        self,
        components: list[Any],
        field_keys: set[str],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        for index, component in enumerate(components):
            current_field_key = component.field_key
            rule_sets = [
                (f"components.{index}.visibility", component.visibility),
            ]
            required_when = component.validation.get("requiredWhen")
            if isinstance(required_when, dict):
                rule_sets.append((f"components.{index}.validation.requiredWhen", required_when))

            for field_prefix, rule_set in rule_sets:
                conditions = rule_set.get("conditions")
                if not isinstance(conditions, list):
                    continue
                for condition_index, condition in enumerate(conditions):
                    if not isinstance(condition, dict):
                        continue
                    field_key = condition.get("fieldKey")
                    if not isinstance(field_key, str) or not field_key.strip():
                        continue
                    if field_key == current_field_key:
                        errors.append(
                            self._error(
                                f"{field_prefix}.conditions.{condition_index}.fieldKey",
                                "条件不能引用当前字段自身。",
                            )
                        )
                    elif field_key not in field_keys:
                        errors.append(
                            self._error(
                                f"{field_prefix}.conditions.{condition_index}.fieldKey",
                                f"条件字段不存在：{field_key}。",
                            )
                        )
        return errors

    def _is_image_accept_value(self, value: str) -> bool:
        normalized = value.lower()
        return normalized == "image/*" or normalized.startswith("image/") or normalized in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".bmp",
            ".svg",
        }

    def _validate_options(
        self,
        field_prefix: str,
        props: dict[str, Any],
    ) -> tuple[set[str], list[TemplateSchemaValidationErrorVO]]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        raw_options = props.get("options")
        if not isinstance(raw_options, list) or len(raw_options) == 0:
            return set(), [self._error(f"{field_prefix}.props.options", "options 必须至少包含 1 个选项。")]

        option_values: set[str] = set()
        duplicated_values: set[str] = set()
        for index, option in enumerate(raw_options):
            if not isinstance(option, dict):
                errors.append(self._error(f"{field_prefix}.props.options.{index}", "选项必须是对象。"))
                continue
            label = option.get("label")
            value = option.get("value")
            if not isinstance(label, str) or not label.strip():
                errors.append(self._error(f"{field_prefix}.props.options.{index}.label", "选项 label 不能为空。"))
            if not isinstance(value, str) or not value.strip():
                errors.append(self._error(f"{field_prefix}.props.options.{index}.value", "选项 value 不能为空。"))
                continue
            if value in option_values:
                duplicated_values.add(value)
            option_values.add(value)

        for value in sorted(duplicated_values):
            errors.append(self._error(f"{field_prefix}.props.options", f"选项 value 重复：{value}。"))
        return option_values, errors

    def _validate_layout(
        self,
        layout: dict[str, Any],
        component_ids: set[str],
        component_types: dict[str, str],
        component_props: dict[str, dict[str, Any]],
        component_index_by_id: dict[str, int],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        root = layout.get("root")
        if not isinstance(root, list):
            return [self._error("layout.root", "layout.root 必须是数组。")]

        seen_layout_ids: set[str] = set()
        errors.extend(
            self._walk_layout_nodes(
                nodes=root,
                path="layout.root",
                component_ids=component_ids,
                component_types=component_types,
                component_props=component_props,
                component_index_by_id=component_index_by_id,
                seen_layout_ids=seen_layout_ids,
            )
        )
        missing_ids = component_ids - seen_layout_ids
        for component_id in sorted(missing_ids):
            errors.append(self._error("layout.root", f"组件 {component_id} 未出现在布局中。"))
        return errors

    def _walk_layout_nodes(
        self,
        *,
        nodes: list[Any],
        path: str,
        component_ids: set[str],
        component_types: dict[str, str],
        component_props: dict[str, dict[str, Any]],
        component_index_by_id: dict[str, int],
        seen_layout_ids: set[str],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        for index, node in enumerate(nodes):
            node_path = f"{path}.{index}"
            component_id: str | None = None
            if isinstance(node, str):
                component_id = node
            elif isinstance(node, dict):
                raw_component_id = node.get("componentId")
                if not isinstance(raw_component_id, str) or not raw_component_id.strip():
                    errors.append(self._error(node_path, "布局节点必须包含 componentId。"))
                    continue
                component_id = raw_component_id.strip()
                errors.extend(
                    self._validate_container_node(
                        node=node,
                        node_path=node_path,
                        component_id=component_id,
                        component_type=component_types.get(component_id),
                        component_ids=component_ids,
                        component_types=component_types,
                        component_props=component_props,
                        component_index_by_id=component_index_by_id,
                        seen_layout_ids=seen_layout_ids,
                    )
                )
            else:
                errors.append(self._error(node_path, "布局节点必须是组件 ID 字符串或对象。"))
                continue

            if component_id not in component_ids:
                errors.append(self._error(node_path, f"布局引用了不存在的组件：{component_id}。"))
                continue
            if component_id in seen_layout_ids:
                errors.append(self._error(node_path, f"组件 {component_id} 在布局中重复出现。"))
            seen_layout_ids.add(component_id)
        return errors

    def _validate_container_node(
        self,
        *,
        node: dict[str, Any],
        node_path: str,
        component_id: str,
        component_type: str | None,
        component_ids: set[str],
        component_types: dict[str, str],
        component_props: dict[str, dict[str, Any]],
        component_index_by_id: dict[str, int],
        seen_layout_ids: set[str],
    ) -> list[TemplateSchemaValidationErrorVO]:
        errors: list[TemplateSchemaValidationErrorVO] = []
        if "children" in node:
            if component_type != TemplateComponentType.GROUP.value:
                errors.append(self._error(node_path, "只有 GROUP 物料可以使用 children。"))
            children = node.get("children")
            if not isinstance(children, list):
                errors.append(self._error(f"{node_path}.children", "children 必须是数组。"))
            else:
                errors.extend(
                    self._walk_layout_nodes(
                        nodes=children,
                        path=f"{node_path}.children",
                        component_ids=component_ids,
                        component_types=component_types,
                        component_props=component_props,
                        component_index_by_id=component_index_by_id,
                        seen_layout_ids=seen_layout_ids,
                    )
                )
        if "tabs" in node:
            if component_type != TemplateComponentType.TABS.value:
                errors.append(self._error(node_path, "只有 TABS 物料可以使用 tabs。"))
            tabs = node.get("tabs")
            if not isinstance(tabs, list):
                errors.append(self._error(f"{node_path}.tabs", "tabs 必须是数组。"))
            elif len(tabs) == 0:
                errors.append(self._error(f"{node_path}.tabs", "tabs 至少包含 1 个 Tab。"))
            else:
                tab_ids: set[str] = set()
                duplicated_tab_ids: set[str] = set()
                for tab_index, tab in enumerate(tabs):
                    tab_path = f"{node_path}.tabs.{tab_index}"
                    if not isinstance(tab, dict):
                        errors.append(self._error(tab_path, "tab 必须是对象。"))
                        continue
                    tab_id = tab.get("id")
                    if not isinstance(tab_id, str) or not tab_id.strip():
                        errors.append(self._error(f"{tab_path}.id", "tab.id 不能为空。"))
                    else:
                        if tab_id in tab_ids:
                            duplicated_tab_ids.add(tab_id)
                        tab_ids.add(tab_id)
                    label = tab.get("label")
                    if not isinstance(label, str) or not label.strip():
                        errors.append(self._error(f"{tab_path}.label", "tab.label 不能为空。"))
                    children = tab.get("children")
                    if not isinstance(children, list):
                        errors.append(self._error(f"{tab_path}.children", "tab.children 必须是数组。"))
                        continue
                    errors.extend(
                        self._walk_layout_nodes(
                            nodes=children,
                            path=f"{tab_path}.children",
                            component_ids=component_ids,
                            component_types=component_types,
                            component_props=component_props,
                            component_index_by_id=component_index_by_id,
                            seen_layout_ids=seen_layout_ids,
                        )
                    )
                for tab_id in sorted(duplicated_tab_ids):
                    errors.append(self._error(f"{node_path}.tabs", f"tab.id 重复：{tab_id}。"))

                default_tab_id = component_props.get(component_id, {}).get("defaultTabId")
                if isinstance(default_tab_id, str) and default_tab_id and default_tab_id not in tab_ids:
                    component_index = component_index_by_id.get(component_id)
                    field = (
                        f"components.{component_index}.props.defaultTabId"
                        if component_index is not None
                        else f"{node_path}.tabs"
                    )
                    errors.append(self._error(field, "defaultTabId 必须引用已存在的 tab.id。"))
        return errors

    def _create_default_draft(self, task: TaskEntity, user: UserVO) -> TemplateDraftEntity:
        now = datetime.now(UTC)
        draft = TemplateDraftEntity(
            id=self._new_id("template_draft"),
            task_id=task.id,
            schema_json=self._dump_schema(TemplateSchemaVO()),
            updated_by=user.id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(draft)
        return draft

    def _get_owned_task(self, task_id: str, user: UserVO) -> TaskEntity:
        task = self._db.get(TaskEntity, task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。")
        return task

    def _get_draft_entity(self, task_id: str) -> TemplateDraftEntity | None:
        return self._db.scalar(select(TemplateDraftEntity).where(TemplateDraftEntity.task_id == task_id))

    def _ensure_editable(self, task: TaskEntity) -> None:
        if task.status != TaskStatus.DRAFT.value:
            raise ApiException(
                status_code=409,
                code="TASK_NOT_EDITABLE",
                message="阶段 2.1 仅允许在草稿任务上保存模板草稿。",
            )

    def _append_audit(
        self,
        *,
        entity_id: str,
        actor: UserVO,
        action: AuditAction,
        request_id: str,
        metadata: dict[str, Any],
        reason: str | None = None,
    ) -> None:
        self._db.add(
            AuditLogEntity(
                id=self._new_id("audit"),
                entity_type=AuditEntityType.TEMPLATE.value,
                entity_id=entity_id,
                actor_id=actor.id,
                actor_role=actor.role,
                action=action.value,
                from_state=None,
                to_state=None,
                reason=reason,
                metadata_json=metadata,
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
        )

    def _to_draft_vo(self, draft: TemplateDraftEntity) -> TemplateDraftVO:
        return TemplateDraftVO(
            id=draft.id,
            task_id=draft.task_id,
            schema=TemplateSchemaVO.model_validate(draft.schema_json),
            updated_by=draft.updated_by,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
        )

    def _to_version_vo(self, version: TemplateVersionEntity) -> TemplateVersionVO:
        return TemplateVersionVO(
            id=version.id,
            task_id=version.task_id,
            version_no=version.version_no,
            schema=TemplateSchemaVO.model_validate(version.schema_json),
            status=TemplateVersionStatus(version.status),
            version_note=version.version_note,
            published_by=version.published_by,
            published_at=version.published_at,
            created_at=version.created_at,
            updated_at=version.updated_at,
        )

    def _collect_field_keys(self, schema: TemplateSchemaVO) -> list[str]:
        return [
            component.field_key
            for component in schema.components
            if component.type in COLLECTABLE_TYPES and component.field_key
        ]

    def _dump_schema(self, schema: TemplateSchemaVO) -> dict[str, Any]:
        return schema.model_dump(by_alias=True)

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作模板。")

    def _error(self, field: str, message: str) -> TemplateSchemaValidationErrorVO:
        return TemplateSchemaValidationErrorVO(field=field, message=message)

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
