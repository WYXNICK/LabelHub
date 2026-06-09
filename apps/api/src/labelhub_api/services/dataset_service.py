from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from io import BytesIO
from math import ceil
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from labelhub_api.core.enums import (
    AuditAction,
    AuditEntityType,
    DatasetItemStatus,
    DatasetSourceFormat,
    DatasetStatus,
    DatasetType,
    ImportStatus,
    UserRole,
)
from labelhub_api.core.errors import ApiException
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetEntity, DatasetItemEntity, ImportErrorRowEntity, ImportJobEntity
from labelhub_api.models.file import FileObjectEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO, PaginationVO
from labelhub_api.schemas.datasets import (
    BatchUpdateDatasetItemsRequest,
    BatchUpdateDatasetItemsVO,
    DatasetItemVO,
    DatasetVO,
    ImportErrorRowVO,
    ImportJobVO,
)
from labelhub_api.services.file_service import FileService


@dataclass(frozen=True)
class ParsedRow:
    row_number: int | None
    payload: dict[str, Any]


@dataclass(frozen=True)
class RowImportError:
    row_number: int | None
    field_path: str | None
    code: str
    message: str
    raw_fragment: dict[str, Any] | None


class DatasetService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create_import_job(
        self,
        *,
        task_id: str,
        user: UserVO,
        request_id: str,
        request_dataset_name: str,
        request_dataset_type: DatasetType,
        request_source_format: DatasetSourceFormat,
        file_object_id: str,
        idempotency_key: str | None,
    ) -> ImportJobVO:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        if idempotency_key:
            # 幂等优先返回既有导入任务，避免前端重复点击造成重复数据集。
            existing_job = self._db.scalar(
                select(ImportJobEntity).where(
                    ImportJobEntity.idempotency_key == idempotency_key,
                    ImportJobEntity.created_by == user.id,
                )
            )
            if existing_job is not None:
                return self._to_import_job_vo(existing_job)

        file_object = self._get_owned_file(file_object_id, user, request_id)
        now = datetime.now(UTC)
        dataset = DatasetEntity(
            id=self._new_id("dataset"),
            task_id=task.id,
            name=request_dataset_name.strip(),
            dataset_type=request_dataset_type.value,
            source_format=request_source_format.value,
            item_count=0,
            enabled_item_count=0,
            disabled_item_count=0,
            status=DatasetStatus.IMPORTING.value,
            created_by=user.id,
            created_at=now,
            updated_at=now,
        )
        job = ImportJobEntity(
            id=self._new_id("import"),
            task_id=task.id,
            dataset_id=dataset.id,
            file_object_id=file_object.id,
            source_format=request_source_format.value,
            status=ImportStatus.RUNNING.value,
            success_count=0,
            failed_count=0,
            error_summary=None,
            idempotency_key=idempotency_key,
            created_by=user.id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(dataset)
        self._db.add(job)
        self._append_audit(
            entity_type=AuditEntityType.IMPORT_JOB,
            entity_id=job.id,
            actor=user,
            action=AuditAction.IMPORT_CREATE,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "datasetId": dataset.id,
                "fileObjectId": file_object.id,
                "sourceFormat": request_source_format.value,
            },
        )
        self._db.flush()

        rows, parse_errors = self._parse_file(file_object, request_source_format, request_id)
        row_errors: list[RowImportError] = [*parse_errors]
        imported_items: list[DatasetItemEntity] = []
        seen_external_ids: set[str] = set()
        for row in rows:
            item, errors = self._build_dataset_item(
                row=row,
                dataset=dataset,
                dataset_type=request_dataset_type,
                source_format=request_source_format,
                seen_external_ids=seen_external_ids,
            )
            row_errors.extend(errors)
            if item is not None:
                imported_items.append(item)

        self._db.add_all(imported_items)
        for error in row_errors:
            self._db.add(self._to_error_entity(error, job, dataset))

        dataset.item_count = len(imported_items)
        dataset.enabled_item_count = len(imported_items)
        dataset.disabled_item_count = 0
        dataset.status = DatasetStatus.READY.value if imported_items else DatasetStatus.FAILED.value
        dataset.updated_at = datetime.now(UTC)
        job.success_count = len(imported_items)
        job.failed_count = len(row_errors)
        job.status = ImportStatus.SUCCEEDED.value if imported_items else ImportStatus.FAILED.value
        job.error_summary = self._build_error_summary(row_errors)
        job.updated_at = datetime.now(UTC)
        self._append_audit(
            entity_type=AuditEntityType.IMPORT_JOB,
            entity_id=job.id,
            actor=user,
            action=AuditAction.IMPORT_COMPLETE,
            request_id=request_id,
            metadata={
                "taskId": task.id,
                "datasetId": dataset.id,
                "successCount": job.success_count,
                "failedCount": job.failed_count,
            },
        )
        self._db.commit()
        self._db.refresh(job)
        return self._to_import_job_vo(job)

    def get_import_job(self, *, import_job_id: str, user: UserVO) -> ImportJobVO:
        self._require_owner(user)
        return self._to_import_job_vo(self._get_import_job(import_job_id, user))

    def list_import_errors(
        self,
        *,
        import_job_id: str,
        user: UserVO,
        page: int,
        page_size: int,
    ) -> PageVO[ImportErrorRowVO]:
        self._require_owner(user)
        job = self._get_import_job(import_job_id, user)
        query = select(ImportErrorRowEntity).where(ImportErrorRowEntity.import_job_id == job.id)
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        errors = list(
            self._db.scalars(
                query.order_by(ImportErrorRowEntity.source_row_number.asc(), ImportErrorRowEntity.created_at.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_error_vo(error) for error in errors],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def list_task_datasets(
        self,
        *,
        task_id: str,
        user: UserVO,
        page: int,
        page_size: int,
    ) -> PageVO[DatasetVO]:
        self._require_owner(user)
        task = self._get_owned_task(task_id, user)
        query = select(DatasetEntity).where(DatasetEntity.task_id == task.id)
        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        datasets = list(
            self._db.scalars(
                query.order_by(DatasetEntity.updated_at.desc(), DatasetEntity.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_dataset_vo(dataset) for dataset in datasets],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def list_dataset_items(
        self,
        *,
        dataset_id: str,
        user: UserVO,
        page: int,
        page_size: int,
        keyword: str | None,
    ) -> PageVO[DatasetItemVO]:
        self._require_owner(user)
        dataset = self._get_owned_dataset(dataset_id, user)
        query = select(DatasetItemEntity).where(DatasetItemEntity.dataset_id == dataset.id)
        normalized_keyword = keyword.strip() if keyword else ""
        if normalized_keyword:
            pattern = f"%{normalized_keyword}%"
            query = query.where(
                or_(
                    DatasetItemEntity.external_item_id.like(pattern),
                    cast(DatasetItemEntity.payload, String).like(pattern),
                    cast(DatasetItemEntity.tags, String).like(pattern),
                )
            )

        total_items = self._db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        items = list(
            self._db.scalars(
                query.order_by(
                    DatasetItemEntity.source_row_number.asc(),
                    DatasetItemEntity.created_at.asc(),
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return PageVO(
            data=[self._to_dataset_item_vo(item) for item in items],
            pagination=PaginationVO(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=ceil(total_items / page_size) if total_items else 0,
            ),
        )

    def batch_update_dataset_items(
        self,
        *,
        dataset_id: str,
        user: UserVO,
        request_id: str,
        body: BatchUpdateDatasetItemsRequest,
    ) -> BatchUpdateDatasetItemsVO:
        self._require_owner(user)
        dataset = self._get_owned_dataset(dataset_id, user)
        item_ids = list(dict.fromkeys(body.item_ids))
        items = list(
            self._db.scalars(
                select(DatasetItemEntity).where(
                    DatasetItemEntity.dataset_id == dataset.id,
                    DatasetItemEntity.id.in_(item_ids),
                )
            )
        )
        if body.expected_version is not None and any(item.version != body.expected_version for item in items):
            raise ApiException(
                status_code=409,
                code="VERSION_CONFLICT",
                message="题目已被其他操作更新，请刷新后重试。",
                request_id=request_id,
            )

        tags = self._normalize_tags(body.tags) if body.tags is not None else None
        now = datetime.now(UTC)
        for item in items:
            if body.enabled is not None:
                item.status = DatasetItemStatus.AVAILABLE.value if body.enabled else DatasetItemStatus.DISABLED.value
            if tags is not None:
                item.tags = tags
            item.version += 1
            item.updated_at = now

        # 先 flush 题目状态，再重算数据集统计，保证同一事务内统计值与明细一致。
        self._db.flush()
        self._refresh_dataset_counts(dataset)
        dataset.updated_at = now
        audit_log_id = self._append_audit(
            entity_type=AuditEntityType.DATASET,
            entity_id=dataset.id,
            actor=user,
            action=AuditAction.BATCH_UPDATE,
            request_id=request_id,
            metadata={
                "taskId": dataset.task_id,
                "itemIds": item_ids,
                "enabled": body.enabled,
                "tags": tags,
                "updatedCount": len(items),
                "skippedCount": len(item_ids) - len(items),
            },
            reason=body.reason,
        )
        self._db.commit()
        return BatchUpdateDatasetItemsVO(
            updated_count=len(items),
            skipped_count=len(item_ids) - len(items),
            audit_log_id=audit_log_id,
        )

    def _parse_file(
        self,
        file_object: FileObjectEntity,
        source_format: DatasetSourceFormat,
        request_id: str,
    ) -> tuple[list[ParsedRow], list[RowImportError]]:
        file_bytes = FileService(self._db).read_file_bytes(file_object, request_id=request_id)
        if source_format == DatasetSourceFormat.JSON:
            return self._parse_json(file_bytes)
        if source_format == DatasetSourceFormat.JSONL:
            return self._parse_jsonl(file_bytes)
        if source_format == DatasetSourceFormat.EXCEL:
            return self._parse_xlsx(file_bytes)
        return [], [
            RowImportError(
                row_number=None,
                field_path="sourceFormat",
                code="UNSUPPORTED_SOURCE_FORMAT",
                message="暂不支持 MIXED 格式导入。",
                raw_fragment={"sourceFormat": source_format.value},
            )
        ]

    def _parse_json(self, file_bytes: bytes) -> tuple[list[ParsedRow], list[RowImportError]]:
        try:
            payload = json.loads(file_bytes.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return [], [
                RowImportError(
                    row_number=None,
                    field_path=None,
                    code="INVALID_JSON",
                    message=f"JSON 文件解析失败：{exc}",
                    raw_fragment=None,
                )
            ]

        if isinstance(payload, dict) and isinstance(payload.get("items"), list):
            records = payload["items"]
        elif isinstance(payload, list):
            records = payload
        else:
            return [], [
                RowImportError(
                    row_number=None,
                    field_path=None,
                    code="INVALID_JSON_ROOT",
                    message="JSON 导入文件必须是数组，或包含 items 数组的对象。",
                    raw_fragment=payload if isinstance(payload, dict) else {"value": str(payload)},
                )
            ]

        rows: list[ParsedRow] = []
        errors: list[RowImportError] = []
        for index, record in enumerate(records, start=1):
            if isinstance(record, dict):
                rows.append(ParsedRow(row_number=index, payload=record))
            else:
                errors.append(
                    RowImportError(
                        row_number=index,
                        field_path=None,
                        code="ROW_NOT_OBJECT",
                        message="数据行必须是 JSON Object。",
                        raw_fragment={"value": record},
                    )
                )
        return rows, errors

    def _parse_jsonl(self, file_bytes: bytes) -> tuple[list[ParsedRow], list[RowImportError]]:
        rows: list[ParsedRow] = []
        errors: list[RowImportError] = []
        text = file_bytes.decode("utf-8-sig")
        for line_number, raw_line in enumerate(text.splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append(
                    RowImportError(
                        row_number=line_number,
                        field_path=None,
                        code="INVALID_JSONL_LINE",
                        message=f"JSONL 第 {line_number} 行解析失败：{exc}",
                        raw_fragment={"line": raw_line},
                    )
                )
                continue
            if not isinstance(payload, dict):
                errors.append(
                    RowImportError(
                        row_number=line_number,
                        field_path=None,
                        code="ROW_NOT_OBJECT",
                        message="JSONL 每一行必须是 JSON Object。",
                        raw_fragment={"value": payload},
                    )
                )
                continue
            rows.append(ParsedRow(row_number=line_number, payload=payload))
        return rows, errors

    def _parse_xlsx(self, file_bytes: bytes) -> tuple[list[ParsedRow], list[RowImportError]]:
        # 只解析第一张工作表，避免为轻量导入额外引入复杂的 Excel 运行依赖。
        try:
            with zipfile.ZipFile(BytesIO(file_bytes)) as workbook:
                shared_strings = self._read_shared_strings(workbook)
                sheet_xml = workbook.read("xl/worksheets/sheet1.xml")
        except (KeyError, zipfile.BadZipFile) as exc:
            return [], [
                RowImportError(
                    row_number=None,
                    field_path=None,
                    code="INVALID_EXCEL",
                    message=f"Excel 文件解析失败：{exc}",
                    raw_fragment=None,
                )
            ]

        root = ElementTree.fromstring(sheet_xml)
        sheet_rows: list[tuple[int, dict[int, Any]]] = []
        for row_node in self._iter_by_local_name(root, "row"):
            row_number = int(row_node.attrib.get("r", len(sheet_rows) + 1))
            values: dict[int, Any] = {}
            for cell in self._iter_children_by_local_name(row_node, "c"):
                cell_ref = cell.attrib.get("r", "")
                column_index = self._column_index(cell_ref)
                if column_index is None:
                    continue
                values[column_index] = self._read_cell_value(cell, shared_strings)
            sheet_rows.append((row_number, values))

        header_row = next((item for item in sheet_rows if any(value not in (None, "") for value in item[1].values())), None)
        if header_row is None:
            return [], [
                RowImportError(
                    row_number=None,
                    field_path=None,
                    code="EMPTY_EXCEL",
                    message="Excel 文件为空。",
                    raw_fragment=None,
                )
            ]

        _, header_values = header_row
        headers = {index: str(value).strip() for index, value in header_values.items() if value not in (None, "")}
        rows: list[ParsedRow] = []
        for row_number, values in sheet_rows:
            if row_number <= header_row[0]:
                continue
            payload = {
                field_name: values.get(index)
                for index, field_name in headers.items()
                if values.get(index) not in (None, "")
            }
            if payload:
                rows.append(ParsedRow(row_number=row_number, payload=payload))
        return rows, []

    def _read_shared_strings(self, workbook: zipfile.ZipFile) -> list[str]:
        try:
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        shared_strings: list[str] = []
        for string_item in self._iter_by_local_name(root, "si"):
            text_parts = [node.text or "" for node in self._iter_by_local_name(string_item, "t")]
            shared_strings.append("".join(text_parts))
        return shared_strings

    def _read_cell_value(self, cell: ElementTree.Element, shared_strings: list[str]) -> Any:
        cell_type = cell.attrib.get("t")
        value_node = self._first_child_by_local_name(cell, "v")
        if cell_type == "inlineStr":
            text_node = self._first_child_by_local_name(cell, "t")
            return text_node.text if text_node is not None else None
        if value_node is None or value_node.text is None:
            return None
        raw_value = value_node.text
        if cell_type == "s":
            index = int(raw_value)
            return shared_strings[index] if 0 <= index < len(shared_strings) else ""
        if cell_type == "b":
            return raw_value == "1"
        if cell_type == "str":
            return raw_value
        try:
            numeric_value = float(raw_value)
        except ValueError:
            return raw_value
        return int(numeric_value) if numeric_value.is_integer() else numeric_value

    def _build_dataset_item(
        self,
        *,
        row: ParsedRow,
        dataset: DatasetEntity,
        dataset_type: DatasetType,
        source_format: DatasetSourceFormat,
        seen_external_ids: set[str],
    ) -> tuple[DatasetItemEntity | None, list[RowImportError]]:
        errors = self._validate_row(row, dataset_type)
        external_item_id = self._external_item_id(row.payload)
        if external_item_id and external_item_id in seen_external_ids:
            errors.append(
                RowImportError(
                    row_number=row.row_number,
                    field_path="id",
                    code="DUPLICATE_ITEM",
                    message=f"同一导入文件内存在重复 id：{external_item_id}",
                    raw_fragment=row.payload,
                )
            )
        if errors:
            return None, errors

        seen_external_ids.add(external_item_id)
        payload = dict(row.payload)
        checksum = sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
        return (
            DatasetItemEntity(
                id=self._new_id("item"),
                dataset_id=dataset.id,
                task_id=dataset.task_id,
                external_item_id=external_item_id,
                source_format=source_format.value,
                source_row_number=row.row_number,
                payload=payload,
                media_refs=self._extract_media_refs(payload),
                checksum=checksum,
                status=DatasetItemStatus.AVAILABLE.value,
                tags=self._extract_tags(payload),
                version=0,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            ),
            [],
        )

    def _validate_row(self, row: ParsedRow, dataset_type: DatasetType) -> list[RowImportError]:
        errors: list[RowImportError] = []
        external_item_id = self._external_item_id(row.payload)
        if not external_item_id:
            errors.append(
                RowImportError(
                    row_number=row.row_number,
                    field_path="id",
                    code="MISSING_REQUIRED_FIELD",
                    message="数据行缺少必填字段 id。",
                    raw_fragment=row.payload,
                )
            )
        required_fields = {
            DatasetType.QA_QUALITY: ["prompt", "model_answer", "reference"],
            DatasetType.PREFERENCE_COMPARE: ["prompt", "response_a", "response_b"],
            DatasetType.CUSTOM: [],
        }[dataset_type]
        for field_name in required_fields:
            if row.payload.get(field_name) in (None, ""):
                errors.append(
                    RowImportError(
                        row_number=row.row_number,
                        field_path=field_name,
                        code="MISSING_REQUIRED_FIELD",
                        message=f"数据行缺少必填字段 {field_name}。",
                        raw_fragment=row.payload,
                    )
                )
        return errors

    def _external_item_id(self, payload: dict[str, Any]) -> str:
        value = payload.get("id")
        return str(value).strip() if value is not None else ""

    def _extract_media_refs(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        media_url = payload.get("media_url")
        if not isinstance(media_url, str) or not media_url.strip():
            return []
        media_type = payload.get("media_type")
        return [{"kind": str(media_type or "url"), "url": media_url.strip(), "fieldPath": "media_url"}]

    def _extract_tags(self, payload: dict[str, Any]) -> list[str]:
        tags = payload.get("tags")
        if isinstance(tags, list):
            return [str(tag) for tag in tags if str(tag).strip()]
        if isinstance(tags, str):
            return [tag.strip() for tag in tags.split(",") if tag.strip()]
        return []

    def _build_error_summary(self, errors: list[RowImportError]) -> dict[str, Any] | None:
        if not errors:
            return None
        counts: dict[str, int] = {}
        for error in errors:
            counts[error.code] = counts.get(error.code, 0) + 1
        return {"total": len(errors), "byCode": counts}

    def _to_error_entity(
        self,
        error: RowImportError,
        job: ImportJobEntity,
        dataset: DatasetEntity,
    ) -> ImportErrorRowEntity:
        return ImportErrorRowEntity(
            id=self._new_id("import_error"),
            import_job_id=job.id,
            task_id=job.task_id,
            dataset_id=dataset.id,
            source_row_number=error.row_number,
            field_path=error.field_path,
            error_code=error.code,
            error_message=error.message,
            raw_fragment=error.raw_fragment,
            created_at=datetime.now(UTC),
        )

    def _get_owned_task(self, task_id: str, user: UserVO) -> TaskEntity:
        task = self._db.get(TaskEntity, task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="任务不存在。")
        return task

    def _get_owned_file(self, file_object_id: str, user: UserVO, request_id: str) -> FileObjectEntity:
        file_object = self._db.get(FileObjectEntity, file_object_id)
        if file_object is None or file_object.created_by != user.id:
            raise ApiException(
                status_code=404,
                code="NOT_FOUND",
                message="文件对象不存在。",
                request_id=request_id,
            )
        return file_object

    def _get_import_job(self, import_job_id: str, user: UserVO) -> ImportJobEntity:
        job = self._db.get(ImportJobEntity, import_job_id)
        if job is None or job.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="导入任务不存在。")
        return job

    def _get_owned_dataset(self, dataset_id: str, user: UserVO) -> DatasetEntity:
        dataset = self._db.get(DatasetEntity, dataset_id)
        if dataset is None:
            raise ApiException(status_code=404, code="NOT_FOUND", message="数据集不存在。")
        task = self._db.get(TaskEntity, dataset.task_id)
        if task is None or task.created_by != user.id:
            raise ApiException(status_code=404, code="NOT_FOUND", message="数据集不存在。")
        return dataset

    def _refresh_dataset_counts(self, dataset: DatasetEntity) -> None:
        total_count = self._db.scalar(
            select(func.count()).select_from(DatasetItemEntity).where(DatasetItemEntity.dataset_id == dataset.id)
        ) or 0
        disabled_count = self._db.scalar(
            select(func.count()).select_from(DatasetItemEntity).where(
                DatasetItemEntity.dataset_id == dataset.id,
                DatasetItemEntity.status == DatasetItemStatus.DISABLED.value,
            )
        ) or 0
        dataset.item_count = total_count
        dataset.disabled_item_count = disabled_count
        dataset.enabled_item_count = total_count - disabled_count

    def _normalize_tags(self, tags: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        seen: set[str] = set()
        for tag in tags:
            normalized_tag = str(tag).strip()
            if not normalized_tag or normalized_tag in seen:
                continue
            seen.add(normalized_tag)
            normalized_tags.append(normalized_tag)
        return normalized_tags

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
    ) -> str:
        audit_log_id = self._new_id("audit")
        self._db.add(
            AuditLogEntity(
                id=audit_log_id,
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
        return audit_log_id

    def _to_dataset_vo(self, dataset: DatasetEntity) -> DatasetVO:
        return DatasetVO(
            id=dataset.id,
            task_id=dataset.task_id,
            name=dataset.name,
            dataset_type=dataset.dataset_type,
            source_format=dataset.source_format,
            item_count=dataset.item_count,
            enabled_item_count=dataset.enabled_item_count,
            disabled_item_count=dataset.disabled_item_count,
            status=dataset.status,
            created_by=dataset.created_by,
            created_at=dataset.created_at,
            updated_at=dataset.updated_at,
        )

    def _to_import_job_vo(self, job: ImportJobEntity) -> ImportJobVO:
        return ImportJobVO(
            id=job.id,
            task_id=job.task_id,
            dataset_id=job.dataset_id,
            file_object_id=job.file_object_id,
            source_format=job.source_format,
            status=job.status,
            success_count=job.success_count,
            failed_count=job.failed_count,
            error_summary=job.error_summary,
            created_by=job.created_by,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _to_dataset_item_vo(self, item: DatasetItemEntity) -> DatasetItemVO:
        return DatasetItemVO(
            id=item.id,
            dataset_id=item.dataset_id,
            task_id=item.task_id,
            external_item_id=item.external_item_id,
            source_format=item.source_format,
            source_row_number=item.source_row_number,
            payload=item.payload,
            media_refs=item.media_refs or [],
            checksum=item.checksum,
            status=item.status,
            tags=item.tags or [],
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    def _to_error_vo(self, error: ImportErrorRowEntity) -> ImportErrorRowVO:
        return ImportErrorRowVO(
            id=error.id,
            import_job_id=error.import_job_id,
            task_id=error.task_id,
            dataset_id=error.dataset_id,
            source_row_number=error.source_row_number,
            field_path=error.field_path,
            error_code=error.error_code,
            error_message=error.error_message,
            raw_fragment=error.raw_fragment,
            created_at=error.created_at,
        )

    def _iter_by_local_name(self, root: ElementTree.Element, local_name: str) -> list[ElementTree.Element]:
        return [node for node in root.iter() if self._local_name(node.tag) == local_name]

    def _iter_children_by_local_name(self, root: ElementTree.Element, local_name: str) -> list[ElementTree.Element]:
        return [node for node in list(root) if self._local_name(node.tag) == local_name]

    def _first_child_by_local_name(self, root: ElementTree.Element, local_name: str) -> ElementTree.Element | None:
        return next((node for node in root.iter() if self._local_name(node.tag) == local_name), None)

    def _local_name(self, tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    def _column_index(self, cell_ref: str) -> int | None:
        match = re.match(r"([A-Z]+)", cell_ref)
        if not match:
            return None
        index = 0
        for char in match.group(1):
            index = index * 26 + (ord(char) - ord("A") + 1)
        return index

    def _require_owner(self, user: UserVO) -> None:
        if user.role != UserRole.OWNER:
            raise ApiException(status_code=403, code="FORBIDDEN", message="仅任务负责人可以操作数据导入。")

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"
