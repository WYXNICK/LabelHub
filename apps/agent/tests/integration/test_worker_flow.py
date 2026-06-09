from __future__ import annotations

from labelhub_agent.config import AgentSettings
from labelhub_agent.contracts import AiReviewResultDTO, ClaimReviewJobResponse
from labelhub_agent.worker import ReviewAgentWorker
from tests.unit.test_contracts import _claim_context


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
