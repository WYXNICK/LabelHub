# @labelhub/web

前端 Web 应用，后续承载：

- Owner 任务负责人后台
- Labeler 标注员工作台
- Reviewer 人工审核工作台

技术栈：React 18、TypeScript、Vite、Ant Design、Formily + Schema 渲染、@dnd-kit/core、Zustand。

当前已实现：

- 登录页与三类 demo 角色快速入口。
- HttpOnly Cookie Session 鉴权恢复。
- Owner、Labeler、Reviewer 三类角色应用壳。
- 无权限页。
- Owner 任务管理、任务设置、数据集导入、题目预览与批量编辑、审核配置、发布前检查抽屉。
- API Client 与阶段 1 VO/Request 类型。
- 阶段 2.0-2.2 模板 schema、模板草稿、模板版本的 TypeScript 类型、API 外壳、基础 schema 工具、Renderer 最小运行时和 Owner 预览页。

常用命令：

在仓库根目录运行：

```bash
cd E:/my-try/LabelHub
corepack pnpm install
corepack pnpm dev:web
corepack pnpm build:web
corepack pnpm test:web
corepack pnpm lint:web
corepack pnpm typecheck:web
```

在 `apps/web` 目录内也可以运行对应本地脚本：

```bash
cd E:/my-try/LabelHub/apps/web
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```
