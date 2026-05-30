from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class TemplateDraftEntity(Base):
    __tablename__ = "template_drafts"
    __table_args__ = (UniqueConstraint("task_id", name="uq_template_drafts_task_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    schema_json: Mapped[dict[str, Any]] = mapped_column("schema", JSON, nullable=False)
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


class TemplateVersionEntity(Base):
    __tablename__ = "template_versions"
    __table_args__ = (
        UniqueConstraint("task_id", "version_no", name="uq_template_versions_task_version"),
        Index("ix_template_versions_task_status", "task_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_json: Mapped[dict[str, Any]] = mapped_column("schema", JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    version_note: Mapped[str | None] = mapped_column(Text, nullable=True)
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
