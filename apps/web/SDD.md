# LabelHub 前端 SDD 文档

## 1. 文档定位

本文档是 `apps/web` 的前端 SDD 基线，用于约束后续 React 18 + TypeScript 开发。正式开发前，前端 SDD 必须与 `apps/api/SDD.md` 中的后端接口契约逐字段对齐。

当前文档已经进入阶段 0 实现基线；阶段 0 先落地登录页、角色入口、受保护布局、无权限页、API Client、通用 VO 和鉴权状态。后续阶段如需变更公共契约，必须先更新本文档与 `apps/api/SDD.md`。

## 2. 技术基线

- 前端框架：React 18
- 语言：TypeScript
- 构建工具：Vite
- UI 组件库：Ant Design
- 表单内核：Formily + Schema 渲染
- 拖拽：@dnd-kit/core
- 状态管理：Zustand
- API 协议：REST + OpenAPI/JSON Schema
- 鉴权：HttpOnly Cookie Session，前端请求统一携带 `credentials: "include"`

## 3. SDD 驱动流程

后续每个完整功能必须按以下顺序推进：

1. 明确业务场景和页面范围。
2. 更新前端 SDD 的页面、VO、交互状态、接口调用清单。
3. 更新后端 SDD 的 Request、DTO、BO、Entity、VO 和接口定义。
4. 对齐接口契约，确保字段名、字段类型、必填性、枚举值、分页结构、错误结构一致。
5. 对齐完成后，才能并行生成前端页面和后端接口。
6. 前端实现必须只依赖已对齐的 API Contract，不临时猜字段。
7. 如开发中发现契约变化，必须先回到 SDD 更新并重新对齐，再继续编码。
8. 每次完成前端页面或核心交互实现后，必须使用本机浏览器进行真实运行验收，至少覆盖 `1280×800` 与 `1920×1080` 两个官方要求视口下的页面截图、基础交互、控制台错误、主要断点布局和视觉完整性；发现样式或交互问题应先修复再进入交付总结。

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
- 不在 localStorage/sessionStorage 保存登录 Token。
- `VITE_API_BASE_URL` 仅配置后端地址，不包含 `/api` 前缀。

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

## 6. 阶段 0 已对齐页面与交互

| 页面/模块 | 路由 | 阶段 0 行为 |
| --- | --- | --- |
| 登录页 | `/login` | 邮箱密码登录；提供 Owner、Labeler、Reviewer 三类 demo 快速入口 |
| 角色首页 | `/owner/*`、`/labeler/*`、`/reviewer/*` | 登录后按用户角色进入对应应用壳；展示阶段 0 契约与后续模块入口 |
| 无权限页 | 任意非当前角色路径 | 展示当前角色与目标路径，提供回到角色首页入口 |
| 鉴权加载态 | 全局 | 启动时调用 `GET /api/auth/me` 恢复会话 |
| 退出登录 | 全局 Header | 调用 `POST /api/auth/logout` 并回到登录页 |

## 7. 阶段 0 已对齐 VO 与 Request

```ts
export type UserRole = "OWNER" | "LABELER" | "REVIEWER" | "SYSTEM";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface HealthVO {
  status: string;
  service: string;
  version: string;
  environment: string;
  serverTime: string;
}

export interface UserVO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionVO {
  expiresAt: string;
}

export interface LoginResponseVO {
  user: UserVO;
  session: AuthSessionVO;
}

export interface LogoutResponseVO {
  success: boolean;
}
```

字段映射结果：

| 前端字段 | 后端字段 | 说明 |
| --- | --- | --- |
| `createdAt` | `createdAt` | 后端 Pydantic alias 从 `created_at` 映射 |
| `expiresAt` | `expiresAt` | 后端 Pydantic alias 从 `expires_at` 映射 |
| `serverTime` | `serverTime` | 后端 Pydantic alias 从 `server_time` 映射 |
| `role` | `role` | 枚举值完全一致，使用 UPPER_SNAKE |

## 8. 阶段 0 已对齐接口调用

| 前端封装 | HTTP 接口 | Request | VO |
| --- | --- | --- | --- |
| `getHealth` | `GET /api/health` | 无 | `HealthVO` |
| `login` | `POST /api/auth/login` | `LoginRequest` | `LoginResponseVO` |
| `getCurrentUser` | `GET /api/auth/me` | Cookie Session | `UserVO` |
| `logout` | `POST /api/auth/logout` | 无 | `LogoutResponseVO` |
| `openapi` | `GET /api/openapi.json` | 无 | OpenAPI JSON |

