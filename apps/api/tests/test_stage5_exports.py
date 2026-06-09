from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path

import pytest
from labelhub_api.core.enums import AuditAction, AuditEntityType, ExportJobStatus, FilePurpose
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.export import ExportJobEntity
from labelhub_api.models.file import FileObjectEntity
from labelhub_api.main import create_app
from labelhub_api.services.file_service import FileService
from sqlalchemy import select

from test_stage3_assignments import client_with_db, create_task, login, prepare_claimable_task
from test_stage4_review_flow import _create_review_for_task


def test_stage5_openapi_and_metadata_contract_are_registered(client_with_db):
    client, _session_factory = client_with_db

    schema = create_app().openapi()
    component_names = set(schema["components"]["schemas"].keys())

    assert {
        "ExportFieldOptionVO",
        "ExportFieldOptionsVO",
        "ExportFieldMappingDTO",
        "CreateExportJobRequest",
        "ExportJobVO",
    }.issubset(component_names)

    assert "/api/tasks/{taskId}/export-field-options" in schema["paths"]
    assert "/api/tasks/{taskId}/export-jobs" in schema["paths"]
    assert "/api/export-jobs/{exportJobId}" in schema["paths"]
    assert "/api/export-jobs/{exportJobId}/download" in schema["paths"]
    assert "/api/export-jobs/{exportJobId}/retry" in schema["paths"]

    table = ExportJobEntity.__table__
    assert table.name == "export_jobs"
    assert {"task_id", "format", "status", "field_mappings", "created_by"}.issubset(
        table.columns.keys()
    )

    migration = Path("migrations/versions/0006_create_export_foundation.py")
    assert migration.exists()


def test_stage5_generated_file_object_is_flushed_before_export_job_fk(client_with_db):
    _client, session_factory = client_with_db

    with session_factory() as session:
        file_object = FileService(session).create_generated_file_object(
            bucket="exports",
            object_key="stage5/flush-check.jsonl",
            file_name="flush-check.jsonl",
            mime_type="application/x-ndjson",
            content=b"{}\n",
            checksum="stage5-flush-check",
            purpose=FilePurpose.EXPORT,
            created_by="user_owner_demo",
            request_id="test_stage5_flush",
        )
        persisted_id = session.scalar(
            select(FileObjectEntity.id).where(FileObjectEntity.id == file_object.id)
        )

    assert persisted_id == file_object.id


