from __future__ import annotations

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
    openai_thinking_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("OPENAI_THINKING_ENABLED", "THINKING_ENABLED"),
    )
    api_base_url: str = Field(default="http://localhost:8000", alias="API_URL")

    @property
    def is_llm_configured(self) -> bool:
        return bool(self.openai_api_key and self.openai_model)

    @property
    def chat_completion_extra_body(self) -> dict[str, object]:
        return {
            "chat_template_kwargs": {
                "enable_thinking": self.openai_thinking_enabled,
            }
        }
