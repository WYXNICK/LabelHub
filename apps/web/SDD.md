# LabelHub 前端 SDD 文档

## 1. 文档定位

本文档是 `apps/web` 的前端 SDD 基线，用于约束后续 React 18 + TypeScript 开发。正式开发前，前端 SDD 必须与 `apps/api/SDD.md` 中的后端接口契约逐字段对齐。

当前文档不代表已经进入正式开发阶段；它定义后续开发必须遵守的协作流程和接口映射规则。

## 2. 技术基线

- 前端框架：React 18
- 语言：TypeScript
- 构建工具：Vite
- UI 组件库：Ant Design
- 表单内核：Formily + Schema 渲染
- 拖拽：@dnd-kit/core
- 状态管理：Zustand
- API 协议：REST + OpenAPI/JSON Schema

## 3. SDD 驱动流程

后续每个完整功能必须按以下顺序推进：

1. 明确业务场景和页面范围。
2. 更新前端 SDD 的页面、VO、交互状态、接口调用清单。
3. 更新后端 SDD 的 Request、DTO、BO、Entity、VO 和接口定义。
4. 对齐接口契约，确保字段名、字段类型、必填性、枚举值、分页结构、错误结构一致。
5. 对齐完成后，才能并行生成前端页面和后端接口。
6. 前端实现必须只依赖已对齐的 API Contract，不临时猜字段。
7. 如开发中发现契约变化，必须先回到 SDD 更新并重新对齐，再继续编码。

## 4. 前端 VO 命名规则

VO 是后端返回给前端的数据结构在前端侧的展示模型。前端 VO 字段名必须与后端返回 JSON 字段名一一对应，不允许擅自改名。

命名规则：

- 文件：`src/features/<domain>/types.ts`
- 类型：`<Domain>VO`
- 请求参数：`<Action>Request`
- 表单值：`<Domain>FormValues`
- 枚举值：使用后端返回的 UPPER_SNAKE 字符串，不在前端重新编码。

示例：

```ts
export interface TaskVO {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ENDED";
  quota: number;
  claimedCount: number;
  deadlineAt: string | null;
}
```

## 5. 接口调用约定

前端 API Client 必须满足：

- 每个后端接口只封装一次。
- 请求对象字段名与后端 Request 字段一致。
- 响应 VO 字段名与后端 VO 字段一致。
- 列表接口统一读取 `data` 和 `pagination`。
- 错误统一读取 `error.code`、`error.message`、`error.details`、`error.requestId`。

通用分页响应：

```ts
export interface PageVO<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
```

通用错误响应：

```ts
export interface ApiErrorVO {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
```

## 6. 当前首批契约占位

正式开发前，以下契约必须与后端 SDD 完整展开：

| 页面/模块 | 前端 VO | 后端接口 | 状态 |
| --- | --- | --- | --- |
| 任务列表 | `TaskVO` | `GET /api/tasks` | 待细化 |
| 任务详情 | `TaskDetailVO` | `GET /api/tasks/{taskId}` | 待细化 |
| 数据导入 | `ImportJobVO` | `POST /api/tasks/{taskId}/import-jobs` | 待细化 |
| 模板版本 | `TemplateVersionVO` | `POST /api/tasks/{taskId}/template-versions` | 待细化 |
| 标注领取 | `AssignmentVO` | `POST /api/tasks/{taskId}/assignments` | 待细化 |
| 标注提交 | `SubmissionVO` | `POST /api/assignments/{assignmentId}/submissions` | 待细化 |
| 审核详情 | `ReviewVO` | `GET /api/reviews/{reviewId}` | 待细化 |
| 导出任务 | `ExportJobVO` | `POST /api/tasks/{taskId}/export-jobs` | 待细化 |

## 7. 前后端字段映射检查清单

每次开发前必须检查：

- 前端 VO 字段名是否与后端响应 JSON 字段名一致。
- 前端 Request 字段名是否与后端 Request Object 字段名一致。
- 枚举值是否完全一致。
- 时间字段是否统一为 ISO 8601 字符串。
- ID 字段是否统一为 string。
- 分页结构是否统一为 `data + pagination`。
- 错误结构是否统一为 `error` 包裹。
- 动态模板 schema 是否由后端保存、前端渲染，不出现前端私有字段。

## 8. 未确认事项

正式开发前需要确认：

- 鉴权使用 Cookie Session 还是 Bearer Token。
- 前端类型是否通过 OpenAPI 自动生成。
- 动态模板 schema 是否单独发布为语言无关 JSON Schema。