## 9. 后续首批业务契约占位

正式开发前，以下契约必须与后端 SDD 完整展开。阶段 1 的目标是任务、数据集、审核配置和发布前检查底座；真正可领取发布必须等阶段 2 模板版本完成后再放开。

| 阶段 | 页面/模块 | 前端 VO / Request | 后端接口 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 任务列表 | `TaskVO`、`ListTasksRequest` | `GET /api/tasks` | 待细化 |
| 1 | 任务创建/编辑 | `TaskDetailVO`、`CreateTaskRequest`、`UpdateTaskRequest` | `POST /api/tasks`、`PATCH /api/tasks/{taskId}` | 待细化 |
| 1 | 任务状态迁移 | `TaskStateTransitionRequest`、`TaskDetailVO` | `POST /api/tasks/{taskId}/state-transitions` | 待细化 |
| 1 | 数据集与导入 | `DatasetVO`、`DatasetItemVO`、`ImportJobVO`、`ImportErrorRowVO` | `POST /api/tasks/{taskId}/import-jobs`、`GET /api/import-jobs/{importJobId}`、`GET /api/import-jobs/{importJobId}/errors` | 待细化 |
| 1 | 题目预览与批量编辑 | `DatasetItemVO`、`BatchUpdateDatasetItemsRequest` | `GET /api/datasets/{datasetId}/items`、`PATCH /api/datasets/{datasetId}/items:batch` | 阶段 1.3 已实现 |
| 1 | 审核配置 | `ReviewConfigDraftVO`、`ReviewConfigVersionVO`、`ReviewDimensionDTO`、`ReviewThresholdDTO` | `GET/PUT /api/tasks/{taskId}/review-config-draft`、`POST/GET /api/tasks/{taskId}/review-config-versions` | 待细化 |
| 1 | 发布前检查 | `PublishCheckVO`、`PublishBlockerVO` | `GET /api/tasks/{taskId}/publish-check` | 待细化 |
| 1 | 任务审计 | `AuditLogVO` | `GET /api/audit-logs?entityType=TASK&entityId={taskId}` | 待细化 |
| 2 | 模板版本 | `TemplateVersionVO`、`TemplateSchemaVO` | `POST /api/tasks/{taskId}/template-versions` | 待细化 |
| 3 | 标注领取 | `AssignmentVO` | `POST /api/tasks/{taskId}/assignments` | 待细化 |
| 3 | 标注提交 | `SubmissionVO` | `POST /api/assignments/{assignmentId}/submissions` | 待细化 |
| 4 | 审核详情 | `ReviewVO` | `GET /api/reviews/{reviewId}` | 待细化 |
| 5 | 导出任务 | `ExportJobVO` | `POST /api/tasks/{taskId}/export-jobs` | 待细化 |

### 9.1 阶段 1.0 已对齐前端契约

阶段 1.0 先建立 Owner 任务、数据集、导入、审核配置、发布检查与审计的前端类型和 API 调用外壳。业务页面在 1.1-1.5 分粒度实现；当前前端只依赖这些已对齐类型，不自行猜测后端字段。

阶段 1.0 枚举：

```ts
export type TaskStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "ENDED";
export type DistributionStrategy = "FIRST_COME_FIRST_SERVED" | "ASSIGNED" | "QUOTA_GRAB";
export type DatasetType = "QA_QUALITY" | "PREFERENCE_COMPARE" | "CUSTOM";
export type DatasetSourceFormat = "JSON" | "JSONL" | "EXCEL" | "MIXED";
export type DatasetStatus = "IMPORTING" | "READY" | "FAILED";
export type DatasetItemStatus = "AVAILABLE" | "CLAIMED" | "DISABLED";
export type ImportStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ReviewConfigVersionStatus = "ACTIVE" | "DISABLED";
export type PublishBlockerCode =
  | "MISSING_REQUIRED_FIELDS"
  | "MISSING_DATASET"
  | "MISSING_TEMPLATE_VERSION"
  | "MISSING_REVIEW_CONFIG"
  | "INVALID_QUOTA"
  | "INVALID_DEADLINE";
```

阶段 1.0 前后端字段映射：

