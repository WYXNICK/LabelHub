from __future__ import annotations

import pytest
from pydantic import ValidationError

from labelhub_agent.config import AgentSettings
from labelhub_agent.contracts import AiReviewResultDTO, ClaimReviewJobResponse
from labelhub_agent.prompt import AiReviewParseError, build_review_messages, parse_ai_review_result
from labelhub_agent.worker import ReviewAgentWorker


def test_ai_review_result_contract_accepts_structured_output() -> None:
    result = AiReviewResultDTO.model_validate(
        {
            "conclusion": "NEEDS_HUMAN_REVIEW",
            "scores": {"accuracy": 4, "safety": 5},
            "summary": "整体可用，但需要人工复核。",
            "issues": [{"field": "accuracy", "code": "MISSING_DETAIL", "message": "细节不足。"}],
            "suggestions": "补充关键判断依据。",
        }
    )

    assert result.conclusion == "NEEDS_HUMAN_REVIEW"
    assert result.scores["accuracy"] == 4


def test_ai_review_result_contract_rejects_unknown_conclusion() -> None:
    with pytest.raises(ValidationError):
        AiReviewResultDTO.model_validate(
            {
                "conclusion": "APPROVE",
                "scores": {},
                "summary": "不允许 Agent 直接终审通过。",
                "issues": [],
            }
        )


