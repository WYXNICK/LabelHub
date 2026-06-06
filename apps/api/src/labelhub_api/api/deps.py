from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Cookie, Depends, Header, Request

from labelhub_api.core.config import Settings, get_settings
from labelhub_api.core.errors import ApiException
from labelhub_api.core.security import parse_session_token
from labelhub_api.schemas.auth import UserVO
from labelhub_api.services.auth_service import AuthService, get_auth_service


def get_request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "req_unknown"))


def get_current_user(
    request: Request,
    labelhub_session: str | None = Cookie(default=None),
    settings: Settings = Depends(get_settings),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserVO:
    request_id = get_request_id(request)
    if not labelhub_session:
        raise ApiException(
            status_code=401,
            code="UNAUTHORIZED",
            message="请先登录。",
            request_id=request_id,
        )

    user_id = parse_session_token(labelhub_session, settings.session_secret)
    if user_id is None:
        raise ApiException(
            status_code=401,
            code="UNAUTHORIZED",
            message="登录状态已失效，请重新登录。",
            request_id=request_id,
        )

    user = auth_service.get_user(user_id)
    if user is None or user.status != "ACTIVE":
        raise ApiException(
            status_code=401,
            code="UNAUTHORIZED",
            message="登录状态已失效，请重新登录。",
            request_id=request_id,
        )
    return user


def get_system_user(
    request: Request,
    x_labelhub_system_token: str | None = Header(default=None, alias="X-LabelHub-System-Token"),
    settings: Settings = Depends(get_settings),
) -> UserVO:
    request_id = get_request_id(request)
    if not x_labelhub_system_token or x_labelhub_system_token != settings.system_agent_token:
        raise ApiException(
            status_code=401,
            code="UNAUTHORIZED",
            message="系统 Agent 凭证无效。",
            request_id=request_id,
        )
    return UserVO(
        id="user_system_agent",
        email="system@labelhub.dev",
        name="AI 预审 Agent",
        role="SYSTEM",
        status="ACTIVE",
        created_at=datetime(2026, 5, 21, 0, 0, 0, tzinfo=UTC),
    )
