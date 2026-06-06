from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


class AgentModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class AiReviewIssueDTO(AgentModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    field: str | None = None
    code: str
    message: str


class AiReviewResultDTO(AgentModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    conclusion: Literal["PASS", "RETURN", "NEEDS_HUMAN_REVIEW"]
    scores: dict[str, int] = Field(default_factory=dict)
    summary: str
    issues: list[AiReviewIssueDTO] = Field(default_factory=list)
    suggestions: str | None = None
    raw_output: dict[str, Any] | None = None
    prompt_snapshot: str | None = None


class ReviewJobDTO(AgentModel):
    id: str
    task_id: str
    assignment_id: str
    submission_id: str
    review_config_version_id: str
    status: str
    attempt_count: int
    max_attempts: int
    idempotency_key: str
    last_error: str | None = None
    locked_by: str | None = None


class SubmissionDTO(AgentModel):
    id: str
    assignment_id: str
    task_id: str
    dataset_item_id: str
    values: dict[str, Any]
    submission_version: int


class TaskDTO(AgentModel):
    id: str
    title: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class TemplateSchemaDTO(AgentModel):
    schema_version: str
    components: list[dict[str, Any]] = Field(default_factory=list)
    layout: dict[str, Any] = Field(default_factory=dict)


class ReviewDimensionDTO(AgentModel):
    key: str
    name: str
    description: str | None = None
    max_score: int = 5
    weight: float = 1.0


class ReviewThresholdDTO(AgentModel):
    pass_min_score: float
    return_below_score: float
    human_review_min_score: float | None = None


class ReviewConfigVersionDTO(AgentModel):
    id: str
    task_id: str
    version_no: int
    prompt_template: str
    dimensions: list[ReviewDimensionDTO]
    thresholds: ReviewThresholdDTO
    output_schema: dict[str, Any] = Field(default_factory=dict)


class ClaimReviewJobResponse(AgentModel):
    job: ReviewJobDTO | None = None
    submission: SubmissionDTO | None = None
    task: TaskDTO | None = None
    dataset_item_payload: dict[str, Any] | None = None
    template_schema: TemplateSchemaDTO | None = None
    review_config_version: ReviewConfigVersionDTO | None = None


class AgentProcessResult(AgentModel):
    processed: bool
    job_id: str | None = None
    status: Literal["NO_JOB", "SUCCEEDED", "FAILED"] = "NO_JOB"
    message: str | None = None
