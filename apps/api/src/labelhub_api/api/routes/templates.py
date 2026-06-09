from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from labelhub_api.api.deps import get_current_user
from labelhub_api.db.session import get_db_session
from labelhub_api.schemas.auth import UserVO
from labelhub_api.schemas.common import PageVO
from labelhub_api.schemas.templates import (
    PublishTemplateVersionRequest,
    SaveTemplateDraftRequest,
    TemplateDraftVO,
    TemplateSchemaValidationVO,
    TemplateVersionVO,
    ValidateTemplateSchemaRequest,
)
from labelhub_api.services.template_service import TemplateService

task_router = APIRouter(prefix="/api/tasks/{taskId}", tags=["templates"])
schema_router = APIRouter(prefix="/api", tags=["templates"])


@task_router.get(
    "/template-draft",
    response_model=TemplateDraftVO,
    response_model_by_alias=True,
)
def get_template_draft(
    taskId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TemplateDraftVO:
    return TemplateService(db).get_draft(task_id=taskId, user=user)


@task_router.put(
    "/template-draft",
    response_model=TemplateDraftVO,
    response_model_by_alias=True,
)
def save_template_draft(
    taskId: str,
    body: SaveTemplateDraftRequest,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TemplateDraftVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return TemplateService(db).save_draft(task_id=taskId, user=user, request_id=request_id, body=body)


@schema_router.post(
    "/template-schemas:validate",
    response_model=TemplateSchemaValidationVO,
    response_model_by_alias=True,
)
def validate_template_schema(
    body: ValidateTemplateSchemaRequest,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TemplateSchemaValidationVO:
    return TemplateService(db).validate_schema(body=body, user=user)


@task_router.post(
    "/template-versions",
    response_model=TemplateVersionVO,
    response_model_by_alias=True,
    status_code=201,
)
def publish_template_version(
    taskId: str,
    body: PublishTemplateVersionRequest,
    request: Request,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TemplateVersionVO:
    request_id = str(getattr(request.state, "request_id", "req_unknown"))
    return TemplateService(db).publish_version(task_id=taskId, user=user, request_id=request_id, body=body)


@task_router.get(
    "/template-versions",
    response_model=PageVO[TemplateVersionVO],
    response_model_by_alias=True,
)
def list_template_versions(
    taskId: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> PageVO[TemplateVersionVO]:
    return TemplateService(db).list_versions(task_id=taskId, user=user, page=page, page_size=page_size)


@schema_router.get(
    "/template-versions/{templateVersionId}",
    response_model=TemplateVersionVO,
    response_model_by_alias=True,
)
def get_template_version(
    templateVersionId: str,
    user: UserVO = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> TemplateVersionVO:
    return TemplateService(db).get_version(template_version_id=templateVersionId, user=user)
