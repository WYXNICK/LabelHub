from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
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
    LlmActionRunStatus,
    ReviewConfigVersionStatus,
    TaskStatus,
    TemplateVersionStatus,
)
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app
from labelhub_api.models.assignment import AssignmentEntity, LlmActionRunEntity, SubmissionEntity
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.dataset import DatasetEntity, DatasetItemEntity
from labelhub_api.models.review_config import ReviewConfigVersionEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateVersionEntity
from labelhub_api.services.llm_client import LlmClientError, OpenAICompatibleLlmClient


STAGE3_PATHS = {
    "/api/marketplace/tasks": {"get"},
    "/api/tasks/{taskId}/assignments": {"post"},
    "/api/assignments": {"get"},
    "/api/assignments/{assignmentId}": {"get"},
    "/api/assignments/{assignmentId}/draft": {"put"},
    "/api/assignments/{assignmentId}/submissions": {"post"},
    "/api/assignments/{assignmentId}/llm-actions/{componentId}:run": {"post"},
    "/api/me/contribution-stats": {"get"},
    "/api/me/contributions": {"get"},
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


def attach_llm_action_to_stage3_template(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        template = session.get(TemplateVersionEntity, "template_version_stage3")
        assert template is not None
        schema = dict(template.schema_json)
        schema["components"] = [
            *schema["components"],
            {
                "id": "answer_assistant",
                "type": "LLM_ACTION",
                "label": "Answer assistant",
                "props": {
                    "actionLabel": "Generate suggestion",
                    "promptTemplate": "Improve the answer using the question context.",
                    "inputItemPaths": ["$.prompt"],
                    "inputFieldKeys": ["answer"],
                    "outputFieldKey": "answer",
                    "helperText": "Reference only; labeler confirms before submit.",
                },
                "validation": {},
                "visibility": {},
            },
        ]
        schema["layout"] = {"root": [*schema["layout"]["root"], "answer_assistant"]}
        template.schema_json = schema
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
        "SaveAssignmentDraftRequest",
        "CreateSubmissionRequest",
        "RunLlmActionRequest",
        "AssignmentVO",
        "AssignmentContextVO",
        "AssignmentNavigationVO",
        "LlmActionRunVO",
        "ContributionItemVO",
        "ContributionStatsVO",
        "ReviewFeedbackVO",
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


def test_labeler_can_save_assignment_draft_and_restore_from_context(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 draft task", quota=2)
    prepare_claimable_task(session_factory, task["id"], item_count=2)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(
        f"/api/tasks/{task['id']}/assignments",
        json={"idempotencyKey": "claim-stage3-draft"},
    ).json()

    response = client.put(
        f"/api/assignments/{assignment['id']}/draft",
        json={"values": {"answer": "第一版草稿"}, "clientVersion": assignment["version"]},
        headers={"X-Request-ID": "req_stage3_draft"},
    )

    assert response.status_code == 200
    saved = response.json()
    assert saved["status"] == AssignmentStatus.DRAFT_SAVED.value
    assert saved["draftValues"] == {"answer": "第一版草稿"}
    assert saved["draftSavedAt"] is not None
    assert saved["version"] == assignment["version"] + 1

    context_response = client.get(f"/api/assignments/{assignment['id']}")
    assert context_response.status_code == 200
    assert context_response.json()["assignment"]["draftValues"] == {"answer": "第一版草稿"}

    with session_factory() as session:
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.ASSIGNMENT.value,
                AuditLogEntity.entity_id == assignment["id"],
                AuditLogEntity.action == AuditAction.ASSIGNMENT_DRAFT_SAVE.value,
            )
        )

        assert stored_assignment is not None
        assert stored_assignment.status == AssignmentStatus.DRAFT_SAVED.value
        assert stored_assignment.draft_values == {"answer": "第一版草稿"}
        assert audit_log is not None
        assert audit_log.request_id == "req_stage3_draft"
        assert audit_log.metadata_json["fieldKeys"] == ["answer"]


def test_save_assignment_draft_rejects_stale_client_version(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 draft conflict task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    with session_factory() as session:
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        assert stored_assignment is not None
        stored_assignment.version = 3
        session.commit()

    response = client.put(
        f"/api/assignments/{assignment['id']}/draft",
        json={"values": {"answer": "stale"}, "clientVersion": assignment["version"]},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ASSIGNMENT_VERSION_CONFLICT"
    assert response.json()["error"]["details"] == {"currentVersion": 3}


def test_labeler_can_submit_assignment_and_create_submission_version(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 submit task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(
        f"/api/tasks/{task['id']}/assignments",
        json={"idempotencyKey": "claim-stage3-submit"},
    ).json()

    response = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "最终答案"},
            "idempotencyKey": "submit-stage3-1",
            "clientDraftVersion": assignment["version"],
        },
        headers={"X-Request-ID": "req_stage3_submit"},
    )

    assert response.status_code == 201
    submission = response.json()
    assert submission["assignmentId"] == assignment["id"]
    assert submission["submissionVersion"] == 1
    assert submission["values"] == {"answer": "最终答案"}
    assert submission["status"] == "SUBMITTED"
    assert submission["submittedAt"] is not None

    context_response = client.get(f"/api/assignments/{assignment['id']}")
    assert context_response.status_code == 200
    context = context_response.json()
    assert context["assignment"]["status"] == AssignmentStatus.SUBMITTED.value
    assert context["assignment"]["currentSubmissionId"] == submission["id"]
    assert context["latestSubmission"]["id"] == submission["id"]

    with session_factory() as session:
        stored_task = session.get(TaskEntity, task["id"])
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        stored_submission = session.get(SubmissionEntity, submission["id"])
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.SUBMISSION.value,
                AuditLogEntity.entity_id == submission["id"],
                AuditLogEntity.action == AuditAction.SUBMISSION_CREATE.value,
            )
        )

        assert stored_task is not None
        assert stored_task.submitted_count == 1
        assert stored_assignment is not None
        assert stored_assignment.status == AssignmentStatus.SUBMITTED.value
        assert stored_assignment.current_submission_id == submission["id"]
        assert stored_submission is not None
        assert stored_submission.idempotency_key == "submit-stage3-1"
        assert audit_log is not None
        assert audit_log.request_id == "req_stage3_submit"
        assert audit_log.metadata_json["fieldKeys"] == ["answer"]


