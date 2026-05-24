from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from labelhub_api.api.deps import get_current_user
from labelhub_api.api.routes._stage1_contract import raise_contract_only
from labelhub_api.core.enums import TaskStatus
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.tasks import (
    CreateTaskRequest,
    PublishCheckVO,
    TaskDetailVO,
    TaskStateTransitionRequest,
    TaskVO,
    UpdateTaskRequest,
)

router = APIRouter(prefix="/api/tasks", tags=["stage1-tasks"])


@router.get("", response_model=PageVO[TaskVO], response_model_by_alias=True)
def list_tasks(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: TaskStatus | None = None,
    keyword: str | None = Query(default=None, max_length=120),
    user: UserVO = Depends(get_current_user),
) -> PageVO[TaskVO]:
    raise_contract_only(request, "任务列表")


@router.post("", response_model=TaskDetailVO, response_model_by_alias=True, status_code=201)
def create_task(
    request: Request,
    body: CreateTaskRequest,
    user: UserVO = Depends(get_current_user),
) -> TaskDetailVO:
    raise_contract_only(request, "任务创建")


@router.get("/{taskId}", response_model=TaskDetailVO, response_model_by_alias=True)
def get_task(
    taskId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
) -> TaskDetailVO:
    raise_contract_only(request, "任务详情")


@router.patch("/{taskId}", response_model=TaskDetailVO, response_model_by_alias=True)
def update_task(
    taskId: str,
    request: Request,
    body: UpdateTaskRequest,
    user: UserVO = Depends(get_current_user),
) -> TaskDetailVO:
    raise_contract_only(request, "任务更新")


@router.post(
    "/{taskId}/state-transitions",
    response_model=TaskDetailVO,
    response_model_by_alias=True,
)
def transition_task_state(
    taskId: str,
    request: Request,
    body: TaskStateTransitionRequest,
    user: UserVO = Depends(get_current_user),
) -> TaskDetailVO:
    raise_contract_only(request, "任务状态迁移")


@router.get(
    "/{taskId}/publish-check",
    response_model=PublishCheckVO,
    response_model_by_alias=True,
)
def get_publish_check(
    taskId: str,
    request: Request,
    user: UserVO = Depends(get_current_user),
) -> PublishCheckVO:
    raise_contract_only(request, "发布前检查")
