# LabelHub 数据标注平台

LabelHub 是一个前后端分离的 AI 数据标注平台，目标覆盖「任务创建 -> 数据导入 -> 动态模板搭建 -> 标注员作答 -> AI 自动预审 -> 人工审核 -> 多格式导出」完整链路。

当前仓库已经初始化为 monorepo。阶段 0 工程底座、阶段 1 Owner 任务/数据/审核配置/发布前检查底座、阶段 2 动态模板搭建与版本发布，以及阶段 3 Labeler 任务广场、领取、作答、草稿、提交、我的贡献、返修入口和题目级 LLM 辅助已落地；任务创建、数据导入、模板草稿/版本、assignment、submission 和 llm_action_runs 均已接入 MySQL。AI 自动预审队列、Reviewer 人工审核流转和多格式导出仍属于后续阶段。

## 目录结构

```text
LabelHub/
  apps/
    web/              # 前端 Web 应用：Owner 后台、Labeler 工作台、Reviewer 审核台
    api/              # Python 后端 API 服务：鉴权、任务、模板、数据集、审核、导出
    agent/            # Python AI 预审 Agent：后续消费队列、按 OpenAI API 格式调用 LLM、写回结构化审核结果
  packages/
    shared/           # 前端共享领域常量、枚举、状态机类型
    schema/           # 规划承载语言无关模板 schema、JSON Schema、OpenAPI 契约
    ui/               # 跨页面复用 UI 组件
    config/           # 共享工程配置
  infra/
    docker/           # 本地开发基础设施与 docker compose
  docs/               # 需求、Demo 范围、架构、数据库设计文档
  demo_data/          # 课题提供的 Demo 数据
  submission/         # 答辩提交材料
```

## 应用边界

- `apps/web` 只负责前端页面和交互，不直接实现业务状态机。
- `apps/api` 是唯一业务写入口，负责权限、校验、事务、状态迁移和审计日志。
- `apps/agent` 作为后台 worker 运行，只能通过受控服务写入 AI 审核结果，不能绕过审核流。
- `packages/schema` 规划作为前后端共享契约来源；当前阶段 Python 后端通过 Pydantic/OpenAPI 暴露接口契约，前端按契约维护 TypeScript 类型。

## 推荐开发环境

- Node.js 20 或更高版本
- pnpm 9 或更高版本
- Python 3.11 或更高版本
- uv
- MySQL 8
- Redis 7

## 技术选型基线

| 层 | 已确定选型 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| UI 组件库 | Ant Design |
| 表单内核 | Formily + Schema 渲染 |
| 拖拽 | @dnd-kit/core |
| 状态管理 | Zustand |
| 后端 | Python |
| 数据库 | MySQL |
| LLM 接入 | OpenAI API 格式；Agent 当前默认 `BASE_URL=https://token-plan-cn.xiaomimimo.com/v1`、`MODEL_NAME=mimo-v2.5-pro`、thinking 关闭 |

如果本机没有 `pnpm`，可先安装或启用：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

## 启动与常用命令

### 1. 首次准备

```bash
# 查看仓库声明的 pnpm 版本是否可用；本项目通过 Corepack 固定 pnpm
corepack pnpm --version

# 安装前端 monorepo 依赖；首次拉取项目或 package.json / pnpm-lock.yaml 变化后运行
corepack pnpm install
```

后端与 Agent 的 Python 依赖必须分别在各自目录下通过 `uv` 管理，不使用 `pip install` 直接写入全局环境。

### 2. 前端命令

以下命令均在仓库根目录运行：

