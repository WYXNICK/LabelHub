from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Response

from labelhub_api.api.deps import get_current_user
from labelhub_api.core.config import Settings, get_settings
from labelhub_api.core.errors import ApiException
from labelhub_api.core.security import create_session_token
from labelhub_api.schemas.auth import (
    AuthSessionVO,
    LoginRequest,
    LoginResponseVO,
    LogoutResponseVO,
    UserVO,
)
from labelhub_api.services.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponseVO, response_model_by_alias=True)
def login(
    request: LoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponseVO:
    user = auth_service.authenticate(request.email, request.password)
    if user is None:
        raise ApiException(
            status_code=401,
            code="INVALID_CREDENTIALS",
            message="邮箱或密码不正确。",
        )

    expires_at = datetime.now(UTC) + timedelta(seconds=settings.session_max_age_seconds)
    token = create_session_token(
        user_id=user.id,
        expires_at=expires_at,
        secret=settings.session_secret,
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return LoginResponseVO(user=user, session=AuthSessionVO(expires_at=expires_at))


@router.get("/me", response_model=UserVO, response_model_by_alias=True)
def me(user: UserVO = Depends(get_current_user)) -> UserVO:
    return user


@router.post("/logout", response_model=LogoutResponseVO, response_model_by_alias=True)
def logout(response: Response, settings: Settings = Depends(get_settings)) -> LogoutResponseVO:
    response.delete_cookie(settings.session_cookie_name, path="/", samesite="lax")
    return LogoutResponseVO(success=True)
