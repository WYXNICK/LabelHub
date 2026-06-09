from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from labelhub_api.db.base import Base


class ExportJobEntity(Base):
    __tablename__ = "export_jobs"
    __table_args__ = (
        Index("ix_export_jobs_task_status", "task_id", "status"),
        Index("ix_export_jobs_created_by_created", "created_by", "created_at"),
        Index("ix_export_jobs_status_created", "status", "created_at"),
        Index("ix_export_jobs_idempotency_key", "idempotency_key", unique=True),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), nullable=False)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    field_mappings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    include_review_records: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="0")
    include_audit_timeline: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="0")
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    exported_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    file_object_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("file_objects.id"), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
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
