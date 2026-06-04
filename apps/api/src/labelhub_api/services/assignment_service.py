from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AssignmentStatus,
    AuditAction,
    AuditEntityType,
    DatasetItemStatus,
    DistributionStrategy,
    TaskStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.assignment import AssignmentEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetItemEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.schemas.assignments import AssignmentVO, CreateAssignmentRequest, MarketplaceTaskVO
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO


class AssignmentService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_marketplace_tasks(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        keyword: str | None,
        tag: str | None,
    ) -> PageVO[MarketplaceTaskVO]:
        self._require_labeler(user)
        query = self._claimable_task_query(keyword=keyword)
        tasks = list(self._db.scalars(query.order_by(TaskEntity.updated_at.desc(), TaskEntity.created_at.desc())))

        normalized_tag = tag.strip() if tag else ""
        task_views = [
            view
            for task in tasks
            if (not normalized_tag or normalized_tag in task.tags)
            for view in [self._to_marketplace_task_vo(task, user)]
            if view.available_item_count > 0
        ]

        total_items = len(task_views)
        start = (page - 1) * page_size
        return PageVO(
            data=task_views[start : start + page_size],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def claim_assignment(
        self,
        *,
        task_id: str,
        user: UserVO,
        request: CreateAssignmentRequest,
        request_id: str,
    ) -> AssignmentVO:
        self._require_labeler(user)
        task = self._db.get(TaskEntity, task_id)
        if task is None:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。", request_id=request_id)
        self._ensure_task_claimable(task, request_id=request_id)

        now = datetime.now(UTC)
        item = self._db.scalar(
            select(DatasetItemEntity)
            .where(
                DatasetItemEntity.task_id == task.id,
                DatasetItemEntity.status == DatasetItemStatus.AVAILABLE.value,
            )
            .order_by(DatasetItemEntity.created_at.asc(), DatasetItemEntity.id.asc())
            .limit(1)
        )
        if item is None:
            raise ApiException(
                status_code=409,
                code="NO_AVAILABLE_ITEMS",
                message="当前任务暂无可领取题目。",
                request_id=request_id,
            )

        # 先原子锁定题目，再写 assignment，避免并发时同一题目被重复领取。
        item_update = self._db.execute(
            update(DatasetItemEntity)
            .where(
                DatasetItemEntity.id == item.id,
                DatasetItemEntity.status == DatasetItemStatus.AVAILABLE.value,
            )
            .values(
                status=DatasetItemStatus.CLAIMED.value,
                version=DatasetItemEntity.version + 1,
                updated_at=now,
            )
        )
        if item_update.rowcount != 1:
            raise ApiException(
                status_code=409,
                code="CLAIM_CONFLICT",
                message="题目已被其他标注员领取，请刷新后重试。",
                request_id=request_id,
            )

        quota_update = self._db.execute(
            update(TaskEntity)
            .where(TaskEntity.id == task.id, TaskEntity.claimed_count < TaskEntity.quota)
            .values(claimed_count=TaskEntity.claimed_count + 1, updated_at=now)
        )
        if quota_update.rowcount != 1:
            raise ApiException(
                status_code=409,
                code="NO_AVAILABLE_ITEMS",
                message="当前任务配额已满。",
                request_id=request_id,
            )

        assignment = AssignmentEntity(
            id=self._new_id("assignment"),
            task_id=task.id,
            dataset_item_id=item.id,
            labeler_id=user.id,
            template_version_id=str(task.current_template_version_id),
            review_config_version_id=str(task.current_review_config_version_id),
            status=AssignmentStatus.CLAIMED.value,
            draft_values=None,
            draft_saved_at=None,
            current_submission_id=None,
            claimed_at=now,
            submitted_at=None,
            version=0,
            created_at=now,
            updated_at=now,
        )
        self._db.add(assignment)
        self._append_audit(
            entity_id=assignment.id,
            actor=user,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "datasetItemId": item.id,
                "idempotencyKey": request.idempotency_key,
            },
        )
        try:
            self._db.commit()
        except IntegrityError as exc:
            self._db.rollback()
            raise ApiException(
                status_code=409,
                code="CLAIM_CONFLICT",
                message="题目领取发生冲突，请刷新后重试。",
                request_id=request_id,
            ) from exc
        self._db.refresh(assignment)
        return self._to_assignment_vo(assignment)

    def _claimable_task_query(self, *, keyword: str | None) -> Select[tuple[TaskEntity]]:
        now = datetime.now(UTC)
        query = select(TaskEntity).where(
            TaskEntity.status == TaskStatus.PUBLISHED.value,
            TaskEntity.current_template_version_id.is_not(None),
            TaskEntity.current_review_config_version_id.is_not(None),
            TaskEntity.distribution_strategy == DistributionStrategy.FIRST_COME_FIRST_SERVED.value,
            TaskEntity.deadline_at.is_not(None),
            TaskEntity.deadline_at > now,
        )
        normalized_keyword = keyword.strip() if keyword else ""
        if normalized_keyword:
            pattern = f"%{normalized_keyword}%"
            query = query.where(or_(TaskEntity.title.like(pattern), TaskEntity.description.like(pattern)))
        return query

    def _ensure_task_claimable(self, task: TaskEntity, *, request_id: str) -> None:
        if (
            task.status != TaskStatus.PUBLISHED.value
            or not task.current_template_version_id
            or not task.current_review_config_version_id
            or task.distribution_strategy != DistributionStrategy.FIRST_COME_FIRST_SERVED.value
            or task.deadline_at is None
            or not self._is_future(task.deadline_at)
        ):
            raise ApiException(
                status_code=409,
                code="TASK_NOT_CLAIMABLE",
                message="任务当前不可领取。",
                request_id=request_id,
            )
        if task.claimed_count >= task.quota:
            raise ApiException(
                status_code=409,
                code="NO_AVAILABLE_ITEMS",
                message="当前任务配额已满。",
                request_id=request_id,
            )

    def _to_marketplace_task_vo(self, task: TaskEntity, user: UserVO) -> MarketplaceTaskVO:
        raw_available_count = self._count_available_items(task.id)
        quota_left = max(task.quota - task.claimed_count, 0)
        return MarketplaceTaskVO(
            id=task.id,
            title=task.title,
            description=task.description,
            tags=task.tags,
            reward_rule=task.reward_rule,
            quota=task.quota,
            claimed_count=task.claimed_count,
            submitted_count=task.submitted_count,
            approved_count=task.approved_count,
            available_item_count=min(raw_available_count, quota_left),
            claimed_by_me_count=self._count_assignments(
                task.id,
                user.id,
                statuses=[
                    AssignmentStatus.CLAIMED,
                    AssignmentStatus.DRAFT_SAVED,
                    AssignmentStatus.SUBMITTED,
                    AssignmentStatus.RETURNED,
                    AssignmentStatus.APPROVED,
                ],
            ),
            submitted_by_me_count=self._count_assignments(
                task.id,
                user.id,
                statuses=[AssignmentStatus.SUBMITTED, AssignmentStatus.RETURNED, AssignmentStatus.APPROVED],
            ),
            deadline_at=task.deadline_at,
            distribution_strategy=DistributionStrategy(task.distribution_strategy),
            current_template_version_id=str(task.current_template_version_id),
            current_review_config_version_id=str(task.current_review_config_version_id),
            updated_at=task.updated_at,
        )

    def _to_assignment_vo(self, assignment: AssignmentEntity) -> AssignmentVO:
        return AssignmentVO(
            id=assignment.id,
            task_id=assignment.task_id,
            dataset_item_id=assignment.dataset_item_id,
            template_version_id=assignment.template_version_id,
            review_config_version_id=assignment.review_config_version_id,
            labeler_id=assignment.labeler_id,
            status=AssignmentStatus(assignment.status),
            draft_values=assignment.draft_values,
            draft_saved_at=assignment.draft_saved_at,
            current_submission_id=assignment.current_submission_id,
            claimed_at=assignment.claimed_at,
            submitted_at=assignment.submitted_at,
            version=assignment.version,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at,
        )

    def _count_available_items(self, task_id: str) -> int:
        return int(
            self._db.scalar(
                select(func.count()).select_from(DatasetItemEntity).where(
                    DatasetItemEntity.task_id == task_id,
                    DatasetItemEntity.status == DatasetItemStatus.AVAILABLE.value,
                )
            )
            or 0
        )

    def _count_assignments(self, task_id: str, labeler_id: str, *, statuses: list[AssignmentStatus]) -> int:
        return int(
            self._db.scalar(
                select(func.count()).select_from(AssignmentEntity).where(
                    AssignmentEntity.task_id == task_id,
                    AssignmentEntity.labeler_id == labeler_id,
                    AssignmentEntity.status.in_([status.value for status in statuses]),
                )
            )
            or 0
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
                entity_type=AuditEntityType.ASSIGNMENT.value,
                entity_id=entity_id,
                actor_id=actor.id,
                actor_role=actor.role,
                action=AuditAction.ASSIGNMENT_CLAIM.value,
                from_state=None,
                to_state=AssignmentStatus.CLAIMED.value,
                reason=None,
                metadata_json=metadata,
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
        )

    def _require_labeler(self, user: UserVO) -> None:
        if user.role != UserRole.LABELER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅标注员可以领取任务。")

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"

    def _is_future(self, value: datetime) -> bool:
        now = datetime.now(value.tzinfo) if value.tzinfo else datetime.now(UTC).replace(tzinfo=None)
        return value > now
