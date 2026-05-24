from __future__ import annotations

from datetime import datetime
from typing import Any

from labelhub_api.core.enums import AuditAction, AuditEntityType, UserRole
from labelhub_api.schemas.common import CamelModel


class AuditLogVO(CamelModel):
    id: str
    entity_type: AuditEntityType
    entity_id: str
    actor_id: str
    actor_role: UserRole
    action: AuditAction
    from_state: str | None
    to_state: str | None
    reason: str | None
    metadata: dict[str, Any] | None
    request_id: str | None
    created_at: datetime
