from __future__ import annotations

import json
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from labelhub_agent.config import AgentSettings
from labelhub_agent.contracts import AiReviewResultDTO, ClaimReviewJobResponse


class LabelHubApiError(RuntimeError):
    pass


class LabelHubApiClient:
    def __init__(self, settings: AgentSettings | None = None) -> None:
        self._settings = settings or AgentSettings()

    def claim_review_job(self) -> ClaimReviewJobResponse:
        payload = self._request_json(
            "/api/internal/review-jobs:claim",
            {"workerId": self._settings.worker_id},
        )
        return ClaimReviewJobResponse.model_validate(payload)

    def complete_review_job(
        self,
        *,
        job_id: str,
        result: AiReviewResultDTO | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "result": result.model_dump(by_alias=True) if result is not None else None,
            "errorMessage": error_message,
        }
        return self._request_json(f"/api/internal/review-jobs/{job_id}/results", payload)

    def _request_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            self._url(path),
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-LabelHub-System-Token": self._settings.system_agent_token,
                "X-LabelHub-Agent-Worker": self._settings.worker_id,
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._settings.api_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise LabelHubApiError(f"LabelHub API returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise LabelHubApiError("LabelHub API request timed out.") from exc
            raise LabelHubApiError(f"LabelHub API request failed: {exc.reason}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise LabelHubApiError("LabelHub API request timed out.") from exc
        except json.JSONDecodeError as exc:
            raise LabelHubApiError("LabelHub API response is not valid JSON.") from exc

    def _url(self, path: str) -> str:
        return f"{self._settings.api_base_url.rstrip('/')}{path}"
