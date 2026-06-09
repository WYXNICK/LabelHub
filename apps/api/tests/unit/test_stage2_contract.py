from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from labelhub_api.db.base import Base
from labelhub_api.main import create_app
import labelhub_api.models  # noqa: F401


STAGE2_TEMPLATE_PATHS = {
    "/api/tasks/{taskId}/template-draft": {"get", "put"},
    "/api/template-schemas:validate": {"post"},
    "/api/tasks/{taskId}/template-versions": {"get", "post"},
    "/api/template-versions/{templateVersionId}": {"get"},
}

STAGE2_TEMPLATE_TABLES = {"template_drafts", "template_versions"}


def _login_owner(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "owner@labelhub.dev", "password": "labelhub123"})
    assert response.status_code == 200


def test_stage2_openapi_exposes_template_foundation_contract() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    for path, methods in STAGE2_TEMPLATE_PATHS.items():
        assert path in paths
        assert methods.issubset(paths[path].keys())

    schemas = response.json()["components"]["schemas"]
    for schema_name in [
        "TemplateSchemaVO",
        "TemplateComponentDTO",
        "TemplateDraftVO",
        "TemplateVersionVO",
        "SaveTemplateDraftRequest",
        "ValidateTemplateSchemaRequest",
        "PublishTemplateVersionRequest",
        "TemplateSchemaValidationVO",
    ]:
        assert schema_name in schemas


def test_stage2_template_entities_are_registered_in_sqlalchemy_metadata() -> None:
    assert STAGE2_TEMPLATE_TABLES.issubset(Base.metadata.tables.keys())
    assert {"task_id", "schema", "updated_by", "created_at", "updated_at"}.issubset(
        Base.metadata.tables["template_drafts"].columns.keys()
    )
    assert {"task_id", "version_no", "schema", "status", "published_by", "published_at"}.issubset(
        Base.metadata.tables["template_versions"].columns.keys()
    )


def test_stage2_alembic_migration_contains_template_foundation_tables() -> None:
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "migrations"
        / "versions"
        / "0003_create_template_foundation.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0002_create_stage1_foundation"' in migration_source
    for table_name in STAGE2_TEMPLATE_TABLES:
        assert f'"{table_name}"' in migration_source


def test_stage2_template_version_routes_are_implemented_after_stage27() -> None:
    with TestClient(create_app()) as client:
        _login_owner(client)
        response = client.get("/api/tasks/task_demo/template-versions")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
