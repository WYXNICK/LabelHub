from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "OWNER"
    LABELER = "LABELER"
    REVIEWER = "REVIEWER"
    SYSTEM = "SYSTEM"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"
