from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import labelhub_api.models  # noqa: F401
from labelhub_api.core.enums import AuditAction, AuditEntityType
from labelhub_api.db.base import Base
from labelhub_api.db.session import get_db_session
from labelhub_api.main import create_app
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.task import TaskEntity
from labelhub_api.models.template import TemplateDraftEntity, TemplateVersionEntity


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
            "title": "Template schema task",
            "description": "Stage 2.1 template validation",
            "instructionRichText": {"format": "plain_text", "content": "Build a template"},
            "tags": ["stage2", "template"],
            "rewardRule": {"description": "fixed"},
            "quota": 20,
            "deadlineAt": "2027-01-01T00:00:00Z",
            "distributionStrategy": "FIRST_COME_FIRST_SERVED",
        },
    )
    assert response.status_code == 201
    return response.json()


def valid_schema() -> dict:
    return {
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
                "type": "TEXTAREA",
                "fieldKey": "answer",
                "label": "Answer",
                "props": {"placeholder": "Write answer"},
                "validation": {"required": True},
                "visibility": {},
            },
            {
                "id": "quality",
                "type": "RADIO",
                "fieldKey": "quality",
                "label": "Quality",
                "props": {"options": [{"label": "Good", "value": "good"}]},
                "validation": {"required": True},
                "visibility": {},
            },
        ],
        "layout": {"root": ["show_prompt", "answer", "quality"]},
        "llmActions": [],
        "showItems": [{"id": "show_prompt", "path": "$.prompt"}],
    }


def test_owner_can_get_default_draft_save_valid_schema_and_audit(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    task = create_task(client)

    default_response = client.get(f"/api/tasks/{task['id']}/template-draft")
    assert default_response.status_code == 200
    default_draft = default_response.json()
    assert default_draft["schema"]["schemaVersion"] == "labelhub-template/v1"
    assert default_draft["schema"]["layout"] == {"root": []}

    save_response = client.put(
        f"/api/tasks/{task['id']}/template-draft",
        json={"schema": valid_schema()},
        headers={"X-Request-ID": "req_template_save_1"},
    )
    assert save_response.status_code == 200
    saved_draft = save_response.json()
    assert [component["id"] for component in saved_draft["schema"]["components"]] == [
        "show_prompt",
        "answer",
        "quality",
    ]

    with session_factory() as session:
        stored_draft = session.scalar(
            select(TemplateDraftEntity).where(TemplateDraftEntity.task_id == task["id"])
        )
        assert stored_draft is not None
        assert stored_draft.schema_json["components"][1]["fieldKey"] == "answer"

        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.TEMPLATE.value,
                AuditLogEntity.action == AuditAction.TEMPLATE_SAVE.value,
            )
        )
        assert audit_log is not None
        assert audit_log.metadata_json["componentCount"] == 3


