from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime
from math import ceil
from pathlib import Path
from xml.sax.saxutils import escape
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    ExportFieldSource,
    ExportFormat,
    ExportJobStatus,
    FilePurpose,
    ReviewStatus,
    SubmissionStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.assignment import SubmissionEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetItemEntity
from labelhub_api.models.export import ExportJobEntity
from labelhub_api.models.file import FileObjectEntity
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
from labelhub_api.services.file_service import FileService


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
        self._db.flush()
        self._append_audit(
            entity_id=job.id,
            actor=user,
            action=AuditAction.EXPORT_JOB_CREATE,
            request_id=request_id,
            from_state=None,
            to_state=ExportJobStatus.QUEUED.value,
            metadata={
                "taskId": task.id,
                "format": body.format.value,
                "fieldCount": len(selected_mappings),
                "totalRows": approved_count,
                "includeReviewRecords": body.include_review_records,
                "includeAuditTimeline": body.include_audit_timeline,
            },
        )
        # 当前 Demo 数据规模小，API 内同步生成；后续可平滑替换为独立导出 worker。
        self._run_export_job(
            job=job,
            task=task,
            mappings=selected_mappings,
            actor=user,
            request_id=request_id,
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

    def prepare_download(
        self,
        *,
        export_job_id: str,
        user: UserVO,
        request_id: str,
    ) -> tuple[ExportJobEntity, FileObjectEntity, Path]:
        self._require_owner(user)
        job, _task = self._get_owned_export_job(export_job_id, user)
        if job.status != ExportJobStatus.SUCCEEDED.value or not job.file_object_id:
            raise ApiException(
                status_code=409,
                code="EXPORT_FILE_NOT_READY",
                message="导出文件尚未生成完成，请稍后再试。",
                request_id=request_id,
            )
        file_object = self._db.get(FileObjectEntity, job.file_object_id)
        if file_object is None or file_object.created_by != user.id:
            raise ApiException(
                status_code=422,
                code="EXPORT_FILE_OBJECT_MISSING",
                message="导出文件对象不存在，请重新创建导出任务。",
                request_id=request_id,
            )
        path = FileService(self._db).get_local_path(file_object, request_id=request_id)
        if not path.exists():
            raise ApiException(
                status_code=422,
                code="EXPORT_FILE_CONTENT_MISSING",
                message="导出文件内容不存在，请重新创建导出任务。",
                request_id=request_id,
            )
        self._append_audit(
            entity_id=job.id,
            actor=user,
            action=AuditAction.EXPORT_JOB_DOWNLOAD,
            request_id=request_id,
            from_state=job.status,
            to_state=job.status,
            metadata={"fileObjectId": file_object.id, "fileName": file_object.file_name},
        )
        self._db.commit()
        return job, file_object, path

    def _run_export_job(
        self,
        *,
        job: ExportJobEntity,
        task: TaskEntity,
        mappings: list[ExportFieldMappingDTO],
        actor: UserVO,
        request_id: str,
    ) -> None:
        now = datetime.now(UTC)
        job.status = ExportJobStatus.RUNNING.value
        job.started_at = now
        job.updated_at = now
        self._db.flush()

        try:
            source_rows = self._get_export_source_rows(task.id)
            records = [
                self._build_export_record(
                    job=job,
                    mappings=mappings,
                    review=review,
                    submission=submission,
                    item=item,
                )
                for review, submission, item in source_rows
            ]
            content, mime_type, extension = self._render_export_file(
                export_format=ExportFormat(job.format),
                records=records,
                mappings=mappings,
                include_review_records=job.include_review_records,
                include_audit_timeline=job.include_audit_timeline,
            )
            checksum = hashlib.sha256(content).hexdigest()
            file_name = self._build_export_file_name(task, extension)
            file_object = FileService(self._db).create_generated_file_object(
                bucket="exports",
                object_key=f"{task.id}/{job.id}/{file_name}",
                file_name=file_name,
                mime_type=mime_type,
                content=content,
                checksum=checksum,
                purpose=FilePurpose.EXPORT,
                created_by=actor.id,
                request_id=request_id,
            )

            finished_at = datetime.now(UTC)
            job.status = ExportJobStatus.SUCCEEDED.value
            job.exported_rows = len(records)
            job.file_object_id = file_object.id
            job.file_name = file_object.file_name
            job.file_size_bytes = file_object.size_bytes
            job.error_message = None
            job.finished_at = finished_at
            job.updated_at = finished_at
            self._append_audit(
                entity_id=job.id,
                actor=actor,
                action=AuditAction.EXPORT_JOB_COMPLETE,
                request_id=request_id,
                from_state=ExportJobStatus.RUNNING.value,
                to_state=ExportJobStatus.SUCCEEDED.value,
                metadata={
                    "taskId": task.id,
                    "fileObjectId": file_object.id,
                    "fileName": file_object.file_name,
                    "fileSizeBytes": file_object.size_bytes,
                    "exportedRows": len(records),
                    "checksum": checksum,
                },
            )
        except Exception as exc:  # noqa: BLE001 - 导出失败要落库，便于前端展示失败原因。
            failed_at = datetime.now(UTC)
            message = str(exc)[:500] or "导出文件生成失败，请稍后重试。"
            job.status = ExportJobStatus.FAILED.value
            job.exported_rows = 0
            job.error_message = message
            job.finished_at = failed_at
            job.updated_at = failed_at
            self._append_audit(
                entity_id=job.id,
                actor=actor,
                action=AuditAction.EXPORT_JOB_FAIL,
                request_id=request_id,
                from_state=ExportJobStatus.RUNNING.value,
                to_state=ExportJobStatus.FAILED.value,
                metadata={"taskId": task.id, "errorMessage": message},
            )

    def _get_export_source_rows(
        self,
        task_id: str,
    ) -> list[tuple[ReviewEntity, SubmissionEntity, DatasetItemEntity]]:
        return [
            (row[0], row[1], row[2])
            for row in self._db.execute(
                select(ReviewEntity, SubmissionEntity, DatasetItemEntity)
                .join(SubmissionEntity, ReviewEntity.submission_id == SubmissionEntity.id)
                .join(DatasetItemEntity, SubmissionEntity.dataset_item_id == DatasetItemEntity.id)
                .where(
                    ReviewEntity.task_id == task_id,
                    ReviewEntity.status == ReviewStatus.APPROVED.value,
                    SubmissionEntity.status == SubmissionStatus.APPROVED.value,
                )
                .order_by(
                    DatasetItemEntity.source_row_number.asc(),
                    ReviewEntity.updated_at.asc(),
                    ReviewEntity.id.asc(),
                )
            ).all()
        ]

    def _build_export_record(
        self,
        *,
        job: ExportJobEntity,
        mappings: list[ExportFieldMappingDTO],
        review: ReviewEntity,
        submission: SubmissionEntity,
        item: DatasetItemEntity,
    ) -> dict[str, Any]:
        record: dict[str, Any] = {}
        for mapping in mappings:
            record[mapping.output_key] = self._resolve_mapping_value(mapping, review, submission, item)
        if job.include_review_records:
            record["reviewRecord"] = self._build_review_record(review)
        if job.include_audit_timeline:
            record["auditTimeline"] = self._build_audit_timeline(review, submission)
        return record

    def _resolve_mapping_value(
        self,
        mapping: ExportFieldMappingDTO,
        review: ReviewEntity,
        submission: SubmissionEntity,
        item: DatasetItemEntity,
    ) -> Any:
        if mapping.source == ExportFieldSource.DATASET_PAYLOAD:
            return self._read_json_path(item.payload, mapping.path)
        if mapping.source == ExportFieldSource.SUBMISSION_VALUE:
            return self._read_json_path(submission.values, mapping.path)
        if mapping.source == ExportFieldSource.AUDIT_TIMELINE:
            return self._build_audit_timeline(review, submission)
        metadata = {
            "aiConclusion": review.ai_conclusion,
            "aiScoreTotal": self._calculate_score_total(review.ai_scores),
            "humanConclusion": review.human_conclusion,
            "humanComment": review.human_comment,
            "reviewRound": review.review_round,
            "reviewStatus": review.status,
        }
        return self._read_json_path(metadata, mapping.path)

    def _build_review_record(self, review: ReviewEntity) -> dict[str, Any]:
        return {
            "reviewId": review.id,
            "reviewStatus": review.status,
            "reviewRound": review.review_round,
            "aiConclusion": review.ai_conclusion,
            "aiScoreTotal": self._calculate_score_total(review.ai_scores),
            "aiScores": review.ai_scores,
            "aiIssues": review.ai_issues,
            "aiComment": review.ai_comment,
            "aiSuggestions": review.ai_suggestions,
            "humanConclusion": review.human_conclusion,
            "humanComment": review.human_comment,
            "reviewerId": review.reviewer_id,
            "updatedAt": self._to_json_value(review.updated_at),
        }

    def _build_audit_timeline(self, review: ReviewEntity, submission: SubmissionEntity) -> list[dict[str, Any]]:
        entity_ids = [review.assignment_id, review.submission_id, review.review_job_id, review.id, submission.id]
        key_actions = {
            AuditAction.ASSIGNMENT_CLAIM.value,
            AuditAction.SUBMISSION_CREATE.value,
            AuditAction.REVIEW_JOB_CREATE.value,
            AuditAction.REVIEW_JOB_RESULT.value,
            AuditAction.REVIEW_DECISION.value,
        }
        logs = self._db.scalars(
            select(AuditLogEntity)
            .where(AuditLogEntity.entity_id.in_(entity_ids), AuditLogEntity.action.in_(key_actions))
            .order_by(AuditLogEntity.created_at.asc(), AuditLogEntity.id.asc())
        )
        return [
            {
                "entityType": log.entity_type,
                "entityId": log.entity_id,
                "actorId": log.actor_id,
                "actorRole": log.actor_role,
                "action": log.action,
                "fromState": log.from_state,
                "toState": log.to_state,
                "reason": log.reason,
                "metadata": log.metadata_json or {},
                "createdAt": self._to_json_value(log.created_at),
            }
            for log in logs
        ]

    def _render_export_file(
        self,
        *,
        export_format: ExportFormat,
        records: list[dict[str, Any]],
        mappings: list[ExportFieldMappingDTO],
        include_review_records: bool,
        include_audit_timeline: bool,
    ) -> tuple[bytes, str, str]:
        if export_format == ExportFormat.JSON:
            return (
                json.dumps(records, ensure_ascii=False, indent=2, default=self._json_default).encode("utf-8"),
                "application/json; charset=utf-8",
                "json",
            )
        if export_format == ExportFormat.JSONL:
            lines = [
                json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=self._json_default)
                for record in records
            ]
            return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8"), "application/x-ndjson", "jsonl"

        fieldnames = self._build_tabular_fieldnames(
            mappings,
            include_review_records=include_review_records,
            include_audit_timeline=include_audit_timeline,
        )
        if export_format == ExportFormat.CSV:
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore")
            writer.writeheader()
            for record in records:
                writer.writerow({key: self._serialize_tabular_value(record.get(key)) for key in fieldnames})
            return output.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", "csv"

        return (
            self._render_xlsx(records, fieldnames),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xlsx",
        )

    def _build_tabular_fieldnames(
        self,
        mappings: list[ExportFieldMappingDTO],
        *,
        include_review_records: bool,
        include_audit_timeline: bool,
    ) -> list[str]:
        fieldnames = [mapping.output_key for mapping in sorted(mappings, key=lambda mapping: mapping.order)]
        if include_review_records:
            fieldnames.append("reviewRecord")
        if include_audit_timeline:
            fieldnames.append("auditTimeline")
        return fieldnames

    def _render_xlsx(self, records: list[dict[str, Any]], fieldnames: list[str]) -> bytes:
        rows = [fieldnames]
        rows.extend(
            [self._serialize_tabular_value(record.get(key)) for key in fieldnames]
            for record in records
        )
        sheet_xml = self._build_sheet_xml(rows)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", self._xlsx_content_types())
            archive.writestr("_rels/.rels", self._xlsx_root_rels())
            archive.writestr("docProps/app.xml", self._xlsx_app_props())
            archive.writestr("docProps/core.xml", self._xlsx_core_props())
            archive.writestr("xl/workbook.xml", self._xlsx_workbook())
            archive.writestr("xl/_rels/workbook.xml.rels", self._xlsx_workbook_rels())
            archive.writestr("xl/styles.xml", self._xlsx_styles())
            archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        return buffer.getvalue()

    def _build_sheet_xml(self, rows: list[list[str]]) -> str:
        row_nodes: list[str] = []
        for row_index, row in enumerate(rows, start=1):
            cells = []
            for column_index, value in enumerate(row, start=1):
                ref = f"{self._excel_column(column_index)}{row_index}"
                cells.append(
                    f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">'
                    f"{escape(value)}"
                    "</t></is></c>"
                )
            row_nodes.append(f'<row r="{row_index}">{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
            '<sheetFormatPr defaultRowHeight="18"/>'
            f'<sheetData>{"".join(row_nodes)}</sheetData>'
            "</worksheet>"
        )

    def _serialize_tabular_value(self, value: Any) -> str:
        if value is None:
            text = ""
        elif isinstance(value, datetime):
            text = self._to_json_value(value)
        elif isinstance(value, (dict, list)):
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=self._json_default)
        else:
            text = str(value)
        return f"'{text}" if text[:1] in {"=", "+", "-", "@"} else text

    def _read_json_path(self, payload: dict[str, Any], path: str) -> Any:
        if path == "$":
            return payload
        if not path.startswith("$."):
            return None
        current: Any = payload
        for part in path[2:].split("."):
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current

    def _build_export_file_name(self, task: TaskEntity, extension: str) -> str:
        safe_title = "".join(
            character.lower() if character.isascii() and character.isalnum() else "_"
            for character in task.title
        ).strip("_")
        task_slug = safe_title[:36] or task.id[:12]
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        return f"labelhub_export_{task_slug}_{timestamp}.{extension}"

    def _json_default(self, value: Any) -> str:
        if isinstance(value, datetime):
            return self._to_json_value(value)
        return str(value)

    def _to_json_value(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")

    def _excel_column(self, index: int) -> str:
        result = ""
        current = index
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            result = chr(65 + remainder) + result
        return result

    def _xlsx_content_types(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '<Override PartName="/docProps/core.xml" '
            'ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            '<Override PartName="/docProps/app.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
            "</Types>"
        )

    def _xlsx_root_rels(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/>'
            '<Relationship Id="rId2" '
            'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" '
            'Target="docProps/core.xml"/>'
            '<Relationship Id="rId3" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" '
            'Target="docProps/app.xml"/>'
            "</Relationships>"
        )

    def _xlsx_workbook(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="data" sheetId="1" r:id="rId1"/></sheets>'
            "</workbook>"
        )

    def _xlsx_workbook_rels(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            'Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
            'Target="styles.xml"/>'
            "</Relationships>"
        )

    def _xlsx_styles(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
            "</styleSheet>"
        )

    def _xlsx_app_props(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
            "<Application>LabelHub</Application>"
            "</Properties>"
        )

    def _xlsx_core_props(self) -> str:
        created_at = escape(datetime.now(UTC).isoformat().replace("+00:00", "Z"))
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            "<dc:creator>LabelHub</dc:creator>"
            "<dc:title>LabelHub Export</dc:title>"
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{created_at}</dcterms:created>'
            f'<dcterms:modified xsi:type="dcterms:W3CDTF">{created_at}</dcterms:modified>'
            "</cp:coreProperties>"
        )

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
        from_state: str | None,
        to_state: str | None,
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
                from_state=from_state,
                to_state=to_state,
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
