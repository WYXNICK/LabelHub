from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache

from labelhub_api.core.security import hash_password, verify_password
from labelhub_api.schemas.auth import UserVO


class AuthService:
    def __init__(self) -> None:
        created_at = datetime(2026, 5, 21, 0, 0, 0, tzinfo=UTC)
        self._users = {
            "owner@labelhub.dev": UserVO(
                id="user_owner_demo",
                email="owner@labelhub.dev",
                name="任务负责人",
                role="OWNER",
                status="ACTIVE",
                created_at=created_at,
            ),
            "labeler@labelhub.dev": UserVO(
                id="user_labeler_demo",
                email="labeler@labelhub.dev",
                name="标注员",
                role="LABELER",
                status="ACTIVE",
                created_at=created_at,
            ),
            "reviewer@labelhub.dev": UserVO(
                id="user_reviewer_demo",
                email="reviewer@labelhub.dev",
                name="审核员",
                role="REVIEWER",
                status="ACTIVE",
                created_at=created_at,
            ),
            "system@labelhub.dev": UserVO(
                id="user_system_agent",
                email="system@labelhub.dev",
                name="AI 预审 Agent",
                role="SYSTEM",
                status="DISABLED",
                created_at=created_at,
            ),
        }
        self._password_hashes = {
            email: hash_password("labelhub123", salt=email.encode("utf-8")[:16].ljust(16, b"_"))
            for email in self._users
        }

    def authenticate(self, email: str, password: str) -> UserVO | None:
        normalized_email = email.lower().strip()
        user = self._users.get(normalized_email)
        if user is None or user.status != "ACTIVE":
            return None
        password_hash = self._password_hashes.get(normalized_email)
        if password_hash is None or not verify_password(password, password_hash):
            return None
        return user

    def get_user(self, user_id: str) -> UserVO | None:
        for user in self._users.values():
            if user.id == user_id:
                return user
        return None

    def list_demo_users(self) -> list[UserVO]:
        return list(self._users.values())


@lru_cache
def get_auth_service() -> AuthService:
    return AuthService()
