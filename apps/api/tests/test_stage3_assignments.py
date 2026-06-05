from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import labelhub_api.models  # noqa: F401
from labelhub_api.core.enums import (
    AssignmentStatus,
    AuditAction,
    AuditEntityType,
    DatasetItemStatus,
    DatasetSourceFormat,
    DatasetStatus,
    DatasetType,
    ReviewConfigVersionStatus,
    TaskStatus,
    TemplateVersionStatus,
)
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app
from labelhub_api.models.assignment import AssignmentEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetEntity, DatasetItemEntity
from labelhub_api.models.review_config import ReviewConfigVersionEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateVersionEntity


STAGE3_PATHS = {
    "/api/marketplace/tasks": {"get"},
    "/api/tasks/{taskId}/assignments": {"post"},
    "/api/assignments": {"get"},
    "/api/assignments/{assignmentId}": {"get"},
}

STAGE3_TABLES = {"assignments", "submissions", "llm_action_runs"}


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


def login(client: TestClient, email: str) -> None:
    response = client.post("/api/auth/login", json={"email": email, "password": "labelhub123"})
    assert response.status_code == 200


def create_task(client: TestClient, title: str = "Stage 3 marketplace task", quota: int = 2) -> dict:
    login(client, "owner@labelhub.dev")
    response = client.post(
        "/api/tasks",
        json={
            "title": title,
            "description": "Claimable labeler task",
            "instructionRichText": {"format": "plain_text", "content": "Claim and annotate."},
            "tags": ["stage3", "marketplace"],
            "rewardRule": {"description": "0.30 元 / 条"},
            "quota": quota,
            "deadlineAt": "2027-01-01T00:00:00Z",
            "distributionStrategy": "FIRST_COME_FIRST_SERVED",
        },
    )
    assert response.status_code == 201
    return response.json()


def prepare_claimable_task(session_factory: sessionmaker[Session], task_id: str, *, item_count: int = 2) -> None:
    now = datetime.now(UTC)
    with session_factory() as session:
        template = TemplateVersionEntity(
            id="template_version_stage3",
            task_id=task_id,
            version_no=1,
            schema_json={
                "schemaVersion": "labelhub-template/v1",
                "components": [
                    {
                        "id": "show_prompt",
                        "type": "SHOW_ITEM",
                        "label": "Prompt",
                        "props": {"path": "$.prompt"},
                        "validation": {},
                        "visibility": {},
                    },
                    {
                        "id": "answer",
                        "type": "TEXT_INPUT",
                        "fieldKey": "answer",
                        "label": "Answer",
                        "props": {"placeholder": "Write answer"},
                        "validation": {"required": True},
                        "visibility": {},
                    },
                ],
                "layout": {"root": ["show_prompt", "answer"]},
                "llmActions": [],
                "showItems": [],
            },
            status=TemplateVersionStatus.ACTIVE.value,
            version_note="stage3",
            published_by="user_owner_demo",
            published_at=now,
            created_at=now,
            updated_at=now,
        )
        review_config = ReviewConfigVersionEntity(
            id="review_config_version_stage3",
            task_id=task_id,
            version_no=1,
            prompt_template="review",
            dimensions=[],
            thresholds={},
            output_schema={},
            status=ReviewConfigVersionStatus.ACTIVE.value,
            published_by="user_owner_demo",
            published_at=now,
            created_at=now,
            updated_at=now,
        )
        dataset = DatasetEntity(
            id="dataset_stage3",
            task_id=task_id,
            name="stage3_dataset",
            dataset_type=DatasetType.QA_QUALITY.value,
            source_format=DatasetSourceFormat.JSON.value,
            item_count=item_count,
            enabled_item_count=item_count,
            disabled_item_count=0,
            status=DatasetStatus.READY.value,
            created_by="user_owner_demo",
            created_at=now,
            updated_at=now,
        )
        session.add_all([template, review_config, dataset])
        for index in range(item_count):
            session.add(
                DatasetItemEntity(
                    id=f"dataset_item_stage3_{index}",
                    dataset_id=dataset.id,
                    task_id=task_id,
                    external_item_id=f"item_{index}",
                    source_format=DatasetSourceFormat.JSON.value,
                    source_row_number=index + 1,
                    payload={"prompt": f"Question {index}"},
                    media_refs=[],
                    checksum=f"checksum_{index}",
                    status=DatasetItemStatus.AVAILABLE.value,
                    tags=[],
                    version=0,
                    created_at=now,
                    updated_at=now,
                )
            )
        task = session.get(TaskEntity, task_id)
        assert task is not None
        task.status = TaskStatus.PUBLISHED.value
        task.current_template_version_id = template.id
        task.current_review_config_version_id = review_config.id
        task.updated_at = now
        session.commit()


def test_stage3_openapi_and_metadata_contract_are_registered() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    for path, methods in STAGE3_PATHS.items():
        assert path in paths
        assert methods.issubset(paths[path].keys())

    schemas = response.json()["components"]["schemas"]
    for schema_name in [
        "MarketplaceTaskVO",
        "CreateAssignmentRequest",
        "AssignmentVO",
        "AssignmentContextVO",
        "AssignmentNavigationVO",
        "SubmissionVO",
    ]:
        assert schema_name in schemas

    assert STAGE3_TABLES.issubset(Base.metadata.tables.keys())
    assert {"task_id", "dataset_item_id", "labeler_id", "template_version_id"}.issubset(
        Base.metadata.tables["assignments"].columns.keys()
    )


