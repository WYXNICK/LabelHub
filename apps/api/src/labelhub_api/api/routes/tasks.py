from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.core.enums import TaskStatus
from labelhub_api.db.session import get_db_session
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
from labelhub_api.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["stage1-tasks"])


@router.get("", response_model=PageVO[TaskVO], response_model_by_alias=True)
def list_tasks(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: TaskStatus | None = None,
    keyword: str | None = Query(default=None, max_length=120),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[TaskVO]:
    return TaskService(db).list_tasks(
        user=user,
        page=page,
        page_size=page_size,
        status=status,
        keyword=keyword,
    )


@router.post("", response_model=TaskDetailVO, response_model_by_alias=True, status_code=201)
def create_task(
    request: Request,
    body: CreateTaskRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TaskDetailVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return TaskService(db).create_task(user=user, request=body, request_id=request_id)


@router.get("/{taskId}", response_model=TaskDetailVO, response_model_by_alias=True)
def get_task(
    taskId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TaskDetailVO:
    return TaskService(db).get_task(task_id=taskId, user=user)


@router.patch("/{taskId}", response_model=TaskDetailVO, response_model_by_alias=True)
def update_task(
    taskId: str,
    request: Request,
    body: UpdateTaskRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TaskDetailVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return TaskService(db).update_task(task_id=taskId, user=user, request=body, request_id=request_id)


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
    db: Session = Depends(get_db_session),
) -> TaskDetailVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return TaskService(db).transition_task_state(
        task_id=taskId,
        user=user,
        request=body,
        request_id=request_id,
    )


@router.get(
    "/{taskId}/publish-check",
    response_model=PublishCheckVO,
    response_model_by_alias=True,
)
def get_publish_check(
    taskId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PublishCheckVO:
    return TaskService(db).get_publish_check(task_id=taskId, user=user)
