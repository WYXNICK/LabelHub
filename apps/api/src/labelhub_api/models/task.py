from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class TaskEntity(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_created_by_status", "created_by", "status"),
        Index("ix_tasks_status_deadline_at", "status", "deadline_at"),
        Index("ix_tasks_current_template_version_id", "current_template_version_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instruction_rich_text: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    reward_rule: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    quota: Mapped[int] = mapped_column(Integer, nullable=False)
    claimed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    submitted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    approved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    distribution_strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    current_template_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_review_config_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
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


class TaskStateTransitionEntity(Base):
    __tablename__ = "task_state_transitions"
    __table_args__ = (
        Index("ix_task_state_transitions_task_created", "task_id", "created_at"),
        Index("ix_task_state_transitions_actor_created", "actor_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
