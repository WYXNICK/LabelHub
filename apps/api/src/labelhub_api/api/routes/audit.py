from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.core.enums import AuditEntityType
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.audit import AuditLogVO
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.services.task_service import TaskService

router = APIRouter(prefix="/api/audit-logs", tags=["stage1-audit"])


@router.get("", response_model=PageVO[AuditLogVO], response_model_by_alias=True)
def list_audit_logs(
    entity_type: AuditEntityType | None = Query(default=None, alias="entityType"),
    entity_id: str | None = Query(default=None, alias="entityId"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[AuditLogVO]:
    return TaskService(db).list_audit_logs(
        user=user,
        entity_type=entity_type,
        entity_id=entity_id,
        page=page,
        page_size=page_size,
    )