def test_stage5_owner_can_inspect_fields_and_create_export_job(client_with_db):
    client, session_factory = client_with_db
    login(client, "owner@labelhub.dev")
    task = create_task(client, "Stage 5 export task")
    prepare_claimable_task(session_factory, task["id"])

    created = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="stage5-export-submit",
        conclusion="PASS",
        summary="AI 预审通过，等待人工确认。",
        values={"answer": "最终标注答案"},
    )
    review = created["review"]

    login(client, "reviewer@labelhub.dev")
    decision_resp = client.post(
        f"/api/reviews/{review['id']}/decisions",
        json={
            "decision": "APPROVE",
            "reason": "人工审核通过，可以导出。",
            "expectedVersion": review["version"],
        },
    )
    assert decision_resp.status_code == 200

    login(client, "owner@labelhub.dev")
    fields_resp = client.get(f"/api/tasks/{task['id']}/export-field-options")
    assert fields_resp.status_code == 200
    fields_payload = fields_resp.json()
    assert fields_payload["approvedCount"] == 1

    field_keys = {(item["source"], item["path"]) for item in fields_payload["options"]}
    assert ("DATASET_PAYLOAD", "$.prompt") in field_keys
    assert ("SUBMISSION_VALUE", "$.answer") in field_keys
    assert ("REVIEW_METADATA", "$.aiConclusion") in field_keys

    create_resp = client.post(
        f"/api/tasks/{task['id']}/export-jobs",
        json={
            "format": "JSONL",
            "fieldMappings": [
                {
                    "source": "DATASET_PAYLOAD",
                    "path": "$.prompt",
                    "outputKey": "prompt",
                    "order": 0,
                    "selected": True,
                },
                {
                    "source": "SUBMISSION_VALUE",
                    "path": "$.answer",
                    "outputKey": "answer",
                    "order": 1,
                    "selected": True,
                },
                {
                    "source": "REVIEW_METADATA",
                    "path": "$.aiConclusion",
                    "outputKey": "ai_conclusion",
                    "order": 2,
                    "selected": True,
                },
            ],
            "includeReviewRecords": True,
            "includeAuditTimeline": False,
            "idempotencyKey": "export-test-001",
        },
    )
    assert create_resp.status_code == 201
    created_job = create_resp.json()
    assert created_job["status"] == ExportJobStatus.SUCCEEDED.value
    assert created_job["totalRows"] == 1
    assert created_job["exportedRows"] == 1
    assert created_job["fileObjectId"]
    assert created_job["fileName"].endswith(".jsonl")

    repeat_resp = client.post(
        f"/api/tasks/{task['id']}/export-jobs",
        json={
            "format": "JSONL",
            "fieldMappings": [
                {
                    "source": "DATASET_PAYLOAD",
                    "path": "$.prompt",
                    "outputKey": "prompt",
                    "order": 0,
                    "selected": True,
                }
            ],
            "idempotencyKey": "export-test-001",
        },
    )
    assert repeat_resp.status_code == 201
    assert repeat_resp.json()["id"] == created_job["id"]

    download_resp = client.get(f"/api/export-jobs/{created_job['id']}/download")
    assert download_resp.status_code == 200
    assert "attachment" in download_resp.headers["content-disposition"]
    exported_line = json.loads(download_resp.text.strip())
    assert exported_line["prompt"] == "Question 0"
    assert exported_line["answer"] == "最终标注答案"
    assert exported_line["ai_conclusion"] == "PASS"
    assert exported_line["reviewRecord"]["aiConclusion"] == "PASS"

    list_resp = client.get(f"/api/tasks/{task['id']}/export-jobs")
    assert list_resp.status_code == 200
    assert list_resp.json()["pagination"]["totalItems"] == 1

    with session_factory() as session:
        persisted = session.get(ExportJobEntity, created_job["id"])
        assert persisted is not None
        assert persisted.field_mappings[0]["outputKey"] == "prompt"
        assert persisted.file_object_id is not None
        file_object = session.get(FileObjectEntity, persisted.file_object_id)
        assert file_object is not None
        assert file_object.purpose == "EXPORT"

        audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.EXPORT_JOB.value,
                AuditLogEntity.entity_id == created_job["id"],
                AuditLogEntity.action == AuditAction.EXPORT_JOB_CREATE.value,
            )
        )
        assert audit is not None
        complete_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.EXPORT_JOB.value,
                AuditLogEntity.entity_id == created_job["id"],
                AuditLogEntity.action == AuditAction.EXPORT_JOB_COMPLETE.value,
            )
        )
        download_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.EXPORT_JOB.value,
                AuditLogEntity.entity_id == created_job["id"],
                AuditLogEntity.action == AuditAction.EXPORT_JOB_DOWNLOAD.value,
            )
        )
        assert complete_audit is not None
        assert download_audit is not None


