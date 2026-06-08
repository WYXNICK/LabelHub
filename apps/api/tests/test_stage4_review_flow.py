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
    "/api/reviews/tasks": {"get"},
    "/api/reviews/{reviewId}": {"get"},
    "/api/reviews/{reviewId}/decisions": {"post"},
    "/api/reviews:batch-decide": {"post"},
    "/api/tasks/{taskId}/acceptance-stats": {"get"},
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
        "CreateReviewDecisionRequest",
        "BatchReviewDecisionRequest",
        "BatchReviewDecisionVO",
        "ReviewVO",
        "ReviewTimelineItemVO",
        "ReviewTaskSummaryVO",
        "ReviewDetailVO",
        "ReviewJobSummaryVO",
        "AcceptanceStatsVO",
    ]:
        assert schema_name in schemas

    assert STAGE4_TABLES.issubset(Base.metadata.tables.keys())
    assert {"actorId", "actorName", "action", "metadata"}.issubset(
        schemas["ReviewTimelineItemVO"]["properties"].keys()
    )
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
    draft_response = client.put(
        f"/api/assignments/{assignment['id']}/draft",
        json={"values": {"answer": "draft before submit"}, "clientVersion": assignment["version"]},
    )
    assert draft_response.status_code == 200
    submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": {"answer": "answer for suggestion"},
            "idempotencyKey": "submit-stage4-suggestion",
            "clientDraftVersion": draft_response.json()["version"],
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
    timeline_actions = [item["action"] for item in detail["timeline"]]
    assert timeline_actions == [
        AuditAction.ASSIGNMENT_CLAIM.value,
        AuditAction.SUBMISSION_CREATE.value,
        AuditAction.REVIEW_AI_SUGGESTION.value,
    ]
    assert AuditAction.ASSIGNMENT_DRAFT_SAVE.value not in timeline_actions
    ai_timeline = detail["timeline"][-1]
    assert ai_timeline["actorId"] == "user_system_agent"
    assert ai_timeline["actorName"] == "AI 预审 Agent"
    assert ai_timeline["metadata"]["scoreTotal"] == 5
    assert ai_timeline["metadata"]["aiConclusion"] == "PASS"

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


def test_reviewer_decision_updates_state_and_labeler_feedback(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4.5 human decision task", quota=2)
    prepare_claimable_task(session_factory, task["id"], item_count=2)
    first_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage45-approve",
        conclusion="PASS",
        summary="建议通过。",
    )
    second_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage45-return",
        conclusion="RETURN",
        summary="建议打回。",
    )

    login(client, "reviewer@labelhub.dev")
    approve_response = client.post(
        f"/api/reviews/{first_review['review']['id']}/decisions",
        json={"decision": "APPROVE", "expectedVersion": first_review["review"]["version"]},
        headers={"X-Request-ID": "req_stage45_approve"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == ReviewStatus.APPROVED.value

    return_reason = "回答缺少关键依据，请补充比较理由后重新提交。"
    return_response = client.post(
        f"/api/reviews/{second_review['review']['id']}/decisions",
        json={"decision": "RETURN", "reason": return_reason, "expectedVersion": second_review["review"]["version"]},
        headers={"X-Request-ID": "req_stage45_return"},
    )
    assert return_response.status_code == 200
    assert return_response.json()["status"] == ReviewStatus.RETURNED.value
    assert return_response.json()["humanComment"] == return_reason

    login(client, "owner@labelhub.dev")
    acceptance_response = client.get(f"/api/tasks/{task['id']}/acceptance-stats")
    assert acceptance_response.status_code == 200
    acceptance = acceptance_response.json()
    assert acceptance["submittedCount"] == 2
    assert acceptance["approvedCount"] == 1
    assert acceptance["returnedCount"] == 1
    assert acceptance["pendingReviewCount"] == 0
    assert len(acceptance["recentReviews"]) == 2

    login(client, "labeler@labelhub.dev")
    contributions_response = client.get("/api/me/contributions?bucket=RETURNED&page=1&pageSize=10")
    assert contributions_response.status_code == 200
    returned_items = contributions_response.json()["data"]
    assert returned_items[0]["reviewFeedback"]["reason"] == return_reason

    with session_factory() as session:
        approved_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW.value,
                AuditLogEntity.action == AuditAction.REVIEW_DECISION.value,
                AuditLogEntity.request_id == "req_stage45_approve",
            )
        )
        returned_assignment_audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.ASSIGNMENT.value,
                AuditLogEntity.to_state == AssignmentStatus.RETURNED.value,
            )
        )
        assert approved_audit is not None
        assert returned_assignment_audit is not None
        assert returned_assignment_audit.reason == return_reason


