from __future__ import annotations

from datetime import datetime

from pydantic import EmailStr, Field

from labelhub_api.core.enums import UserRole, UserStatus
from labelhub_api.schemas.common import CamelModel


class UserVO(CamelModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole
    status: UserStatus
    created_at: datetime


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AuthSessionVO(CamelModel):
    expires_at: datetime


class LoginResponseVO(CamelModel):
    user: UserVO
    session: AuthSessionVO


class LogoutResponseVO(CamelModel):
    success: bool
