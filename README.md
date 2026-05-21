# LabelHub 数据标注平台

LabelHub 是一个前后端分离的 AI 数据标注平台，目标覆盖「任务创建 -> 数据导入 -> 动态模板搭建 -> 标注员作答 -> AI 自动预审 -> 人工审核 -> 多格式导出」完整链路。

当前仓库已经初始化为 monorepo 骨架，后续开发在此基础上补齐前端、后端、Agent 与共享包实现。

## 目录结构

```text
LabelHub/
  apps/
    web/              # 前端 Web 应用：Owner 后台、Labeler 工作台、Reviewer 审核台
    api/              # 后端 API 服务：鉴权、任务、模板、数据集、审核、导出
    agent/            # AI 预审 Agent：消费队列、调用 LLM、写回结构化审核结果
  packages/
    shared/           # 共享领域类型、枚举、状态机、错误模型
    schema/           # 模板 schema、DTO schema、导入 schema、LLM 输出 schema
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
- `packages/shared` 与 `packages/schema` 作为前后端契约来源。

## 推荐开发环境

- Node.js 20 或更高版本
- pnpm 9 或更高版本
- MySQL 8
- Redis 7

如果本机没有 `pnpm`，可先安装或启用：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

## 当前命令

当前只是项目骨架，脚本会输出占位信息。后续接入真实框架后替换为 Vite、NestJS、worker 等启动命令。

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## 文档入口

- [需求分析文档](docs/01-需求分析文档.md)
- [Demo 范围文档](docs/02-Demo范围文档.md)
- [系统架构文档](docs/03-系统架构文档.md)
- [数据库设计文档](docs/04-数据库设计文档.md)
- [GitHub 提交指南](docs/05-GitHub提交指南.md)
