"""create labeler foundation tables

Revision ID: 0004_create_labeler_foundation
Revises: 0003_create_template_foundation
Create Date: 2026-06-05 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_create_labeler_foundation"
down_revision = "0003_create_template_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assignments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_item_id", sa.String(length=64), nullable=False),
        sa.Column("labeler_id", sa.String(length=64), nullable=False),
        sa.Column("template_version_id", sa.String(length=64), nullable=False),
        sa.Column("review_config_version_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("draft_values", sa.JSON(), nullable=True),
        sa.Column("draft_saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_submission_id", sa.String(length=64), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_item_id"], ["dataset_items.id"]),
        sa.ForeignKeyConstraint(["labeler_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["review_config_version_id"], ["review_config_versions.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["template_version_id"], ["template_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "dataset_item_id", name="uq_assignments_task_item"),
    )
    op.create_index("ix_assignments_labeler_status", "assignments", ["labeler_id", "status"])
    op.create_index("ix_assignments_task_status", "assignments", ["task_id", "status"])
    op.create_index("ix_assignments_template_version", "assignments", ["template_version_id"])

    op.create_table(
        "submissions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("assignment_id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_item_id", sa.String(length=64), nullable=False),
        sa.Column("labeler_id", sa.String(length=64), nullable=False),
        sa.Column("template_version_id", sa.String(length=64), nullable=False),
        sa.Column("submission_version", sa.Integer(), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["dataset_item_id"], ["dataset_items.id"]),
        sa.ForeignKeyConstraint(["labeler_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["template_version_id"], ["template_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "submission_version", name="uq_submissions_assignment_version"),
    )
    op.create_index("ix_submissions_task_status", "submissions", ["task_id", "status"])
    op.create_index("ix_submissions_labeler_created", "submissions", ["labeler_id", "created_at"])
    op.create_index("ix_submissions_idempotency_key", "submissions", ["idempotency_key"], unique=True)

    op.create_table(
        "llm_action_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("assignment_id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("component_id", sa.String(length=128), nullable=False),
        sa.Column("input_values", sa.JSON(), nullable=False),
        sa.Column("output_value", sa.JSON(), nullable=True),
        sa.Column("output_values", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_llm_action_runs_assignment_component", "llm_action_runs", ["assignment_id", "component_id"])
    op.create_index("ix_llm_action_runs_idempotency_key", "llm_action_runs", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_llm_action_runs_idempotency_key", table_name="llm_action_runs")
    op.drop_index("ix_llm_action_runs_assignment_component", table_name="llm_action_runs")
    op.drop_table("llm_action_runs")
    op.drop_index("ix_submissions_idempotency_key", table_name="submissions")
    op.drop_index("ix_submissions_labeler_created", table_name="submissions")
    op.drop_index("ix_submissions_task_status", table_name="submissions")
    op.drop_table("submissions")
    op.drop_index("ix_assignments_template_version", table_name="assignments")
    op.drop_index("ix_assignments_task_status", table_name="assignments")
    op.drop_index("ix_assignments_labeler_status", table_name="assignments")
    op.drop_table("assignments")
