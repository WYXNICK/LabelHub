from __future__ import annotations

from datetime import datetime

from labelhub_api.schemas.common import CamelModel


class HealthVO(CamelModel):
    status: str
    service: str
    version: str
    environment: str
    server_time: datetime
