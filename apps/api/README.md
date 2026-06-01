# @labelhub/api

Python 后端 API 服务，负责：

- 鉴权与角色权限
- 任务、模板、数据集、领取、提交、审核、导出
- 状态机、事务一致性、审计日志
- AI 预审入队与内部写回接口

技术基线：

- Python
- FastAPI
- Pydantic v2
- SQLAlchemy 2
- Alembic
- MySQL
- uv

队列实现尚未作为最终选型固定；确认前必须先更新后端 SDD。

常用命令均在 `apps/api` 目录运行：

```bash
cd E:/my-try/LabelHub/apps/api
uv sync --extra dev
uv run pytest
uv run python -m labelhub_api
```

PowerShell:

```powershell
cd E:\my-try\LabelHub\apps\api
uv sync --extra dev
uv run pytest
uv run python -m labelhub_api
```

数据库迁移需要本地 MySQL 已启动，且 `DATABASE_URL` 指向可访问的库：

```bash
cd E:/my-try/LabelHub/apps/api
uv run alembic upgrade head
```

当前鉴权接口仍使用内存 demo 用户；任务、数据集、导入、审核配置、发布检查、状态迁移和审计日志已进入阶段 1 MySQL 主链路。阶段 2.0 已新增模板草稿与模板版本表、OpenAPI 契约和路由占位；阶段 2.1 已实现模板草稿保存和 schema 校验；阶段 2.2 已补充最小 Renderer schema 校验覆盖。模板 Designer 和版本发布将在 2.3-2.7 继续实现。

接口：

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/openapi.json`
- `GET /api/tasks/{taskId}/publish-check`
- `GET/PUT /api/tasks/{taskId}/template-draft`
- `POST /api/template-schemas:validate`
- `POST/GET /api/tasks/{taskId}/template-versions`
- `GET /api/template-versions/{templateVersionId}`

包管理规则：

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
