from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from labelhub_api.db.base import Base
from labelhub_api.main import create_app
import labelhub_api.models  # noqa: F401


STAGE1_PATHS = {
    "/api/tasks": {"get", "post"},
    "/api/tasks/summary": {"get"},
    "/api/tasks/{taskId}": {"get", "patch"},
    "/api/tasks/{taskId}/state-transitions": {"post"},
    "/api/tasks/{taskId}/publish-check": {"get"},
    "/api/files": {"post"},
    "/api/tasks/{taskId}/import-jobs": {"post"},
    "/api/import-jobs/{importJobId}": {"get"},
    "/api/import-jobs/{importJobId}/errors": {"get"},
    "/api/tasks/{taskId}/datasets": {"get"},
    "/api/datasets/{datasetId}/items": {"get"},
    "/api/datasets/{datasetId}/items:batch": {"patch"},
    "/api/tasks/{taskId}/review-config-draft": {"get", "put"},
    "/api/tasks/{taskId}/review-config-versions": {"get", "post"},
    "/api/audit-logs": {"get"},
}


STAGE1_TABLES = {
    "tasks",
    "task_state_transitions",
    "file_objects",
    "datasets",
    "dataset_items",
    "import_jobs",
    "import_error_rows",
    "review_config_drafts",
    "review_config_versions",
    "audit_logs",
}


def test_stage1_openapi_exposes_owner_foundation_contract() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    for path, methods in STAGE1_PATHS.items():
        assert path in paths
        assert methods.issubset(paths[path].keys())

    schemas = response.json()["components"]["schemas"]
    for schema_name in [
        "TaskVO",
        "TaskDetailVO",
        "TaskSummaryVO",
        "CreateTaskRequest",
        "DatasetVO",
        "DatasetItemVO",
        "ImportJobVO",
        "ReviewConfigDraftVO",
        "ReviewConfigVersionVO",
        "PublishCheckVO",
        "AuditLogVO",
    ]:
        assert schema_name in schemas


def test_stage1_entities_are_registered_in_sqlalchemy_metadata() -> None:
    assert STAGE1_TABLES.issubset(Base.metadata.tables.keys())
    assert {"title", "status", "distribution_strategy", "created_by"}.issubset(
        Base.metadata.tables["tasks"].columns.keys()
    )
    assert {"payload", "media_refs", "checksum", "status"}.issubset(
        Base.metadata.tables["dataset_items"].columns.keys()
    )
    assert {"prompt_template", "dimensions", "thresholds", "output_schema"}.issubset(
        Base.metadata.tables["review_config_versions"].columns.keys()
    )


def test_stage1_alembic_migration_contains_required_tables() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "0002_create_stage1_foundation.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0001_create_users"' in migration_source
    for table_name in STAGE1_TABLES:
        assert f'"{table_name}"' in migration_source