| 命令 | 什么时候运行 | 说明 |
| --- | --- | --- |
| `corepack pnpm dev:web` | 日常前端开发 | 启动 Vite 开发服务器，默认访问 `http://localhost:5173` |
| `corepack pnpm build:web` | 提交前或验证生产构建 | 执行 TypeScript 构建检查并生成前端生产产物 |
| `corepack pnpm test:web` | 修改前端逻辑后 | 运行 Vitest 单元测试 |
| `corepack pnpm lint:web` | 修改前端代码后、提交前 | 运行 ESLint，检查代码规范和潜在问题 |
| `corepack pnpm typecheck:web` | 修改类型、接口契约或组件 props 后 | 只运行 TypeScript 类型检查，不生成产物 |
| `corepack pnpm format` | 需要统一格式时 | 对 workspace 内配置支持的文件执行格式化 |

前端登录页需要后端 API 提供 `POST /api/auth/login` 和 `GET /api/auth/me`，因此完整体验建议同时启动后端。

### 2.1 前端真实浏览器验收

完成前端页面或核心交互后，除 `typecheck/lint/test/build` 外，还必须使用 Chrome DevTools MCP 做真实浏览器验收。阶段 1 起数据库链路必须连接 MySQL，不使用 SQLite 代替。

本地验收建议：

```bash
# 终端 1：在仓库根目录启动 MySQL / Redis
cd E:/my-try/LabelHub
docker compose -f infra/docker/compose.yaml up -d

# 终端 2：进入后端目录，确认 DATABASE_URL 指向 MySQL 后执行迁移并启动 API
cd apps/api
uv run alembic upgrade head
uv run python -m labelhub_api

# 终端 3：回到仓库根目录启动前端
cd E:/my-try/LabelHub
corepack pnpm dev:web
```

如需使用临时端口，确保前端访问 host、`VITE_API_BASE_URL`、后端 `API_CORS_ORIGINS` 使用同一 host，例如统一使用 `localhost`，避免 Cookie Session 在 `127.0.0.1` 与 `localhost` 混用时丢失。

Chrome DevTools MCP 检查项：

- `1280×800` 与 `1920×1080` 两个视口。
- 页面首屏、主要表单/表格、按钮交互、loading/empty/error 状态。
- Console 无非预期 error/issue。
- Network 中核心接口状态码和响应结构符合 SDD/OpenAPI；业务预期错误如 `409 PUBLISH_BLOCKED` 必须在页面清晰展示。
- 涉及写入时，通过 Network 或数据库确认数据进入 MySQL。

### 3. 后端 API 命令

以下命令在 `apps/api` 目录运行：

```bash
# 安装/同步后端依赖；首次进入后端或 pyproject.toml / uv.lock 变化后运行
uv sync --extra dev

# 运行后端测试；修改 API、Schema、鉴权、错误结构后运行
uv run pytest

# 启动后端开发服务；默认监听 http://localhost:8000
uv run python -m labelhub_api
```

数据库迁移命令只在需要初始化或更新 MySQL 表结构时运行：

```bash
# 需要 MySQL 已启动，并且 DATABASE_URL 指向可访问的库
uv run alembic upgrade head
```

题目级 LLM 辅助使用 OpenAI Chat Completions 兼容格式。后端进程启动前需确认仓库根目录 `.env` 至少包含：

```bash
# 以下为示例；真实 OPENAI_API_KEY 只放本地 .env，不提交到 Git
OPENAI_API_KEY=your-local-key
BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MODEL_NAME=mimo-v2.5-pro
OPENAI_TIMEOUT_SECONDS=90
OPENAI_THINKING_ENABLED=false
```

说明：

- `OPENAI_TIMEOUT_SECONDS` 默认 90 秒；如果模型冷启动或响应较慢，可在本地 `.env` 调大，但后端当前限制不超过 300 秒。
- 当前 MiMo Provider 在 `OPENAI_THINKING_ENABLED=false` 时，后端会自动补充 `chat_template_kwargs.enable_thinking=false`；其它 OpenAI 兼容 Provider 不会被强行注入该扩展字段。
- 修改 `.env` 后必须重启 `uv run python -m labelhub_api`，运行中的后端进程不会自动重新读取 LLM 配置。

### 4. AI Agent 命令

以下命令在 `apps/agent` 目录运行：