| 前端 VO / Request | 字段 |
| --- | --- |
| `TaskVO` | `id`、`title`、`description`、`tags`、`quota`、`claimedCount`、`submittedCount`、`approvedCount`、`deadlineAt`、`distributionStrategy`、`status`、`createdBy`、`createdAt`、`updatedAt` |
| `TaskDetailVO` | `TaskVO` 全量字段 + `instructionRichText`、`rewardRule`、`currentTemplateVersionId`、`currentReviewConfigVersionId`、`version`、`stats` |
| `CreateTaskRequest` | `title`、`description`、`instructionRichText`、`tags`、`rewardRule`、`quota`、`deadlineAt`、`distributionStrategy` |
| `UpdateTaskRequest` | `title`、`description`、`instructionRichText`、`tags`、`rewardRule`、`quota`、`deadlineAt`、`distributionStrategy`、`version` |
| `TaskStateTransitionRequest` | `targetStatus`、`reason`、`version` |
| `FileObjectVO` | `id`、`bucket`、`objectKey`、`fileName`、`mimeType`、`sizeBytes`、`checksum`、`purpose`、`createdBy`、`createdAt` |
| `DatasetVO` | `id`、`taskId`、`name`、`datasetType`、`sourceFormat`、`itemCount`、`enabledItemCount`、`disabledItemCount`、`status`、`createdBy`、`createdAt`、`updatedAt` |
| `DatasetItemVO` | `id`、`datasetId`、`taskId`、`externalItemId`、`sourceFormat`、`sourceRowNumber`、`payload`、`mediaRefs`、`checksum`、`status`、`tags`、`createdAt`、`updatedAt` |
| `CreateImportJobRequest` | `datasetName`、`datasetType`、`sourceFormat`、`fileObjectId`、`idempotencyKey` |
| `ImportJobVO` | `id`、`taskId`、`datasetId`、`fileObjectId`、`sourceFormat`、`status`、`successCount`、`failedCount`、`errorSummary`、`createdBy`、`createdAt`、`updatedAt` |
| `ImportErrorRowVO` | `id`、`importJobId`、`taskId`、`datasetId`、`sourceRowNumber`、`fieldPath`、`errorCode`、`errorMessage`、`rawFragment`、`createdAt` |
| `BatchUpdateDatasetItemsRequest` | `itemIds`、`enabled`、`tags`、`reason`、`expectedVersion` |
| `ReviewConfigDraftVO` | `id`、`taskId`、`promptTemplate`、`dimensions`、`thresholds`、`outputSchema`、`updatedBy`、`createdAt`、`updatedAt` |
| `ReviewConfigVersionVO` | `id`、`taskId`、`versionNo`、`promptTemplate`、`dimensions`、`thresholds`、`outputSchema`、`status`、`publishedBy`、`publishedAt`、`createdAt`、`updatedAt` |
| `PublishCheckVO` | `taskId`、`canPublish`、`blockers`、`checkedAt` |
| `AuditLogVO` | `id`、`entityType`、`entityId`、`actorId`、`actorRole`、`action`、`fromState`、`toState`、`reason`、`metadata`、`requestId`、`createdAt` |

阶段 1.0 前端文件落点：`src/features/tasks`、`src/features/datasets`、`src/features/review-config`、`src/features/audit`、`src/features/files`。这些文件只做类型和 API 封装，页面开发从 1.1 开始。

### 9.2 阶段 1.1 Owner 任务页面

阶段 1.1 将 Owner 任务管理页推进为可操作页面，覆盖任务 CRUD、状态迁移入口和审计提示。

页面范围：

| 页面 | 路由 | 行为 |
| --- | --- | --- |
| 任务列表 | `/owner/tasks` | 搜索、状态筛选、分页、任务状态标签、数据量摘要、创建入口、编辑入口、发布/暂停/恢复/结束入口 |
| 任务创建 | `/owner/tasks/new` | 创建 `DRAFT` 任务，字段包含标题、描述、富文本说明、标签、奖励规则、截止时间、配额和分发策略 |
| 任务设置 | `/owner/tasks/:taskId/settings` | 加载任务详情，只允许编辑 `DRAFT` 任务；提交时携带 `version` 做乐观锁 |

交互规则：

- 状态迁移由后端决定最终结果；前端只发起 `TaskStateTransitionRequest`。
- 发布失败时展示后端 `PUBLISH_BLOCKED` 的阻塞项，例如缺少数据集、模板版本或审核配置。
- 列表和详情页都必须处理 loading、empty、error 和成功反馈。
- 阶段 1.1 不在前端实现数据导入、审核配置保存、模板搭建或完整发布检查抽屉。

### 9.3 阶段 1.2 Owner 数据集导入页面

阶段 1.2 将 `/owner/tasks/:taskId/datasets` 推进为可操作页面，覆盖 JSON/JSONL/Excel 导入、导入结果反馈、数据集列表和错误行追踪；题目预览与批量启用/禁用仍放在阶段 1.3。

