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
        "openai_base_url": "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
        "openai_model_name": "astron-code-latest",
        "openai_timeout_seconds": 90.0,
        "llm_temperature": 0.2,
        "llm_extra_body_json": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_openai_compatible_request_uses_config_without_provider_extension(
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
    assert captured["payload"]["model"] == "astron-code-latest"
    assert set(captured["payload"]) == {"model", "messages", "temperature"}


def test_openai_compatible_provider_does_not_receive_extra_body_by_default(
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

    assert set(captured["payload"]) == {"model", "messages", "temperature"}


def test_explicit_extra_body_is_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(llm_client, "urlopen", fake_urlopen)

    OpenAICompatibleLlmClient(
        make_settings(llm_extra_body_json='{"top_p":0.8,"response_format":{"type":"json_object"}}')
    ).complete(messages=[{"role": "user", "content": "hello"}])

    assert captured["payload"]["top_p"] == 0.8
    assert captured["payload"]["response_format"] == {"type": "json_object"}


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
