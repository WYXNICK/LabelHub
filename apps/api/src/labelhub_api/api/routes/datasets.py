from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.datasets import (
    BatchUpdateDatasetItemsRequest,
    BatchUpdateDatasetItemsVO,
    CreateImportJobRequest,
    DatasetItemVO,
    DatasetVO,
    ImportErrorRowVO,
    ImportJobVO,
)
from labelhub_api.services.dataset_service import DatasetService

router = APIRouter(prefix="/api", tags=["datasets"])


@router.post(
    "/tasks/{taskId}/import-jobs",
    response_model=ImportJobVO,
    response_model_by_alias=True,
    status_code=201,
)
def create_import_job(
    taskId: str,
    request: Request,
    body: CreateImportJobRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ImportJobVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return DatasetService(db).create_import_job(
        task_id=taskId,
        user=user,
        request_id=request_id,
        request_dataset_name=body.dataset_name,
        request_dataset_type=body.dataset_type,
        request_source_format=body.source_format,
        file_object_id=body.file_object_id,
        idempotency_key=body.idempotency_key,
    )


@router.get(
    "/import-jobs/{importJobId}",
    response_model=ImportJobVO,
    response_model_by_alias=True,
)
def get_import_job(
    importJobId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ImportJobVO:
    return DatasetService(db).get_import_job(import_job_id=importJobId, user=user)


@router.get(
    "/import-jobs/{importJobId}/errors",
    response_model=PageVO[ImportErrorRowVO],
    response_model_by_alias=True,
)
def list_import_errors(
    importJobId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[ImportErrorRowVO]:
    return DatasetService(db).list_import_errors(
        import_job_id=importJobId,
        user=user,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/tasks/{taskId}/datasets",
    response_model=PageVO[DatasetVO],
    response_model_by_alias=True,
)
def list_task_datasets(
    taskId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[DatasetVO]:
    return DatasetService(db).list_task_datasets(
        task_id=taskId,
        user=user,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/datasets/{datasetId}/items",
    response_model=PageVO[DatasetItemVO],
    response_model_by_alias=True,
)
def list_dataset_items(
    datasetId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    keyword: str | None = Query(default=None, max_length=120),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[DatasetItemVO]:
    return DatasetService(db).list_dataset_items(
        dataset_id=datasetId,
        user=user,
        page=page,
        page_size=page_size,
        keyword=keyword,
    )


@router.patch(
    "/datasets/{datasetId}/items:batch",
    response_model=BatchUpdateDatasetItemsVO,
    response_model_by_alias=True,
)
def batch_update_dataset_items(
    datasetId: str,
    request: Request,
    body: BatchUpdateDatasetItemsRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BatchUpdateDatasetItemsVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return DatasetService(db).batch_update_dataset_items(
        dataset_id=datasetId,
        user=user,
        request_id=request_id,
        body=body,
    )
