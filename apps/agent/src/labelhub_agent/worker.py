from __future__ import annotations

import logging
import time
from time import perf_counter
from typing import Protocol

from labelhub_agent.api_client import LabelHubApiClient
from labelhub_agent.config import AgentSettings
from labelhub_agent.contracts import AgentProcessResult, ClaimReviewJobResponse
from labelhub_agent.llm import OpenAICompatibleClient
from labelhub_agent.prompt import build_review_messages, parse_ai_review_result

logger = logging.getLogger(__name__)


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
        started_at = perf_counter()
        logger.info(
            "claimed review job job=%s task=%s attempt=%s/%s",
            _short_id(job.id),
            _safe_text(claimed.task.title if claimed.task else None),
            job.attempt_count,
            job.max_attempts,
        )
        try:
            messages, prompt_snapshot = build_review_messages(claimed)
            content = self._llm_client.complete(messages=messages)
            result = parse_ai_review_result(
                content=content,
                dimensions=claimed.review_config_version.dimensions if claimed.review_config_version else [],
                prompt_snapshot=prompt_snapshot,
            )
            self._api_client.complete_review_job(job_id=job.id, result=result)
            logger.info(
                "completed review job job=%s conclusion=%s elapsed=%.2fs",
                _short_id(job.id),
                result.conclusion,
                perf_counter() - started_at,
            )
            return AgentProcessResult(processed=True, job_id=job.id, status="SUCCEEDED")
        except Exception as exc:  # noqa: BLE001 - Agent 必须把任意执行失败写回队列，避免 job 卡死。
            self._api_client.complete_review_job(job_id=job.id, error_message=str(exc)[:2000])
            logger.warning(
                "failed review job job=%s elapsed=%.2fs error=%s",
                _short_id(job.id),
                perf_counter() - started_at,
                _safe_text(str(exc), limit=180),
            )
            return AgentProcessResult(processed=True, job_id=job.id, status="FAILED", message=str(exc))

    def run_forever(self) -> None:
        logger.info(
            "agent loop started worker=%s api=%s model=%s poll=%.1fs",
            self._settings.worker_id,
            self._settings.api_base_url,
            self._settings.openai_model,
            self._settings.poll_interval_seconds,
        )
        idle_count = 0
        while True:
            result = self.run_once()
            if result.processed:
                idle_count = 0
            else:
                idle_count += 1
                if idle_count == 1 or idle_count % 12 == 0:
                    logger.info("no review job available; waiting %.1fs", self._settings.poll_interval_seconds)
            time.sleep(self._settings.poll_interval_seconds)


def _short_id(value: str | None) -> str:
    if not value:
        return "-"
    if len(value) <= 16:
        return value
    return f"{value[:8]}...{value[-6:]}"


def _safe_text(value: str | None, *, limit: int = 80) -> str:
    text = (value or "-").replace("\n", " ").strip()
    return text if len(text) <= limit else f"{text[:limit]}..."
