from __future__ import annotations

import json
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
    ContributionBucket,
    DatasetItemStatus,
    DistributionStrategy,
    LlmActionRunStatus,
    SubmissionStatus,
    TaskStatus,
    TemplateComponentType,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.assignment import AssignmentEntity, LlmActionRunEntity, SubmissionEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetItemEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateVersionEntity
from labelhub_api.schemas.assignments import (
    AssignmentContextVO,
    AssignmentNavigationVO,
    AssignmentVO,
    ContributionItemVO,
    ContributionStatsVO,
    CreateAssignmentRequest,
    CreateSubmissionRequest,
    LlmActionRunVO,
    MarketplaceTaskVO,
    ReviewFeedbackVO,
    RunLlmActionRequest,
    SaveAssignmentDraftRequest,
    SubmissionVO,
)
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.tasks import TaskVO
from labelhub_api.schemas.templates import TemplateComponentDTO, TemplateSchemaVO
from labelhub_api.services.llm_client import LlmClientError, OpenAICompatibleLlmClient
from labelhub_api.services.review_service import ReviewService
from labelhub_api.services.submission_validation import validate_submission_value


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

    def list_assignments(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        status: AssignmentStatus | None,
    ) -> PageVO[AssignmentVO]:
        self._require_labeler(user)
        query = select(AssignmentEntity).where(AssignmentEntity.labeler_id == user.id)
        if status is not None:
            query = query.where(AssignmentEntity.status == status.value)

        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        assignments = list(
            self._db.scalars(
                query.order_by(AssignmentEntity.updated_at.desc(), AssignmentEntity.claimed_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_assignment_vo(assignment) for assignment in assignments],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def get_contribution_stats(self, *, user: UserVO) -> ContributionStatsVO:
        self._require_labeler(user)
        base_query = select(AssignmentEntity).where(
            AssignmentEntity.labeler_id == user.id,
            AssignmentEntity.status != AssignmentStatus.CANCELLED.value,
        )
        assignments = list(self._db.scalars(base_query))
        draft_count = sum(1 for item in assignments if item.status in self._draft_status_values())
        in_review_count = sum(1 for item in assignments if item.status == AssignmentStatus.SUBMITTED.value)
        approved_count = sum(1 for item in assignments if item.status == AssignmentStatus.APPROVED.value)
        returned_count = sum(1 for item in assignments if item.status == AssignmentStatus.RETURNED.value)
        submitted_count = in_review_count + approved_count + returned_count
        reviewed_count = approved_count + returned_count
        total_submission_count = int(
            self._db.scalar(
                select(func.count()).select_from(SubmissionEntity).where(SubmissionEntity.labeler_id == user.id)
            )
            or 0
        )
        latest_updated_at = max((item.updated_at for item in assignments), default=None)
        return ContributionStatsVO(
            total_assignments=len(assignments),
            draft_count=draft_count,
            in_review_count=in_review_count,
            submitted_count=submitted_count,
            approved_count=approved_count,
            returned_count=returned_count,
            revision_required_count=returned_count,
            total_submission_count=total_submission_count,
            pass_rate=round((approved_count / reviewed_count) * 100, 1) if reviewed_count else 0.0,
            latest_updated_at=latest_updated_at,
        )

    def list_contributions(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        bucket: ContributionBucket,
        keyword: str | None,
    ) -> PageVO[ContributionItemVO]:
        self._require_labeler(user)
        query = self._contribution_query(user=user, bucket=bucket, keyword=keyword)
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        assignments = list(
            self._db.scalars(
                query.order_by(AssignmentEntity.updated_at.desc(), AssignmentEntity.claimed_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_contribution_item_vo(assignment) for assignment in assignments],
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

    def get_assignment_context(
        self,
        *,
        assignment_id: str,
        user: UserVO,
        request_id: str,
    ) -> AssignmentContextVO:
        self._require_labeler(user)
        assignment = self._db.get(AssignmentEntity, assignment_id)
        if assignment is None or assignment.labeler_id != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="领取记录不存在。", request_id=request_id)

        task = self._db.get(TaskEntity, assignment.task_id)
        item = self._db.get(DatasetItemEntity, assignment.dataset_item_id)
        template_version = self._db.get(TemplateVersionEntity, assignment.template_version_id)
        if task is None or item is None or template_version is None:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_CONTEXT_INCOMPLETE",
                message="作答上下文不完整，请刷新或联系任务负责人。",
                request_id=request_id,
            )

        return AssignmentContextVO(
            assignment=self._to_assignment_vo(assignment),
            task=self._to_task_vo(task),
            dataset_item_payload=item.payload,
            template_schema=TemplateSchemaVO.model_validate(template_version.schema_json),
            latest_submission=self._to_submission_vo(self._get_latest_submission(assignment.id)),
            review_feedback=self._get_review_feedback(assignment.id),
            navigation=self._build_navigation(assignment, task),
        )

    def save_assignment_draft(
        self,
        *,
        assignment_id: str,
        user: UserVO,
        body: SaveAssignmentDraftRequest,
        request_id: str,
    ) -> AssignmentVO:
        self._require_labeler(user)
        assignment = self._db.get(AssignmentEntity, assignment_id)
        if assignment is None or assignment.labeler_id != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="领取记录不存在。", request_id=request_id)

        if assignment.status not in {
            AssignmentStatus.CLAIMED.value,
            AssignmentStatus.DRAFT_SAVED.value,
            AssignmentStatus.RETURNED.value,
        }:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_NOT_EDITABLE",
                message="当前题目状态不可保存草稿。",
                request_id=request_id,
            )

        if body.client_version != assignment.version:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_VERSION_CONFLICT",
                message="草稿已被更新，请重新加载后再继续编辑。",
                details={"currentVersion": assignment.version},
                request_id=request_id,
            )

        now = datetime.now(UTC)
        previous_status = assignment.status
        next_status = (
            AssignmentStatus.DRAFT_SAVED.value
            if assignment.status == AssignmentStatus.CLAIMED.value
            else assignment.status
        )
        save_result = self._db.execute(
            update(AssignmentEntity)
            .where(
                AssignmentEntity.id == assignment.id,
                AssignmentEntity.version == body.client_version,
            )
            .values(
                draft_values=body.values,
                draft_saved_at=now,
                status=next_status,
                version=AssignmentEntity.version + 1,
                updated_at=now,
            )
        )
        if save_result.rowcount != 1:
            current_version = self._db.scalar(
                select(AssignmentEntity.version).where(AssignmentEntity.id == assignment.id)
            )
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_VERSION_CONFLICT",
                message="草稿已被更新，请重新加载后再继续编辑。",
                details={"currentVersion": current_version if current_version is not None else assignment.version},
                request_id=request_id,
            )

        self._append_audit(
            entity_id=assignment.id,
            actor=user,
            action=AuditAction.ASSIGNMENT_DRAFT_SAVE,
            request_id=request_id,
            from_state=previous_status,
            to_state=next_status,
            metadata={
                "taskId": assignment.task_id,
                "datasetItemId": assignment.dataset_item_id,
                "fieldKeys": sorted(body.values.keys()),
                "clientVersion": body.client_version,
                "serverVersion": body.client_version + 1,
            },
        )
        self._db.commit()
        self._db.refresh(assignment)
        return self._to_assignment_vo(assignment)

    def create_submission(
        self,
        *,
        assignment_id: str,
        user: UserVO,
        body: CreateSubmissionRequest,
        request_id: str,
    ) -> SubmissionVO:
        self._require_labeler(user)
        assignment = self._db.get(AssignmentEntity, assignment_id)
        if assignment is None or assignment.labeler_id != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="领取记录不存在。", request_id=request_id)

        if body.idempotency_key:
            existing_submission = self._db.scalar(
                select(SubmissionEntity).where(SubmissionEntity.idempotency_key == body.idempotency_key)
            )
            if existing_submission is not None:
                if existing_submission.assignment_id != assignment.id or existing_submission.labeler_id != user.id:
                    raise ApiException(
                        status_code=409,
                        code="SUBMISSION_IDEMPOTENCY_CONFLICT",
                        message="提交幂等键已被其他题目使用。",
                        request_id=request_id,
                    )
                ReviewService(self._db).ensure_job_for_existing_submission(
                    assignment=assignment,
                    submission=existing_submission,
                    actor=user,
                    request_id=request_id,
                )
                existing_vo = self._to_submission_vo(existing_submission)
                assert existing_vo is not None
                return existing_vo

        if assignment.status not in {
            AssignmentStatus.CLAIMED.value,
            AssignmentStatus.DRAFT_SAVED.value,
            AssignmentStatus.RETURNED.value,
        }:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_NOT_EDITABLE",
                message="当前题目状态不可提交。",
                request_id=request_id,
            )

        if body.client_draft_version is not None and body.client_draft_version != assignment.version:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_VERSION_CONFLICT",
                message="题目草稿已被更新，请重新加载后再提交。",
                details={"currentVersion": assignment.version},
                request_id=request_id,
            )

        template_version = self._db.get(TemplateVersionEntity, assignment.template_version_id)
        if template_version is None:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_CONTEXT_INCOMPLETE",
                message="题目模板版本不存在，请联系任务负责人。",
                request_id=request_id,
            )

        schema = TemplateSchemaVO.model_validate(template_version.schema_json)
        validation = validate_submission_value(schema, body.values)
        if validation.errors:
            raise ApiException(
                status_code=422,
                code="SUBMISSION_VALIDATION_FAILED",
                message="提交内容未通过校验，请修正后再提交。",
                details={"errors": validation.error_details()},
                request_id=request_id,
            )

        task = self._db.get(TaskEntity, assignment.task_id)
        if task is None:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_CONTEXT_INCOMPLETE",
                message="题目所属任务不存在，请联系任务负责人。",
                request_id=request_id,
            )

        now = datetime.now(UTC)
        previous_status = assignment.status
        next_version = int(
            self._db.scalar(
                select(func.coalesce(func.max(SubmissionEntity.submission_version), 0)).where(
                    SubmissionEntity.assignment_id == assignment.id
                )
            )
            or 0
        ) + 1
        submission = SubmissionEntity(
            id=self._new_id("submission"),
            assignment_id=assignment.id,
            task_id=assignment.task_id,
            dataset_item_id=assignment.dataset_item_id,
            labeler_id=user.id,
            template_version_id=assignment.template_version_id,
            submission_version=next_version,
            values=validation.values,
            status=SubmissionStatus.AI_REVIEWING.value,
            idempotency_key=body.idempotency_key,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        self._db.add(submission)

        assignment.status = AssignmentStatus.SUBMITTED.value
        assignment.current_submission_id = submission.id
        assignment.submitted_at = now
        assignment.draft_values = validation.values
        assignment.draft_saved_at = now
        assignment.version += 1
        assignment.updated_at = now
        task.submitted_count += 1
        task.updated_at = now

        self._append_audit(
            entity_type=AuditEntityType.SUBMISSION,
            entity_id=submission.id,
            actor=user,
            action=AuditAction.SUBMISSION_CREATE,
            request_id=request_id,
            from_state=previous_status,
            to_state=AssignmentStatus.SUBMITTED.value,
            metadata={
                "taskId": assignment.task_id,
                "assignmentId": assignment.id,
                "datasetItemId": assignment.dataset_item_id,
                "templateVersionId": assignment.template_version_id,
                "submissionVersion": next_version,
                "fieldKeys": sorted(validation.values.keys()),
                "idempotencyKey": body.idempotency_key,
                "submissionStatus": SubmissionStatus.AI_REVIEWING.value,
            },
        )
        ReviewService(self._db).enqueue_for_submission(
            assignment=assignment,
            submission=submission,
            actor=user,
            request_id=request_id,
        )
        try:
            self._db.commit()
        except IntegrityError as exc:
            self._db.rollback()
            if body.idempotency_key:
                existing_submission = self._db.scalar(
                    select(SubmissionEntity).where(SubmissionEntity.idempotency_key == body.idempotency_key)
                )
                if existing_submission is not None and existing_submission.assignment_id == assignment_id:
                    existing_assignment = self._db.get(AssignmentEntity, existing_submission.assignment_id)
                    if existing_assignment is not None:
                        ReviewService(self._db).ensure_job_for_existing_submission(
                            assignment=existing_assignment,
                            submission=existing_submission,
                            actor=user,
                            request_id=request_id,
                        )
                    existing_vo = self._to_submission_vo(existing_submission)
                    assert existing_vo is not None
                    return existing_vo
            raise ApiException(
                status_code=409,
                code="SUBMISSION_CONFLICT",
                message="提交发生并发冲突，请刷新后重试。",
                request_id=request_id,
            ) from exc

        self._db.refresh(submission)
        submission_vo = self._to_submission_vo(submission)
        assert submission_vo is not None
        return submission_vo

    def run_llm_action(
        self,
        *,
        assignment_id: str,
        component_id: str,
        user: UserVO,
        body: RunLlmActionRequest,
        request_id: str,
    ) -> LlmActionRunVO:
        self._require_labeler(user)
        assignment = self._db.get(AssignmentEntity, assignment_id)
        if assignment is None or assignment.labeler_id != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="领取记录不存在。", request_id=request_id)

        if body.idempotency_key:
            existing_run = self._db.scalar(
                select(LlmActionRunEntity).where(LlmActionRunEntity.idempotency_key == body.idempotency_key)
            )
            if existing_run is not None:
                if existing_run.assignment_id != assignment.id or existing_run.component_id != component_id:
                    raise ApiException(
                        status_code=409,
                        code="LLM_ACTION_IDEMPOTENCY_CONFLICT",
                        message="LLM 动作幂等键已被其他题目或组件使用。",
                        request_id=request_id,
                    )
                return self._to_llm_action_run_vo(existing_run)

        if assignment.status not in {
            AssignmentStatus.CLAIMED.value,
            AssignmentStatus.DRAFT_SAVED.value,
            AssignmentStatus.RETURNED.value,
        }:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_NOT_EDITABLE",
                message="当前题目状态不可运行 LLM 辅助。",
                request_id=request_id,
            )

        task = self._db.get(TaskEntity, assignment.task_id)
        item = self._db.get(DatasetItemEntity, assignment.dataset_item_id)
        template_version = self._db.get(TemplateVersionEntity, assignment.template_version_id)
        if task is None or item is None or template_version is None:
            raise ApiException(
                status_code=409,
                code="ASSIGNMENT_CONTEXT_INCOMPLETE",
                message="作答上下文不完整，请刷新或联系任务负责人。",
                request_id=request_id,
            )

        schema = TemplateSchemaVO.model_validate(template_version.schema_json)
        component = self._get_llm_action_component(schema, component_id, request_id=request_id)
        target_field_key = self._resolve_llm_target_field(
            schema=schema,
            component=component,
            requested_target=body.target_field_key,
            request_id=request_id,
        )
        messages = self._build_llm_action_messages(
            schema=schema,
            component=component,
            target_field_key=target_field_key,
            item_payload=item.payload if isinstance(item.payload, dict) else {},
            input_values=body.input_values,
        )

        now = datetime.now(UTC)
        status = LlmActionRunStatus.SUCCEEDED
        output_value: Any | None = None
        output_values: dict[str, Any] | None = None
        error_message: str | None = None
        try:
            content = OpenAICompatibleLlmClient().complete(messages=messages)
            output_value, output_values = self._parse_llm_action_output(content, target_field_key)
        except LlmClientError as exc:
            status = LlmActionRunStatus.FAILED
            error_message = str(exc)

        run = LlmActionRunEntity(
            id=self._new_id("llm_action_run"),
            assignment_id=assignment.id,
            task_id=assignment.task_id,
            component_id=component.id,
            input_values=body.input_values,
            output_value=output_value,
            output_values=output_values,
            status=status.value,
            error_message=error_message,
            idempotency_key=body.idempotency_key,
            created_at=now,
        )
        self._db.add(run)
        self._append_audit(
            entity_type=AuditEntityType.LLM_ACTION_RUN,
            entity_id=run.id,
            actor=user,
            action=AuditAction.LLM_ACTION_RUN,
            request_id=request_id,
            to_state=status.value,
            metadata={
                "taskId": assignment.task_id,
                "assignmentId": assignment.id,
                "datasetItemId": assignment.dataset_item_id,
                "templateVersionId": assignment.template_version_id,
                "componentId": component.id,
                "targetFieldKey": target_field_key,
                "inputItemPaths": self._get_llm_input_item_paths(component),
                "inputFieldKeys": self._get_llm_input_field_keys(component),
                "idempotencyKey": body.idempotency_key,
            },
        )
        try:
            self._db.commit()
        except IntegrityError as exc:
            self._db.rollback()
            if body.idempotency_key:
                existing_run = self._db.scalar(
                    select(LlmActionRunEntity).where(LlmActionRunEntity.idempotency_key == body.idempotency_key)
                )
                if existing_run is not None and existing_run.assignment_id == assignment_id:
                    return self._to_llm_action_run_vo(existing_run)
            raise ApiException(
                status_code=409,
                code="LLM_ACTION_RUN_CONFLICT",
                message="LLM 动作记录写入发生冲突，请刷新后重试。",
                request_id=request_id,
            ) from exc

        self._db.refresh(run)
        return self._to_llm_action_run_vo(run)

    def _get_llm_action_component(
        self,
        schema: TemplateSchemaVO,
        component_id: str,
        *,
        request_id: str,
    ) -> TemplateComponentDTO:
        component = next((item for item in schema.components if item.id == component_id), None)
        if component is None:
            raise ApiException(
                status_code=404,
                code="LLM_ACTION_NOT_FOUND",
                message="当前题目的模板中不存在该 LLM 动作组件。",
                request_id=request_id,
            )
        if component.type != TemplateComponentType.LLM_ACTION.value:
            raise ApiException(
                status_code=422,
                code="INVALID_LLM_ACTION_COMPONENT",
                message="指定组件不是 LLM 动作组件。",
                request_id=request_id,
            )
        return component

    def _resolve_llm_target_field(
        self,
        *,
        schema: TemplateSchemaVO,
        component: TemplateComponentDTO,
        requested_target: str | None,
        request_id: str,
    ) -> str | None:
        target = (requested_target or self._get_string_prop(component.props.get("outputFieldKey")) or "").strip()
        if not target:
            return None
        field_keys = {item.field_key for item in schema.components if item.field_key}
        if target not in field_keys:
            raise ApiException(
                status_code=422,
                code="LLM_OUTPUT_FIELD_INVALID",
                message="LLM 动作输出字段不属于当前模板采集字段。",
                request_id=request_id,
            )
        return target

    def _build_llm_action_messages(
        self,
        *,
        schema: TemplateSchemaVO,
        component: TemplateComponentDTO,
        target_field_key: str | None,
        item_payload: dict[str, Any],
        input_values: dict[str, Any],
    ) -> list[dict[str, str]]:
        input_field_keys = self._get_llm_input_field_keys(component)
        scoped_values = {key: input_values.get(key) for key in input_field_keys if key in input_values}
        input_item_paths = self._get_llm_input_item_paths(component)
        selected_item_values = {
            path: self._read_payload_path(item_payload, path)
            for path in input_item_paths
        }
        prompt_template = self._get_string_prop(component.props.get("promptTemplate")) or ""
        target_component = self._find_component_by_field_key(schema, target_field_key)
        payload = {
            "component": {
                "id": component.id,
                "label": component.label,
                "targetFieldKey": target_field_key,
            },
            "targetField": {
                "fieldKey": target_field_key,
                "label": target_component.label if target_component else None,
            },
            "promptTemplate": prompt_template,
            "inputContext": {
                "itemValues": selected_item_values,
                "formValues": scoped_values,
            },
            "selectedItemValues": selected_item_values,
            "selectedInputValues": scoped_values,
        }
        # 只传入 Owner 显式选择的上下文，避免模型读取无关字段后串题。
        system_prompt = (
            "You are a LabelHub question-level annotation assistant. "
            "Use only selectedItemValues and selectedInputValues from the provided JSON context. "
            "You may use general knowledge to answer the selected question, but never infer from unselected raw item fields, "
            "prior tasks, hidden context, or unrelated dataset columns. "
            "Generate the value for the target field only. Do not add comparison judgments, tie judgments, review conclusions, "
            "reasoning, thinking, analysis, labels, prefixes, suffixes, or markdown unless the target field explicitly asks for them. "
            "Return one JSON object with keys outputValue and outputValues. "
            "If targetFieldKey is present, outputValues must include that field key."
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": self._compact_json(payload)},
        ]

    def _parse_llm_action_output(
        self,
        content: str,
        target_field_key: str | None,
    ) -> tuple[Any | None, dict[str, Any] | None]:
        parsed = self._try_parse_json_object(content)
        if parsed is None:
            text = content.strip()
            return text, {target_field_key: text} if target_field_key and text else None

        output_values = parsed.get("outputValues") if isinstance(parsed.get("outputValues"), dict) else {}
        output_value = None
        if target_field_key and target_field_key in output_values:
            output_value = output_values[target_field_key]
        elif "outputValue" in parsed:
            output_value = parsed["outputValue"]
        elif target_field_key and target_field_key in parsed:
            output_value = parsed[target_field_key]
        elif isinstance(parsed.get("text"), str):
            output_value = parsed["text"]
        else:
            output_value = parsed

        if target_field_key and output_value is not None and target_field_key not in output_values:
            output_values = {**output_values, target_field_key: output_value}
        return output_value, output_values or None

    def _try_parse_json_object(self, content: str) -> dict[str, Any] | None:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        for candidate in (text, text[text.find("{") : text.rfind("}") + 1] if "{" in text and "}" in text else ""):
            if not candidate:
                continue
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
        return None

    def _get_llm_input_field_keys(self, component: TemplateComponentDTO) -> list[str]:
        raw = component.props.get("inputFieldKeys")
        return [item for item in raw if isinstance(item, str) and item.strip()] if isinstance(raw, list) else []

    def _find_component_by_field_key(
        self,
        schema: TemplateSchemaVO,
        field_key: str | None,
    ) -> TemplateComponentDTO | None:
        if not field_key:
            return None
        return next((item for item in schema.components if item.field_key == field_key), None)

    def _get_llm_input_item_paths(self, component: TemplateComponentDTO) -> list[str]:
        raw = component.props.get("inputItemPaths")
        return [item for item in raw if isinstance(item, str) and item.strip().startswith("$")] if isinstance(raw, list) else []

    def _read_payload_path(self, payload: dict[str, Any], path: str) -> Any:
        if path == "$":
            return payload
        if not path.startswith("$."):
            return None
        current: Any = payload
        tokens = self._parse_payload_path_tokens(path)
        for token in tokens:
            if isinstance(current, list):
                try:
                    current = current[int(token)]
                except (ValueError, IndexError):
                    return None
            elif isinstance(current, dict):
                current = current.get(token)
            else:
                return None
        return current

    def _parse_payload_path_tokens(self, path: str) -> list[str]:
        tokens: list[str] = []
        index = 2
        token = ""
        while index < len(path):
            char = path[index]
            if char == ".":
                if token:
                    tokens.append(token)
                    token = ""
            elif char == "[":
                if token:
                    tokens.append(token)
                    token = ""
                end = path.find("]", index)
                if end == -1:
                    return tokens
                bracket_token = path[index + 1 : end].strip()
                if bracket_token:
                    tokens.append(bracket_token)
                index = end
            else:
                token += char
            index += 1
        if token:
            tokens.append(token)
        return tokens

    def _compact_json(self, value: dict[str, Any], *, max_length: int = 12000) -> str:
        text = json.dumps(value, ensure_ascii=False, default=str)
        return text if len(text) <= max_length else f"{text[:max_length]}...<truncated>"

    def _get_string_prop(self, value: Any) -> str | None:
        return value if isinstance(value, str) else None

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
            active_assignment_id=self._find_active_assignment_id(task.id, user.id),
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
            distribution_strategy=DistributionStrategy(task.distribution_strategy),
            status=TaskStatus(task.status),
            current_template_version_id=task.current_template_version_id,
            current_review_config_version_id=task.current_review_config_version_id,
            created_by=task.created_by,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def _to_submission_vo(self, submission: SubmissionEntity | None) -> SubmissionVO | None:
        if submission is None:
            return None
        return SubmissionVO(
            id=submission.id,
            assignment_id=submission.assignment_id,
            task_id=submission.task_id,
            dataset_item_id=submission.dataset_item_id,
            labeler_id=submission.labeler_id,
            template_version_id=submission.template_version_id,
            submission_version=submission.submission_version,
            values=submission.values,
            status=SubmissionStatus(submission.status),
            idempotency_key=submission.idempotency_key,
            submitted_at=submission.submitted_at,
            created_at=submission.created_at,
            updated_at=submission.updated_at,
        )

    def _to_llm_action_run_vo(self, run: LlmActionRunEntity) -> LlmActionRunVO:
        return LlmActionRunVO(
            id=run.id,
            assignment_id=run.assignment_id,
            task_id=run.task_id,
            component_id=run.component_id,
            status=LlmActionRunStatus(run.status),
            input_values=run.input_values,
            output_value=run.output_value,
            output_values=run.output_values,
            error_message=run.error_message,
            idempotency_key=run.idempotency_key,
            created_at=run.created_at,
        )

    def _to_contribution_item_vo(self, assignment: AssignmentEntity) -> ContributionItemVO:
        task = self._db.get(TaskEntity, assignment.task_id)
        item = self._db.get(DatasetItemEntity, assignment.dataset_item_id)
        latest_submission = self._get_latest_submission(assignment.id)
        return ContributionItemVO(
            assignment_id=assignment.id,
            task_id=assignment.task_id,
            task_title=task.title if task else "Unknown task",
            task_description=task.description if task else None,
            dataset_item_id=assignment.dataset_item_id,
            dataset_item_preview=self._preview_dataset_item(item),
            status=AssignmentStatus(assignment.status),
            latest_submission_id=latest_submission.id if latest_submission else None,
            latest_submission_version=latest_submission.submission_version if latest_submission else None,
            latest_submission_status=SubmissionStatus(latest_submission.status) if latest_submission else None,
            claimed_at=assignment.claimed_at,
            draft_saved_at=assignment.draft_saved_at,
            submitted_at=assignment.submitted_at,
            updated_at=assignment.updated_at,
            can_continue=assignment.status in self._draft_status_values(),
            can_revise=assignment.status == AssignmentStatus.RETURNED.value,
            review_feedback=self._get_review_feedback(assignment.id),
        )

    def _contribution_query(
        self,
        *,
        user: UserVO,
        bucket: ContributionBucket,
        keyword: str | None,
    ) -> Select[tuple[AssignmentEntity]]:
        query = select(AssignmentEntity).where(
            AssignmentEntity.labeler_id == user.id,
            AssignmentEntity.status != AssignmentStatus.CANCELLED.value,
        )
        statuses = self._contribution_bucket_statuses(bucket)
        if statuses:
            query = query.where(AssignmentEntity.status.in_(statuses))

        normalized_keyword = keyword.strip() if keyword else ""
        if normalized_keyword:
            pattern = f"%{normalized_keyword}%"
            query = query.join(TaskEntity, AssignmentEntity.task_id == TaskEntity.id).where(
                or_(
                    TaskEntity.title.like(pattern),
                    TaskEntity.description.like(pattern),
                    AssignmentEntity.dataset_item_id.like(pattern),
                )
            )
        return query

    def _contribution_bucket_statuses(self, bucket: ContributionBucket) -> list[str]:
        if bucket == ContributionBucket.ALL:
            return []
        if bucket == ContributionBucket.DRAFT:
            return self._draft_status_values()
        if bucket == ContributionBucket.IN_REVIEW:
            return [AssignmentStatus.SUBMITTED.value]
        if bucket == ContributionBucket.APPROVED:
            return [AssignmentStatus.APPROVED.value]
        if bucket in {ContributionBucket.RETURNED, ContributionBucket.REVISION_REQUIRED}:
            return [AssignmentStatus.RETURNED.value]
        return []

    def _draft_status_values(self) -> list[str]:
        return [AssignmentStatus.CLAIMED.value, AssignmentStatus.DRAFT_SAVED.value]

    def _preview_dataset_item(self, item: DatasetItemEntity | None) -> str:
        if item is None:
            return ""
        payload = item.payload if isinstance(item.payload, dict) else {}
        for key in ("prompt", "question", "title", "text", "content"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:120]
        return item.external_item_id or item.id

    def _get_review_feedback(self, assignment_id: str) -> ReviewFeedbackVO | None:
        audit = self._db.scalar(
            select(AuditLogEntity)
            .where(
                AuditLogEntity.entity_type == AuditEntityType.ASSIGNMENT.value,
                AuditLogEntity.entity_id == assignment_id,
                AuditLogEntity.to_state == AssignmentStatus.RETURNED.value,
            )
            .order_by(AuditLogEntity.created_at.desc())
            .limit(1)
        )
        if audit is None:
            audit = self._find_returned_submission_audit(assignment_id)
        if audit is None:
            return None

        metadata = audit.metadata_json if isinstance(audit.metadata_json, dict) else {}
        reason = audit.reason or metadata.get("reason")
        # 阶段 3.5 只展示最近一次意见；完整多轮时间线在 Reviewer 阶段扩展。
        return ReviewFeedbackVO(
            reason=reason if isinstance(reason, str) and reason.strip() else "审核未通过，请按意见修改后重新提交。",
            source=str(metadata.get("source") or audit.action),
            reviewer_id=audit.actor_id,
            reviewer_role=audit.actor_role,
            returned_at=audit.created_at,
            metadata=metadata,
        )

    def _find_returned_submission_audit(self, assignment_id: str) -> AuditLogEntity | None:
        recent_audits = list(
            self._db.scalars(
                select(AuditLogEntity)
                .where(
                    AuditLogEntity.entity_type == AuditEntityType.SUBMISSION.value,
                    AuditLogEntity.to_state == AssignmentStatus.RETURNED.value,
                )
                .order_by(AuditLogEntity.created_at.desc())
                .limit(50)
            )
        )
        for audit in recent_audits:
            metadata = audit.metadata_json if isinstance(audit.metadata_json, dict) else {}
            if metadata.get("assignmentId") == assignment_id:
                return audit
        return None

    def _get_latest_submission(self, assignment_id: str) -> SubmissionEntity | None:
        return self._db.scalar(
            select(SubmissionEntity)
            .where(SubmissionEntity.assignment_id == assignment_id)
            .order_by(SubmissionEntity.submission_version.desc(), SubmissionEntity.created_at.desc())
            .limit(1)
        )

    def _build_navigation(self, assignment: AssignmentEntity, task: TaskEntity) -> AssignmentNavigationVO:
        assignments = list(
            self._db.scalars(
                select(AssignmentEntity)
                .where(
                    AssignmentEntity.task_id == assignment.task_id,
                    AssignmentEntity.labeler_id == assignment.labeler_id,
                    AssignmentEntity.status != AssignmentStatus.CANCELLED.value,
                )
                .order_by(AssignmentEntity.claimed_at.asc(), AssignmentEntity.id.asc())
            )
        )
        ids = [item.id for item in assignments]
        current_index = ids.index(assignment.id) if assignment.id in ids else 0
        can_claim_next = self._can_claim_next(task)
        return AssignmentNavigationVO(
            previous_assignment_id=ids[current_index - 1] if current_index > 0 else None,
            next_assignment_id=ids[current_index + 1] if current_index + 1 < len(ids) else None,
            current_index=current_index + 1 if ids else 1,
            total_count=len(ids),
            can_claim_next=can_claim_next,
            next_claimable_task_id=task.id if can_claim_next else None,
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

    def _find_active_assignment_id(self, task_id: str, labeler_id: str) -> str | None:
        return self._db.scalar(
            select(AssignmentEntity.id)
            .where(
                AssignmentEntity.task_id == task_id,
                AssignmentEntity.labeler_id == labeler_id,
                AssignmentEntity.status.in_(
                    [
                        AssignmentStatus.CLAIMED.value,
                        AssignmentStatus.DRAFT_SAVED.value,
                        AssignmentStatus.RETURNED.value,
                    ]
                ),
            )
            .order_by(AssignmentEntity.updated_at.desc(), AssignmentEntity.claimed_at.desc())
            .limit(1)
        )

    def _can_claim_next(self, task: TaskEntity) -> bool:
        return (
            task.status == TaskStatus.PUBLISHED.value
            and bool(task.current_template_version_id)
            and bool(task.current_review_config_version_id)
            and task.distribution_strategy == DistributionStrategy.FIRST_COME_FIRST_SERVED.value
            and task.deadline_at is not None
            and self._is_future(task.deadline_at)
            and task.claimed_count < task.quota
            and self._count_available_items(task.id) > 0
        )

    def _append_audit(
        self,
        *,
        entity_id: str,
        actor: UserVO,
        request_id: str,
        metadata: dict[str, Any],
        entity_type: AuditEntityType = AuditEntityType.ASSIGNMENT,
        action: AuditAction = AuditAction.ASSIGNMENT_CLAIM,
        from_state: str | None = None,
        to_state: str | None = AssignmentStatus.CLAIMED.value,
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
