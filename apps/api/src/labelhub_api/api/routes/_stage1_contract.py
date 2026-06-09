from __future__ import annotations

from typing import NoReturn

from fastapi import Request

from labelhub_api.core.errors import ApiException


def raise_feature_not_ready(request: Request, feature: str) -> NoReturn:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    raise ApiException(
        status_code=501,
        code="NOT_IMPLEMENTED",
        message=f"{feature} 暂未开放，请使用当前工作台已提供的功能入口。",
        request_id=request_id,
    )
