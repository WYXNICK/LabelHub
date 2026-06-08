from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="LABELHUB_ENV")
    app_url: str = Field(default="http://localhost:5173", alias="APP_URL")
    api_cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="API_CORS_ORIGINS",
    )
    database_url: str = Field(
        default="mysql+pymysql://labelhub:labelhub@localhost:3306/labelhub",
        alias="DATABASE_URL",
    )
    session_cookie_name: str = Field(default="labelhub_session", alias="SESSION_COOKIE_NAME")
    session_secret: str = Field(default="dev-only-change-me", alias="SESSION_SECRET")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_max_age_seconds: int = Field(default=60 * 60 * 8, alias="SESSION_MAX_AGE_SECONDS")
    system_agent_token: str = Field(default="dev-system-agent-token", alias="SYSTEM_AGENT_TOKEN")
    review_job_lock_timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=3600,
        alias="REVIEW_JOB_LOCK_TIMEOUT_SECONDS",
    )
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_API_KEY", "LLM_API_KEY"),
    )
    openai_base_url: str = Field(
        default="https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
        validation_alias=AliasChoices("BASE_URL", "OPENAI_BASE_URL", "LLM_BASE_URL"),
    )
    openai_model_name: str = Field(
        default="astron-code-latest",
        validation_alias=AliasChoices("MODEL_NAME", "OPENAI_MODEL_NAME", "OPENAI_MODEL", "LLM_MODEL_NAME"),
    )
    openai_timeout_seconds: float = Field(
        default=90.0,
        ge=1,
        le=300,
        validation_alias=AliasChoices("OPENAI_TIMEOUT_SECONDS", "LLM_TIMEOUT_SECONDS", "LLM_REQUEST_TIMEOUT_SECONDS"),
    )
    llm_temperature: float = Field(
        default=0.2,
        ge=0,
        le=2,
        validation_alias=AliasChoices("LLM_TEMPERATURE", "OPENAI_TEMPERATURE"),
    )
    llm_extra_body_json: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_EXTRA_BODY_JSON", "OPENAI_EXTRA_BODY_JSON"),
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
