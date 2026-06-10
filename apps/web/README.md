# @labelhub/web

React 前端应用，提供 Owner、Labeler、Reviewer 三类角色工作台。

## 技术栈

React 18、TypeScript、Vite、Ant Design、Formily + Schema 渲染、@dnd-kit/core、Zustand。

## 页面能力

- 登录页与三类 Demo 账号入口。
- Owner：任务管理、数据导入、模板搭建、审核配置、数据验收、导出中心。
- Labeler：任务广场、标注工作台、我的贡献、返修修改。
- Reviewer：AI 预审队列、人工审核任务列表、任务内审核工作台、审核详情、审核结果。
- 动态模板 Designer / Renderer 共用同一份 `TemplateSchemaVO`。

## 常用命令

在仓库根目录运行：

```powershell
cd E:\my-try\LabelHub
pnpm install
pnpm --filter @labelhub/web dev
pnpm --filter @labelhub/web build
pnpm --filter @labelhub/web test
pnpm --filter @labelhub/web test:unit
pnpm --filter @labelhub/web test:integration
```

在 `apps/web` 目录内也可以运行对应本地脚本：

```powershell
cd E:\my-try\LabelHub\apps\web
pnpm dev
pnpm build
pnpm test
pnpm typecheck
```
