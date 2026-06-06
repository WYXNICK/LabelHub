from __future__ import annotations

import json
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from labelhub_api.core.config import Settings, get_settings


class LlmClientError(RuntimeError):
    pass


class OpenAICompatibleLlmClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def complete(self, *, messages: list[dict[str, str]]) -> str:
        api_key = self._settings.openai_api_key
        if not api_key:
            raise LlmClientError("LLM provider is not configured: OPENAI_API_KEY is missing.")

        payload: dict[str, Any] = {
            "model": self._settings.openai_model_name,
            "messages": messages,
            "temperature": self._settings.llm_temperature,
        }
        payload.update(self._extra_body())
        request = Request(
            self._chat_completions_url(),
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._settings.openai_timeout_seconds) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise LlmClientError(f"LLM provider returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            if self._is_timeout_error(exc.reason):
                raise self._timeout_error() from exc
            raise LlmClientError(f"LLM provider request failed: {exc.reason}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise self._timeout_error() from exc

        return self._extract_message_content(body)

    def _chat_completions_url(self) -> str:
        return f"{self._settings.openai_base_url.rstrip('/')}/chat/completions"

    def _extra_body(self) -> dict[str, Any]:
        raw = self._settings.llm_extra_body_json
        parsed: dict[str, Any] = {}
        if raw:
            try:
                extra_body = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise LlmClientError("LLM_EXTRA_BODY_JSON is not valid JSON.") from exc
            if not isinstance(extra_body, dict):
                raise LlmClientError("LLM_EXTRA_BODY_JSON must be a JSON object.")
            parsed = extra_body

        # MiMo 兼容 OpenAI Chat Completions，但关闭 thinking 需要额外请求体参数。
        # 对未知 Provider 不自动注入，避免破坏更严格的 OpenAI 兼容服务。
        if self._settings.openai_thinking_enabled is False and self._is_mimo_provider():
            parsed = self._deep_merge(
                {"chat_template_kwargs": {"enable_thinking": False}},
                parsed,
            )
        return parsed

    def _is_mimo_provider(self) -> bool:
        base_url = self._settings.openai_base_url.lower()
        model_name = self._settings.openai_model_name.lower()
        return "xiaomimimo.com" in base_url or model_name.startswith("mimo-")

    def _deep_merge(self, base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged = dict(base)
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged

    def _timeout_error(self) -> LlmClientError:
        timeout = self._settings.openai_timeout_seconds
        return LlmClientError(
            f"LLM 供应商请求超过 {timeout:g} 秒仍未返回。"
            "请稍后重试，或联系管理员检查 Provider 可用性、thinking 关闭配置和 OPENAI_TIMEOUT_SECONDS。"
        )

    def _is_timeout_error(self, error: object) -> bool:
        return isinstance(error, (TimeoutError, socket.timeout))

    def _extract_message_content(self, body: str) -> str:
        try:
            payload = json.loads(body)
            choice = payload["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise LlmClientError("LLM provider response is not OpenAI Chat Completions compatible.") from exc

        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [
                part.get("text", "")
                for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ]
            return "\n".join(parts)
        raise LlmClientError("LLM provider response message content is not text.")