```bash
# 安装/同步 Agent 依赖；首次进入 Agent 或 pyproject.toml / uv.lock 变化后运行
uv sync --extra dev

# 运行 Agent 契约测试；修改结构化输出 DTO 或配置读取后运行
uv run pytest

# 启动 Agent 当前阶段的健康输出；阶段 0 只校验配置读取，不消费真实队列
uv run python -m labelhub_agent
```

### 5. 本地 MySQL / Redis

```bash
# 以下命令在仓库根目录运行：启动本地 MySQL 和 Redis
docker compose -f infra/docker/compose.yaml up -d

# 以下命令在仓库根目录运行：停止本地 MySQL 和 Redis
docker compose -f infra/docker/compose.yaml down
```

如果只体验登录、健康检查和 OpenAPI，可以暂不启动 MySQL；从阶段 1 的任务、数据集、审核配置和发布前检查开始，必须启动 MySQL 并完成 Alembic 迁移。

## 当前 MySQL 使用状态

MySQL 已经作为项目确定数据库，并且阶段 1 主链路已经开始使用 MySQL：

- `.env.example` 中的 `DATABASE_URL=mysql+pymysql://labelhub:labelhub@localhost:3306/labelhub`。
- `infra/docker/compose.yaml` 中的 MySQL 8 本地容器。
- `apps/api/migrations/` 中的 Alembic 迁移骨架。
- 首个迁移 `0001_create_users.py`，用于创建 `users` 表和 demo 用户记录。
- 阶段 1 迁移 `0002_create_stage1_foundation.py`，用于任务、数据集、导入、审核配置、状态迁移和审计表。
- 阶段 2 迁移 `0003_create_template_tables.py`，用于模板草稿和模板版本表。
- 阶段 3 迁移 `0004_create_labeler_foundation.py`，用于 assignment、submission 和题目级 LLM 调用记录。

当前 `GET /api/health`、`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout` 仍使用内存 demo 用户和 Cookie Session；除此之外，阶段 1-3 的任务创建、数据导入、题目批量编辑、审核配置版本、发布前检查、模板草稿/版本、Labeler 领取、草稿、提交、贡献统计和题目级 LLM 辅助都依赖 MySQL 数据。模板版本发布成功后会更新 `tasks.current_template_version_id`，发布检查不再返回 `MISSING_TEMPLATE_VERSION`，但缺少数据集或审核配置时仍会继续阻塞发布。阶段 4 将继续在 MySQL 中新增 AI review job、AI 预审结果、人工审核记录和审核审计链路。

## 阶段 0 Demo 账号

统一密码：`labelhub123`

| 角色 | 邮箱 |
| --- | --- |
| Owner | `owner@labelhub.dev` |
| Labeler | `labeler@labelhub.dev` |
| Reviewer | `reviewer@labelhub.dev` |

## uv 缓存目录说明

仓库根目录中的 `.uv-cache/` 与 `uvcache/` 都属于 uv 包缓存目录，已被 `.gitignore` 忽略。

- `uvcache/` 当前包含 `archive-v0`、`wheels-v6`、`simple-v21` 等 uv 标准缓存结构，通常来自曾经设置 `UV_CACHE_DIR=uvcache` 或执行过 `uv --cache-dir uvcache ...`。
- `.uv-cache/` 当前为空或仅包含缓存标签，通常来自另一次本地缓存目录尝试。
- 当前 shell 环境没有 `UV_CACHE_DIR`，uv 默认会使用用户目录缓存；若遇到 Windows 权限问题，可临时指定到可写目录，例如 `D:\tmp\labelhub-uv-cache`。
- 这两个目录不是源代码，不需要提交。

## 文档入口

- [需求分析文档](docs/需求分析文档.md)
- [Demo 范围文档](docs/Demo范围文档.md)
- [系统架构文档](docs/系统架构文档.md)
- [数据库设计文档](docs/数据库设计文档.md)
- [开发粒度与实施计划](docs/开发粒度与实施计划.md)
- [技术选型基线](docs/技术选型基线.md)
