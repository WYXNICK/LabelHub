from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class ReviewJobEntity(Base):
    __tablename__ = "review_jobs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_review_jobs_idempotency_key"),
        Index("ix_review_jobs_status_created", "status", "created_at"),
        Index("ix_review_jobs_task_status", "task_id", "status"),
        Index("ix_review_jobs_submission", "submission_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    assignment_id: Mapped[str] = mapped_column(String(64), ForeignKey("assignments.id"), nullable=False)
    submission_id: Mapped[str] = mapped_column(String(64), ForeignKey("submissions.id"), nullable=False)
    review_config_version_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("review_config_versions.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    idempotency_key: Mapped[str] = mapped_column(String(192), nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ReviewEntity(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("review_job_id", name="uq_reviews_review_job_id"),
        Index("ix_reviews_task_status", "task_id", "status"),
        Index("ix_reviews_assignment_created", "assignment_id", "created_at"),
        Index("ix_reviews_ai_conclusion", "ai_conclusion"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    assignment_id: Mapped[str] = mapped_column(String(64), ForeignKey("assignments.id"), nullable=False)
    submission_id: Mapped[str] = mapped_column(String(64), ForeignKey("submissions.id"), nullable=False)
    review_job_id: Mapped[str] = mapped_column(String(64), ForeignKey("review_jobs.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    ai_conclusion: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_scores: Mapped[dict[str, int]] = mapped_column(JSON, nullable=False)
    ai_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_issues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    ai_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    human_conclusion: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reviewer_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("users.id"), nullable=True)
    human_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    dimension_comments: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False)
    review_round: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
