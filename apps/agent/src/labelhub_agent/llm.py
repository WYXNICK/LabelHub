from __future__ import annotations

import json
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from labelhub_agent.config import AgentSettings


class AgentLlmError(RuntimeError):
    pass


class OpenAICompatibleClient:
    def __init__(self, settings: AgentSettings | None = None) -> None:
        self._settings = settings or AgentSettings()

    def complete(self, *, messages: list[dict[str, str]]) -> str:
        if not self._settings.openai_api_key:
            raise AgentLlmError("OPENAI_API_KEY is missing.")

        payload: dict[str, Any] = {
            "model": self._settings.openai_model,
            "messages": messages,
            "temperature": self._settings.openai_temperature,
            "response_format": {"type": "json_object"},
        }
        payload.update(self._settings.chat_completion_extra_body)
        request = Request(
            self._chat_completions_url(),
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._settings.openai_timeout_seconds) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise AgentLlmError(f"LLM provider returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                raise self._timeout_error() from exc
            raise AgentLlmError(f"LLM provider request failed: {exc.reason}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise self._timeout_error() from exc

        return self._extract_content(body)

    def _chat_completions_url(self) -> str:
        return f"{self._settings.openai_base_url.rstrip('/')}/chat/completions"

    def _timeout_error(self) -> AgentLlmError:
        return AgentLlmError(f"LLM provider request timed out after {self._settings.openai_timeout_seconds:g}s.")

    def _extract_content(self, body: str) -> str:
        try:
            payload = json.loads(body)
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise AgentLlmError("LLM provider response is not OpenAI Chat Completions compatible.") from exc

        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            )
        raise AgentLlmError("LLM provider response message content is not text.")
