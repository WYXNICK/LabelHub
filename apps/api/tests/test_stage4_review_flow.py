from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from labelhub_api.core.enums import AuditAction, AuditEntityType, ReviewJobStatus, SubmissionStatus
from labelhub_api.db.base import Base
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.review import ReviewEntity, ReviewJobEntity
from labelhub_api.models.assignment import SubmissionEntity
from labelhub_api.main import create_app

from test_stage3_assignments import client_with_db, create_task, login, prepare_claimable_task  # noqa: F401


STAGE4_PATHS = {
    "/api/review-jobs": {"get"},
    "/api/internal/review-jobs:claim": {"post"},
    "/api/internal/review-jobs/{jobId}/results": {"post"},
    "/api/reviews": {"get"},
    "/api/reviews/{reviewId}": {"get"},
}

STAGE4_TABLES = {"review_jobs", "reviews"}


def test_stage4_openapi_and_metadata_contract_are_registered() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    for path, methods in STAGE4_PATHS.items():
        assert path in paths
        assert methods.issubset(paths[path].keys())

    schemas = response.json()["components"]["schemas"]
    for schema_name in [
        "ReviewJobVO",
        "ClaimReviewJobRequest",
        "ClaimReviewJobResponse",
        "AiReviewIssueDTO",
        "AiReviewResultDTO",
        "CompleteReviewJobRequest",
        "ReviewVO",
        "ReviewDetailVO",
    ]:
        assert schema_name in schemas

    assert STAGE4_TABLES.issubset(Base.metadata.tables.keys())
    assert {"submission_id", "review_config_version_id", "idempotency_key", "status"}.issubset(
        Base.metadata.tables["review_jobs"].columns.keys()
    )


def test_stage4_alembic_migration_contains_review_foundation_tables() -> None:
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "0005_create_review_foundation.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0004_create_labeler_foundation"' in migration_source
    for table_name in STAGE4_TABLES:
        assert f'"{table_name}"' in migration_source


def test_submission_creates_single_ai_review_job(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4 enqueue task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    payload = {
        "values": {"answer": "进入预审队列"},
        "idempotencyKey": "submit-stage4-enqueue",
        "clientDraftVersion": assignment["version"],
    }

    first = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json=payload,
        headers={"X-Request-ID": "req_stage4_enqueue"},
    )
    second = client.post(f"/api/assignments/{assignment['id']}/submissions", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert first.json()["status"] == SubmissionStatus.AI_REVIEWING.value

    with session_factory() as session:
        job_count = session.scalar(select(func.count()).select_from(ReviewJobEntity))
        review_count = session.scalar(select(func.count()).select_from(ReviewEntity))
        submission = session.get(SubmissionEntity, first.json()["id"])
        job = session.scalar(select(ReviewJobEntity))
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW_JOB.value,
                AuditLogEntity.action == AuditAction.REVIEW_JOB_CREATE.value,
            )
        )

        assert job_count == 1
        assert review_count == 0
        assert submission is not None
        assert submission.status == SubmissionStatus.AI_REVIEWING.value
        assert job is not None
        assert job.status == ReviewJobStatus.QUEUED.value
        assert job.submission_id == first.json()["id"]
        assert job.idempotency_key == f"{first.json()['id']}:1:review_config_version_stage3"
        assert audit_log is not None
        assert audit_log.request_id == "req_stage4_enqueue"
        assert audit_log.metadata_json["submissionVersion"] == 1


def test_reviewer_can_list_review_jobs_and_system_can_claim_context(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4 claim task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "answer for review"},
            "idempotencyKey": "submit-stage4-claim",
            "clientDraftVersion": assignment["version"],
        },
    ).json()

    login(client, "reviewer@labelhub.dev")
    list_response = client.get("/api/review-jobs?page=1&pageSize=10&status=QUEUED")
    assert list_response.status_code == 200
    listed_job = list_response.json()["data"][0]
    assert listed_job["submissionId"] == submission["id"]
    assert listed_job["status"] == ReviewJobStatus.QUEUED.value

    claim_response = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage4-test"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token", "X-Request-ID": "req_stage4_claim"},
    )

    assert claim_response.status_code == 200
    claimed = claim_response.json()
    assert claimed["job"]["id"] == listed_job["id"]
    assert claimed["job"]["status"] == ReviewJobStatus.RUNNING.value
    assert claimed["job"]["attemptCount"] == 1
    assert claimed["submission"]["id"] == submission["id"]
    assert claimed["assignment"]["id"] == assignment["id"]
    assert claimed["task"]["id"] == task["id"]
    assert claimed["datasetItemPayload"] == {"prompt": "Question 0"}
    assert claimed["templateSchema"]["components"][1]["fieldKey"] == "answer"
    assert claimed["reviewConfigVersion"]["id"] == "review_config_version_stage3"

    with session_factory() as session:
        job = session.get(ReviewJobEntity, listed_job["id"])
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW_JOB.value,
                AuditLogEntity.action == AuditAction.REVIEW_JOB_CLAIM.value,
            )
        )
        assert job is not None
        assert job.status == ReviewJobStatus.RUNNING.value
        assert job.locked_by == "agent-stage4-test"
        assert audit_log is not None
        assert audit_log.request_id == "req_stage4_claim"