def test_submit_assignment_rejects_required_field_errors(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 submit validation task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    response = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={"values": {}, "clientDraftVersion": assignment["version"]},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "SUBMISSION_VALIDATION_FAILED"
    assert error["details"]["errors"] == [{"fieldKey": "answer", "message": "Answer 为必填项"}]

    with session_factory() as session:
        submission_count = session.scalar(select(func.count()).select_from(SubmissionEntity))
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        assert submission_count == 0
        assert stored_assignment is not None
        assert stored_assignment.status == AssignmentStatus.CLAIMED.value


def test_submit_assignment_prunes_hidden_fields_before_persisting(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 hidden field task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    with session_factory() as session:
        template = session.get(TemplateVersionEntity, "template_version_stage3")
        assert template is not None
        schema = dict(template.schema_json)
        schema["components"] = [
            *schema["components"],
            {
                "id": "hidden_note",
                "type": "TEXT_INPUT",
                "fieldKey": "hiddenNote",
                "label": "Hidden Note",
                "props": {},
                "validation": {"required": True},
                "visibility": {
                    "logic": "ALL",
                    "conditions": [{"fieldKey": "answer", "operator": "EQUALS", "value": "needs_note"}],
                },
            },
        ]
        schema["layout"] = {"root": [*schema["layout"]["root"], "hidden_note"]}
        template.schema_json = schema
        session.commit()

    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    response = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "ok", "hiddenNote": "should be removed"},
            "clientDraftVersion": assignment["version"],
        },
    )

    assert response.status_code == 201
    assert response.json()["values"] == {"answer": "ok"}

    with session_factory() as session:
        stored_submission = session.get(SubmissionEntity, response.json()["id"])
        assert stored_submission is not None
        assert stored_submission.values == {"answer": "ok"}