页面范围：

| 页面 | 路由 | 行为 |
| --- | --- | --- |
| 数据集导入 | `/owner/tasks/:taskId/datasets` | 读取任务信息，上传 JSON/JSONL/Excel，填写数据集名称、类型和格式，创建文件对象并触发导入任务 |
| 导入结果 | 同页 | 展示导入状态、成功数、失败数、错误摘要和可追踪错误行 |
| 数据集列表 | 同页 | 展示任务下数据集名称、类型、来源格式、总题数、可用题数、禁用题数和状态 |

前端 Request/VO 对齐：

```ts
export interface CreateFileObjectRequest {
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  checksum?: string | null;
  purpose: FilePurpose;
  contentText?: string | null;
  contentBase64?: string | null;
}

export interface CreateImportJobRequest {
  datasetName: string;
  datasetType?: DatasetType;
  sourceFormat: DatasetSourceFormat;
  fileObjectId: string;
  idempotencyKey?: string | null;
}
```

交互规则：

- 文件后缀自动推断 `sourceFormat`，用户仍可手动修正。
- JSON/JSONL 使用 `File.text()` 读取后写入 `contentText`；Excel 使用 base64 写入 `contentBase64`。
- 同一文件、任务、数据集名称、数据集类型和格式生成稳定 `idempotencyKey`，重复点击导入不会产生重复数据。
- 导入成功后刷新数据集列表，并在页面内展示最近一次 `ImportJobVO`。
- 导入存在失败行时，调用 `GET /api/import-jobs/{importJobId}/errors` 展示行号、字段、错误码、错误信息和原始片段。
- 页面必须处理 loading、empty、error、partial success 和 failed 状态。

浏览器验收：

- 使用 Chrome DevTools MCP 在真实浏览器检查 `1280×800` 与 `1920×1080`。
- 后端必须连接 MySQL，并确认导入后数据进入 `datasets`、`dataset_items`、`import_jobs` 和 `import_error_rows`。
- 至少验证 `qa_quality.json` 30 条与 `preference_compare.jsonl` 12 条导入链路；Excel 导入由后端测试覆盖，浏览器可视时间允许时补充上传验证。

### 9.4 阶段 1.3 Owner 题目预览与批量编辑页面

阶段 1.3 继续扩展 `/owner/tasks/:taskId/datasets`，在数据集导入与列表基础上增加题目预览、关键词检索、分页和批量编辑。前端不新增独立路由，避免 Owner 在导入与验收数据之间频繁跳转。

页面范围：

| 页面区域 | 行为 |
| --- | --- |
| 数据集列表 | 每行提供“查看题目”入口；选中数据集后加载 `GET /api/datasets/{datasetId}/items` |
| 题目预览 | 展示外部题目 ID、行号、状态、标签、最近更新和 payload 摘要 |
| Payload 抽屉 | 点击“查看 payload”后展示格式化 JSON，便于核对原始导入内容 |
| 批量工具栏 | 选择题目后可批量禁用、启用或替换标签；提交 `PATCH /api/datasets/{datasetId}/items:batch` |
| 检索与分页 | 支持关键词查询 payload、外部题目 ID 或标签；分页结构继续使用 `PageVO` |

前端 Request/VO 对齐：

```ts
export interface ListDatasetItemsRequest {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface BatchUpdateDatasetItemsRequest {
  itemIds: string[];
  enabled?: boolean | null;
  tags?: string[] | null;
  reason?: string | null;
  expectedVersion?: number | null;
}

export interface BatchUpdateDatasetItemsVO {
  updatedCount: number;
  skippedCount: number;
  auditLogId: string | null;
}
```

交互规则：

- 未选中数据集时显示明确 empty 状态；选中数据集后自动加载第一页题目。
- 搜索框只改变题目列表，不影响数据集列表；清空关键词后恢复全量分页。
- 批量启用/禁用必须基于表格选中项；未选择题目时按钮不可用。
- 标签编辑使用逗号或换行分隔，前端去空白、去重后提交；后端仍做最终校验。
- 批量操作成功后刷新题目列表、数据集统计和任务统计，并展示 `updatedCount`、`skippedCount`。
- 页面必须处理 loading、empty、error、partial skipped 和接口结构化错误。

浏览器验收：

