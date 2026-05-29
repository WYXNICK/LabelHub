from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import labelhub_api.models  # noqa: F401
from labelhub_api.core.enums import AuditAction, AuditEntityType, ReviewConfigVersionStatus
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.review_config import ReviewConfigVersionEntity
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


def create_task(client: TestClient) -> dict:
    response = client.post(
        "/api/tasks",
        json={
            "title": "QA 审核配置任务",
            "description": "验证阶段 1.4 审核配置。",
            "instructionRichText": {"format": "plain_text", "content": "请完成质量判断。"},
            "tags": ["stage1", "review-config"],
            "rewardRule": {"description": "按有效提交计费"},
            "quota": 30,
            "deadlineAt": "2027-01-01T00:00:00Z",
            "distributionStrategy": "FIRST_COME_FIRST_SERVED",
        },
    )
    assert response.status_code == 201
    return response.json()


def review_config_payload(prompt_suffix: str = "") -> dict:
    return {
        "promptTemplate": f"请根据题目、参考答案和提交内容进行结构化评分。{prompt_suffix}",
        "dimensions": [
            {
                "key": "relevance",
                "name": "相关性",
                "description": "提交内容是否紧扣题目要求。",
                "maxScore": 5,
                "weight": 1.0,
            },
            {
                "key": "accuracy",
                "name": "准确性",
                "description": "判断结论是否准确可靠。",
                "maxScore": 5,
                "weight": 1.2,
            },
        ],
        "thresholds": {
            "passMinScore": 10,
            "humanReviewMinScore": 7,
            "returnBelowScore": 4,
        },
        "outputSchema": {
            "type": "object",
            "required": ["decision", "totalScore", "dimensionScores", "comment"],
            "properties": {
                "decision": {"type": "string", "enum": ["PASS", "RETURN", "HUMAN_REVIEW"]},
                "totalScore": {"type": "number"},
                "dimensionScores": {"type": "object"},
                "comment": {"type": "string"},
            },
        },
    }


def test_owner_can_save_publish_and_list_review_config_versions(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    task = create_task(client)

    default_response = client.get(f"/api/tasks/{task['id']}/review-config-draft")
    assert default_response.status_code == 200
    default_draft = default_response.json()
    assert default_draft["taskId"] == task["id"]
    assert default_draft["dimensions"]

    save_response = client.put(
        f"/api/tasks/{task['id']}/review-config-draft",
        json=review_config_payload(),
        headers={"X-Request-ID": "req_review_save_1"},
    )
    assert save_response.status_code == 200
    saved_draft = save_response.json()
    assert saved_draft["promptTemplate"].startswith("请根据题目")
    assert [dimension["key"] for dimension in saved_draft["dimensions"]] == ["relevance", "accuracy"]

    publish_response = client.post(
        f"/api/tasks/{task['id']}/review-config-versions",
        json={"draftId": saved_draft["id"], "versionNote": "首版审核标准"},
        headers={"X-Request-ID": "req_review_publish_1"},
    )
    assert publish_response.status_code == 201
    first_version = publish_response.json()
    assert first_version["versionNo"] == 1
    assert first_version["status"] == "ACTIVE"

    second_save_response = client.put(
        f"/api/tasks/{task['id']}/review-config-draft",
        json=review_config_payload("第二版补充安全性说明。"),
    )
    assert second_save_response.status_code == 200
    second_publish_response = client.post(
        f"/api/tasks/{task['id']}/review-config-versions",
        json={"draftId": saved_draft["id"], "versionNote": "第二版"},
    )
    assert second_publish_response.status_code == 201
    second_version = second_publish_response.json()
    assert second_version["versionNo"] == 2
    assert second_version["status"] == "ACTIVE"

    list_response = client.get(f"/api/tasks/{task['id']}/review-config-versions?page=1&pageSize=10")
    assert list_response.status_code == 200
    versions = list_response.json()["data"]
    assert [version["versionNo"] for version in versions] == [2, 1]
    assert versions[0]["status"] == "ACTIVE"
    assert versions[1]["status"] == "DISABLED"

    with session_factory() as session:
        stored_task = session.get(TaskEntity, task["id"])
        assert stored_task is not None
        assert stored_task.current_review_config_version_id == second_version["id"]
        assert stored_task.version == 2

        stored_versions = list(
            session.scalars(
                select(ReviewConfigVersionEntity).order_by(ReviewConfigVersionEntity.version_no.asc())
            )
        )
        assert [version.status for version in stored_versions] == [
            ReviewConfigVersionStatus.DISABLED.value,
            ReviewConfigVersionStatus.ACTIVE.value,
        ]

        audit_actions = [
            log.action
            for log in session.scalars(
                select(AuditLogEntity).where(AuditLogEntity.entity_type == AuditEntityType.REVIEW_CONFIG.value)
            )
        ]
        assert AuditAction.REVIEW_CONFIG_SAVE.value in audit_actions
        assert audit_actions.count(AuditAction.REVIEW_CONFIG_PUBLISH.value) == 2


def test_review_config_rejects_duplicate_dimensions_and_invalid_thresholds(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client)
    payload = review_config_payload()
    payload["dimensions"][1]["key"] = "relevance"
    payload["thresholds"] = {
        "passMinScore": 3,
        "humanReviewMinScore": 5,
        "returnBelowScore": 6,
    }

    response = client.put(f"/api/tasks/{task['id']}/review-config-draft", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REVIEW_CONFIG"


def test_non_owner_cannot_manage_review_config(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client, "labeler@labelhub.dev")

    response = client.get("/api/tasks/task_demo/review-config-draft")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
