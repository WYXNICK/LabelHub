from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import labelhub_api.models  # noqa: F401
from labelhub_api.core.enums import DatasetSourceFormat, DatasetStatus, DatasetType
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app
from labelhub_api.models.dataset import DatasetEntity
from labelhub_api.models.task import TaskEntity


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


def login(client: TestClient, email: str = "owner@labelhub.dev") -> None:
    response = client.post("/api/auth/login", json={"email": email, "password": "labelhub123"})
    assert response.status_code == 200


def create_task(client: TestClient, title: str = "QA 质量标注") -> dict:
    response = client.post(
        "/api/tasks",
        json={
            "title": title,
            "description": "判断回答是否准确、完整、格式合规。",
            "instructionRichText": {"format": "plain_text", "content": "请阅读题目后完成判断。"},
            "tags": ["qa_quality", "demo"],
            "rewardRule": {"description": "按有效提交计件"},
            "quota": 30,
            "deadlineAt": "2027-01-01T00:00:00Z",
            "distributionStrategy": "FIRST_COME_FIRST_SERVED",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_owner_can_create_list_get_and_update_draft_task(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)

    created = create_task(client)
    assert created["status"] == "DRAFT"
    assert created["version"] == 0
    assert created["stats"] == {
        "datasetCount": 0,
        "itemCount": 0,
        "enabledItemCount": 0,
        "reviewConfigVersionCount": 0,
    }

    list_response = client.get("/api/tasks?keyword=QA&page=1&pageSize=10")
    assert list_response.status_code == 200
    assert list_response.json()["pagination"]["totalItems"] == 1
    assert list_response.json()["data"][0]["id"] == created["id"]

    update_response = client.patch(
        f"/api/tasks/{created['id']}",
        json={"title": "QA 质量标注 v2", "quota": 36, "version": 0},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["title"] == "QA 质量标注 v2"
    assert updated["quota"] == 36
    assert updated["version"] == 1

    stale_response = client.patch(
        f"/api/tasks/{created['id']}",
        json={"title": "旧版本更新", "version": 0},
    )
    assert stale_response.status_code == 409
    assert stale_response.json()["error"]["code"] == "VERSION_CONFLICT"


def test_non_owner_cannot_create_task(client_with_db: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _session_factory = client_with_db
    login(client, "labeler@labelhub.dev")

    response = client.post(
        "/api/tasks",
        json={
            "title": "越权任务",
            "quota": 1,
            "deadlineAt": "2027-01-01T00:00:00Z",
        },
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_owner_task_summary_reports_full_scope_metrics(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    draft = create_task(client, "草稿任务")
    published = create_task(client, "发布中任务")

    with session_factory() as session:
        draft_task = session.get(TaskEntity, draft["id"])
        published_task = session.get(TaskEntity, published["id"])
        assert draft_task is not None
        assert published_task is not None
        draft_task.submitted_count = 3
        draft_task.approved_count = 1
        draft_task.current_template_version_id = "template_version_draft"
        published_task.status = "PUBLISHED"
        published_task.submitted_count = 7
        published_task.claimed_count = 8
        published_task.current_review_config_version_id = "review_config_ready"
        session.add(
            DatasetEntity(
                id="dataset_summary_ready",
                task_id=published_task.id,
                name="summary_dataset",
                dataset_type=DatasetType.QA_QUALITY.value,
                source_format=DatasetSourceFormat.JSON.value,
                item_count=12,
                enabled_item_count=10,
                disabled_item_count=2,
                status=DatasetStatus.READY.value,
                created_by="user_owner_demo",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.get("/api/tasks/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["totalTaskCount"] == 2
    assert body["draftTaskCount"] == 1
    assert body["publishedTaskCount"] == 1
    assert body["totalSubmittedCount"] == 10
    assert body["totalApprovedCount"] == 1
    assert body["readyDatasetCount"] == 1
    assert body["enabledItemCount"] == 10
    assert body["templateReadyTaskCount"] == 1
    assert body["reviewConfigReadyTaskCount"] == 1


def test_publish_is_blocked_until_dataset_template_and_review_config_are_ready(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    created = create_task(client)

    response = client.post(
        f"/api/tasks/{created['id']}/state-transitions",
        json={"targetStatus": "PUBLISHED", "version": 0, "reason": "准备发布"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "PUBLISH_BLOCKED"
    blocker_codes = {blocker["code"] for blocker in body["error"]["details"]["blockers"]}
    assert {
        "MISSING_DATASET",
        "MISSING_TEMPLATE_VERSION",
        "MISSING_REVIEW_CONFIG",
    }.issubset(blocker_codes)


def test_publish_check_reports_current_blockers(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    created = create_task(client)

    response = client.get(f"/api/tasks/{created['id']}/publish-check")

    assert response.status_code == 200
    body = response.json()
    assert body["taskId"] == created["id"]
    assert body["canPublish"] is False
    assert body["checkedAt"]
    blocker_codes = {blocker["code"] for blocker in body["blockers"]}
    assert {
        "MISSING_DATASET",
        "MISSING_TEMPLATE_VERSION",
        "MISSING_REVIEW_CONFIG",
    }.issubset(blocker_codes)
    assert "INVALID_TASK_STATUS" not in blocker_codes


def test_publish_check_passes_when_dependencies_are_ready(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    created = create_task(client)

    with session_factory() as session:
        task = session.get(TaskEntity, created["id"])
        assert task is not None
        task.current_template_version_id = "template_version_ready"
        task.current_review_config_version_id = "review_config_version_ready"
        session.add(
            DatasetEntity(
                id="dataset_ready_for_check",
                task_id=task.id,
                name="qa_quality",
                dataset_type=DatasetType.QA_QUALITY.value,
                source_format=DatasetSourceFormat.JSON.value,
                item_count=30,
                enabled_item_count=30,
                disabled_item_count=0,
                status=DatasetStatus.READY.value,
                created_by="user_owner_demo",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.get(f"/api/tasks/{created['id']}/publish-check")

    assert response.status_code == 200
    body = response.json()
    assert body["canPublish"] is True
    assert body["blockers"] == []


def test_publish_check_blocks_invalid_task_status(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    created = create_task(client)

    with session_factory() as session:
        task = session.get(TaskEntity, created["id"])
        assert task is not None
        task.status = "ENDED"
        session.commit()

    response = client.get(f"/api/tasks/{created['id']}/publish-check")

    assert response.status_code == 200
    body = response.json()
    assert body["canPublish"] is False
    assert body["blockers"][0]["code"] == "INVALID_TASK_STATUS"


def test_valid_state_transitions_write_audit_logs(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    created = create_task(client)

    with session_factory() as session:
        task = session.get(TaskEntity, created["id"])
        assert task is not None
        task.current_template_version_id = "template_version_ready"
        task.current_review_config_version_id = "review_config_version_ready"
        session.add(
            DatasetEntity(
                id="dataset_ready",
                task_id=task.id,
                name="qa_quality",
                dataset_type=DatasetType.QA_QUALITY.value,
                source_format=DatasetSourceFormat.JSON.value,
                item_count=30,
                enabled_item_count=30,
                disabled_item_count=0,
                status=DatasetStatus.READY.value,
                created_by="user_owner_demo",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.commit()

    publish_response = client.post(
        f"/api/tasks/{created['id']}/state-transitions",
        json={"targetStatus": "PUBLISHED", "version": 0, "reason": "检查通过"},
    )
    assert publish_response.status_code == 200
    assert publish_response.json()["status"] == "PUBLISHED"
    assert publish_response.json()["version"] == 1

    pause_response = client.post(
        f"/api/tasks/{created['id']}/state-transitions",
        json={"targetStatus": "PAUSED", "version": 1, "reason": "暂停发放"},
    )
    assert pause_response.status_code == 200
    assert pause_response.json()["status"] == "PAUSED"

    audit_response = client.get(f"/api/audit-logs?entityType=TASK&entityId={created['id']}")
    assert audit_response.status_code == 200
    actions = [log["action"] for log in audit_response.json()["data"]]
    assert actions.count("STATE_TRANSITION") == 2
    assert "CREATE" in actions

    invalid_response = client.post(
        f"/api/tasks/{created['id']}/state-transitions",
        json={"targetStatus": "DRAFT", "version": 2},
    )
    assert invalid_response.status_code == 409
    assert invalid_response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
