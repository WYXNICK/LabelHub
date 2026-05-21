from __future__ import annotations

from functools import lru_cache

from pydantic import Field
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

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
