"""create users table

Revision ID: 0001_create_users
Revises:
Create Date: 2026-05-21 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_create_users"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_role_status", "users", ["role", "status"], unique=False)

    users_table = sa.table(
        "users",
        sa.column("id", sa.String),
        sa.column("email", sa.String),
        sa.column("name", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("role", sa.String),
        sa.column("status", sa.String),
    )
    op.bulk_insert(
        users_table,
        [
            {
                "id": "user_owner_demo",
                "email": "owner@labelhub.dev",
                "name": "任务负责人",
                "password_hash": None,
                "role": "OWNER",
                "status": "ACTIVE",
            },
            {
                "id": "user_labeler_demo",
                "email": "labeler@labelhub.dev",
                "name": "标注员",
                "password_hash": None,
                "role": "LABELER",
                "status": "ACTIVE",
            },
            {
                "id": "user_reviewer_demo",
                "email": "reviewer@labelhub.dev",
                "name": "审核员",
                "password_hash": None,
                "role": "REVIEWER",
                "status": "ACTIVE",
            },
            {
                "id": "user_system_agent",
                "email": "system@labelhub.dev",
                "name": "AI 预审 Agent",
                "password_hash": None,
                "role": "SYSTEM",
                "status": "DISABLED",
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_users_role_status", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
