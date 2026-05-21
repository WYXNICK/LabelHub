from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from labelhub_api.schemas.common import ApiErrorDetailVO, ApiErrorVO


class ApiException(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
        request_id: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.request_id = request_id


def get_request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "req_unknown"))


def build_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    details: Any | None = None,
) -> JSONResponse:
    body = ApiErrorVO(
        error=ApiErrorDetailVO(
            code=code,
            message=message,
            details=details,
            request_id=request_id,
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True),
        headers={"X-Request-ID": request_id},
    )


async def api_exception_handler(request: Request, exc: ApiException) -> JSONResponse:
    return build_error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
        request_id=exc.request_id or get_request_id(request),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    status_to_code = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
    }
    code = status_to_code.get(exc.status_code, "HTTP_ERROR")
    message = str(exc.detail) if exc.detail else "请求处理失败。"
    return build_error_response(
        status_code=exc.status_code,
        code=code,
        message=message,
        request_id=get_request_id(request),
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return build_error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="请求参数校验失败。",
        details=exc.errors(),
        request_id=get_request_id(request),
    )


async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    return build_error_response(
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
        message="服务暂时不可用，请稍后重试。",
        request_id=get_request_id(request),
    )
