from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from labelhub_api import __version__
from labelhub_api.core.config import Settings, get_settings
from labelhub_api.schemas.health import HealthVO

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health", response_model=HealthVO, response_model_by_alias=True)
def health(settings: Settings = Depends(get_settings)) -> HealthVO:
    return HealthVO(
        status="ok",
        service="labelhub-api",
        version=__version__,
        environment=settings.environment,
        server_time=datetime.now(UTC),
    )
