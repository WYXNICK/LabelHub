"""create review foundation tables

Revision ID: 0005_create_review_foundation
Revises: 0004_create_labeler_foundation
Create Date: 2026-06-06 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_create_review_foundation"
down_revision = "0004_create_labeler_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("assignment_id", sa.String(length=64), nullable=False),
        sa.Column("submission_id", sa.String(length=64), nullable=False),
        sa.Column("review_config_version_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("idempotency_key", sa.String(length=192), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("locked_by", sa.String(length=120), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["review_config_version_id"], ["review_config_versions.id"]),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_review_jobs_idempotency_key"),
    )
    op.create_index("ix_review_jobs_status_created", "review_jobs", ["status", "created_at"])
    op.create_index("ix_review_jobs_task_status", "review_jobs", ["task_id", "status"])
    op.create_index("ix_review_jobs_submission", "review_jobs", ["submission_id"])

    op.create_table(
        "reviews",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("assignment_id", sa.String(length=64), nullable=False),
        sa.Column("submission_id", sa.String(length=64), nullable=False),
        sa.Column("review_job_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("ai_conclusion", sa.String(length=32), nullable=True),
        sa.Column("ai_scores", sa.JSON(), nullable=False),
        sa.Column("ai_comment", sa.Text(), nullable=True),
        sa.Column("ai_issues", sa.JSON(), nullable=False),
        sa.Column("ai_suggestions", sa.Text(), nullable=True),
        sa.Column("raw_output", sa.JSON(), nullable=True),
        sa.Column("prompt_snapshot", sa.Text(), nullable=True),
        sa.Column("human_conclusion", sa.String(length=32), nullable=True),
        sa.Column("reviewer_id", sa.String(length=64), nullable=True),
        sa.Column("human_comment", sa.Text(), nullable=True),
        sa.Column("dimension_comments", sa.JSON(), nullable=False),
        sa.Column("review_round", sa.Integer(), server_default="1", nullable=False),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"]),
        sa.ForeignKeyConstraint(["review_job_id"], ["review_jobs.id"]),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("review_job_id", name="uq_reviews_review_job_id"),
    )
    op.create_index("ix_reviews_task_status", "reviews", ["task_id", "status"])
    op.create_index("ix_reviews_assignment_created", "reviews", ["assignment_id", "created_at"])
    op.create_index("ix_reviews_ai_conclusion", "reviews", ["ai_conclusion"])


def downgrade() -> None:
    op.drop_index("ix_reviews_ai_conclusion", table_name="reviews")
    op.drop_index("ix_reviews_assignment_created", table_name="reviews")
    op.drop_index("ix_reviews_task_status", table_name="reviews")
    op.drop_table("reviews")
    op.drop_index("ix_review_jobs_submission", table_name="review_jobs")
    op.drop_index("ix_review_jobs_task_status", table_name="review_jobs")
    op.drop_index("ix_review_jobs_status_created", table_name="review_jobs")
    op.drop_table("review_jobs")
