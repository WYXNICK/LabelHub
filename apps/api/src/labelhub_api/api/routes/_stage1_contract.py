from __future__ import annotations

from typing import NoReturn

from fastapi import Request

from labelhub_api.core.errors import ApiException


def raise_contract_only(request: Request, feature: str) -> NoReturn:
    # 阶段 1.0 只冻结接口契约，避免前端或调用方误把占位路由当成可用业务能力。
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    raise ApiException(
        status_code=501,
        code="NOT_IMPLEMENTED",
        message=f"{feature}业务实现将在后续粒度完成，阶段 1.0 仅暴露接口契约。",
        request_id=request_id,
    )