def test_stage3_alembic_migration_contains_labeler_foundation_tables() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "0004_create_labeler_foundation.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0003_create_template_foundation"' in migration_source
    for table_name in STAGE3_TABLES:
        assert f'"{table_name}"' in migration_source


def test_labeler_can_list_marketplace_and_claim_first_available_item(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client)
    prepare_claimable_task(session_factory, task["id"])
    login(client, "labeler@labelhub.dev")

    list_response = client.get("/api/marketplace/tasks?page=1&pageSize=10&keyword=marketplace&tag=stage3")

    assert list_response.status_code == 200
    listed_task = list_response.json()["data"][0]
    assert listed_task["id"] == task["id"]
    assert listed_task["availableItemCount"] == 2
    assert listed_task["currentTemplateVersionId"] == "template_version_stage3"

    claim_response = client.post(
        f"/api/tasks/{task['id']}/assignments",
        json={"idempotencyKey": "claim-stage3-1"},
        headers={"X-Request-ID": "req_stage3_claim"},
    )

    assert claim_response.status_code == 201
    assignment = claim_response.json()
    assert assignment["status"] == AssignmentStatus.CLAIMED.value
    assert assignment["taskId"] == task["id"]
    assert assignment["datasetItemId"] == "dataset_item_stage3_0"
    assert assignment["templateVersionId"] == "template_version_stage3"
    assert assignment["reviewConfigVersionId"] == "review_config_version_stage3"

    with session_factory() as session:
        stored_task = session.get(TaskEntity, task["id"])
        stored_item = session.get(DatasetItemEntity, "dataset_item_stage3_0")
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.ASSIGNMENT.value,
                AuditLogEntity.action == AuditAction.ASSIGNMENT_CLAIM.value,
            )
        )

        assert stored_task is not None
        assert stored_task.claimed_count == 1
        assert stored_item is not None
        assert stored_item.status == DatasetItemStatus.CLAIMED.value
        assert stored_assignment is not None
        assert stored_assignment.labeler_id == "user_labeler_demo"
        assert audit_log is not None
        assert audit_log.request_id == "req_stage3_claim"

    after_claim_response = client.get("/api/marketplace/tasks?page=1&pageSize=10")
    assert after_claim_response.status_code == 200
    after_claim_task = after_claim_response.json()["data"][0]
    assert after_claim_task["availableItemCount"] == 1
    assert after_claim_task["claimedByMeCount"] == 1
    assert after_claim_task["activeAssignmentId"] == assignment["id"]


def test_labeler_can_open_assignment_context_and_navigate_claimed_items(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 context task", quota=3)
    prepare_claimable_task(session_factory, task["id"], item_count=3)
    login(client, "labeler@labelhub.dev")

    first = client.post(
        f"/api/tasks/{task['id']}/assignments",
        json={"idempotencyKey": "claim-stage3-context-1"},
    ).json()
    second = client.post(
        f"/api/tasks/{task['id']}/assignments",
        json={"idempotencyKey": "claim-stage3-context-2"},
    ).json()

    list_response = client.get("/api/assignments?page=1&pageSize=10&status=CLAIMED")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()["data"]][:2] == [second["id"], first["id"]]

    context_response = client.get(f"/api/assignments/{first['id']}")

    assert context_response.status_code == 200
    context = context_response.json()
    assert context["assignment"]["id"] == first["id"]
    assert context["task"]["id"] == task["id"]
    assert context["datasetItemPayload"] == {"prompt": "Question 0"}
    assert context["templateSchema"]["components"][1]["fieldKey"] == "answer"
    assert context["latestSubmission"] is None
    assert context["reviewFeedback"] is None
    assert context["navigation"] == {
        "previousAssignmentId": None,
        "nextAssignmentId": second["id"],
        "currentIndex": 1,
        "totalCount": 2,
        "canClaimNext": True,
        "nextClaimableTaskId": task["id"],
    }

    second_context_response = client.get(f"/api/assignments/{second['id']}")
    assert second_context_response.status_code == 200
    second_navigation = second_context_response.json()["navigation"]
    assert second_navigation["previousAssignmentId"] == first["id"]
    assert second_navigation["nextAssignmentId"] is None


def test_marketplace_hides_tasks_without_ready_publish_dependencies(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    create_task(client, "Draft task should be hidden")
    login(client, "labeler@labelhub.dev")

    response = client.get("/api/marketplace/tasks?page=1&pageSize=10")

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_non_labeler_cannot_use_marketplace_or_claim(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, "Owner cannot claim")
    prepare_claimable_task(session_factory, task["id"])

    list_response = client.get("/api/marketplace/tasks")
    claim_response = client.post(f"/api/tasks/{task['id']}/assignments", json={})
    assignments_response = client.get("/api/assignments")
    context_response = client.get("/api/assignments/assignment_missing")

    assert list_response.status_code == 403
    assert claim_response.status_code == 403
    assert assignments_response.status_code == 403
    assert context_response.status_code == 403
