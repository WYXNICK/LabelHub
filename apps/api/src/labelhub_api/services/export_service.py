from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    ExportFieldSource,
    ExportJobStatus,
    ReviewStatus,
    SubmissionStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.assignment import SubmissionEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetItemEntity
from labelhub_api.models.export import ExportJobEntity
from labelhub_api.models.review import ReviewEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateVersionEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.exports import (
    CreateExportJobRequest,
    ExportFieldMappingDTO,
    ExportFieldOptionVO,
    ExportFieldOptionsVO,
    ExportJobVO,
)
from labelhub_api.schemas.templates import TemplateSchemaVO


class ExportService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_field_options(self, *, task_id: str, user: UserVO) -> ExportFieldOptionsVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        approved_count = self._approved_count(task.id)
        latest_approved_at = self._latest_approved_at(task.id)
        sample_review, sample_submission, sample_item = self._get_sample_approved_row(task.id)
        if sample_item is None:
            sample_item = self._get_first_dataset_item(task.id)

        template_schema = self._get_current_template_schema(task)
        options = [
            *self._build_dataset_options(sample_item.payload if sample_item is not None else {}),
            *self._build_submission_options(template_schema, sample_submission.values if sample_submission else {}),
            *self._build_review_options(sample_review),
            self._build_audit_timeline_option(),
        ]
        return ExportFieldOptionsVO(
            task_id=task.id,
            task_title=task.title,
            approved_count=approved_count,
            latest_approved_at=latest_approved_at,
            options=options,
        )

    def create_export_job(
        self,
        *,
        task_id: str,
        user: UserVO,
        body: CreateExportJobRequest,
        request_id: str,
    ) -> ExportJobVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        existing = self._get_existing_idempotent_job(body.idempotency_key, task_id=task.id, user_id=user.id)
        if existing is not None:
            return self._to_export_job_vo(existing, task_title=task.title)

        approved_count = self._approved_count(task.id)
        if approved_count == 0:
            raise ApiException(
                status_code=409,
                code="NO_EXPORTABLE_ROWS",
                message="当前任务暂无人工审核通过的数据，不能创建导出任务。",
                request_id=request_id,
            )

        selected_mappings = sorted(
            [mapping for mapping in body.field_mappings if mapping.selected],
            key=lambda mapping: mapping.order,
        )
        if not selected_mappings:
            raise ApiException(
                status_code=422,
                code="NO_SELECTED_EXPORT_FIELDS",
                message="请至少选择一个导出字段。",
                request_id=request_id,
            )
        self._validate_mappings(task.id, selected_mappings, user=user, request_id=request_id)

        now = datetime.now(UTC)
        job = ExportJobEntity(
            id=self._new_id("export_job"),
            task_id=task.id,
            format=body.format.value,
            status=ExportJobStatus.QUEUED.value,
            field_mappings=[mapping.model_dump(by_alias=True, mode="json") for mapping in selected_mappings],
            include_review_records=body.include_review_records,
            include_audit_timeline=body.include_audit_timeline,
            total_rows=approved_count,
            exported_rows=0,
            file_object_id=None,
            file_name=None,
            file_size_bytes=None,
            error_message=None,
            idempotency_key=body.idempotency_key,
            created_by=user.id,
            started_at=None,
            finished_at=None,
            created_at=now,
            updated_at=now,
        )
        self._db.add(job)
        self._append_audit(
            entity_id=job.id,
            actor=user,
            action=AuditAction.EXPORT_JOB_CREATE,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "format": body.format.value,
                "fieldCount": len(selected_mappings),
                "totalRows": approved_count,
                "includeReviewRecords": body.include_review_records,
                "includeAuditTimeline": body.include_audit_timeline,
            },
        )
        self._db.commit()
        self._db.refresh(job)
        return self._to_export_job_vo(job, task_title=task.title)

    def list_export_jobs(
        self,
        *,
        task_id: str,
        user: UserVO,
        page: int,
        page_size: int,
    ) -> PageVO[ExportJobVO]:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        query = select(ExportJobEntity).where(
            ExportJobEntity.task_id == task.id,
            ExportJobEntity.created_by == user.id,
        )
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        jobs = list(
            self._db.scalars(
                query.order_by(ExportJobEntity.created_at.desc(), ExportJobEntity.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_export_job_vo(job, task_title=task.title) for job in jobs],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def get_export_job(self, *, export_job_id: str, user: UserVO) -> ExportJobVO:
        self._require_owner(user)
        job, task = self._get_owned_export_job(export_job_id, user)
        return self._to_export_job_vo(job, task_title=task.title)

    def ensure_download_ready(self, *, export_job_id: str, user: UserVO, request_id: str) -> ExportJobEntity:
        self._require_owner(user)
        job, _task = self._get_owned_export_job(export_job_id, user)
        if job.status != ExportJobStatus.SUCCEEDED.value or not job.file_object_id:
            raise ApiException(
                status_code=409,
                code="EXPORT_FILE_NOT_READY",
                message="导出文件尚未生成完成，请稍后再试。",
                request_id=request_id,
            )
        return job

    def _get_owned_task(self, task_id: str, user: UserVO) -> TaskEntity:
        task = self._db.get(TaskEntity, task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。")
        return task

    def _get_owned_export_job(self, export_job_id: str, user: UserVO) -> tuple[ExportJobEntity, TaskEntity]:
        job = self._db.get(ExportJobEntity, export_job_id)
        if job is None or job.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="导出任务不存在。")
        task = self._db.get(TaskEntity, job.task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="导出任务不存在。")
        return job, task

    def _approved_count(self, task_id: str) -> int:
        return int(
            self._db.scalar(
                select(func.count()).select_from(ReviewEntity).join(
                    SubmissionEntity,
                    ReviewEntity.submission_id == SubmissionEntity.id,
                ).where(
                    ReviewEntity.task_id == task_id,
                    ReviewEntity.status == ReviewStatus.APPROVED.value,
                    SubmissionEntity.status == SubmissionStatus.APPROVED.value,
                )
            )
            or 0
        )

    def _latest_approved_at(self, task_id: str) -> datetime | None:
        return self._db.scalar(
            select(func.max(ReviewEntity.updated_at)).join(
                SubmissionEntity,
                ReviewEntity.submission_id == SubmissionEntity.id,
            ).where(
                ReviewEntity.task_id == task_id,
                ReviewEntity.status == ReviewStatus.APPROVED.value,
                SubmissionEntity.status == SubmissionStatus.APPROVED.value,
            )
        )

    def _get_sample_approved_row(
        self,
        task_id: str,
    ) -> tuple[ReviewEntity | None, SubmissionEntity | None, DatasetItemEntity | None]:
        row = self._db.execute(
            select(ReviewEntity, SubmissionEntity, DatasetItemEntity)
            .join(SubmissionEntity, ReviewEntity.submission_id == SubmissionEntity.id)
            .join(DatasetItemEntity, SubmissionEntity.dataset_item_id == DatasetItemEntity.id)
            .where(
                ReviewEntity.task_id == task_id,
                ReviewEntity.status == ReviewStatus.APPROVED.value,
                SubmissionEntity.status == SubmissionStatus.APPROVED.value,
            )
            .order_by(ReviewEntity.updated_at.desc(), ReviewEntity.id.desc())
            .limit(1)
        ).first()
        if row is None:
            return None, None, None
        return row[0], row[1], row[2]

    def _get_first_dataset_item(self, task_id: str) -> DatasetItemEntity | None:
        return self._db.scalar(
            select(DatasetItemEntity)
            .where(DatasetItemEntity.task_id == task_id)
            .order_by(DatasetItemEntity.source_row_number.asc(), DatasetItemEntity.created_at.asc())
            .limit(1)
        )

    def _get_current_template_schema(self, task: TaskEntity) -> TemplateSchemaVO | None:
        if not task.current_template_version_id:
            return None
        version = self._db.get(TemplateVersionEntity, task.current_template_version_id)
        if version is None:
            return None
        return TemplateSchemaVO.model_validate(version.schema_json)

    def _build_dataset_options(self, payload: dict[str, Any]) -> list[ExportFieldOptionVO]:
        flattened = self._flatten_json(payload)
        return [
            ExportFieldOptionVO(
                source=ExportFieldSource.DATASET_PAYLOAD,
                path=path,
                label=f"原始数据 {path.removeprefix('$.')}",
                sample_value=value,
                default_selected=True,
            )
            for path, value in flattened
        ]

    def _build_submission_options(
        self,
        template_schema: TemplateSchemaVO | None,
        values: dict[str, Any],
    ) -> list[ExportFieldOptionVO]:
        if template_schema is None:
            return [
                ExportFieldOptionVO(
                    source=ExportFieldSource.SUBMISSION_VALUE,
                    path=f"$.{key}",
                    label=f"标注结果 {key}",
                    sample_value=value,
                    default_selected=True,
                )
                for key, value in sorted(values.items())
            ]

        options: list[ExportFieldOptionVO] = []
        for component in template_schema.components:
            if not component.field_key:
                continue
            options.append(
                ExportFieldOptionVO(
                    source=ExportFieldSource.SUBMISSION_VALUE,
                    path=f"$.{component.field_key}",
                    label=component.label,
                    sample_value=values.get(component.field_key),
                    default_selected=True,
                )
            )
        return options

    def _build_review_options(self, review: ReviewEntity | None) -> list[ExportFieldOptionVO]:
        score_total = self._calculate_score_total(review.ai_scores) if review else None
        fixed_options = [
            ("$.aiConclusion", "AI 结论", review.ai_conclusion if review else None),
            ("$.aiScoreTotal", "AI 总分", score_total),
            ("$.humanConclusion", "人工结论", review.human_conclusion if review else None),
            ("$.humanComment", "人工审核说明", review.human_comment if review else None),
            ("$.reviewRound", "审核轮次", review.review_round if review else None),
            ("$.reviewStatus", "审核状态", review.status if review else None),
        ]
        return [
            ExportFieldOptionVO(
                source=ExportFieldSource.REVIEW_METADATA,
                path=path,
                label=label,
                sample_value=sample,
                default_selected=path in {"$.aiConclusion", "$.humanConclusion", "$.reviewStatus"},
            )
            for path, label, sample in fixed_options
        ]

    def _build_audit_timeline_option(self) -> ExportFieldOptionVO:
        return ExportFieldOptionVO(
            source=ExportFieldSource.AUDIT_TIMELINE,
            path="$.timeline",
            label="关键审计时间线",
            sample_value="领取、提交、AI 预审、人工审核决策",
            default_selected=False,
        )

    def _validate_mappings(
        self,
        task_id: str,
        mappings: list[ExportFieldMappingDTO],
        *,
        user: UserVO,
        request_id: str,
    ) -> None:
        options = self.get_field_options(task_id=task_id, user=user)
        allowed = {(option.source.value, option.path) for option in options.options}
        invalid = [
            mapping.model_dump(by_alias=True, mode="json")
            for mapping in mappings
            if (mapping.source.value, mapping.path) not in allowed
        ]
        duplicate_output_keys = {
            mapping.output_key
            for mapping in mappings
            if sum(1 for item in mappings if item.output_key == mapping.output_key) > 1
        }
        if invalid:
            raise ApiException(
                status_code=422,
                code="INVALID_EXPORT_FIELD",
                message="导出字段不在当前任务可导出字段范围内，请刷新后重试。",
                details={"invalidFields": invalid},
                request_id=request_id,
            )
        if duplicate_output_keys:
            raise ApiException(
                status_code=422,
                code="DUPLICATE_OUTPUT_KEY",
                message="导出字段名不能重复。",
                details={"outputKeys": sorted(duplicate_output_keys)},
                request_id=request_id,
            )

    def _get_existing_idempotent_job(
        self,
        idempotency_key: str | None,
        *,
        task_id: str,
        user_id: str,
    ) -> ExportJobEntity | None:
        if not idempotency_key:
            return None
        return self._db.scalar(
            select(ExportJobEntity).where(
                ExportJobEntity.idempotency_key == idempotency_key,
                ExportJobEntity.task_id == task_id,
                ExportJobEntity.created_by == user_id,
            )
        )

    def _to_export_job_vo(self, job: ExportJobEntity, *, task_title: str) -> ExportJobVO:
        return ExportJobVO(
            id=job.id,
            task_id=job.task_id,
            task_title=task_title,
            format=job.format,
            status=job.status,
            total_rows=job.total_rows,
            exported_rows=job.exported_rows,
            field_mappings=[ExportFieldMappingDTO.model_validate(item) for item in job.field_mappings],
            include_review_records=job.include_review_records,
            include_audit_timeline=job.include_audit_timeline,
            file_object_id=job.file_object_id,
            file_name=job.file_name,
            file_size_bytes=job.file_size_bytes,
            error_message=job.error_message,
            created_by=job.created_by,
            created_at=job.created_at,
            updated_at=job.updated_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )

    def _flatten_json(self, payload: dict[str, Any]) -> list[tuple[str, Any]]:
        result: list[tuple[str, Any]] = []

        def visit(value: Any, path: str) -> None:
            if isinstance(value, dict):
                for key in sorted(value.keys()):
                    visit(value[key], f"{path}.{key}" if path != "$" else f"$.{key}")
                return
            result.append((path, value))

        visit(payload, "$")
        return result

    def _calculate_score_total(self, scores: dict[str, int]) -> float | None:
        if not scores:
            return None
        return round(sum(float(score) for score in scores.values()) / len(scores), 2)

    def _append_audit(
        self,
        *,
        entity_id: str,
        actor: UserVO,
        action: AuditAction,
        request_id: str,
        metadata: dict[str, Any],
    ) -> None:
        self._db.add(
            AuditLogEntity(
                id=self._new_id("audit"),
                entity_type=AuditEntityType.EXPORT_JOB.value,
                entity_id=entity_id,
                actor_id=actor.id,
                actor_role=actor.role,
                action=action.value,
                from_state=None,
                to_state=ExportJobStatus.QUEUED.value,
                reason=None,
                metadata_json=metadata,
                request_id=request_id,
                created_at=datetime.now(UTC),
            )
        )

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作数据导出。")

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
