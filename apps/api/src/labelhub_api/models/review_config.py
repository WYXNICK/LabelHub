from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class ReviewConfigDraftEntity(Base):
    __tablename__ = "review_config_drafts"
    __table_args__ = (UniqueConstraint("task_id", name="uq_review_config_drafts_task_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    dimensions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    thresholds: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
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


class ReviewConfigVersionEntity(Base):
    __tablename__ = "review_config_versions"
    __table_args__ = (
        UniqueConstraint("task_id", "version_no", name="uq_review_config_versions_task_version"),
        Index("ix_review_config_versions_task_status", "task_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    dimensions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    thresholds: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    published_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
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
