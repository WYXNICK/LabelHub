"""create export foundation tables

Revision ID: 0006_create_export_foundation
Revises: 0005_create_review_foundation
Create Date: 2026-06-08 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_create_export_foundation"
down_revision = "0005_create_review_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "export_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("field_mappings", sa.JSON(), nullable=False),
        sa.Column("include_review_records", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("include_audit_timeline", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("total_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("exported_rows", sa.Integer(), server_default="0", nullable=False),
        sa.Column("file_object_id", sa.String(length=64), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["file_object_id"], ["file_objects.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_export_jobs_task_status", "export_jobs", ["task_id", "status"])
    op.create_index("ix_export_jobs_created_by_created", "export_jobs", ["created_by", "created_at"])
    op.create_index("ix_export_jobs_status_created", "export_jobs", ["status", "created_at"])
    op.create_index("ix_export_jobs_idempotency_key", "export_jobs", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_export_jobs_idempotency_key", table_name="export_jobs")
    op.drop_index("ix_export_jobs_status_created", table_name="export_jobs")
    op.drop_index("ix_export_jobs_created_by_created", table_name="export_jobs")
    op.drop_index("ix_export_jobs_task_status", table_name="export_jobs")
    op.drop_table("export_jobs")
