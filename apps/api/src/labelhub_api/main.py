from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from labelhub_api import __version__
from labelhub_api.api.routes import assignments, audit, auth, datasets, files, health, review_configs, tasks, templates
from labelhub_api.core.config import get_settings
from labelhub_api.core.errors import (
    ApiException,
    api_exception_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from labelhub_api.core.middleware import request_id_middleware


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="LabelHub API",
        version=__version__,
        description="LabelHub 数据标注平台后端 API。",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(request_id_middleware)
    app.add_exception_handler(ApiException, api_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(files.router)
    app.include_router(tasks.router)
    app.include_router(assignments.marketplace_router)
    app.include_router(assignments.task_assignment_router)
    app.include_router(assignments.assignment_router)
    app.include_router(assignments.me_router)
    app.include_router(datasets.router)
    app.include_router(review_configs.router)
    app.include_router(templates.task_router)
    app.include_router(templates.schema_router)
    app.include_router(audit.router)
    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "labelhub_api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