def test_submit_assignment_requires_controlled_file_references(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 file ref task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    with session_factory() as session:
        template = session.get(TemplateVersionEntity, "template_version_stage3")
        assert template is not None
        schema = dict(template.schema_json)
        schema["components"] = [
            *schema["components"],
            {
                "id": "evidence",
                "type": "FILE_UPLOAD",
                "fieldKey": "evidence",
                "label": "Evidence",
                "props": {"maxFiles": 2},
                "validation": {"required": True},
                "visibility": {},
            },
        ]
        schema["layout"] = {"root": [*schema["layout"]["root"], "evidence"]}
        template.schema_json = schema
        session.commit()

    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    invalid_response = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={"values": {"answer": "ok", "evidence": ["local.pdf"]}, "clientDraftVersion": assignment["version"]},
    )

    assert invalid_response.status_code == 422
    assert invalid_response.json()["error"]["details"]["errors"] == [
        {"fieldKey": "evidence", "message": "Evidence 必须使用已上传文件引用"}
    ]

    valid_response = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={"values": {"answer": "ok", "evidence": ["file_controlled_ref"]}, "clientDraftVersion": assignment["version"]},
    )

    assert valid_response.status_code == 201
    assert valid_response.json()["values"] == {"answer": "ok", "evidence": ["file_controlled_ref"]}


