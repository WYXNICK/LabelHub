from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class AssignmentEntity(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "dataset_item_id", name="uq_assignments_task_item"),
        Index("ix_assignments_labeler_status", "labeler_id", "status"),
        Index("ix_assignments_task_status", "task_id", "status"),
        Index("ix_assignments_template_version", "template_version_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    dataset_item_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_items.id"), nullable=False)
    labeler_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
    template_version_id: Mapped[str] = mapped_column(String(64), ForeignKey("template_versions.id"), nullable=False)
    review_config_version_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("review_config_versions.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    draft_values: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    draft_saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_submission_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class SubmissionEntity(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "submission_version", name="uq_submissions_assignment_version"),
        Index("ix_submissions_task_status", "task_id", "status"),
        Index("ix_submissions_labeler_created", "labeler_id", "created_at"),
        Index("ix_submissions_idempotency_key", "idempotency_key", unique=True),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(String(64), ForeignKey("assignments.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    dataset_item_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_items.id"), nullable=False)
    labeler_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
    template_version_id: Mapped[str] = mapped_column(String(64), ForeignKey("template_versions.id"), nullable=False)
    submission_version: Mapped[int] = mapped_column(Integer, nullable=False)
    values: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
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


class LlmActionRunEntity(Base):
    __tablename__ = "llm_action_runs"
    __table_args__ = (
        Index("ix_llm_action_runs_assignment_component", "assignment_id", "component_id"),
        Index("ix_llm_action_runs_idempotency_key", "idempotency_key", unique=True),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(String(64), ForeignKey("assignments.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    component_id: Mapped[str] = mapped_column(String(128), nullable=False)
    input_values: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_value: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    output_values: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
