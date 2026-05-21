# @labelhub/web

前端 Web 应用，后续承载：

- Owner 任务负责人后台
- Labeler 标注员工作台
- Reviewer 人工审核工作台

技术栈：React 18、TypeScript、Vite、Ant Design、Formily + Schema 渲染、@dnd-kit/core、Zustand。

阶段 0 已实现：

- 登录页与三类 demo 角色快速入口。
- HttpOnly Cookie Session 鉴权恢复。
- Owner、Labeler、Reviewer 三类角色应用壳。
- 无权限页。
- API Client 与阶段 0 VO/Request 类型。

运行：

```bash
pnpm install
pnpm dev:web
pnpm build:web
pnpm test:web
pnpm lint:web
pnpm typecheck:web
```
