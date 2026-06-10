from __future__ import annotations

import base64
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import labelhub_api.models  # noqa: F401
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app


ROOT_DIR = Path(__file__).resolve().parents[4]
DEMO_DATA_DIR = ROOT_DIR / "demo_data" / "datasets"


@pytest.fixture()
def client_with_db() -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db_session() -> Iterator[Session]:
        session = testing_session_factory()
        try:
            yield session
        finally:
            session.close()

    app = create_app()
    app.dependency_overrides[get_db_session] = override_db_session
    with TestClient(app) as client:
        yield client, testing_session_factory


def login(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "owner@labelhub.dev", "password": "labelhub123"})
    assert response.status_code == 200


def create_task(client: TestClient, title: str = "数据集导入测试任务") -> dict:
    response = client.post(
        "/api/tasks",
        json={
            "title": title,
            "description": "用于验证阶段 1.2 数据导入。",
            "instructionRichText": {"format": "plain_text", "content": "请完成导入数据的标注。"},
            "tags": ["stage1", "import"],
            "rewardRule": {"description": "按有效提交计费。"},
            "quota": 30,
            "deadlineAt": "2027-01-01T00:00:00Z",
            "distributionStrategy": "FIRST_COME_FIRST_SERVED",
        },
    )
    assert response.status_code == 201
    return response.json()


def create_file_object(client: TestClient, *, file_path: Path, source_format: str, object_key: str) -> str:
    if source_format == "EXCEL":
        payload = {
            "contentBase64": base64.b64encode(file_path.read_bytes()).decode("ascii"),
            "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
    else:
        payload = {"contentText": file_path.read_text(encoding="utf-8"), "mimeType": "application/json"}

    response = client.post(
        "/api/files",
        json={
            "bucket": "stage1-import-tests",
            "objectKey": object_key,
            "fileName": file_path.name,
            "sizeBytes": file_path.stat().st_size,
            "checksum": None,
            "purpose": "IMPORT",
            **payload,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_import_job(
    client: TestClient,
    *,
    task_id: str,
    file_object_id: str,
    dataset_name: str,
    dataset_type: str,
    source_format: str,
    idempotency_key: str,
) -> dict:
    response = client.post(
        f"/api/tasks/{task_id}/import-jobs",
        json={
            "datasetName": dataset_name,
            "datasetType": dataset_type,
            "sourceFormat": source_format,
            "fileObjectId": file_object_id,
            "idempotencyKey": idempotency_key,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_import_qa_quality_json_and_idempotency(client_with_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client)
    file_path = DEMO_DATA_DIR / "qa_quality" / "json" / "qa_quality.json"
    file_object_id = create_file_object(
        client,
        file_path=file_path,
        source_format="JSON",
        object_key="qa_quality/json/qa_quality.json",
    )

    job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=file_object_id,
        dataset_name="qa_quality_json",
        dataset_type="QA_QUALITY",
        source_format="JSON",
        idempotency_key="qa-quality-json-demo",
    )

    assert job["status"] == "SUCCEEDED"
    assert job["successCount"] == 30
    assert job["failedCount"] == 0
    assert job["datasetId"]

    repeated_job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=file_object_id,
        dataset_name="qa_quality_json",
        dataset_type="QA_QUALITY",
        source_format="JSON",
        idempotency_key="qa-quality-json-demo",
    )
    assert repeated_job["id"] == job["id"]

    datasets_response = client.get(f"/api/tasks/{task['id']}/datasets?page=1&pageSize=10")
    assert datasets_response.status_code == 200
    datasets = datasets_response.json()
    assert datasets["pagination"]["totalItems"] == 1
    assert datasets["data"][0]["itemCount"] == 30
    assert datasets["data"][0]["enabledItemCount"] == 30


def test_import_preference_compare_jsonl(client_with_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client, "偏好对比导入测试")
    file_path = DEMO_DATA_DIR / "preference_compare" / "jsonl" / "preference_compare.jsonl"
    file_object_id = create_file_object(
        client,
        file_path=file_path,
        source_format="JSONL",
        object_key="preference_compare/jsonl/preference_compare.jsonl",
    )

    job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=file_object_id,
        dataset_name="preference_compare_jsonl",
        dataset_type="PREFERENCE_COMPARE",
        source_format="JSONL",
        idempotency_key="preference-compare-jsonl-demo",
    )

    assert job["status"] == "SUCCEEDED"
    assert job["successCount"] == 12
    assert job["failedCount"] == 0


def test_import_qa_quality_excel(client_with_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client, "Excel 导入测试")
    file_path = DEMO_DATA_DIR / "qa_quality" / "excel" / "qa_quality.xlsx"
    file_object_id = create_file_object(
        client,
        file_path=file_path,
        source_format="EXCEL",
        object_key="qa_quality/excel/qa_quality.xlsx",
    )

    job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=file_object_id,
        dataset_name="qa_quality_excel",
        dataset_type="QA_QUALITY",
        source_format="EXCEL",
        idempotency_key="qa-quality-excel-demo",
    )

    assert job["status"] == "SUCCEEDED"
    assert job["successCount"] == 30
    assert job["failedCount"] == 0


def test_import_error_rows_are_traceable(client_with_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client, "错误行追踪测试")
    content_text = (
        '{"id":"qa_001","prompt":"p","model_answer":"a","reference":"r"}\n'
        '{"id":"qa_002","model_answer":"a","reference":"r"}\n'
        '{"id":"qa_001","prompt":"p2","model_answer":"a2","reference":"r2"}\n'
    )
    response = client.post(
        "/api/files",
        json={
            "bucket": "stage1-import-tests",
            "objectKey": "invalid/qa_quality.jsonl",
            "fileName": "invalid_qa_quality.jsonl",
            "mimeType": "application/jsonl",
            "sizeBytes": len(content_text.encode("utf-8")),
            "checksum": None,
            "purpose": "IMPORT",
            "contentText": content_text,
        },
    )
    assert response.status_code == 201

    job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=response.json()["id"],
        dataset_name="invalid_qa_quality",
        dataset_type="QA_QUALITY",
        source_format="JSONL",
        idempotency_key="invalid-qa-quality-jsonl",
    )

    assert job["status"] == "SUCCEEDED"
    assert job["successCount"] == 1
    assert job["failedCount"] == 2

    errors_response = client.get(f"/api/import-jobs/{job['id']}/errors?page=1&pageSize=10")
    assert errors_response.status_code == 200
    errors = errors_response.json()["data"]
    assert {error["errorCode"] for error in errors} == {"MISSING_REQUIRED_FIELD", "DUPLICATE_ITEM"}
    assert {error["sourceRowNumber"] for error in errors} == {2, 3}


