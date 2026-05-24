from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from labelhub_api.api.deps import get_current_user
from labelhub_api.api.routes._stage1_contract import raise_contract_only
from labelhub_api.core.enums import AuditEntityType
from labelhub_api.schemas.audit import AuditLogVO
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO

router = APIRouter(prefix="/api/audit-logs", tags=["stage1-audit"])


@router.get("", response_model=PageVO[AuditLogVO], response_model_by_alias=True)
def list_audit_logs(
    request: Request,
    entity_type: AuditEntityType | None = Query(default=None, alias="entityType"),
    entity_id: str | None = Query(default=None, alias="entityId"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
) -> PageVO[AuditLogVO]:
    raise_contract_only(request, "审计日志查询")