def test_agent_settings_accepts_provider_aliases_without_private_extension(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BASE_URL", "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2")
    monkeypatch.setenv("MODEL_NAME", "astron-code-latest")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    settings = AgentSettings(_env_file=None)

    assert settings.openai_base_url == "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2"
    assert settings.openai_model == "astron-code-latest"
    assert settings.openai_api_key == "test-key"
    assert settings.is_llm_configured is True
    assert settings.chat_completion_extra_body == {}


def test_agent_settings_keeps_unknown_provider_openai_compatible(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BASE_URL", "https://api.example.com/v1")
    monkeypatch.setenv("MODEL_NAME", "openai-compatible-model")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    settings = AgentSettings(_env_file=None)

    assert settings.chat_completion_extra_body == {}


def test_agent_settings_forwards_explicit_extra_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_EXTRA_BODY_JSON", '{"top_p":0.8}')

    settings = AgentSettings(_env_file=None)

    assert settings.chat_completion_extra_body == {"top_p": 0.8}


def test_agent_builds_review_prompt_from_claim_context() -> None:
    context = _claim_context()

    messages, snapshot = build_review_messages(context)

    assert messages[0]["role"] == "system"
    assert "不要输出思考过程" in messages[0]["content"]
    assert "判断标注回答是否正确" in messages[0]["content"]
    assert "字段语义" in messages[0]["content"]
    assert "Check answer quality" in messages[1]["content"]
    assert "不要泛泛写" in messages[1]["content"]
    assert "平局" in messages[1]["content"]
    assert "Question 1" in snapshot
    assert "answer" in snapshot


def test_agent_parses_structured_result_and_rejects_unknown_scores() -> None:
    context = _claim_context()
    _, snapshot = build_review_messages(context)

    result = parse_ai_review_result(
        content='{"conclusion":"PASS","scores":{"accuracy":5},"summary":"looks good","issues":[]}',
        dimensions=context.review_config_version.dimensions,
        prompt_snapshot=snapshot,
    )

    assert result.conclusion == "PASS"
    assert result.prompt_snapshot == snapshot

    with pytest.raises(AiReviewParseError):
        parse_ai_review_result(
            content='{"conclusion":"PASS","scores":{"unknown":5},"summary":"bad","issues":[]}',
            dimensions=context.review_config_version.dimensions,
            prompt_snapshot=snapshot,
        )


def test_agent_normalizes_review_config_output_schema_payload() -> None:
    context = _claim_context()
    _, snapshot = build_review_messages(context)

    result = parse_ai_review_result(
        content=(
            '{"decision":"HUMAN_REVIEW","totalScore":3,'
            '"dimensionScores":{"accuracy":3},"comment":"needs human check"}'
        ),
        dimensions=context.review_config_version.dimensions,
        prompt_snapshot=snapshot,
    )

    assert result.conclusion == "NEEDS_HUMAN_REVIEW"
    assert result.scores == {"accuracy": 3}
    assert result.summary == "needs human check"
    assert result.raw_output and result.raw_output["decision"] == "HUMAN_REVIEW"


def test_agent_normalizes_string_issues_from_provider() -> None:
    context = _claim_context()
    _, snapshot = build_review_messages(context)

    result = parse_ai_review_result(
        content=(
            '{"conclusion":"RETURN","scores":{"accuracy":2},"summary":"needs fix",'
            '"issues":["reason is empty"],"suggestions":["fill reason","check answer"]}'
        ),
        dimensions=context.review_config_version.dimensions,
        prompt_snapshot=snapshot,
    )

    assert result.issues[0].code == "MODEL_NOTE"
    assert result.issues[0].message == "reason is empty"
    assert result.suggestions == "fill reason；check answer"


def test_worker_processes_one_job_and_writes_result() -> None:
    api = FakeApiClient(_claim_context())
    llm = FakeLlmClient('{"conclusion":"PASS","scores":{"accuracy":5},"summary":"approved","issues":[]}')

    result = ReviewAgentWorker(api_client=api, llm_client=llm, settings=AgentSettings(_env_file=None)).run_once()

    assert result.processed is True
    assert result.status == "SUCCEEDED"
    assert api.completed_result is not None
    assert api.completed_result.conclusion == "PASS"


def test_worker_writes_error_when_llm_output_is_invalid() -> None:
    api = FakeApiClient(_claim_context())
    llm = FakeLlmClient("not-json")

    result = ReviewAgentWorker(api_client=api, llm_client=llm, settings=AgentSettings(_env_file=None)).run_once()

    assert result.processed is True
    assert result.status == "FAILED"
    assert api.completed_error is not None
    assert "valid JSON" in api.completed_error


def _claim_context() -> ClaimReviewJobResponse:
    return ClaimReviewJobResponse.model_validate(
        {
            "job": {
                "id": "review_job_1",
                "taskId": "task_1",
                "assignmentId": "assignment_1",
                "submissionId": "submission_1",
                "reviewConfigVersionId": "review_config_1",
                "status": "RUNNING",
                "attemptCount": 1,
                "maxAttempts": 3,
                "idempotencyKey": "submission_1:1:review_config_1",
            },
            "submission": {
                "id": "submission_1",
                "assignmentId": "assignment_1",
                "taskId": "task_1",
                "datasetItemId": "item_1",
                "submissionVersion": 1,
                "values": {"answer": "The answer is 42."},
            },
            "task": {"id": "task_1", "title": "QA Review", "description": "Check answer quality", "tags": ["qa"]},
            "datasetItemPayload": {"prompt": "Question 1"},
            "templateSchema": {
                "schemaVersion": "labelhub-template/v1",
                "components": [
                    {
                        "id": "show_prompt",
                        "type": "SHOW_ITEM",
                        "label": "题目原文",
                        "props": {"path": "$.prompt"},
                        "validation": {},
                    },
                    {
                        "id": "answer",
                        "type": "TEXT_INPUT",
                        "fieldKey": "answer",
                        "label": "简要回答",
                        "props": {},
                        "validation": {"required": True},
                    },
                ],
                "layout": {"root": ["show_prompt", "answer"]},
            },
            "reviewConfigVersion": {
                "id": "review_config_1",
                "taskId": "task_1",
                "versionNo": 1,
                "promptTemplate": "Check answer quality",
                "dimensions": [{"key": "accuracy", "name": "准确性", "maxScore": 5, "weight": 1}],
                "thresholds": {"passMinScore": 4, "returnBelowScore": 2, "humanReviewMinScore": 3},
                "outputSchema": {"type": "object"},
            },
        }
    )


class FakeApiClient:
    def __init__(self, response: ClaimReviewJobResponse) -> None:
        self._response = response
        self.completed_result: AiReviewResultDTO | None = None
        self.completed_error: str | None = None

    def claim_review_job(self) -> ClaimReviewJobResponse:
        return self._response

    def complete_review_job(
        self,
        *,
        job_id: str,
        result: AiReviewResultDTO | None = None,
        error_message: str | None = None,
    ) -> object:
        assert job_id == "review_job_1"
        self.completed_result = result
        self.completed_error = error_message
        return {}


class FakeLlmClient:
    def __init__(self, content: str) -> None:
        self._content = content

    def complete(self, *, messages: list[dict[str, str]]) -> str:
        assert messages
        return self._content
