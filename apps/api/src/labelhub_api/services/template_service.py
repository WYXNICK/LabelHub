from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    TaskStatus,
    TemplateComponentType,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateDraftEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.templates import (
    SaveTemplateDraftRequest,
    TemplateDraftVO,
    TemplateSchemaValidationErrorVO,
    TemplateSchemaValidationVO,
    TemplateSchemaVO,
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

        for index, component in enumerate(schema.components):
            field_prefix = f"components.{index}"
            component_id = component.id.strip()
            component_type = component.type.strip()
            field_key = component.field_key.strip() if component.field_key else None

            if component_id in component_ids:
                duplicate_component_ids.add(component_id)
            component_ids.add(component_id)

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

        for component_id in sorted(duplicate_component_ids):
            errors.append(self._error("components", f"component.id 重复：{component_id}。"))
        for field_key in sorted(duplicate_field_keys):
            errors.append(self._error("components", f"fieldKey 重复：{field_key}。"))

        errors.extend(self._validate_layout(schema.layout, component_ids, {c.id: c.type for c in schema.components}))
        return errors

    def _validate_layout(
        self,
        layout: dict[str, Any],
        component_ids: set[str],
        component_types: dict[str, str],
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
                        seen_layout_ids=seen_layout_ids,
                    )
                )
        if "tabs" in node:
            if component_type != TemplateComponentType.TABS.value:
                errors.append(self._error(node_path, "只有 TABS 物料可以使用 tabs。"))
            tabs = node.get("tabs")
            if not isinstance(tabs, list):
                errors.append(self._error(f"{node_path}.tabs", "tabs 必须是数组。"))
            else:
                for tab_index, tab in enumerate(tabs):
                    tab_path = f"{node_path}.tabs.{tab_index}"
                    if not isinstance(tab, dict) or not isinstance(tab.get("children"), list):
                        errors.append(self._error(tab_path, "tab 必须是包含 children 数组的对象。"))
                        continue
                    errors.extend(
                        self._walk_layout_nodes(
                            nodes=tab["children"],
                            path=f"{tab_path}.children",
                            component_ids=component_ids,
                            component_types=component_types,
                            seen_layout_ids=seen_layout_ids,
                        )
                    )
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
        request_id: str,
        metadata: dict[str, Any],
    ) -> None:
        self._db.add(
            AuditLogEntity(
                id=self._new_id("audit"),
                entity_type=AuditEntityType.TEMPLATE.value,
                entity_id=entity_id,
                actor_id=actor.id,
                actor_role=actor.role,
                action=AuditAction.TEMPLATE_SAVE.value,
                from_state=None,
                to_state=None,
                reason=None,
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

    def _dump_schema(self, schema: TemplateSchemaVO) -> dict[str, Any]:
        return schema.model_dump(by_alias=True)

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作模板。")

    def _error(self, field: str, message: str) -> TemplateSchemaValidationErrorVO:
        return TemplateSchemaValidationErrorVO(field=field, message=message)

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
