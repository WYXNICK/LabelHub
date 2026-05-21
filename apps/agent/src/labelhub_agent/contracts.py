from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AiReviewIssueDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str | None = None
    code: str
    message: str


class AiReviewResultDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conclusion: Literal["PASS", "RETURN", "NEEDS_HUMAN_REVIEW"]
    scores: dict[str, int] = Field(default_factory=dict)
    summary: str
    issues: list[AiReviewIssueDTO] = Field(default_factory=list)
    suggestions: str | None = None