- 使用 Chrome DevTools MCP 在真实浏览器检查 `1280×800` 与 `1920×1080`。
- 后端必须连接 MySQL；批量编辑后确认 `dataset_items.status/tags/version`、`datasets.enabledItemCount/disabledItemCount` 和 `audit_logs.BATCH_UPDATE` 已落库。
- Console 不应出现非预期 error/issue；Network 中题目预览与批量编辑接口状态码必须与契约一致。

## 10. 前后端字段映射检查清单

每次开发前必须检查：

- 前端 VO 字段名是否与后端响应 JSON 字段名一致。
- 前端 Request 字段名是否与后端 Request Object 字段名一致。
- 枚举值是否完全一致。
- 时间字段是否统一为 ISO 8601 字符串。
- ID 字段是否统一为 string。
- 分页结构是否统一为 `data + pagination`。
- 错误结构是否统一为 `error` 包裹。
- 动态模板 schema 是否由后端保存、前端渲染，不出现前端私有字段。

## 11. 未确认事项

阶段 0 已确认：鉴权使用 HttpOnly Cookie Session；阶段 0 前端类型先手写并与后端 OpenAPI 对齐；动态模板 schema 将作为语言无关 JSON 结构维护。

后续阶段仍需确认：

- 是否引入 OpenAPI 自动生成 TypeScript 类型。
- 动态模板 schema 的最终 JSON Schema 发布目录与版本策略。

## 12. 浏览器真实验收流程

后续每次完成前端页面或核心交互后，必须使用 Chrome DevTools MCP 做真实浏览器验收，并且后端数据链路必须连接 MySQL，不能用 SQLite 替代官方要求的数据库。

推荐流程：

1. 确认 MySQL 可用，并执行 `apps/api` 下的 `alembic upgrade head`。阶段 1 以后任务、数据集、审核配置、状态迁移和审计日志必须写入 MySQL。
2. 启动后端 API，并确保 `DATABASE_URL` 指向 MySQL；如果前端使用非默认端口，需要同步配置 `API_CORS_ORIGINS`。
3. 启动前端 Vite；如使用非默认 API 地址，需要设置 `VITE_API_BASE_URL`。
4. 使用 Chrome DevTools MCP 打开页面，优先使用 `http://localhost:<port>`，不要混用 `127.0.0.1` 与 `localhost`，避免 HttpOnly Cookie Session 在跨 host 请求中丢失。
5. 至少检查 `1280×800` 与 `1920×1080` 两个视口。每个视口需确认关键内容可见、布局不遮挡、不出现非预期滚动、主要交互可完成。
6. 检查 Console 与 Network：Console 不应有非预期 error/issue；Network 需确认核心接口状态码与契约一致。业务预期错误（例如发布保护返回 `409 PUBLISH_BLOCKED`）应在页面展示清晰阻塞项。
7. 保存必要截图到本地临时目录或验收记录中；发现视觉、可访问性、接口或 Cookie 问题时，必须先修复并复验。

本次阶段 1.1 验收使用过的有效方式：

- MySQL：`labelhub-mysql-browser-check` 容器，`localhost:3307`，迁移版本 `0002_create_stage1_foundation (head)`。
- API：`http://localhost:8001`。
- Web：`http://localhost:5174`，通过 `VITE_API_BASE_URL=http://localhost:8001` 直连 API。
- 已验证：登录、Owner 任务列表、任务创建写入 MySQL、任务设置页回填、发布阻塞 `409 PUBLISH_BLOCKED` 展示、Console 清洁复验、Network 核心接口状态码正确。

本次阶段 1.2 验收使用过的有效方式：

- MySQL：`docker compose -f infra/docker/compose.yaml up -d mysql` 启动 `labelhub-mysql`，`localhost:3306`，迁移版本 `0002_create_stage1_foundation (head)`。
- API：`http://localhost:8000`，默认 `DATABASE_URL=mysql+pymysql://labelhub:labelhub@localhost:3306/labelhub`。
- Web：`http://localhost:5173`，Vite proxy 将 `/api` 转发到 `http://localhost:8000`。
- 已验证：Owner 登录、创建阶段 1.2 任务、进入 `/owner/tasks/:taskId/datasets`、上传 `qa_quality.json` 导入 30 条、上传 `preference_compare.jsonl` 导入 12 条、上传包含缺字段和重复 id 的 JSONL 后展示 2 条错误行。
- 数据库侧确认：`datasets=3`、`dataset_items=43`、`import_jobs=3`、`import_error_rows=2`。
- 浏览器侧确认：Chrome DevTools MCP 在 `1280×800` 与 `1920×1080` 视口检查页面布局；Network 核心请求均为预期状态码；Console 无非预期 error/issue。
