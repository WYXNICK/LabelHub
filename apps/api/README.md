# @labelhub/api

FastAPI 后端 API 服务，负责鉴权、任务、数据集、动态模板、标注提交、AI 预审、人工审核、数据验收、导出和审计日志。

## 技术栈

- Python
- FastAPI
- Pydantic v2
- SQLAlchemy 2
- Alembic
- MySQL
- uv

## 常用命令

所有命令均在 `apps/api` 目录运行：

```powershell
cd E:\my-try\LabelHub\apps\api
uv sync
uv run alembic upgrade head
uv run pytest
uv run python -m labelhub_api
```

## 主要接口

- 鉴权：`/api/auth/login`、`/api/auth/me`、`/api/auth/logout`
- 任务：`/api/tasks`
- 数据集：`/api/tasks/{taskId}/import-jobs`、`/api/datasets/{datasetId}/items`
- 模板：`/api/tasks/{taskId}/template-draft`、`/api/tasks/{taskId}/template-versions`
- 审核配置：`/api/tasks/{taskId}/review-config-draft`、`/api/tasks/{taskId}/review-config-versions`
- 标注：`/api/marketplace/tasks`、`/api/assignments/{assignmentId}`
- AI 预审：`/api/review-jobs`、`/api/internal/review-jobs:claim`
- 人工审核：`/api/reviews`、`/api/reviews/tasks`
- 导出：`/api/tasks/{taskId}/export-jobs`、`/api/export-jobs/{exportJobId}/download`
- 审计：`/api/audit-logs`

完整接口见 `docs/API文档.md`。

## 包管理规则

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