def test_stage5_export_history_filters_and_retries_stale_job(client_with_db):
    client, session_factory = client_with_db
    login(client, "owner@labelhub.dev")
    task = create_task(client, "Stage 5.4 retry task")
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    created = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="stage54-retry-submit",
        conclusion="PASS",
        summary="AI 预审通过，等待人工确认。",
        values={"answer": "可恢复导出答案"},
    )

    login(client, "reviewer@labelhub.dev")
    decision_resp = client.post(
        f"/api/reviews/{created['review']['id']}/decisions",
        json={
            "decision": "APPROVE",
            "reason": "人工审核通过，可以导出。",
            "expectedVersion": created["review"]["version"],
        },
    )
    assert decision_resp.status_code == 200

    stale_time = datetime.now(UTC) - timedelta(minutes=30)
    stale_job_id = "export_job_stage54_retry"
    with session_factory() as session:
        session.add(
            ExportJobEntity(
                id=stale_job_id,
                task_id=task["id"],
                format="JSONL",
                status=ExportJobStatus.QUEUED.value,
                field_mappings=[
                    {
                        "source": "DATASET_PAYLOAD",
                        "path": "$.prompt",
                        "outputKey": "prompt",
                        "order": 0,
                        "selected": True,
                    },
                    {
                        "source": "SUBMISSION_VALUE",
                        "path": "$.answer",
                        "outputKey": "answer",
                        "order": 1,
                        "selected": True,
                    },
                ],
                include_review_records=False,
                include_audit_timeline=False,
                total_rows=1,
                exported_rows=0,
                created_by="user_owner_demo",
                created_at=stale_time,
                updated_at=stale_time,
            )
        )
        session.commit()

    login(client, "owner@labelhub.dev")
    queued_resp = client.get(f"/api/tasks/{task['id']}/export-jobs?status=QUEUED")
    assert queued_resp.status_code == 200
    queued_job = queued_resp.json()["data"][0]
    assert queued_job["id"] == stale_job_id
    assert queued_job["isStale"] is True
    assert queued_job["canRetry"] is True

    retry_resp = client.post(f"/api/export-jobs/{stale_job_id}/retry")
    assert retry_resp.status_code == 200
    retried = retry_resp.json()
    assert retried["status"] == ExportJobStatus.SUCCEEDED.value
    assert retried["canDownload"] is True
    assert retried["canRetry"] is False
    assert retried["durationSeconds"] is not None

    succeeded_resp = client.get(f"/api/tasks/{task['id']}/export-jobs?status=SUCCEEDED")
    assert succeeded_resp.status_code == 200
    assert succeeded_resp.json()["pagination"]["totalItems"] == 1

    with session_factory() as session:
        retry_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.EXPORT_JOB.value,
                AuditLogEntity.entity_id == stale_job_id,
                AuditLogEntity.action == AuditAction.EXPORT_JOB_RETRY.value,
            )
        )
        assert retry_audit is not None


def test_stage5_download_missing_file_marks_job_failed(client_with_db):
    client, session_factory = client_with_db
    login(client, "owner@labelhub.dev")
    task = create_task(client, "Stage 5.4 missing file task")
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    created = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="stage54-missing-file-submit",
        conclusion="PASS",
        summary="AI 预审通过，等待人工确认。",
        values={"answer": "文件缺失测试答案"},
    )

    login(client, "reviewer@labelhub.dev")
    decision_resp = client.post(
        f"/api/reviews/{created['review']['id']}/decisions",
        json={
            "decision": "APPROVE",
            "reason": "人工审核通过，可以导出。",
            "expectedVersion": created["review"]["version"],
        },
    )
    assert decision_resp.status_code == 200

    login(client, "owner@labelhub.dev")
    create_resp = client.post(
        f"/api/tasks/{task['id']}/export-jobs",
        json={
            "format": "JSONL",
            "fieldMappings": [
                {
                    "source": "DATASET_PAYLOAD",
                    "path": "$.prompt",
                    "outputKey": "prompt",
                    "order": 0,
                    "selected": True,
                }
            ],
            "idempotencyKey": "stage54-missing-file",
        },
    )
    assert create_resp.status_code == 201
    job = create_resp.json()
    assert job["status"] == ExportJobStatus.SUCCEEDED.value

    with session_factory() as session:
        persisted = session.get(ExportJobEntity, job["id"])
        assert persisted is not None and persisted.file_object_id is not None
        file_object = session.get(FileObjectEntity, persisted.file_object_id)
        assert file_object is not None
        file_path = FileService(session).get_local_path(file_object, request_id="test_stage54_missing")
        assert file_path.exists()
        file_path.unlink()

    download_resp = client.get(f"/api/export-jobs/{job['id']}/download")
    assert download_resp.status_code == 422
    assert download_resp.json()["error"]["code"] == "EXPORT_FILE_CONTENT_MISSING"

    with session_factory() as session:
        persisted = session.get(ExportJobEntity, job["id"])
        assert persisted is not None
        assert persisted.status == ExportJobStatus.FAILED.value
        assert "导出文件内容不存在" in (persisted.error_message or "")