def test_submit_assignment_is_idempotent_for_same_assignment(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 idempotent submit task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    payload = {
        "values": {"answer": "幂等提交"},
        "idempotencyKey": "submit-stage3-idempotent",
        "clientDraftVersion": assignment["version"],
    }

    first = client.post(f"/api/assignments/{assignment['id']}/submissions", json=payload)
    second = client.post(f"/api/assignments/{assignment['id']}/submissions", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    with session_factory() as session:
        submission_count = session.scalar(select(func.count()).select_from(SubmissionEntity))
        assert submission_count == 1


def test_labeler_can_run_llm_action_with_idempotent_trace(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 llm action task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    attach_llm_action_to_stage3_template(session_factory)
    with session_factory() as session:
        item = session.get(DatasetItemEntity, "dataset_item_stage3_0")
        assert item is not None
        item.payload = {
            "prompt": "Question 0",
            "response_a": "unrelated model answer A",
            "response_b": "unrelated model answer B",
            "preferred": "tie",
        }
        session.commit()
    captured: dict[str, object] = {"callCount": 0}

    def fake_complete(_self: OpenAICompatibleLlmClient, *, messages: list[dict[str, str]]) -> str:
        captured["callCount"] = int(captured["callCount"]) + 1
        captured["messages"] = messages
        return '{"outputValue":"refined answer","outputValues":{"answer":"refined answer"}}'

    monkeypatch.setattr(OpenAICompatibleLlmClient, "complete", fake_complete)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    payload = {
        "inputValues": {"answer": "rough"},
        "targetFieldKey": "answer",
        "idempotencyKey": "llm-stage3-idempotent",
    }

    first = client.post(
        f"/api/assignments/{assignment['id']}/llm-actions/answer_assistant:run",
        json=payload,
        headers={"X-Request-ID": "req_stage3_llm"},
    )
    second = client.post(f"/api/assignments/{assignment['id']}/llm-actions/answer_assistant:run", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    result = first.json()
    assert result["status"] == LlmActionRunStatus.SUCCEEDED.value
    assert result["inputValues"] == {"answer": "rough"}
    assert result["outputValue"] == "refined answer"
    assert result["outputValues"] == {"answer": "refined answer"}
    assert result["id"] == second.json()["id"]
    assert captured["callCount"] == 1
    messages = captured["messages"]
    assert isinstance(messages, list)
    assert "Do not add comparison judgments" in messages[0]["content"]
    assert "reasoning" in messages[0]["content"]
    assert "unrelated dataset columns" in messages[0]["content"]
    user_payload = json.loads(messages[1]["content"])
    assert "datasetItemPayload" not in user_payload
    assert "allInputValues" not in user_payload
    assert user_payload["targetField"] == {"fieldKey": "answer", "label": "Answer"}
    assert user_payload["inputContext"] == {
        "itemValues": {"$.prompt": "Question 0"},
        "formValues": {"answer": "rough"},
    }
    assert user_payload["selectedItemValues"] == {"$.prompt": "Question 0"}
    assert user_payload["selectedInputValues"] == {"answer": "rough"}
    assert "response_a" not in messages[1]["content"]
    assert "response_b" not in messages[1]["content"]
    assert "preferred" not in messages[1]["content"]

    with session_factory() as session:
        run_count = session.scalar(select(func.count()).select_from(LlmActionRunEntity))
        run = session.scalar(select(LlmActionRunEntity).where(LlmActionRunEntity.component_id == "answer_assistant"))
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.LLM_ACTION_RUN.value,
                AuditLogEntity.action == AuditAction.LLM_ACTION_RUN.value,
            )
        )
        assert run_count == 1
        assert run is not None
        assert run.status == LlmActionRunStatus.SUCCEEDED.value
        assert run.output_values == {"answer": "refined answer"}
        assert audit_log is not None
        assert audit_log.request_id == "req_stage3_llm"
        assert audit_log.metadata_json["targetFieldKey"] == "answer"
        assert audit_log.metadata_json["inputItemPaths"] == ["$.prompt"]


def test_llm_action_does_not_send_unselected_form_values(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 llm scoped input task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    attach_llm_action_to_stage3_template(session_factory)
    with session_factory() as session:
        template = session.get(TemplateVersionEntity, "template_version_stage3")
        assert template is not None
        schema = json.loads(json.dumps(template.schema_json))
        for component in schema["components"]:
            if component["id"] == "answer_assistant":
                component["props"]["inputFieldKeys"] = []
        template.schema_json = schema
        session.commit()

    captured: dict[str, object] = {}

    def fake_complete(_self: OpenAICompatibleLlmClient, *, messages: list[dict[str, str]]) -> str:
        captured["messages"] = messages
        return '{"outputValue":"suggestion","outputValues":{"answer":"suggestion"}}'

    monkeypatch.setattr(OpenAICompatibleLlmClient, "complete", fake_complete)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    response = client.post(
        f"/api/assignments/{assignment['id']}/llm-actions/answer_assistant:run",
        json={
            "inputValues": {"answer": "rough draft", "unselectedNote": "should not leak"},
            "targetFieldKey": "answer",
        },
    )

    assert response.status_code == 200
    messages = captured["messages"]
    assert isinstance(messages, list)
    user_payload = json.loads(messages[1]["content"])
    assert user_payload["selectedItemValues"] == {"$.prompt": "Question 0"}
    assert user_payload["selectedInputValues"] == {}
    assert user_payload["inputContext"]["formValues"] == {}
    assert "rough draft" not in messages[1]["content"]
    assert "should not leak" not in messages[1]["content"]


def test_llm_action_provider_failure_is_recorded_without_blocking_assignment(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 llm failure task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    attach_llm_action_to_stage3_template(session_factory)

    def fake_complete(_self: OpenAICompatibleLlmClient, *, messages: list[dict[str, str]]) -> str:
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(OpenAICompatibleLlmClient, "complete", fake_complete)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    response = client.post(
        f"/api/assignments/{assignment['id']}/llm-actions/answer_assistant:run",
        json={"inputValues": {"answer": "rough"}, "targetFieldKey": "answer"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == LlmActionRunStatus.FAILED.value
    assert result["outputValue"] is None
    assert result["errorMessage"] == "provider unavailable"
    with session_factory() as session:
        run = session.scalar(select(LlmActionRunEntity))
        assert run is not None
        assert run.status == LlmActionRunStatus.FAILED.value
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        assert stored_assignment is not None
        assert stored_assignment.status == AssignmentStatus.CLAIMED.value


def test_labeler_can_view_contribution_stats_list_and_return_feedback(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 contribution task", quota=3)
    prepare_claimable_task(session_factory, task["id"], item_count=3)
    login(client, "labeler@labelhub.dev")

    assignments = [
        client.post(
            f"/api/tasks/{task['id']}/assignments",
            json={"idempotencyKey": f"claim-stage3-contribution-{index}"},
        ).json()
        for index in range(3)
    ]
    for index, assignment in enumerate(assignments):
        response = client.post(
            f"/api/assignments/{assignment['id']}/submissions",
            json={
                "values": {"answer": f"answer-{index}"},
                "idempotencyKey": f"submit-stage3-contribution-{index}",
                "clientDraftVersion": assignment["version"],
            },
        )
        assert response.status_code == 201

    returned_assignment_id = assignments[2]["id"]
    returned_reason = "答案缺少关键依据，请补充理由后重新提交。"
    now = datetime.now(UTC)
    with session_factory() as session:
        approved_assignment = session.get(AssignmentEntity, assignments[1]["id"])
        returned_assignment = session.get(AssignmentEntity, returned_assignment_id)
        assert approved_assignment is not None
        assert returned_assignment is not None
        approved_assignment.status = AssignmentStatus.APPROVED.value
        approved_submission = session.get(SubmissionEntity, approved_assignment.current_submission_id)
        assert approved_submission is not None
        approved_submission.status = "APPROVED"
        returned_assignment.status = AssignmentStatus.RETURNED.value
        returned_assignment.updated_at = now
        returned_submission = session.get(SubmissionEntity, returned_assignment.current_submission_id)
        assert returned_submission is not None
        returned_submission.status = "RETURNED"
        session.add(
            AuditLogEntity(
                id="audit_stage3_returned_feedback",
                entity_type=AuditEntityType.ASSIGNMENT.value,
                entity_id=returned_assignment.id,
                actor_id="user_reviewer_demo",
                actor_role="REVIEWER",
                action=AuditAction.STATE_TRANSITION.value,
                from_state=AssignmentStatus.SUBMITTED.value,
                to_state=AssignmentStatus.RETURNED.value,
                reason=returned_reason,
                metadata_json={"source": "HUMAN_REVIEW", "assignmentId": returned_assignment.id},
                request_id="req_stage3_returned",
                created_at=now,
            )
        )
        session.commit()

    stats_response = client.get("/api/me/contribution-stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert stats["totalAssignments"] == 3
    assert stats["submittedCount"] == 3
    assert stats["inReviewCount"] == 1
    assert stats["approvedCount"] == 1
    assert stats["returnedCount"] == 1
    assert stats["revisionRequiredCount"] == 1
    assert stats["totalSubmissionCount"] == 3
    assert stats["passRate"] == 50.0

    list_response = client.get("/api/me/contributions?bucket=REVISION_REQUIRED&page=1&pageSize=10")
    assert list_response.status_code == 200
    row = list_response.json()["data"][0]
    assert row["assignmentId"] == returned_assignment_id
    assert row["taskTitle"] == "Stage 3 contribution task"
    assert row["latestSubmissionVersion"] == 1
    assert row["canRevise"] is True
    assert row["reviewFeedback"]["reason"] == returned_reason

    context_response = client.get(f"/api/assignments/{returned_assignment_id}")
    assert context_response.status_code == 200
    assert context_response.json()["reviewFeedback"]["reason"] == returned_reason


def test_returned_assignment_can_be_revised_without_losing_submission_history(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 3 revise task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    first = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "first answer"},
            "idempotencyKey": "submit-stage3-revise-1",
            "clientDraftVersion": assignment["version"],
        },
    )
    assert first.status_code == 201

    now = datetime.now(UTC)
    with session_factory() as session:
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        assert stored_assignment is not None
        stored_assignment.status = AssignmentStatus.RETURNED.value
        stored_assignment.updated_at = now
        stored_submission = session.get(SubmissionEntity, stored_assignment.current_submission_id)
        assert stored_submission is not None
        stored_submission.status = "RETURNED"
        session.add(
            AuditLogEntity(
                id="audit_stage3_revise_returned",
                entity_type=AuditEntityType.ASSIGNMENT.value,
                entity_id=stored_assignment.id,
                actor_id="user_reviewer_demo",
                actor_role="REVIEWER",
                action=AuditAction.STATE_TRANSITION.value,
                from_state=AssignmentStatus.SUBMITTED.value,
                to_state=AssignmentStatus.RETURNED.value,
                reason="请修正答案。",
                metadata_json={"source": "HUMAN_REVIEW", "assignmentId": stored_assignment.id},
                request_id="req_stage3_revise_returned",
                created_at=now,
            )
        )
        session.commit()

    context = client.get(f"/api/assignments/{assignment['id']}").json()
    second = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "revised answer"},
            "idempotencyKey": "submit-stage3-revise-2",
            "clientDraftVersion": context["assignment"]["version"],
        },
    )

    assert second.status_code == 201
    assert second.json()["submissionVersion"] == 2
    assert second.json()["values"] == {"answer": "revised answer"}
    with session_factory() as session:
        submission_count = session.scalar(
            select(func.count()).select_from(SubmissionEntity).where(SubmissionEntity.assignment_id == assignment["id"])
        )
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        assert submission_count == 2
        assert stored_assignment is not None
        assert stored_assignment.status == AssignmentStatus.SUBMITTED.value
        assert stored_assignment.current_submission_id == second.json()["id"]


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
