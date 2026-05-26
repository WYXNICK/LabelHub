from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    DatasetItemStatus,
    DatasetStatus,
    PublishBlockerCode,
    TaskStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetEntity, DatasetItemEntity
from labelhub_api.models.review_config import ReviewConfigVersionEntity
from labelhub_api.models.task import TaskEntity, TaskStateTransitionEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.audit import AuditLogVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.tasks import (
    CreateTaskRequest,
    PublishBlockerVO,
    TaskDetailVO,
    TaskStateTransitionRequest,
    TaskStatsVO,
    TaskVO,
    UpdateTaskRequest,
)


class TaskService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_tasks(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        status: TaskStatus | None,
        keyword: str | None,
    ) -> PageVO[TaskVO]:
        self._require_owner(user)
        query = select(TaskEntity).where(TaskEntity.created_by == user.id)
        query = self._apply_filters(query, status=status, keyword=keyword)

        total_items = self._db.scalar(
            select(func.count()).select_from(query.order_by(None).subquery())
        ) or 0
        tasks = list(
            self._db.scalars(
                query.order_by(TaskEntity.updated_at.desc(), TaskEntity.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_task_vo(task) for task in tasks],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def create_task(self, *, user: UserVO, request: CreateTaskRequest, request_id: str) -> TaskDetailVO:
        self._require_owner(user)
        now = datetime.now(UTC)
        task = TaskEntity(
            id=self._new_id("task"),
            title=request.title.strip(),
            description=request.description.strip() if request.description else None,
            instruction_rich_text=request.instruction_rich_text,
            tags=request.tags,
            reward_rule=request.reward_rule,
            quota=request.quota,
            claimed_count=0,
            submitted_count=0,
            approved_count=0,
            deadline_at=request.deadline_at,
            distribution_strategy=request.distribution_strategy.value,
            status=TaskStatus.DRAFT.value,
            current_template_version_id=None,
            current_review_config_version_id=None,
            created_by=user.id,
            version=0,
            created_at=now,
            updated_at=now,
        )
        self._db.add(task)
        self._append_audit(
            entity_type=AuditEntityType.TASK,
            entity_id=task.id,
            actor=user,
            action=AuditAction.CREATE,
            request_id=request_id,
            metadata={"title": task.title},
        )
        self._db.commit()
        self._db.refresh(task)
        return self._to_task_detail_vo(task)

    def get_task(self, *, task_id: str, user: UserVO) -> TaskDetailVO:
        self._require_owner(user)
        return self._to_task_detail_vo(self._get_owned_task(task_id, user))

    def update_task(
        self,
        *,
        task_id: str,
        user: UserVO,
        request: UpdateTaskRequest,
        request_id: str,
    ) -> TaskDetailVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_version(task, request.version)
        if task.status != TaskStatus.DRAFT.value:
            raise ApiException(
                status_code=409,
                code="TASK_NOT_EDITABLE",
                message="只有草稿任务可以编辑基础信息。",
                request_id=request_id,
            )

        updates = request.model_dump(exclude_unset=True)
        updates.pop("version", None)
        self._apply_task_updates(task, updates)
        task.version += 1
        task.updated_at = datetime.now(UTC)
        self._append_audit(
            entity_type=AuditEntityType.TASK,
            entity_id=task.id,
            actor=user,
            action=AuditAction.UPDATE,
            request_id=request_id,
            metadata={"updatedFields": sorted(updates.keys())},
        )
        self._db.commit()
        self._db.refresh(task)
        return self._to_task_detail_vo(task)

    def transition_task_state(
        self,
        *,
        task_id: str,
        user: UserVO,
        request: TaskStateTransitionRequest,
        request_id: str,
    ) -> TaskDetailVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_version(task, request.version)
        current_status = TaskStatus(task.status)
        target_status = request.target_status
        if target_status not in self._allowed_targets(current_status):
            raise ApiException(
                status_code=409,
                code="INVALID_STATE_TRANSITION",
                message=f"任务状态不能从 {current_status.value} 迁移到 {target_status.value}。",
                request_id=request_id,
            )

        if target_status == TaskStatus.PUBLISHED:
            # 发布动作必须先通过硬性依赖校验，避免不可执行任务进入标注市场。
            blockers = self._build_publish_blockers(task)
            if blockers:
                raise ApiException(
                    status_code=409,
                    code="PUBLISH_BLOCKED",
                    message="任务暂不满足发布条件。",
                    details={"blockers": [blocker.model_dump(by_alias=True) for blocker in blockers]},
                    request_id=request_id,
                )

        now = datetime.now(UTC)
        task.status = target_status.value
        task.version += 1
        task.updated_at = now
        transition = TaskStateTransitionEntity(
            id=self._new_id("task_transition"),
            task_id=task.id,
            from_status=current_status.value,
            to_status=target_status.value,
            actor_id=user.id,
            reason=request.reason,
            request_id=request_id,
            created_at=now,
        )
        self._db.add(transition)
        self._append_audit(
            entity_type=AuditEntityType.TASK,
            entity_id=task.id,
            actor=user,
            action=AuditAction.STATE_TRANSITION,
            request_id=request_id,
            from_state=current_status.value,
            to_state=target_status.value,
            reason=request.reason,
        )
        self._db.commit()
        self._db.refresh(task)
        return self._to_task_detail_vo(task)

    def list_audit_logs(
        self,
        *,
        user: UserVO,
        entity_type: AuditEntityType | None,
        entity_id: str | None,
        page: int,
        page_size: int,
    ) -> PageVO[AuditLogVO]:
        self._require_owner(user)
        query = select(AuditLogEntity).where(AuditLogEntity.actor_id == user.id)
        if entity_type is not None:
            query = query.where(AuditLogEntity.entity_type == entity_type.value)
        if entity_id is not None:
            query = query.where(AuditLogEntity.entity_id == entity_id)

        total_items = self._db.scalar(
            select(func.count()).select_from(query.order_by(None).subquery())
        ) or 0
        logs = list(
            self._db.scalars(
                query.order_by(AuditLogEntity.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_audit_log_vo(log) for log in logs],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def _apply_filters(
        self,
        query: Select[tuple[TaskEntity]],
        *,
        status: TaskStatus | None,
        keyword: str | None,
    ) -> Select[tuple[TaskEntity]]:
        if status is not None:
            query = query.where(TaskEntity.status == status.value)
        normalized_keyword = keyword.strip() if keyword else ""
        if normalized_keyword:
            pattern = f"%{normalized_keyword}%"
            query = query.where(or_(TaskEntity.title.like(pattern), TaskEntity.description.like(pattern)))
        return query

    def _apply_task_updates(self, task: TaskEntity, updates: dict[str, Any]) -> None:
        if "title" in updates and updates["title"] is not None:
            task.title = str(updates["title"]).strip()
        if "description" in updates:
            description = updates["description"]
            task.description = description.strip() if isinstance(description, str) else None
        if "instruction_rich_text" in updates:
            task.instruction_rich_text = updates["instruction_rich_text"]
        if "tags" in updates and updates["tags"] is not None:
            task.tags = updates["tags"]
        if "reward_rule" in updates:
            task.reward_rule = updates["reward_rule"]
        if "quota" in updates and updates["quota"] is not None:
            task.quota = updates["quota"]
        if "deadline_at" in updates:
            task.deadline_at = updates["deadline_at"]
        if "distribution_strategy" in updates and updates["distribution_strategy"] is not None:
            task.distribution_strategy = updates["distribution_strategy"].value

    def _get_owned_task(self, task_id: str, user: UserVO) -> TaskEntity:
        task = self._db.get(TaskEntity, task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。")
        return task

    def _ensure_version(self, task: TaskEntity, expected_version: int) -> None:
        if task.version != expected_version:
            raise ApiException(
                status_code=409,
                code="VERSION_CONFLICT",
                message="任务已被其他操作更新，请刷新后重试。",
                details={"currentVersion": task.version},
            )

    def _build_publish_blockers(self, task: TaskEntity) -> list[PublishBlockerVO]:
        blockers: list[PublishBlockerVO] = []
        if task.quota <= 0:
            blockers.append(
                PublishBlockerVO(
                    code=PublishBlockerCode.INVALID_QUOTA,
                    message="任务配额必须大于 0。",
                    field="quota",
                )
            )
        if task.deadline_at is None or not self._is_future(task.deadline_at):
            blockers.append(
                PublishBlockerVO(
                    code=PublishBlockerCode.INVALID_DEADLINE,
                    message="截止时间必须晚于当前时间。",
                    field="deadlineAt",
                )
            )
        ready_dataset_count = self._db.scalar(
            select(func.count()).select_from(DatasetEntity).where(
                DatasetEntity.task_id == task.id,
                DatasetEntity.status == DatasetStatus.READY.value,
            )
        ) or 0
        if ready_dataset_count == 0:
            blockers.append(
                PublishBlockerVO(
                    code=PublishBlockerCode.MISSING_DATASET,
                    message="请先导入至少一个可用数据集。",
                    field="datasets",
                )
            )
        if not task.current_template_version_id:
            blockers.append(
                PublishBlockerVO(
                    code=PublishBlockerCode.MISSING_TEMPLATE_VERSION,
                    message="请先发布可运行的标注模板版本。",
                    field="currentTemplateVersionId",
                )
            )
        if not task.current_review_config_version_id:
            blockers.append(
                PublishBlockerVO(
                    code=PublishBlockerCode.MISSING_REVIEW_CONFIG,
                    message="请先发布审核配置版本。",
                    field="currentReviewConfigVersionId",
                )
            )
        return blockers

    def _allowed_targets(self, status: TaskStatus) -> set[TaskStatus]:
        return {
            TaskStatus.DRAFT: {TaskStatus.PUBLISHED, TaskStatus.ENDED},
            TaskStatus.PUBLISHED: {TaskStatus.PAUSED, TaskStatus.ENDED},
            TaskStatus.PAUSED: {TaskStatus.PUBLISHED, TaskStatus.ENDED},
            TaskStatus.ENDED: set(),
        }[status]

    def _to_task_vo(self, task: TaskEntity) -> TaskVO:
        return TaskVO(
            id=task.id,
            title=task.title,
            description=task.description,
            tags=task.tags,
            quota=task.quota,
            claimed_count=task.claimed_count,
            submitted_count=task.submitted_count,
            approved_count=task.approved_count,
            deadline_at=task.deadline_at,
            distribution_strategy=task.distribution_strategy,
            status=task.status,
            created_by=task.created_by,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def _to_task_detail_vo(self, task: TaskEntity) -> TaskDetailVO:
        return TaskDetailVO(
            **self._to_task_vo(task).model_dump(),
            instruction_rich_text=task.instruction_rich_text,
            reward_rule=task.reward_rule,
            current_template_version_id=task.current_template_version_id,
            current_review_config_version_id=task.current_review_config_version_id,
            version=task.version,
            stats=self._build_stats(task.id),
        )

    def _build_stats(self, task_id: str) -> TaskStatsVO:
        dataset_count = self._db.scalar(
            select(func.count()).select_from(DatasetEntity).where(DatasetEntity.task_id == task_id)
        ) or 0
        item_count = self._db.scalar(
            select(func.count()).select_from(DatasetItemEntity).where(DatasetItemEntity.task_id == task_id)
        ) or 0
        enabled_item_count = self._db.scalar(
            select(func.count()).select_from(DatasetItemEntity).where(
                DatasetItemEntity.task_id == task_id,
                DatasetItemEntity.status != DatasetItemStatus.DISABLED.value,
            )
        ) or 0
        review_config_version_count = self._db.scalar(
            select(func.count()).select_from(ReviewConfigVersionEntity).where(
                ReviewConfigVersionEntity.task_id == task_id
            )
        ) or 0
        return TaskStatsVO(
            dataset_count=dataset_count,
            item_count=item_count,
            enabled_item_count=enabled_item_count,
            review_config_version_count=review_config_version_count,
        )

    def _to_audit_log_vo(self, log: AuditLogEntity) -> AuditLogVO:
        return AuditLogVO(
            id=log.id,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            actor_id=log.actor_id,
            actor_role=log.actor_role,
            action=log.action,
            from_state=log.from_state,
            to_state=log.to_state,
            reason=log.reason,
            metadata=log.metadata_json,
            request_id=log.request_id,
            created_at=log.created_at,
        )

    def _append_audit(
        self,
        *,
        entity_type: AuditEntityType,
        entity_id: str,
        actor: UserVO,
        action: AuditAction,
        request_id: str,
        from_state: str | None = None,
        to_state: str | None = None,
        reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self._db.add(
            AuditLogEntity(
                id=self._new_id("audit"),
                entity_type=entity_type.value,
                entity_id=entity_id,
                actor_id=actor.id,
                actor_role=actor.role,
                action=action.value,
                from_state=from_state,
                to_state=to_state,
                reason=reason,
                metadata_json=metadata,
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
        )

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作任务管理。")

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"

    def _is_future(self, value: datetime) -> bool:
        now = datetime.now(value.tzinfo) if value.tzinfo else datetime.now(UTC).replace(tzinfo=None)
        return value > now