def test_reviewer_can_directly_revise_submission_and_approve_it(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4.6 direct revise decision", quota=1)
    prepare_claimable_task(session_factory, task["id"], item_count=1)
    created = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage46-direct-revise",
        values={"answer": "old answer"},
        conclusion="RETURN",
        summary="需要修订后入库。",
    )

    login(client, "reviewer@labelhub.dev")
    response = client.post(
        f"/api/reviews/{created['review']['id']}/decisions",
        json={
            "decision": "DIRECT_REVISE",
            "reason": "Reviewer 已直接修订答案并入库。",
            "revisedValues": {"answer": "revised answer"},
            "expectedVersion": created["review"]["version"],
        },
        headers={"X-Request-ID": "req_stage46_direct_revise"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == ReviewStatus.APPROVED.value
    assert body["humanConclusion"] == "DIRECT_REVISE"
    assert body["version"] == created["review"]["version"] + 1

    with session_factory() as session:
        assignment = session.get(AssignmentEntity, created["assignment"]["id"])
        submission = session.get(SubmissionEntity, created["submission"]["id"])
        audit = session.scalar(
            select(AuditLogEntity).where(
                AuditLogEntity.entity_type == AuditEntityType.REVIEW.value,
                AuditLogEntity.action == AuditAction.REVIEW_DECISION.value,
                AuditLogEntity.request_id == "req_stage46_direct_revise",
            )
        )
        assert assignment is not None
        assert submission is not None
        assert assignment.status == AssignmentStatus.APPROVED.value
        assert submission.status == SubmissionStatus.APPROVED.value
        assert submission.values == {"answer": "revised answer"}
        assert audit is not None
        assert audit.to_state == ReviewStatus.APPROVED.value
        assert audit.metadata_json["decision"] == "DIRECT_REVISE"
        assert audit.metadata_json["directRevised"] is True
        assert audit.metadata_json["revisedFieldKeys"] == ["answer"]


def test_reviewer_can_list_review_tasks_for_manual_workbench(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4.6 manual task list", quota=2)
    prepare_claimable_task(session_factory, task["id"], item_count=2)
    first_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage46-task-list-pass",
        conclusion="PASS",
        summary="第一条建议通过。",
    )
    second_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage46-task-list-return",
        conclusion="RETURN",
        summary="第二条建议打回。",
    )

    login(client, "reviewer@labelhub.dev")
    response = client.get(
        "/api/reviews/tasks?page=1&pageSize=10&status=PENDING_HUMAN_REVIEW&keyword=manual"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["pagination"]["totalItems"] == 1
    summary = body["data"][0]
    assert summary["taskId"] == task["id"]
    assert summary["taskTitle"] == "Stage 4.6 manual task list"
    assert summary["totalReviewCount"] == 2
    assert summary["pendingReviewCount"] == 2
    assert summary["approvedCount"] == 0
    assert summary["returnedCount"] == 0
    assert summary["aiPassCount"] == 1
    assert summary["aiReturnCount"] == 1
    assert summary["aiManualCount"] == 0
    assert summary["latestReviewId"] in {first_review["review"]["id"], second_review["review"]["id"]}
    assert summary["latestReviewRound"] == 1
    assert summary["reviewConfigVersionNo"] == 1


def test_batch_decision_allows_partial_success(
    client_with_db: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = client_with_db
    task = create_task(client, title="Stage 4.5 batch decision task", quota=2)
    prepare_claimable_task(session_factory, task["id"], item_count=2)
    first_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage45-batch-1",
        conclusion="PASS",
        summary="第一条建议通过。",
    )
    second_review = _create_review_for_task(
        client,
        session_factory,
        task_id=task["id"],
        submit_key="submit-stage45-batch-2",
        conclusion="PASS",
        summary="第二条建议通过。",
    )

    login(client, "reviewer@labelhub.dev")
    response = client.post(
        "/api/reviews:batch-decide",
        json={
            "reviewIds": [first_review["review"]["id"], second_review["review"]["id"]],
            "decision": "APPROVE",
            "expectedVersions": {
                first_review["review"]["id"]: first_review["review"]["version"],
                second_review["review"]["id"]: 999,
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["succeededIds"] == [first_review["review"]["id"]]
    assert second_review["review"]["id"] in body["failed"]

    first_detail = client.get(f"/api/reviews/{first_review['review']['id']}").json()
    second_detail = client.get(f"/api/reviews/{second_review['review']['id']}").json()
    assert first_detail["review"]["status"] == ReviewStatus.APPROVED.value
    assert second_detail["review"]["status"] == ReviewStatus.PENDING_HUMAN_REVIEW.value


def _create_review_for_task(
    client: TestClient,
    session_factory: sessionmaker[Session],
    *,
    task_id: str,
    submit_key: str,
    conclusion: str,
    summary: str,
    values: dict[str, object] | None = None,
) -> dict:
    login(client, "labeler@labelhub.dev")
    assignment = client.post(f"/api/tasks/{task_id}/assignments", json={}).json()
    submission = client.post(
        f"/api/assignments/{assignment['id']}/submissions",
        json={
            "values": values or {"answer": f"answer for {submit_key}"},
            "idempotencyKey": submit_key,
            "clientDraftVersion": assignment["version"],
        },
    ).json()
    claim_response = client.post(
        "/api/internal/review-jobs:claim",
        json={"workerId": f"agent-{submit_key}"},
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )
    job_id = claim_response.json()["job"]["id"]
    client.post(
        f"/api/internal/review-jobs/{job_id}/results",
        json={
            "result": {
                "conclusion": conclusion,
                "scores": {"accuracy": 5 if conclusion == "PASS" else 2},
                "summary": summary,
                "issues": [],
                "suggestions": None,
                "rawOutput": {"conclusion": conclusion},
                "promptSnapshot": '{"task":{"title":"stage45"},"submissionValues":{"answer":"value"}}',
            }
        },
        headers={"X-LabelHub-System-Token": "dev-system-agent-token"},
    )
    login(client, "reviewer@labelhub.dev")
    reviews = client.get(f"/api/reviews?page=1&pageSize=10&keyword={submit_key}").json()["data"]
    if not reviews:
        reviews = client.get("/api/reviews?page=1&pageSize=10").json()["data"]
    review = next(item for item in reviews if item["assignmentId"] == assignment["id"])
    return {"assignment": assignment, "submission": submission, "review": review}
