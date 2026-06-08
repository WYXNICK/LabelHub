from __future__ import annotations

from pathlib import Path

from labelhub_api.core.enums import AuditAction, AuditEntityType, ExportJobStatus
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.export import ExportJobEntity
from labelhub_api.main import create_app
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

    table = ExportJobEntity.__table__
    assert table.name == "export_jobs"
    assert {"task_id", "format", "status", "field_mappings", "created_by"}.issubset(
        table.columns.keys()
    )

    migration = Path("migrations/versions/0006_create_export_foundation.py")
    assert migration.exists()


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
    assert created_job["status"] == ExportJobStatus.QUEUED.value
    assert created_job["totalRows"] == 1
    assert created_job["exportedRows"] == 0

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

    list_resp = client.get(f"/api/tasks/{task['id']}/export-jobs")
    assert list_resp.status_code == 200
    assert list_resp.json()["pagination"]["totalItems"] == 1

    with session_factory() as session:
        persisted = session.get(ExportJobEntity, created_job["id"])
        assert persisted is not None
        assert persisted.field_mappings[0]["outputKey"] == "prompt"

        audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.EXPORT_JOB.value,
                AuditLogEntity.entity_id == created_job["id"],
                AuditLogEntity.action == AuditAction.EXPORT_JOB_CREATE.value,
            )
        )
        assert audit is not None


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
