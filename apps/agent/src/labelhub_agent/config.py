from __future__ import annotations

import json

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_base_url: str = Field(
        default="https://token-plan-cn.xiaomimimo.com/v1",
        validation_alias=AliasChoices("BASE_URL", "OPENAI_BASE_URL"),
    )
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(
        default="mimo-v2.5-pro",
        validation_alias=AliasChoices("MODEL_NAME", "OPENAI_MODEL"),
    )
    openai_timeout_seconds: float = Field(
        default=90.0,
        ge=1,
        le=300,
        validation_alias=AliasChoices("OPENAI_TIMEOUT_SECONDS", "LLM_TIMEOUT_SECONDS"),
    )
    openai_temperature: float = Field(
        default=0.2,
        ge=0,
        le=2,
        validation_alias=AliasChoices("OPENAI_TEMPERATURE", "LLM_TEMPERATURE"),
    )
    openai_thinking_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("OPENAI_THINKING_ENABLED", "THINKING_ENABLED"),
    )
    openai_extra_body_json: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_EXTRA_BODY_JSON", "LLM_EXTRA_BODY_JSON"),
    )
    api_base_url: str = Field(default="http://localhost:8000", alias="API_URL")
    api_timeout_seconds: float = Field(default=20.0, ge=1, le=120, alias="API_TIMEOUT_SECONDS")
    system_agent_token: str = Field(default="dev-system-agent-token", alias="SYSTEM_AGENT_TOKEN")
    worker_id: str = Field(default="labelhub-agent", alias="AGENT_WORKER_ID")
    poll_interval_seconds: float = Field(default=5.0, ge=0.5, le=300, alias="AGENT_POLL_INTERVAL_SECONDS")

    @property
    def is_llm_configured(self) -> bool:
        return bool(self.openai_api_key and self.openai_model)

    @property
    def chat_completion_extra_body(self) -> dict[str, object]:
        parsed: dict[str, object] = {}
        if self.openai_extra_body_json:
            extra_body = json.loads(self.openai_extra_body_json)
            if not isinstance(extra_body, dict):
                raise ValueError("OPENAI_EXTRA_BODY_JSON must be a JSON object.")
            parsed = extra_body

        if self.openai_thinking_enabled is False and self._is_mimo_provider:
            return self._deep_merge({"chat_template_kwargs": {"enable_thinking": False}}, parsed)
        return parsed

    @property
    def _is_mimo_provider(self) -> bool:
        base_url = self.openai_base_url.lower()
        model = self.openai_model.lower()
        return "xiaomimimo.com" in base_url or model.startswith("mimo-")

    def _deep_merge(self, base: dict[str, object], override: dict[str, object]) -> dict[str, object]:
        merged = dict(base)
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged
