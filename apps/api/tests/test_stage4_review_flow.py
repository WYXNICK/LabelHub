from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from labelhub_api.core.enums import AssignmentStatus, AuditAction, AuditEntityType, ReviewJobStatus, ReviewStatus, SubmissionStatus
from labelhub_api.db.base import Base
from labelhub_api.models.audit import AuditLogEntity
from labelhub_api.models.review import ReviewEntity, ReviewJobEntity
from labelhub_api.models.assignment import AssignmentEntity, SubmissionEntity
from labelhub_api.main import create_app

from test_stage3_assignments import client_with_db, create_task, login, prepare_claimable_task  # noqa: F401


STAGE4_PATHS = {
    "/api/review-jobs": {"get"},
    "/api/review-jobs/summary": {"get"},
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
        "ReviewJobSummaryVO",
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
    assert listed_job["taskTitle"] == "Stage 4 claim task"
    assert listed_job["submissionVersion"] == 1
    assert listed_job["reviewConfigVersionNo"] == 1
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
    assert claimed["job"]["taskTitle"] == "Stage 4 claim task"
    assert claimed["job"]["submissionVersion"] == 1
    assert claimed["job"]["reviewConfigVersionNo"] == 1
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


def test_system_agent_recovers_stale_running_review_job_before_claiming(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4 stale running task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "stale running answer"},
            "idempotencyKey": "submit-stage4-stale-running",
            "clientDraftVersion": assignment["version"],
        },
    )

    claim_response = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage4-stale-old"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )
    assert claim_response.status_code == 200
    job_id = claim_response.json()["job"]["id"]

    with session_factory() as session:
        job = session.get(ReviewJobEntity, job_id)
        assert job is not None
        job.locked_at = datetime.now(UTC) - timedelta(seconds=600)
        job.updated_at = job.locked_at
        session.commit()

    login(client, "reviewer@labelhub.dev")
    summary_response = client.get("/api/review-jobs/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["runningJobCount"] == 1
    assert summary["staleRunningJobCount"] == 1
    assert summary["activeWorkerCount"] == 0
    assert summary["lockTimeoutSeconds"] == 300

    retry_claim_response = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage4-stale-new"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token", "X-Request-ID": "req_stage4_stale_reclaim"},
    )
    assert retry_claim_response.status_code == 200
    retried_job = retry_claim_response.json()["job"]
    assert retried_job["id"] == job_id
    assert retried_job["status"] == ReviewJobStatus.RUNNING.value
    assert retried_job["attemptCount"] == 2
    assert retried_job["lockedBy"] == "agent-stage4-stale-new"

    with session_factory() as session:
        job = session.get(ReviewJobEntity, job_id)
        assert job is not None
        assert job.status == ReviewJobStatus.RUNNING.value
        assert job.last_error is None
        timeout_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW_JOB.value,
                AuditLogEntity.entity_id == job_id,
                AuditLogEntity.request_id == "req_stage4_stale_reclaim",
                AuditLogEntity.to_state == ReviewJobStatus.FAILED.value,
            )
        )
        assert timeout_audit is not None
        assert timeout_audit.metadata_json["timeout"] is True