@pytest.mark.parametrize(
    ("export_format", "expected_suffix"),
    [
        ("JSON", ".json"),
        ("CSV", ".csv"),
        ("EXCEL", ".xlsx"),
    ],
)
def test_stage5_download_supports_json_csv_and_excel(client_with_db, export_format: str, expected_suffix: str):
    client, session_factory = client_with_db
    login(client, "owner@labelhub.dev")
    task = create_task(client, f"Stage 5 {export_format} export task")
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    created = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key=f"stage5-{export_format.lower()}-submit",
        conclusion="PASS",
        summary="AI 预审通过，等待人工确认。",
        values={"answer": "=需要防护的表格值"},
    )

    login(client, "reviewer@labelhub.dev")
    decision_resp = client.post(
        f"/api/reviews/{created['review']['id']}/decisions",
        json={
            "decision": "APPROVE",
            "reason": "人工审核通过，可以导出。",
            "expectedVersion": created["review"]["version"],
        },
    )
    assert decision_resp.status_code == 200

    login(client, "owner@labelhub.dev")
    create_resp = client.post(
        f"/api/tasks/{task['id']}/export-jobs",
        json={
            "format": export_format,
            "fieldMappings": [
                {
                    "source": "DATASET_PAYLOAD",
                    "path": "$.prompt",
                    "outputKey": "prompt",
                    "order": 0,
                    "selected": True,
                },
                {
                    "source": "SUBMISSION_VALUE",
                    "path": "$.answer",
                    "outputKey": "answer",
                    "order": 1,
                    "selected": True,
                },
            ],
            "includeReviewRecords": False,
            "includeAuditTimeline": True,
            "idempotencyKey": f"export-test-{export_format.lower()}",
        },
    )
    assert create_resp.status_code == 201
    job = create_resp.json()
    assert job["status"] == ExportJobStatus.SUCCEEDED.value
    assert job["fileName"].endswith(expected_suffix)

    download_resp = client.get(f"/api/export-jobs/{job['id']}/download")
    assert download_resp.status_code == 200
    if export_format == "JSON":
        payload = download_resp.json()
        assert payload[0]["prompt"] == "Question 0"
        assert payload[0]["auditTimeline"]
    elif export_format == "CSV":
        text = download_resp.content.decode("utf-8-sig")
        assert "prompt,answer,auditTimeline" in text.splitlines()[0]
        assert "'=需要防护的表格值" in text
    else:
        assert download_resp.content[:2] == b"PK"
        with zipfile.ZipFile(BytesIO(download_resp.content)) as workbook:
            sheet_xml = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
        assert "prompt" in sheet_xml
        assert "'=需要防护的表格值" in sheet_xml


def test_stage5_export_job_requires_approved_rows(client_with_db):
    client, _session_factory = client_with_db
    login(client, "owner@labelhub.dev")
    task = create_task(client, "No approved rows")

    resp = client.post(
        f"/api/tasks/{task['id']}/export-jobs",
        json={
            "format": "JSON",
            "fieldMappings": [
                {
                    "source": "DATASET_PAYLOAD",
                    "path": "$.prompt",
                    "outputKey": "prompt",
                    "order": 0,
                    "selected": True,
                }
            ],
        },
    )

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "NO_EXPORTABLE_ROWS"
