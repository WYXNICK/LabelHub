from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from labelhub_api.core.enums import AuditAction, AuditEntityType, ReviewConfigVersionStatus, TaskStatus, UserRole
from labelhub_api.core.errors import ApiException
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.review_config import ReviewConfigDraftEntity, ReviewConfigVersionEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.review_configs import (
    PublishReviewConfigVersionRequest,
    ReviewConfigDraftVO,
    ReviewConfigVersionVO,
    ReviewDimensionDTO,
    ReviewThresholdDTO,
    SaveReviewConfigDraftRequest,
)


class ReviewConfigService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_draft(self, *, task_id: str, user: UserVO) -> ReviewConfigDraftVO:
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
        body: SaveReviewConfigDraftRequest,
    ) -> ReviewConfigDraftVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_editable(task)
        normalized = self._normalize_config(body)
        now = datetime.now(UTC)
        draft = self._get_draft_entity(task.id)
        if draft is None:
            draft = ReviewConfigDraftEntity(
                id=self._new_id("review_draft"),
                task_id=task.id,
                prompt_template=normalized["promptTemplate"],
                dimensions=normalized["dimensions"],
                thresholds=normalized["thresholds"],
                output_schema=normalized["outputSchema"],
                updated_by=user.id,
                created_at=now,
                updated_at=now,
            )
            self._db.add(draft)
        else:
            draft.prompt_template = normalized["promptTemplate"]
            draft.dimensions = normalized["dimensions"]
            draft.thresholds = normalized["thresholds"]
            draft.output_schema = normalized["outputSchema"]
            draft.updated_by = user.id
            draft.updated_at = now

        self._append_audit(
            entity_type=AuditEntityType.REVIEW_CONFIG,
            entity_id=draft.id,
            actor=user,
            action=AuditAction.REVIEW_CONFIG_SAVE,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "dimensionKeys": [dimension["key"] for dimension in normalized["dimensions"]],
                "maxScore": self._calculate_max_score(normalized["dimensions"]),
            },
        )
        self._db.commit()
        self._db.refresh(draft)
        return self._to_draft_vo(draft)

    def publish_version(
        self,
        *,
        task_id: str,
        user: UserVO,
        request_id: str,
        body: PublishReviewConfigVersionRequest,
    ) -> ReviewConfigVersionVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        self._ensure_editable(task)
        draft = self._get_draft_entity(task.id)
        if draft is None or draft.id != body.draft_id:
            raise ApiException(
                status_code=404,
                code="NOT_FOUND",
                message="审核配置草稿不存在。",
                request_id=request_id,
            )
        self._validate_stored_config(
            prompt_template=draft.prompt_template,
            dimensions=draft.dimensions,
            thresholds=draft.thresholds,
        )

        now = datetime.now(UTC)
        next_version_no = (
            self._db.scalar(
                select(func.max(ReviewConfigVersionEntity.version_no)).where(
                    ReviewConfigVersionEntity.task_id == task.id
                )
            )
            or 0
        ) + 1
        self._db.execute(
            update(ReviewConfigVersionEntity)
            .where(
                ReviewConfigVersionEntity.task_id == task.id,
                ReviewConfigVersionEntity.status == ReviewConfigVersionStatus.ACTIVE.value,
            )
            .values(status=ReviewConfigVersionStatus.DISABLED.value, updated_at=now)
        )
        version = ReviewConfigVersionEntity(
            id=self._new_id("review_version"),
            task_id=task.id,
            version_no=next_version_no,
            prompt_template=draft.prompt_template,
            dimensions=draft.dimensions,
            thresholds=draft.thresholds,
            output_schema=draft.output_schema,
            status=ReviewConfigVersionStatus.ACTIVE.value,
            published_by=user.id,
            published_at=now,
            created_at=now,
            updated_at=now,
        )
        task.current_review_config_version_id = version.id
        task.version += 1
        task.updated_at = now
        self._db.add(version)
        self._append_audit(
            entity_type=AuditEntityType.REVIEW_CONFIG,
            entity_id=version.id,
            actor=user,
            action=AuditAction.REVIEW_CONFIG_PUBLISH,
            request_id=request_id,
            reason=body.version_note,
            metadata={
                "taskId": task.id,
                "draftId": draft.id,
                "versionNo": next_version_no,
                "versionNote": body.version_note,
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
    ) -> PageVO[ReviewConfigVersionVO]:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        query = select(ReviewConfigVersionEntity).where(ReviewConfigVersionEntity.task_id == task.id)
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        versions = list(
            self._db.scalars(
                query.order_by(ReviewConfigVersionEntity.version_no.desc())
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

    def _create_default_draft(self, task: TaskEntity, user: UserVO) -> ReviewConfigDraftEntity:
        now = datetime.now(UTC)
        dimensions = [
            {
                "key": "relevance",
                "name": "相关性",
                "description": "提交内容是否紧扣题目、任务说明和参考标准。",
                "maxScore": 100,
                "weight": 1.0,
            },
            {
                "key": "accuracy",
                "name": "准确性",
                "description": "判断结论、事实依据和关键细节是否准确。",
                "maxScore": 100,
                "weight": 1.2,
            },
            {
                "key": "format",
                "name": "格式合规",
                "description": "提交格式是否完整、清晰，并符合模板约束。",
                "maxScore": 100,
                "weight": 0.8,
            },
            {
                "key": "safety",
                "name": "安全性",
                "description": "是否存在明显安全、合规或低质量风险。",
                "maxScore": 100,
                "weight": 1.0,
            },
        ]
        draft = ReviewConfigDraftEntity(
            id=self._new_id("review_draft"),
            task_id=task.id,
            prompt_template=(
                "你是 LabelHub 的数据质量预审员。请结合任务说明、题目原始 payload、"
                "标注员提交内容和参考信息，从配置的评分维度进行评估。"
                "必须只返回符合 outputSchema 的 JSON，不要输出额外解释文本。"
            ),
            dimensions=dimensions,
            thresholds={"passMinScore": 280, "humanReviewMinScore": 220, "returnBelowScore": 160},
            output_schema=self._build_default_output_schema(dimensions),
            updated_by=user.id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(draft)
        return draft

    def _normalize_config(self, body: SaveReviewConfigDraftRequest) -> dict[str, Any]:
        prompt_template = body.prompt_template.strip()
        dimensions: list[dict[str, Any]] = []
        seen_keys: set[str] = set()
        errors: list[dict[str, str]] = []

        if not prompt_template:
            errors.append({"field": "promptTemplate", "message": "Prompt 模板不能为空。"})

        for index, dimension in enumerate(body.dimensions):
            key = dimension.key.strip()
            name = dimension.name.strip()
            description = dimension.description.strip() if dimension.description else None
            if not key:
                errors.append({"field": f"dimensions.{index}.key", "message": "维度 key 不能为空。"})
            if not name:
                errors.append({"field": f"dimensions.{index}.name", "message": "维度名称不能为空。"})
            if key in seen_keys:
                errors.append({"field": f"dimensions.{index}.key", "message": "维度 key 不能重复。"})
            seen_keys.add(key)
            dimensions.append(
                {
                    "key": key,
                    "name": name,
                    "description": description,
                    "maxScore": dimension.max_score,
                    "weight": dimension.weight,
                }
            )

        thresholds = body.thresholds.model_dump(by_alias=True)
        errors.extend(self._validate_thresholds(dimensions=dimensions, thresholds=thresholds))
        if errors:
            raise ApiException(
                status_code=422,
                code="INVALID_REVIEW_CONFIG",
                message="审核配置校验失败。",
                details={"errors": errors},
            )

        output_schema = body.output_schema or self._build_default_output_schema(dimensions)
        return {
            "promptTemplate": prompt_template,
            "dimensions": dimensions,
            "thresholds": thresholds,
            "outputSchema": output_schema,
        }

    def _validate_stored_config(
        self,
        *,
        prompt_template: str,
        dimensions: list[dict[str, Any]],
        thresholds: dict[str, Any],
    ) -> None:
        errors: list[dict[str, str]] = []
        if not prompt_template.strip():
            errors.append({"field": "promptTemplate", "message": "Prompt 模板不能为空。"})
        errors.extend(self._validate_thresholds(dimensions=dimensions, thresholds=thresholds))
        keys = [str(dimension.get("key", "")).strip() for dimension in dimensions]
        if len(keys) != len(set(keys)):
            errors.append({"field": "dimensions", "message": "维度 key 不能重复。"})
        if errors:
            raise ApiException(
                status_code=422,
                code="INVALID_REVIEW_CONFIG",
                message="审核配置校验失败。",
                details={"errors": errors},
            )

    def _validate_thresholds(
        self,
        *,
        dimensions: list[dict[str, Any]],
        thresholds: dict[str, Any],
    ) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        pass_min_score = float(thresholds["passMinScore"])
        return_below_score = float(thresholds["returnBelowScore"])
        human_review_min_score = thresholds.get("humanReviewMinScore")
        if return_below_score > pass_min_score:
            errors.append({"field": "thresholds", "message": "打回阈值不能高于通过阈值。"})
        if human_review_min_score is not None:
            human_review_min_score = float(human_review_min_score)
            if not return_below_score <= human_review_min_score <= pass_min_score:
                errors.append({"field": "thresholds", "message": "人工复核阈值必须位于打回阈值和通过阈值之间。"})

        max_score = self._calculate_max_score(dimensions)
        threshold_values = [pass_min_score, return_below_score]
        if human_review_min_score is not None:
            threshold_values.append(float(human_review_min_score))
        if max(threshold_values) > max_score:
            errors.append({"field": "thresholds", "message": f"阈值不能超过当前最高分 {max_score:g}。"})
        return errors

    def _calculate_max_score(self, dimensions: list[dict[str, Any]]) -> float:
        return sum(float(dimension["maxScore"]) * float(dimension["weight"]) for dimension in dimensions)

    def _build_default_output_schema(self, dimensions: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "type": "object",
            "required": ["decision", "totalScore", "dimensionScores", "comment"],
            "additionalProperties": False,
            "properties": {
                "decision": {"type": "string", "enum": ["PASS", "RETURN", "HUMAN_REVIEW"]},
                "totalScore": {"type": "number", "minimum": 0},
                "dimensionScores": {
                    "type": "object",
                    "required": [dimension["key"] for dimension in dimensions],
                    "properties": {
                        dimension["key"]: {
                            "type": "number",
                            "minimum": 0,
                            "maximum": dimension["maxScore"],
                        }
                        for dimension in dimensions
                    },
                },
                "comment": {"type": "string"},
            },
        }

    def _get_draft_entity(self, task_id: str) -> ReviewConfigDraftEntity | None:
        return self._db.scalar(
            select(ReviewConfigDraftEntity).where(ReviewConfigDraftEntity.task_id == task_id)
        )

    def _get_owned_task(self, task_id: str, user: UserVO) -> TaskEntity:
        task = self._db.get(TaskEntity, task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。")
        return task

    def _ensure_editable(self, task: TaskEntity) -> None:
        if task.status != TaskStatus.DRAFT.value:
            raise ApiException(
                status_code=409,
                code="TASK_NOT_EDITABLE",
                message="仅允许在草稿任务上编辑和发布审核配置。",
            )

    def _append_audit(
        self,
        *,
        entity_type: AuditEntityType,
        entity_id: str,
        actor: UserVO,
        action: AuditAction,
        request_id: str,
        metadata: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> None:
        self._db.add(
            AuditLogEntity(
                id=self._new_id("audit"),
                entity_type=entity_type.value,
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

    def _to_draft_vo(self, draft: ReviewConfigDraftEntity) -> ReviewConfigDraftVO:
        return ReviewConfigDraftVO(
            id=draft.id,
            task_id=draft.task_id,
            prompt_template=draft.prompt_template,
            dimensions=[ReviewDimensionDTO(**dimension) for dimension in draft.dimensions],
            thresholds=ReviewThresholdDTO(**draft.thresholds),
            output_schema=draft.output_schema,
            updated_by=draft.updated_by,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
        )

    def _to_version_vo(self, version: ReviewConfigVersionEntity) -> ReviewConfigVersionVO:
        return ReviewConfigVersionVO(
            id=version.id,
            task_id=version.task_id,
            version_no=version.version_no,
            prompt_template=version.prompt_template,
            dimensions=[ReviewDimensionDTO(**dimension) for dimension in version.dimensions],
            thresholds=ReviewThresholdDTO(**version.thresholds),
            output_schema=version.output_schema,
            status=ReviewConfigVersionStatus(version.status),
            published_by=version.published_by,
            published_at=version.published_at,
            created_at=version.created_at,
            updated_at=version.updated_at,
        )

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作审核配置。")

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