def test_system_agent_success_creates_traceable_ai_review_suggestion(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4 suggestion task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "answer for suggestion"},
            "idempotencyKey": "submit-stage4-suggestion",
            "clientDraftVersion": assignment["version"],
        },
    ).json()
    claim_response = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage4-suggestion"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )
    job_id = claim_response.json()["job"]["id"]
    prompt_snapshot = (
        '{"task":{"title":"Stage 4 suggestion task"},"datasetItemPayload":{"prompt":"Question 0"},'
        '"templateFields":[{"label":"Prompt"},{"label":"Answer","fieldKey":"answer"}],'
        '"submissionValues":{"answer":"answer for suggestion"},'
        '"reviewConfig":{"versionNo":1,"dimensions":[{"name":"准确性"}]}}'
    )

    result_response = client.post(
        f"/api/internal/review-jobs/{job_id}/results",
        json={
            "result": {
                "conclusion": "PASS",
                "scores": {"accuracy": 5},
                "summary": "答案准确，建议通过，但仍需 Reviewer 终审。",
                "issues": [{"field": "answer", "code": "OK", "message": "无明显问题。"}],
                "suggestions": "可直接进入人工复核确认。",
                "rawOutput": {"conclusion": "PASS"},
                "promptSnapshot": prompt_snapshot,
            }
        },
        headers={"X-LabelHub-System-Token": "dev-system-agent-token", "X-Request-ID": "req_stage4_suggestion"},
    )
    assert result_response.status_code == 200
    assert result_response.json()["status"] == ReviewJobStatus.SUCCEEDED.value

    login(client, "reviewer@labelhub.dev")
    reviews_response = client.get("/api/reviews?page=1&pageSize=10")
    assert reviews_response.status_code == 200
    listed_review = reviews_response.json()["data"][0]
    assert listed_review["taskTitle"] == "Stage 4 suggestion task"
    assert listed_review["submissionVersion"] == 1
    assert listed_review["reviewConfigVersionNo"] == 1
    assert listed_review["aiConclusion"] == "PASS"
    assert listed_review["aiScoreTotal"] == 5
    assert listed_review["aiIssueCount"] == 1

    jobs_response = client.get("/api/review-jobs?page=1&pageSize=10")
    assert jobs_response.status_code == 200
    listed_job = jobs_response.json()["data"][0]
    assert listed_job["reviewId"] == listed_review["id"]
    assert listed_job["aiConclusion"] == "PASS"
    assert listed_job["aiScoreTotal"] == 5
    assert listed_job["aiIssueCount"] == 1

    summary_response = client.get("/api/review-jobs/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["totalJobs"] == 1
    assert summary["statusCounts"]["SUCCEEDED"] == 1
    assert summary["aiConclusionCounts"]["PASS"] == 1
    assert summary["pendingReviewCount"] == 1
    assert summary["maxAttempts"] == 3

    detail_response = client.get(f"/api/reviews/{listed_review['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["review"]["id"] == listed_review["id"]
    assert detail["review"]["status"] == ReviewStatus.PENDING_HUMAN_REVIEW.value
    assert detail["submission"]["id"] == submission["id"]
    assert detail["submission"]["status"] == SubmissionStatus.HUMAN_REVIEWING.value
    assert detail["promptSnapshotSummary"]["taskTitle"] == "Stage 4 suggestion task"
    assert detail["promptSnapshotSummary"]["datasetItemKeys"] == ["prompt"]
    assert detail["promptSnapshotSummary"]["submissionFieldKeys"] == ["answer"]
    assert detail["promptSnapshotSummary"]["reviewDimensionNames"] == ["准确性"]
    assert any(item["action"] == AuditAction.REVIEW_AI_SUGGESTION.value for item in detail["timeline"])

    with session_factory() as session:
        audit_log = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW.value,
                AuditLogEntity.action == AuditAction.REVIEW_AI_SUGGESTION.value,
            )
        )
        assert audit_log is not None
        assert audit_log.request_id == "req_stage4_suggestion"
        assert audit_log.metadata_json["scoreTotal"] == 5
        assert audit_log.metadata_json["issueCount"] == 1


