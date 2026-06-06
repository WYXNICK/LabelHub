from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from labelhub_api.services import llm_client
from labelhub_api.services.llm_client import LlmClientError, OpenAICompatibleLlmClient


class FakeResponse:
    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return b'{"choices":[{"message":{"content":"{\\"outputValue\\":\\"ok\\"}"}}]}'


def make_settings(**overrides: Any) -> SimpleNamespace:
    values: dict[str, Any] = {
        "openai_api_key": "test-key",
        "openai_base_url": "https://token-plan-cn.xiaomimimo.com/v1",
        "openai_model_name": "mimo-v2.5-pro",
        "openai_timeout_seconds": 90.0,
        "openai_thinking_enabled": False,
        "llm_temperature": 0.2,
        "llm_extra_body_json": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_mimo_thinking_flag_is_translated_to_openai_compatible_extra_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        captured["timeout"] = timeout
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(llm_client, "urlopen", fake_urlopen)

    content = OpenAICompatibleLlmClient(make_settings()).complete(
        messages=[{"role": "user", "content": "hello"}],
    )

    assert content == '{"outputValue":"ok"}'
    assert captured["timeout"] == 90.0
    assert captured["payload"]["model"] == "mimo-v2.5-pro"
    assert captured["payload"]["chat_template_kwargs"] == {"enable_thinking": False}


def test_unknown_provider_does_not_receive_thinking_extension_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(llm_client, "urlopen", fake_urlopen)

    OpenAICompatibleLlmClient(
        make_settings(openai_base_url="https://api.openai.com/v1", openai_model_name="gpt-4o-mini")
    ).complete(messages=[{"role": "user", "content": "hello"}])

    assert "chat_template_kwargs" not in captured["payload"]


def test_explicit_extra_body_overrides_inferred_thinking_config(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(llm_client, "urlopen", fake_urlopen)

    OpenAICompatibleLlmClient(
        make_settings(llm_extra_body_json='{"chat_template_kwargs":{"enable_thinking":true},"top_p":0.8}')
    ).complete(messages=[{"role": "user", "content": "hello"}])

    assert captured["payload"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert captured["payload"]["top_p"] == 0.8


def test_timeout_error_message_is_actionable(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_urlopen(_request: Any, timeout: float) -> FakeResponse:
        raise TimeoutError()

    monkeypatch.setattr(llm_client, "urlopen", fake_urlopen)

    with pytest.raises(LlmClientError) as exc_info:
        OpenAICompatibleLlmClient(make_settings(openai_timeout_seconds=120.0)).complete(
            messages=[{"role": "user", "content": "hello"}],
        )

    message = str(exc_info.value)
    assert "超过 120 秒" in message
    assert "OPENAI_TIMEOUT_SECONDS" in message
