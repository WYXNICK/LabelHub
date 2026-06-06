from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AiReviewConclusion,
    AssignmentStatus,
    AuditAction,
    AuditEntityType,
    ReviewConfigVersionStatus,
    ReviewJobStatus,
    ReviewStatus,
    SubmissionStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.assignment import AssignmentEntity, SubmissionEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetItemEntity
from labelhub_api.models.review import ReviewEntity, ReviewJobEntity
from labelhub_api.models.review_config import ReviewConfigVersionEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateVersionEntity
from labelhub_api.schemas.assignments import AssignmentVO, SubmissionVO
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.review_configs import ReviewConfigVersionVO, ReviewDimensionDTO, ReviewThresholdDTO
from labelhub_api.schemas.reviews import (
    AiReviewIssueDTO,
    ClaimReviewJobResponse,
    CompleteReviewJobRequest,
    ReviewDetailVO,
    ReviewJobVO,
    ReviewTimelineItemVO,
    ReviewVO,
)
from labelhub_api.schemas.tasks import TaskVO
from labelhub_api.schemas.templates import TemplateSchemaVO


class ReviewService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def enqueue_for_submission(
        self,
        *,
        assignment: AssignmentEntity,
        submission: SubmissionEntity,
        actor: UserVO,
        request_id: str,
    ) -> ReviewJobEntity:
        idempotency_key = self._job_idempotency_key(
            submission_id=submission.id,
            submission_version=submission.submission_version,
            review_config_version_id=assignment.review_config_version_id,
        )
        existing = self._db.scalar(select(ReviewJobEntity).where(ReviewJobEntity.idempotency_key == idempotency_key))
        if existing is not None:
            return existing

        now = datetime.now(UTC)
        job = ReviewJobEntity(
            id=self._new_id("review_job"),
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            submission_id=submission.id,
            review_config_version_id=assignment.review_config_version_id,
            status=ReviewJobStatus.QUEUED.value,
            attempt_count=0,
            max_attempts=3,
            idempotency_key=idempotency_key,
            last_error=None,
            locked_by=None,
            locked_at=None,
            started_at=None,
            finished_at=None,
            created_at=now,
            updated_at=now,
        )
        self._db.add(job)
        self._append_audit(
            entity_type=AuditEntityType.REVIEW_JOB,
            entity_id=job.id,
            actor=actor,
            action=AuditAction.REVIEW_JOB_CREATE,
            request_id=request_id,
            from_state=None,
            to_state=ReviewJobStatus.QUEUED.value,
            metadata={
                "taskId": assignment.task_id,
                "assignmentId": assignment.id,
                "submissionId": submission.id,
                "submissionVersion": submission.submission_version,
                "reviewConfigVersionId": assignment.review_config_version_id,
                "idempotencyKey": idempotency_key,
            },
        )
        return job

    def ensure_job_for_existing_submission(
        self,
        *,
        assignment: AssignmentEntity,
        submission: SubmissionEntity,
        actor: UserVO,
        request_id: str,
    ) -> ReviewJobEntity:
        job = self.enqueue_for_submission(
            assignment=assignment,
            submission=submission,
            actor=actor,
            request_id=request_id,
        )
        self._db.commit()
        self._db.refresh(job)
        return job

    def list_review_jobs(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        status: ReviewJobStatus | None = None,
        task_id: str | None = None,
    ) -> PageVO[ReviewJobVO]:
        self._require_reviewer_or_system(user)
        query = select(ReviewJobEntity)
        if status is not None:
            query = query.where(ReviewJobEntity.status == status.value)
        if task_id:
            query = query.where(ReviewJobEntity.task_id == task_id)

        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        jobs = list(
            self._db.scalars(
                query.order_by(ReviewJobEntity.created_at.desc(), ReviewJobEntity.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_review_job_vo(job) for job in jobs],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def claim_review_job(
        self,
        *,
        user: UserVO,
        worker_id: str,
        request_id: str,
    ) -> ClaimReviewJobResponse:
        self._require_system(user)
        job = self._db.scalar(
            select(ReviewJobEntity)
            .where(
                ReviewJobEntity.status.in_([ReviewJobStatus.QUEUED.value, ReviewJobStatus.FAILED.value]),
                ReviewJobEntity.attempt_count < ReviewJobEntity.max_attempts,
            )
            .order_by(ReviewJobEntity.created_at.asc(), ReviewJobEntity.id.asc())
            .limit(1)
        )
        if job is None:
            return ClaimReviewJobResponse()

        now = datetime.now(UTC)
        previous_status = job.status
        result = self._db.execute(
            update(ReviewJobEntity)
            .where(
                ReviewJobEntity.id == job.id,
                ReviewJobEntity.status == previous_status,
                ReviewJobEntity.attempt_count < ReviewJobEntity.max_attempts,
            )
            .values(
                status=ReviewJobStatus.RUNNING.value,
                attempt_count=ReviewJobEntity.attempt_count + 1,
                locked_by=worker_id,
                locked_at=now,
                started_at=now,
                last_error=None,
                updated_at=now,
            )
        )
        if result.rowcount != 1:
            raise ApiException(
                status_code=409,
                code="REVIEW_JOB_CLAIM_CONFLICT",
                message="预审任务已被其他 Agent 领取，请重试。",
                request_id=request_id,
            )

        self._append_audit(
            entity_type=AuditEntityType.REVIEW_JOB,
            entity_id=job.id,
            actor=user,
            action=AuditAction.REVIEW_JOB_CLAIM,
            request_id=request_id,
            from_state=previous_status,
            to_state=ReviewJobStatus.RUNNING.value,
            metadata={"workerId": worker_id},
        )
        self._db.commit()
        self._db.refresh(job)
        return self._build_claim_response(job)

    def complete_review_job(
        self,
        *,
        job_id: str,
        user: UserVO,
        body: CompleteReviewJobRequest,
        request_id: str,
    ) -> ReviewJobVO:
        self._require_system(user)
        job = self._db.get(ReviewJobEntity, job_id)
        if job is None:
            raise ApiException(status_code=404, code="NOT_FOUND", message="预审任务不存在。", request_id=request_id)
        if job.status != ReviewJobStatus.RUNNING.value:
            raise ApiException(
                status_code=409,
                code="REVIEW_JOB_NOT_RUNNING",
                message="只有运行中的预审任务可以写回结果。",
                request_id=request_id,
            )

        now = datetime.now(UTC)
        previous_status = job.status
        if body.result is None:
            next_status = (
                ReviewJobStatus.NEEDS_HUMAN_REVIEW.value
                if job.attempt_count >= job.max_attempts
                else ReviewJobStatus.FAILED.value
            )
            job.status = next_status
            job.last_error = body.error_message or "AI 预审失败，等待重试或人工兜底。"
            if next_status == ReviewJobStatus.NEEDS_HUMAN_REVIEW.value:
                self._create_ai_review_from_failure(job, now=now)
        else:
            job.status = ReviewJobStatus.SUCCEEDED.value
            job.last_error = None
            self._create_ai_review_from_result(job, result=body.result, now=now)

        job.finished_at = now
        job.locked_by = None
        job.locked_at = None
        job.updated_at = now
        self._append_audit(
            entity_type=AuditEntityType.REVIEW_JOB,
            entity_id=job.id,
            actor=user,
            action=AuditAction.REVIEW_JOB_RESULT,
            request_id=request_id,
            from_state=previous_status,
            to_state=job.status,
            metadata={
                "submissionId": job.submission_id,
                "hasResult": body.result is not None,
                "errorMessage": body.error_message,
            },
        )
        self._db.commit()
        self._db.refresh(job)
        return self._to_review_job_vo(job)

    def list_reviews(
        self,
        *,
        user: UserVO,
        page: int,
        page_size: int,
        status: ReviewStatus | None = None,
        task_id: str | None = None,
        ai_conclusion: AiReviewConclusion | None = None,
    ) -> PageVO[ReviewVO]:
        self._require_reviewer_or_system(user)
        query = select(ReviewEntity)
        if status is not None:
            query = query.where(ReviewEntity.status == status.value)
        if task_id:
            query = query.where(ReviewEntity.task_id == task_id)
        if ai_conclusion is not None:
            query = query.where(ReviewEntity.ai_conclusion == ai_conclusion.value)

        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        reviews = list(
            self._db.scalars(
                query.order_by(ReviewEntity.updated_at.desc(), ReviewEntity.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_review_vo(review) for review in reviews],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def get_review_detail(self, *, review_id: str, user: UserVO, request_id: str) -> ReviewDetailVO:
        self._require_reviewer_or_system(user)
        review = self._db.get(ReviewEntity, review_id)
        if review is None:
            raise ApiException(status_code=404, code="NOT_FOUND", message="审核记录不存在。", request_id=request_id)
        assignment = self._require_entity(self._db.get(AssignmentEntity, review.assignment_id), request_id)
        submission = self._require_entity(self._db.get(SubmissionEntity, review.submission_id), request_id)
        task = self._require_entity(self._db.get(TaskEntity, review.task_id), request_id)
        item = self._require_entity(self._db.get(DatasetItemEntity, assignment.dataset_item_id), request_id)
        template = self._require_entity(self._db.get(TemplateVersionEntity, assignment.template_version_id), request_id)
        review_config = self._require_entity(
            self._db.get(ReviewConfigVersionEntity, assignment.review_config_version_id),
            request_id,
        )
        timeline = list(
            self._db.scalars(
                select(AuditLogEntity)
                .where(
                    AuditLogEntity.entity_type.in_(
                        [
                            AuditEntityType.REVIEW_JOB.value,
                            AuditEntityType.REVIEW.value,
                            AuditEntityType.SUBMISSION.value,
                            AuditEntityType.ASSIGNMENT.value,
                        ]
                    ),
                    AuditLogEntity.entity_id.in_([review.review_job_id, review.id, submission.id, assignment.id]),
                )
                .order_by(AuditLogEntity.created_at.asc())
            )
        )
        return ReviewDetailVO(
            review=self._to_review_vo(review),
            task=self._to_task_vo(task),
            assignment=self._to_assignment_vo(assignment),
            submission=self._to_submission_vo(submission),
            dataset_item_payload=item.payload,
            template_schema=TemplateSchemaVO.model_validate(template.schema_json),
            review_config_version=self._to_review_config_version_vo(review_config),
            timeline=[self._to_timeline_item_vo(item) for item in timeline],
        )

    def _build_claim_response(self, job: ReviewJobEntity) -> ClaimReviewJobResponse:
        assignment = self._db.get(AssignmentEntity, job.assignment_id)
        submission = self._db.get(SubmissionEntity, job.submission_id)
        task = self._db.get(TaskEntity, job.task_id)
        if assignment is None or submission is None or task is None:
            raise ApiException(status_code=409, code="REVIEW_JOB_CONTEXT_INCOMPLETE", message="预审上下文不完整。")
        item = self._db.get(DatasetItemEntity, assignment.dataset_item_id)
        template = self._db.get(TemplateVersionEntity, assignment.template_version_id)
        review_config = self._db.get(ReviewConfigVersionEntity, assignment.review_config_version_id)
        if item is None or template is None or review_config is None:
            raise ApiException(status_code=409, code="REVIEW_JOB_CONTEXT_INCOMPLETE", message="预审上下文不完整。")
        return ClaimReviewJobResponse(
            job=self._to_review_job_vo(job),
            submission=self._to_submission_vo(submission),
            assignment=self._to_assignment_vo(assignment),
            task=self._to_task_vo(task),
            dataset_item_payload=item.payload,
            template_schema=TemplateSchemaVO.model_validate(template.schema_json),
            review_config_version=self._to_review_config_version_vo(review_config),
        )

    def _create_ai_review_from_result(self, job: ReviewJobEntity, *, result: object, now: datetime) -> None:
        if self._db.scalar(select(ReviewEntity).where(ReviewEntity.review_job_id == job.id)) is not None:
            return
        submission = self._db.get(SubmissionEntity, job.submission_id)
        if submission is not None:
            submission.status = SubmissionStatus.HUMAN_REVIEWING.value
            submission.updated_at = now
        self._db.add(
            ReviewEntity(
                id=self._new_id("review"),
                task_id=job.task_id,
                assignment_id=job.assignment_id,
                submission_id=job.submission_id,
                review_job_id=job.id,
                status=ReviewStatus.PENDING_HUMAN_REVIEW.value,
                ai_conclusion=result.conclusion.value,
                ai_scores=result.scores,
                ai_comment=result.summary,
                ai_issues=[issue.model_dump(by_alias=True) for issue in result.issues],
                ai_suggestions=result.suggestions,
                raw_output=result.raw_output,
                prompt_snapshot=result.prompt_snapshot,
                human_conclusion=None,
                reviewer_id=None,
                human_comment=None,
                dimension_comments={},
                review_round=1,
                version=0,
                created_at=now,
                updated_at=now,
            )
        )

    def _create_ai_review_from_failure(self, job: ReviewJobEntity, *, now: datetime) -> None:
        if self._db.scalar(select(ReviewEntity).where(ReviewEntity.review_job_id == job.id)) is not None:
            return
        submission = self._db.get(SubmissionEntity, job.submission_id)
        if submission is not None:
            submission.status = SubmissionStatus.HUMAN_REVIEWING.value
            submission.updated_at = now
        self._db.add(
            ReviewEntity(
                id=self._new_id("review"),
                task_id=job.task_id,
                assignment_id=job.assignment_id,
                submission_id=job.submission_id,
                review_job_id=job.id,
                status=ReviewStatus.PENDING_HUMAN_REVIEW.value,
                ai_conclusion=AiReviewConclusion.NEEDS_HUMAN_REVIEW.value,
                ai_scores={},
                ai_comment=job.last_error or "AI 预审失败，已转入人工兜底。",
                ai_issues=[],
                ai_suggestions=None,
                raw_output=None,
                prompt_snapshot=None,
                human_conclusion=None,
                reviewer_id=None,
                human_comment=None,
                dimension_comments={},
                review_round=1,
                version=0,
                created_at=now,
                updated_at=now,
            )
        )

    def _job_idempotency_key(
        self,
        *,
        submission_id: str,
        submission_version: int,
        review_config_version_id: str,
    ) -> str:
        return f"{submission_id}:{submission_version}:{review_config_version_id}"

    def _to_review_job_vo(self, job: ReviewJobEntity) -> ReviewJobVO:
        return ReviewJobVO(
            id=job.id,
            task_id=job.task_id,
            assignment_id=job.assignment_id,
            submission_id=job.submission_id,
            review_config_version_id=job.review_config_version_id,
            status=ReviewJobStatus(job.status),
            attempt_count=job.attempt_count,
            max_attempts=job.max_attempts,
            idempotency_key=job.idempotency_key,
            last_error=job.last_error,
            locked_by=job.locked_by,
            locked_at=job.locked_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _to_review_vo(self, review: ReviewEntity) -> ReviewVO:
        return ReviewVO(
            id=review.id,
            task_id=review.task_id,
            submission_id=review.submission_id,
            assignment_id=review.assignment_id,
            review_job_id=review.review_job_id,
            status=ReviewStatus(review.status),
            ai_conclusion=AiReviewConclusion(review.ai_conclusion) if review.ai_conclusion else None,
            ai_scores=review.ai_scores,
            ai_comment=review.ai_comment,
            ai_issues=[AiReviewIssueDTO(**issue) for issue in review.ai_issues],
            ai_suggestions=review.ai_suggestions,
            human_conclusion=review.human_conclusion,
            reviewer_id=review.reviewer_id,
            human_comment=review.human_comment,
            dimension_comments=review.dimension_comments,
            review_round=review.review_round,
            version=review.version,
            created_at=review.created_at,
            updated_at=review.updated_at,
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

    def _to_submission_vo(self, submission: SubmissionEntity) -> SubmissionVO:
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
            current_template_version_id=task.current_template_version_id,
            current_review_config_version_id=task.current_review_config_version_id,
            created_by=task.created_by,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def _to_review_config_version_vo(self, version: ReviewConfigVersionEntity) -> ReviewConfigVersionVO:
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

    def _to_timeline_item_vo(self, audit: AuditLogEntity) -> ReviewTimelineItemVO:
        return ReviewTimelineItemVO(
            actor_role=audit.actor_role,
            action=audit.action,
            from_state=audit.from_state,
            to_state=audit.to_state,
            reason=audit.reason,
            metadata=audit.metadata_json or {},
            created_at=audit.created_at,
        )

    def _append_audit(
        self,
        *,
        entity_type: AuditEntityType,
        entity_id: str,
        actor: UserVO,
        action: AuditAction,
        request_id: str,
        metadata: dict[str, object],
        from_state: str | None = None,
        to_state: str | None = None,
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
                from_state=from_state,
                to_state=to_state,
                reason=reason,
                metadata_json=metadata,
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
        )

    def _require_reviewer_or_system(self, user: UserVO) -> None:
        if user.role not in {UserRole.REVIEWER, UserRole.SYSTEM}:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅审核员或系统 Agent 可以访问审核队列。")

    def _require_system(self, user: UserVO) -> None:
        if user.role != UserRole.SYSTEM:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅系统 Agent 可以操作预审任务。")

    def _require_entity(self, entity: object | None, request_id: str) -> object:
        if entity is None:
            raise ApiException(
                status_code=409,
                code="REVIEW_CONTEXT_INCOMPLETE",
                message="审核上下文不完整，请刷新或联系任务负责人。",
                request_id=request_id,
            )
        return entity

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