def test_system_agent_failure_retries_and_falls_back_to_human_review(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4 retry task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()
    client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "needs retry"},
            "idempotencyKey": "submit-stage4-retry",
            "clientDraftVersion": assignment["version"],
        },
    )

    claimed_job_id = ""
    for index in range(3):
        claim_response = client.post(
            "/api/internal/review-jobs:claim",
            json={"workerId": "agent-stage4-retry"},
            headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
        )
        assert claim_response.status_code == 200
        claimed_job_id = claim_response.json()["job"]["id"]
        result_response = client.post(
            f"/api/internal/review-jobs/{claimed_job_id}/results",
            json={"result": None, "errorMessage": f"provider error {index}"},
            headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
        )
        assert result_response.status_code == 200

    login(client, "reviewer@labelhub.dev")
    reviews_response = client.get("/api/reviews?page=1&pageSize=10")
    assert reviews_response.status_code == 200
    listed_review = reviews_response.json()["data"][0]
    assert listed_review["taskTitle"] == "Stage 4 retry task"
    assert listed_review["submissionVersion"] == 1
    assert listed_review["reviewConfigVersionNo"] == 1

    summary_response = client.get("/api/review-jobs/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["statusCounts"]["NEEDS_HUMAN_REVIEW"] == 1
    assert summary["aiConclusionCounts"]["NEEDS_HUMAN_REVIEW"] == 1
    assert summary["todayFallbackCount"] == 1

    with session_factory() as session:
        job = session.get(ReviewJobEntity, claimed_job_id)
        review = session.scalar(select(ReviewEntity).where(ReviewEntity.review_job_id == claimed_job_id))

        assert job is not None
        assert job.status == ReviewJobStatus.NEEDS_HUMAN_REVIEW.value
        assert job.attempt_count == 3
        assert review is not None
        assert review.status == ReviewStatus.PENDING_HUMAN_REVIEW.value


def test_reviewer_filters_history_diff_and_state_link_for_review_detail(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4.4 history diff task", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task['id']}/assignments", json={}).json()

    first_submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "old answer"},
            "idempotencyKey": "submit-stage44-v1",
            "clientDraftVersion": assignment["version"],
        },
    ).json()
    first_job_id = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage44"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    ).json()["job"]["id"]
    client.post(
        f"/api/internal/review-jobs/{first_job_id}/results",
        json={
            "result": {
                "conclusion": "RETURN",
                "scores": {"accuracy": 2},
                "summary": "第一轮答案过短，建议返修。",
                "issues": [{"field": "answer", "code": "TOO_SHORT", "message": "答案缺少必要细节。"}],
                "suggestions": "补充关键事实后再次提交。",
                "rawOutput": {"conclusion": "RETURN"},
                "promptSnapshot": '{"task":{"title":"Stage 4.4 history diff task"},"submissionValues":{"answer":"old answer"}}',
            }
        },
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )

    with session_factory() as session:
        stored_assignment = session.get(AssignmentEntity, assignment["id"])
        stored_submission = session.get(SubmissionEntity, first_submission["id"])
        assert stored_assignment is not None
        assert stored_submission is not None
        stored_assignment.status = AssignmentStatus.RETURNED.value
        stored_submission.status = SubmissionStatus.RETURNED.value
        session.commit()

    second_submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "new answer with useful context"},
            "idempotencyKey": "submit-stage44-v2",
            "clientDraftVersion": assignment["version"] + 1,
        },
    ).json()
    second_job_id = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": "agent-stage44"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    ).json()["job"]["id"]
    client.post(
        f"/api/internal/review-jobs/{second_job_id}/results",
        json={
            "result": {
                "conclusion": "PASS",
                "scores": {"accuracy": 5},
                "summary": "第二轮已补充关键事实，建议通过。",
                "issues": [],
                "suggestions": None,
                "rawOutput": {"conclusion": "PASS"},
                "promptSnapshot": '{"task":{"title":"Stage 4.4 history diff task"},"submissionValues":{"answer":"new answer with useful context"}}',
            }
        },
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )

    login(client, "reviewer@labelhub.dev")
    pass_reviews = client.get("/api/reviews?page=1&pageSize=10&aiConclusion=PASS&keyword=history")
    return_reviews = client.get("/api/reviews?page=1&pageSize=10&aiConclusion=RETURN&keyword=history")

    assert pass_reviews.status_code == 200
    assert return_reviews.status_code == 200
    assert pass_reviews.json()["pagination"]["totalItems"] == 1
    assert return_reviews.json()["pagination"]["totalItems"] == 1
    listed_review = pass_reviews.json()["data"][0]
    assert listed_review["submissionId"] == second_submission["id"]
    assert listed_review["reviewRound"] == 2

    detail_response = client.get(f"/api/reviews/{listed_review['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["stateLink"]["assignmentStatus"] == AssignmentStatus.SUBMITTED.value
    assert detail["stateLink"]["submissionStatus"] == SubmissionStatus.HUMAN_REVIEWING.value
    assert detail["stateLink"]["reviewJobStatus"] == ReviewJobStatus.SUCCEEDED.value
    assert detail["stateLink"]["currentStep"] == "WAITING_HUMAN_REVIEW"
    assert [item["submissionVersion"] for item in detail["reviewHistory"]] == [2, 1]
    assert detail["reviewHistory"][0]["aiConclusion"] == "PASS"
    assert detail["reviewHistory"][1]["aiConclusion"] == "RETURN"
    assert detail["submissionDiff"] == [
        {
            "fieldKey": "answer",
            "label": "Answer",
            "previousValue": "old answer",
            "currentValue": "new answer with useful context",
            "changeType": "CHANGED",
        }
    ]
