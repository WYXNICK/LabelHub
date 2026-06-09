from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user, get_request_id
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.exports import CreateExportJobRequest, ExportFieldOptionsVO, ExportJobVO
from labelhub_api.services.export_service import ExportService

task_export_router = APIRouter(prefix="/api/tasks", tags=["stage5-exports"])
export_job_router = APIRouter(prefix="/api/export-jobs", tags=["stage5-export-jobs"])


@task_export_router.get(
    "/{taskId}/export-field-options",
    response_model=ExportFieldOptionsVO,
    response_model_by_alias=True,
)
def get_export_field_options(
    taskId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ExportFieldOptionsVO:
    return ExportService(db).get_field_options(task_id=taskId, user=user)


@task_export_router.get(
    "/{taskId}/export-jobs",
    response_model=PageVO[ExportJobVO],
    response_model_by_alias=True,
)
def list_export_jobs(
    taskId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ExportJobVO]:
    return ExportService(db).list_export_jobs(
        task_id=taskId,
        user=user,
        page=page,
        page_size=page_size,
    )


@task_export_router.post(
    "/{taskId}/export-jobs",
    response_model=ExportJobVO,
    response_model_by_alias=True,
    status_code=201,
)
def create_export_job(
    taskId: str,
    body: CreateExportJobRequest,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ExportJobVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return ExportService(db).create_export_job(
        task_id=taskId,
        user=user,
        body=body,
        request_id=request_id,
    )


@export_job_router.get("/{exportJobId}", response_model=ExportJobVO, response_model_by_alias=True)
def get_export_job(
    exportJobId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ExportJobVO:
    return ExportService(db).get_export_job(export_job_id=exportJobId, user=user)


@export_job_router.get("/{exportJobId}/download")
def download_export_job(
    exportJobId: str,
    request_id: str = Depends(get_request_id),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FileResponse:
    _job, file_object, path = ExportService(db).prepare_download(
        export_job_id=exportJobId,
        user=user,
        request_id=request_id,
    )
    return FileResponse(
        path,
        media_type=file_object.mime_type or "application/octet-stream",
        filename=file_object.file_name,
    )
