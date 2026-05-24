from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from labelhub_api.api.deps import get_current_user
from labelhub_api.api.routes._stage1_contract import raise_contract_only
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

router = APIRouter(prefix="/api", tags=["stage1-datasets"])


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
) -> ImportJobVO:
    raise_contract_only(request, "数据导入任务创建")


@router.get(
    "/import-jobs/{importJobId}",
    response_model=ImportJobVO,
    response_model_by_alias=True,
)
def get_import_job(
    importJobId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
) -> ImportJobVO:
    raise_contract_only(request, "数据导入任务查询")


@router.get(
    "/import-jobs/{importJobId}/errors",
    response_model=PageVO[ImportErrorRowVO],
    response_model_by_alias=True,
)
def list_import_errors(
    importJobId: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
) -> PageVO[ImportErrorRowVO]:
    raise_contract_only(request, "导入错误行查询")


@router.get(
    "/tasks/{taskId}/datasets",
    response_model=PageVO[DatasetVO],
    response_model_by_alias=True,
)
def list_task_datasets(
    taskId: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
) -> PageVO[DatasetVO]:
    raise_contract_only(request, "任务数据集列表")


@router.get(
    "/datasets/{datasetId}/items",
    response_model=PageVO[DatasetItemVO],
    response_model_by_alias=True,
)
def list_dataset_items(
    datasetId: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    keyword: str | None = Query(default=None, max_length=120),
    user: UserVO = Depends(get_current_user),
) -> PageVO[DatasetItemVO]:
    raise_contract_only(request, "数据题目预览")


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
) -> BatchUpdateDatasetItemsVO:
    raise_contract_only(request, "数据题目批量编辑")
