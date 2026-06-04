from __future__ import annotations

from typing import NoReturn

from fastapi import Request

from labelhub_api.core.errors import ApiException


def raise_contract_only(request: Request, feature: str) -> NoReturn:
    # Contract-only routes keep OpenAPI stable before the business slice lands.
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    raise ApiException(
        status_code=501,
        code="NOT_IMPLEMENTED",
        message=f"{feature} is contract-only and will be implemented in a later grain.",
        request_id=request_id,
    )
