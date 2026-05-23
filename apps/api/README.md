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

阶段 0 可运行：

```bash
uv sync --extra dev
uv run pytest
uv run python -m labelhub_api
```

PowerShell:

```powershell
uv sync --extra dev
uv run pytest
uv run python -m labelhub_api
```

数据库迁移需要本地 MySQL 已启动，且 `DATABASE_URL` 指向可访问的库：

```bash
uv run alembic upgrade head
```

阶段 0 的运行时鉴权接口仍使用内存 demo 用户；`users` 表迁移用于提前固定数据库骨架，阶段 1 起任务、数据集、审核配置和审计日志会进入 MySQL 主链路。

接口：

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/openapi.json`

包管理规则：

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
