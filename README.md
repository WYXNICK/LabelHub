# LabelHub 数据标注平台

LabelHub 是一个前后端分离的 AI 数据标注平台，目标覆盖「任务创建 -> 数据导入 -> 动态模板搭建 -> 标注员作答 -> AI 自动预审 -> 人工审核 -> 多格式导出」完整链路。

当前仓库已经初始化为 monorepo 骨架，后续开发在此基础上补齐前端、后端、Agent 与共享包实现。

## 目录结构

```text
LabelHub/
  apps/
    web/              # 前端 Web 应用：Owner 后台、Labeler 工作台、Reviewer 审核台
    api/              # Python 后端 API 服务：鉴权、任务、模板、数据集、审核、导出
    agent/            # Python AI 预审 Agent：消费队列、按 OpenAI API 格式调用 LLM、写回结构化审核结果
  packages/
    shared/           # 前端共享领域常量、枚举、状态机类型
    schema/           # 语言无关模板 schema、JSON Schema、OpenAPI 契约
    ui/               # 跨页面复用 UI 组件
    config/           # 共享工程配置
  infra/
    docker/           # 本地开发基础设施说明，后续放 docker compose
  docs/               # 需求、Demo 范围、架构、数据库设计文档
  demo_data/          # 课题提供的 Demo 数据
  submission/         # 答辩提交材料
```

## 应用边界

- `apps/web` 只负责前端页面和交互，不直接实现业务状态机。
- `apps/api` 是唯一业务写入口，负责权限、校验、事务、状态迁移和审计日志。
- `apps/agent` 作为后台 worker 运行，只能通过受控服务写入 AI 审核结果，不能绕过审核流。
- `packages/schema` 作为前后端契约来源；Python 后端通过 Pydantic/OpenAPI 暴露接口契约，前端按契约生成或维护 TypeScript 类型。

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
| LLM 接入 | OpenAI API 格式，具体模型暂未定 |

如果本机没有 `pnpm`，可先安装或启用：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

## 当前命令

当前只是项目骨架，脚本会输出占位信息。后续接入真实框架后替换为 React/Vite 前端、Python 后端服务和 Python Agent 启动命令。

```bash
# 前端
pnpm install
pnpm dev:web
pnpm build:web
pnpm test:web
pnpm lint:web
pnpm typecheck:web

# 后端 API
cd apps/api
uv run --python 3.11 python -m labelhub_api

# AI Agent
cd apps/agent
uv run --python 3.11 python -m labelhub_agent
```

后端与 Agent 的 Python 依赖必须分别在各自目录下通过 `uv` 管理，不使用 `pip install` 直接写入全局环境。

## 文档入口

- [需求分析文档](docs/需求分析文档.md)
- [Demo 范围文档](docs/Demo范围文档.md)
- [系统架构文档](docs/系统架构文档.md)
- [数据库设计文档](docs/数据库设计文档.md)
- [开发粒度与实施计划](docs/开发粒度与实施计划.md)
- [技术选型基线](docs/技术选型基线.md)
