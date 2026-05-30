"""create template foundation tables

Revision ID: 0003_create_template_foundation
Revises: 0002_create_stage1_foundation
Create Date: 2026-05-30 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_create_template_foundation"
down_revision = "0002_create_stage1_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "template_drafts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("schema", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", name="uq_template_drafts_task_id"),
    )

    op.create_table(
        "template_versions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("schema", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("version_note", sa.Text(), nullable=True),
        sa.Column("published_by", sa.String(length=64), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["published_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "version_no", name="uq_template_versions_task_version"),
    )
    op.create_index(
        "ix_template_versions_task_status",
        "template_versions",
        ["task_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_template_versions_task_status", table_name="template_versions")
    op.drop_table("template_versions")
    op.drop_table("template_drafts")