def test_dataset_items_can_be_previewed_and_batch_updated(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client, "stage 1.3 dataset item preview")
    file_path = DEMO_DATA_DIR / "qa_quality" / "json" / "qa_quality.json"
    file_object_id = create_file_object(
        client,
        file_path=file_path,
        source_format="JSON",
        object_key="qa_quality/json/qa_quality_stage13.json",
    )
    job = create_import_job(
        client,
        task_id=task["id"],
        file_object_id=file_object_id,
        dataset_name="qa_quality_stage13",
        dataset_type="QA_QUALITY",
        source_format="JSON",
        idempotency_key="qa-quality-json-stage13",
    )
    dataset_id = job["datasetId"]
    assert dataset_id

    items_response = client.get(f"/api/datasets/{dataset_id}/items?page=1&pageSize=5")
    assert items_response.status_code == 200
    items_page = items_response.json()
    assert items_page["pagination"]["totalItems"] == 30
    first_two_ids = [item["id"] for item in items_page["data"][:2]]
    first_external_id = items_page["data"][0]["externalItemId"]
    assert items_page["data"][0]["payload"]["prompt"]

    keyword_response = client.get(f"/api/datasets/{dataset_id}/items?keyword={first_external_id}&page=1&pageSize=10")
    assert keyword_response.status_code == 200
    assert keyword_response.json()["pagination"]["totalItems"] == 1

    batch_response = client.patch(
        f"/api/datasets/{dataset_id}/items:batch",
        json={
            "itemIds": first_two_ids,
            "enabled": False,
            "tags": ["needs_review", "golden"],
            "reason": "stage 1.3 regression",
        },
    )
    assert batch_response.status_code == 200
    batch_body = batch_response.json()
    assert batch_body["updatedCount"] == 2
    assert batch_body["skippedCount"] == 0
    assert batch_body["auditLogId"]

    updated_items_response = client.get(f"/api/datasets/{dataset_id}/items?page=1&pageSize=2")
    assert updated_items_response.status_code == 200
    updated_items = updated_items_response.json()["data"]
    assert {item["status"] for item in updated_items} == {"DISABLED"}
    assert {tuple(item["tags"]) for item in updated_items} == {("needs_review", "golden")}

    datasets_response = client.get(f"/api/tasks/{task['id']}/datasets?page=1&pageSize=10")
    assert datasets_response.status_code == 200
    dataset = datasets_response.json()["data"][0]
    assert dataset["itemCount"] == 30
    assert dataset["enabledItemCount"] == 28
    assert dataset["disabledItemCount"] == 2

    audit_response = client.get(f"/api/audit-logs?entityType=DATASET&entityId={dataset_id}")
    assert audit_response.status_code == 200
    audit_log = audit_response.json()["data"][0]
    assert audit_log["action"] == "BATCH_UPDATE"
    assert audit_log["metadata"]["updatedCount"] == 2
