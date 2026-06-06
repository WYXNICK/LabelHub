from __future__ import annotations

import time
from typing import Protocol

from labelhub_agent.api_client import LabelHubApiClient
from labelhub_agent.config import AgentSettings
from labelhub_agent.contracts import AgentProcessResult, ClaimReviewJobResponse
from labelhub_agent.llm import OpenAICompatibleClient
from labelhub_agent.prompt import build_review_messages, parse_ai_review_result


class ReviewJobApi(Protocol):
    def claim_review_job(self) -> ClaimReviewJobResponse: ...

    def complete_review_job(self, *, job_id: str, result: object | None = None, error_message: str | None = None) -> object:
        ...


class ChatClient(Protocol):
    def complete(self, *, messages: list[dict[str, str]]) -> str: ...


class ReviewAgentWorker:
    def __init__(
        self,
        *,
        settings: AgentSettings | None = None,
        api_client: ReviewJobApi | None = None,
        llm_client: ChatClient | None = None,
    ) -> None:
        self._settings = settings or AgentSettings()
        self._api_client = api_client or LabelHubApiClient(self._settings)
        self._llm_client = llm_client or OpenAICompatibleClient(self._settings)

    def run_once(self) -> AgentProcessResult:
        claimed = self._api_client.claim_review_job()
        if claimed.job is None:
            return AgentProcessResult(processed=False, status="NO_JOB", message="No review job is available.")

        job = claimed.job
        try:
            messages, prompt_snapshot = build_review_messages(claimed)
            content = self._llm_client.complete(messages=messages)
            result = parse_ai_review_result(
                content=content,
                dimensions=claimed.review_config_version.dimensions if claimed.review_config_version else [],
                prompt_snapshot=prompt_snapshot,
            )
            self._api_client.complete_review_job(job_id=job.id, result=result)
            return AgentProcessResult(processed=True, job_id=job.id, status="SUCCEEDED")
        except Exception as exc:  # noqa: BLE001 - Agent 必须把任意执行失败写回队列，避免 job 卡死。
            self._api_client.complete_review_job(job_id=job.id, error_message=str(exc)[:2000])
            return AgentProcessResult(processed=True, job_id=job.id, status="FAILED", message=str(exc))

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self._settings.poll_interval_seconds)