def test_owner_can_publish_template_versions_and_unblock_publish_check(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    login(client)
    task = create_task(client)

    save_response = client.put(f"/api/tasks/{task['id']}/template-draft", json={"schema": valid_schema()})
    assert save_response.status_code == 200
    draft = save_response.json()

    publish_response = client.post(
        f"/api/tasks/{task['id']}/template-versions",
        json={"draftId": draft["id"], "versionNote": "首版标注模板"},
        headers={"X-Request-ID": "req_template_publish_1"},
    )
    assert publish_response.status_code == 201
    first_version = publish_response.json()
    assert first_version["versionNo"] == 1
    assert first_version["status"] == "ACTIVE"
    assert first_version["schema"]["components"][1]["fieldKey"] == "answer"

    schema_v2 = valid_schema()
    schema_v2["components"][1]["label"] = "Answer v2"
    second_save_response = client.put(f"/api/tasks/{task['id']}/template-draft", json={"schema": schema_v2})
    assert second_save_response.status_code == 200
    second_publish_response = client.post(
        f"/api/tasks/{task['id']}/template-versions",
        json={"draftId": draft["id"], "versionNote": "第二版"},
    )
    assert second_publish_response.status_code == 201
    second_version = second_publish_response.json()
    assert second_version["versionNo"] == 2
    assert second_version["status"] == "ACTIVE"

    list_response = client.get(f"/api/tasks/{task['id']}/template-versions?page=1&pageSize=10")
    assert list_response.status_code == 200
    listed_versions = list_response.json()["data"]
    assert [version["versionNo"] for version in listed_versions] == [2, 1]
    assert listed_versions[0]["status"] == "ACTIVE"
    assert listed_versions[1]["status"] == "DISABLED"

    detail_response = client.get(f"/api/template-versions/{first_version['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["schema"]["components"][1]["label"] == "Answer"

    publish_check_response = client.get(f"/api/tasks/{task['id']}/publish-check")
    assert publish_check_response.status_code == 200
    blocker_codes = {blocker["code"] for blocker in publish_check_response.json()["blockers"]}
    assert "MISSING_TEMPLATE_VERSION" not in blocker_codes

    with session_factory() as session:
        stored_task = session.get(TaskEntity, task["id"])
        assert stored_task is not None
        assert stored_task.current_template_version_id == second_version["id"]
        assert stored_task.version == 2

        stored_versions = list(
            session.scalars(select(TemplateVersionEntity).order_by(TemplateVersionEntity.version_no.asc()))
        )
        assert [version.status for version in stored_versions] == ["DISABLED", "ACTIVE"]

        audit_actions = [
            log.action
            for log in session.scalars(
                select(AuditLogEntity).where(AuditLogEntity.entity_type == AuditEntityType.TEMPLATE.value)
            )
        ]
        assert AuditAction.TEMPLATE_SAVE.value in audit_actions
        assert AuditAction.TEMPLATE_PUBLISH.value in audit_actions


def test_publish_template_version_rejects_empty_default_draft(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client)
    draft_response = client.get(f"/api/tasks/{task['id']}/template-draft")
    assert draft_response.status_code == 200

    response = client.post(
        f"/api/tasks/{task['id']}/template-versions",
        json={"draftId": draft_response.json()["id"], "versionNote": "空模板"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_TEMPLATE_SCHEMA"
    fields = {error["field"] for error in response.json()["error"]["details"]["errors"]}
    assert "components" in fields
    assert "layout.root" in fields


def test_validate_template_schema_returns_structured_errors(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = valid_schema()
    schema["components"][1]["fieldKey"] = "quality"
    schema["components"].append(
        {
            "id": "unknown",
            "type": "NOT_A_MATERIAL",
            "fieldKey": "unknown",
            "label": "Unknown",
            "props": {},
            "validation": {},
            "visibility": {},
        }
    )
    schema["layout"] = {"root": ["show_prompt", "answer", "missing_component"]}

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    messages = [error["message"] for error in payload["errors"]]
    assert any("不支持的物料类型" in message for message in messages)
    assert any("fieldKey 重复" in message for message in messages)
    assert any("不存在的组件" in message for message in messages)


def test_validate_template_schema_accepts_minimal_renderer_materials(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = {
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
                "id": "short_answer",
                "type": "TEXT_INPUT",
                "fieldKey": "shortAnswer",
                "label": "Short answer",
                "props": {},
                "validation": {"required": True},
                "visibility": {},
            },
            {
                "id": "long_answer",
                "type": "TEXTAREA",
                "fieldKey": "longAnswer",
                "label": "Long answer",
                "props": {},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "quality",
                "type": "RADIO",
                "fieldKey": "quality",
                "label": "Quality",
                "props": {"options": [{"label": "Good", "value": "good"}]},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "issues",
                "type": "CHECKBOX",
                "fieldKey": "issues",
                "label": "Issues",
                "props": {"options": [{"label": "Fact error", "value": "fact_error"}]},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "tags",
                "type": "TAG_SELECT",
                "fieldKey": "tags",
                "label": "Tags",
                "props": {"options": [{"label": "Golden", "value": "golden"}]},
                "validation": {},
                "visibility": {},
            },
        ],
        "layout": {
            "root": ["show_prompt", "short_answer", "long_answer", "quality", "issues", "tags"]
        },
        "llmActions": [],
        "showItems": [{"id": "show_prompt", "path": "$.prompt"}],
    }

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    assert response.json() == {"valid": True, "errors": []}


def test_validate_template_schema_accepts_stage25_advanced_materials(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = {
        "schemaVersion": "labelhub-template/v1",
        "components": [
            {
                "id": "rich",
                "type": "RICH_TEXT",
                "fieldKey": "richText",
                "label": "Rich answer",
                "props": {"placeholder": "Write rich text", "defaultValue": "", "toolbarPreset": "basic"},
                "validation": {"required": False, "maxLength": 5000},
                "visibility": {},
            },
            {
                "id": "file",
                "type": "FILE_UPLOAD",
                "fieldKey": "attachments",
                "label": "Attachments",
                "props": {"accept": [".pdf", ".docx"], "maxFiles": 3, "maxSizeMb": 20},
                "validation": {"required": False},
                "visibility": {},
            },
            {
                "id": "image",
                "type": "IMAGE_UPLOAD",
                "fieldKey": "screenshots",
                "label": "Screenshots",
                "props": {"accept": ["image/png", "image/jpeg"], "maxFiles": 6, "maxSizeMb": 10},
                "validation": {"required": False},
                "visibility": {},
            },
            {
                "id": "json",
                "type": "JSON_EDITOR",
                "fieldKey": "metadata",
                "label": "Metadata",
                "props": {"placeholder": "{\"quality\":\"good\"}", "defaultValue": {"source": "demo"}},
                "validation": {"required": False},
                "visibility": {},
            },
            {
                "id": "llm",
                "type": "LLM_ACTION",
                "label": "LLM suggestion",
                "props": {
                    "actionLabel": "Generate suggestion",
                    "promptTemplate": "Use the item and fields to produce a suggestion.",
                    "inputFieldKeys": ["richText", "metadata"],
                    "outputFieldKey": "richText",
                    "helperText": "Reference only.",
                },
                "validation": {},
                "visibility": {},
            },
        ],
        "layout": {"root": ["rich", "file", "image", "json", "llm"]},
        "llmActions": [],
        "showItems": [],
    }

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    assert response.json() == {"valid": True, "errors": []}


def test_validate_template_schema_rejects_invalid_basic_material_props(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = valid_schema()
    schema["components"][0]["props"] = {"path": "prompt"}
    schema["components"][1]["validation"] = {"required": True, "maxLength": 9999}
    schema["components"][2]["props"] = {
        "options": [{"label": "Good", "value": "good"}],
        "defaultValue": "bad",
    }
    schema["components"].append(
        {
            "id": "issues",
            "type": "CHECKBOX",
            "fieldKey": "issues",
            "label": "Issues",
            "props": {
                "options": [{"label": "Fact error", "value": "fact_error"}],
                "defaultValue": ["missing"],
            },
            "validation": {},
            "visibility": {},
        }
    )
    schema["layout"]["root"].append("issues")

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    fields = {error["field"] for error in payload["errors"]}
    assert "components.0.props.path" in fields
    assert "components.1.validation.maxLength" in fields
    assert "components.2.props.defaultValue" in fields
    assert "components.3.props.defaultValue.0" in fields


def test_validate_template_schema_rejects_invalid_stage25_advanced_material_props(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = {
        "schemaVersion": "labelhub-template/v1",
        "components": [
            {
                "id": "file",
                "type": "FILE_UPLOAD",
                "fieldKey": "attachments",
                "label": "Attachments",
                "props": {"accept": [".pdf"], "maxFiles": 0, "maxSizeMb": 20},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "image",
                "type": "IMAGE_UPLOAD",
                "fieldKey": "screenshots",
                "label": "Screenshots",
                "props": {"accept": [".pdf"], "maxFiles": 2, "maxSizeMb": 10},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "json",
                "type": "JSON_EDITOR",
                "fieldKey": "metadata",
                "label": "Metadata",
                "props": {"defaultValue": "not-object"},
                "validation": {"required": "yes"},
                "visibility": {},
            },
            {
                "id": "llm",
                "type": "LLM_ACTION",
                "label": "LLM suggestion",
                "props": {"promptTemplate": " ", "inputFieldKeys": ["missing"], "outputFieldKey": "missing"},
                "validation": {},
                "visibility": {},
            },
        ],
        "layout": {"root": ["file", "image", "json", "llm"]},
        "llmActions": [],
        "showItems": [],
    }

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    fields = {error["field"] for error in payload["errors"]}
    assert "components.0.props.maxFiles" in fields
    assert "components.1.props.accept.0" in fields
    assert "components.2.props.defaultValue" in fields
    assert "components.2.validation.required" in fields
    assert "components.3.props.promptTemplate" in fields
    assert "components.3.props.inputFieldKeys.0" in fields
    assert "components.3.props.outputFieldKey" in fields


def test_validate_template_schema_accepts_stage26_layout_and_rules(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = {
        "schemaVersion": "labelhub-template/v1",
        "components": [
            {
                "id": "quality",
                "type": "RADIO",
                "fieldKey": "quality",
                "label": "Quality",
                "props": {"options": [{"label": "Bad", "value": "bad"}, {"label": "Good", "value": "good"}]},
                "validation": {"required": True},
                "visibility": {},
            },
            {
                "id": "reason",
                "type": "TEXTAREA",
                "fieldKey": "reason",
                "label": "Reason",
                "props": {"placeholder": "Explain"},
                "validation": {
                    "pattern": "^[^@]+$",
                    "patternMessage": "Cannot contain @",
                    "customRuleIds": ["NO_EMOJI"],
                    "requiredWhen": {
                        "logic": "ALL",
                        "conditions": [{"fieldKey": "quality", "operator": "EQUALS", "value": "bad"}],
                        "message": "Bad quality requires reason",
                    },
                },
                "visibility": {
                    "logic": "ALL",
                    "conditions": [{"fieldKey": "quality", "operator": "EQUALS", "value": "bad"}],
                },
            },
            {
                "id": "group_feedback",
                "type": "GROUP",
                "label": "Feedback",
                "props": {"description": "Grouped feedback fields", "collapsible": False},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "tabs_detail",
                "type": "TABS",
                "label": "Details",
                "props": {"defaultTabId": "basic"},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "summary",
                "type": "TEXT_INPUT",
                "fieldKey": "summary",
                "label": "Summary",
                "props": {},
                "validation": {"customRuleIds": ["TRIMMED_NON_EMPTY"]},
                "visibility": {},
            },
        ],
        "layout": {
            "root": [
                "quality",
                {"componentId": "group_feedback", "children": ["reason"]},
                {
                    "componentId": "tabs_detail",
                    "tabs": [{"id": "basic", "label": "Basic", "children": ["summary"]}],
                },
            ]
        },
        "llmActions": [],
        "showItems": [],
    }

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    assert response.json() == {"valid": True, "errors": []}


def test_validate_template_schema_rejects_invalid_stage26_rules_and_layout(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    schema = {
        "schemaVersion": "labelhub-template/v1",
        "components": [
            {
                "id": "quality",
                "type": "RADIO",
                "fieldKey": "quality",
                "label": "Quality",
                "props": {"options": [{"label": "Bad", "value": "bad"}]},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "reason",
                "type": "TEXTAREA",
                "fieldKey": "reason",
                "label": "Reason",
                "props": {},
                "validation": {
                    "pattern": "[",
                    "patternMessage": 123,
                    "customRuleIds": ["RUN_SCRIPT"],
                    "requiredWhen": {
                        "logic": "SOME",
                        "conditions": [{"fieldKey": "missing", "operator": "EQUALS", "value": "bad"}],
                    },
                },
                "visibility": {
                    "conditions": [{"fieldKey": "reason", "operator": "MATCHES", "value": "bad"}],
                },
            },
            {
                "id": "group_feedback",
                "type": "GROUP",
                "label": "Feedback",
                "props": {"description": 123, "collapsible": "yes"},
                "validation": {},
                "visibility": {},
            },
            {
                "id": "tabs_detail",
                "type": "TABS",
                "label": "Details",
                "props": {"defaultTabId": "missing_tab"},
                "validation": {},
                "visibility": {},
            },
        ],
        "layout": {
            "root": [
                "quality",
                {"componentId": "group_feedback", "children": ["reason"]},
                {"componentId": "tabs_detail", "tabs": [{"id": "tab_1", "label": "", "children": []}]},
            ]
        },
        "llmActions": [],
        "showItems": [],
    }

    response = client.post("/api/template-schemas:validate", json={"schema": schema})

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    fields = {error["field"] for error in payload["errors"]}
    assert "components.1.validation.pattern" in fields
    assert "components.1.validation.patternMessage" in fields
    assert "components.1.validation.customRuleIds.0" in fields
    assert "components.1.validation.requiredWhen.logic" in fields
    assert "components.1.validation.requiredWhen.conditions.0.fieldKey" in fields
    assert "components.1.visibility.conditions.0.operator" in fields
    assert "components.1.visibility.conditions.0.fieldKey" in fields
    assert "components.2.props.description" in fields
    assert "components.2.props.collapsible" in fields
    assert "layout.root.2.tabs.0.label" in fields
    assert "components.3.props.defaultTabId" in fields


def test_save_template_schema_rejects_invalid_schema(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client)
    task = create_task(client)
    schema = valid_schema()
    schema["layout"] = {"root": ["show_prompt", "answer", "answer"]}

    response = client.put(f"/api/tasks/{task['id']}/template-draft", json={"schema": schema})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_TEMPLATE_SCHEMA"
    assert response.json()["error"]["details"]["errors"]


def test_non_owner_cannot_manage_or_validate_template_schema(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _session_factory = client_with_db
    login(client, "labeler@labelhub.dev")

    draft_response = client.get("/api/tasks/task_demo/template-draft")
    validate_response = client.post("/api/template-schemas:validate", json={"schema": valid_schema()})

    assert draft_response.status_code == 403
    assert validate_response.status_code == 403
