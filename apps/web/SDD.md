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
| 1 | 任务列表 | `TaskVO`、`ListTasksRequest` | `GET /api/tasks` | 阶段 1.1 已实现 |
| 1 | 任务总览 | `TaskSummaryVO` | `GET /api/tasks/summary` | 阶段 1.1 已实现 |
| 1 | 任务创建/编辑 | `TaskDetailVO`、`CreateTaskRequest`、`UpdateTaskRequest` | `POST /api/tasks`、`PATCH /api/tasks/{taskId}` | 阶段 1.1 已实现 |
| 1 | 任务状态迁移 | `TaskStateTransitionRequest`、`TaskDetailVO` | `POST /api/tasks/{taskId}/state-transitions` | 阶段 1.1 已实现 |
| 1 | 数据集与导入 | `DatasetVO`、`DatasetItemVO`、`ImportJobVO`、`ImportErrorRowVO` | `POST /api/tasks/{taskId}/import-jobs`、`GET /api/import-jobs/{importJobId}`、`GET /api/import-jobs/{importJobId}/errors` | 阶段 1.2 已实现 |
| 1 | 题目预览与批量编辑 | `DatasetItemVO`、`BatchUpdateDatasetItemsRequest` | `GET /api/datasets/{datasetId}/items`、`PATCH /api/datasets/{datasetId}/items:batch` | 阶段 1.3 已实现 |
| 1 | 审核配置 | `ReviewConfigDraftVO`、`ReviewConfigVersionVO`、`ReviewDimensionDTO`、`ReviewThresholdDTO` | `GET/PUT /api/tasks/{taskId}/review-config-draft`、`POST/GET /api/tasks/{taskId}/review-config-versions` | 阶段 1.4 已实现 |
| 1 | 发布前检查 | `PublishCheckVO`、`PublishBlockerVO` | `GET /api/tasks/{taskId}/publish-check` | 阶段 1.5 已实现 |
| 1 | 任务审计 | `AuditLogVO` | `GET /api/audit-logs?entityType=TASK&entityId={taskId}` | 阶段 1.1 已实现 |
| 2 | 模板草稿 | `TemplateDraftVO`、`TemplateSchemaVO`、`SaveTemplateDraftRequest` | `GET/PUT /api/tasks/{taskId}/template-draft` | 阶段 2.1 已实现 |
| 2 | 模板校验 | `ValidateTemplateSchemaRequest`、`TemplateSchemaValidationVO` | `POST /api/template-schemas:validate` | 阶段 2.1 已实现 |
| 2 | 模板版本 | `TemplateVersionVO`、`PublishTemplateVersionRequest` | `POST/GET /api/tasks/{taskId}/template-versions`、`GET /api/template-versions/{templateVersionId}` | 阶段 2.7 已实现 |
| 2 | 模板真实样本预览 | `DatasetVO`、`DatasetItemVO`、`PayloadFieldOption` | 复用 `GET /api/tasks/{taskId}/datasets`、`GET /api/datasets/{datasetId}/items` | 设计器预览优先使用当前任务数据集样本；无数据集时使用内置示例并允许手动 JSONPath |
| 3 | 任务广场 | `MarketplaceTaskVO` | `GET /api/marketplace/tasks` | 阶段 3.1 已实现 |
| 3 | 标注领取 | `AssignmentVO` | `POST /api/tasks/{taskId}/assignments` | 阶段 3.1 已实现 |
| 3 | 作答上下文 | `AssignmentContextVO` | `GET /api/assignments/{assignmentId}` | 阶段 3.2 已实现 |
| 3 | 草稿保存 | `SaveAssignmentDraftRequest` | `PUT /api/assignments/{assignmentId}/draft` | 阶段 3.3 已实现 |
| 3/4 | 标注提交 | `SubmissionVO` | `POST /api/assignments/{assignmentId}/submissions` | 阶段 3.4 已实现；阶段 4.1 提交后进入 AI 预审队列 |
| 3 | 题目级 LLM 辅助 | `LlmActionRunVO` | `POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run` | 阶段 3.6 已实现 |
| 4 | AI 预审队列 | `ReviewJobVO` | `GET /api/review-jobs` | 阶段 4.0/4.1 已实现 |
| 4 | AI 预审队列摘要 | `ReviewJobSummaryVO` | `GET /api/review-jobs/summary` | 阶段 4.4 已实现 |
| 4 | Reviewer 人工审核任务 | `ReviewTaskSummaryVO` | `GET /api/reviews/tasks` | 阶段 4.6 已改为任务级入口，先选任务再进入流转工作台 |
| 4 | Reviewer 任务内审核记录 | `ReviewVO` | `GET /api/reviews` | 阶段 4.4 已实现；阶段 4.6 仅在任务内工作台使用，支持 `taskId/status/aiConclusion` 筛选 |
| 4 | Reviewer 审核详情 | `ReviewDetailVO` | `GET /api/reviews/{reviewId}` | 阶段 4.4 已补充状态链路、多轮历史和提交 diff |
| 4 | 人工审核决策 | `CreateReviewDecisionRequest`、`BatchReviewDecisionRequest` | `POST /api/reviews/{reviewId}/decisions`、`POST /api/reviews:batch-decide` | 阶段 4.5 已实现 |
| 4 | Owner 数据验收 | `AcceptanceStatsVO` | `GET /api/tasks/{taskId}/acceptance-stats` | 阶段 4.6 已实现 |
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
  | "INVALID_TASK_STATUS"
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
| `TaskSummaryVO` | `totalTaskCount`、`draftTaskCount`、`publishedTaskCount`、`pausedTaskCount`、`endedTaskCount`、`totalQuota`、`totalClaimedCount`、`totalSubmittedCount`、`totalApprovedCount`、`readyDatasetCount`、`enabledItemCount`、`templateReadyTaskCount`、`reviewConfigReadyTaskCount` |
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
| 任务列表 | `/owner/tasks` | 顶部任务总览卡、搜索、状态筛选、分页、任务状态标签、数据量摘要、创建入口、编辑入口、发布/暂停/恢复/结束入口 |
| 任务创建 | `/owner/tasks/new` | 创建 `DRAFT` 任务，字段包含标题、描述、富文本说明、标签、奖励规则、截止时间、配额和分发策略 |
| 任务设置 | `/owner/tasks/:taskId/settings` | 加载任务详情，只允许编辑 `DRAFT` 任务；提交时携带 `version` 做乐观锁 |

交互规则：

- 状态迁移由后端决定最终结果；前端只发起 `TaskStateTransitionRequest`。
- 顶部总览读取 `GET /api/tasks/summary`，展示 Owner 全量已发布任务（对应官方“发布中”）、草稿任务、可用题目和累计提交；搜索/状态筛选只影响下方列表。
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

### 9.5 阶段 1.4 Owner 审核配置页面

阶段 1.4 新增 `/owner/tasks/:taskId/review-config`，让 Owner 在任务发布前配置 AI 预审所需的 Prompt、评分维度、阈值和结构化输出 schema。页面只产生配置草稿与版本，不触发 AI 预审，也不进入 Reviewer 工作台。

页面范围：

| 页面区域 | 行为 |
| --- | --- |
| 顶部任务上下文 | 展示任务标题、状态、当前审核配置版本入口状态，并提供返回、任务设置、数据集入口 |
| Prompt 模板 | 编辑系统预审 Prompt，说明需要输出结构化 JSON |
| 评分维度 | 支持增加、删除和编辑维度 `key/name/description/maxScore/weight` |
| 阈值配置 | 编辑通过阈值、人工复核阈值、打回阈值，并展示当前加权最高分 |
| 输出 Schema | 展示并允许编辑结构化输出 JSON Schema；可按当前维度一键生成默认 schema |
| 草稿与发布 | 保存草稿、保存后发布审核配置版本；发布前先保存当前表单，避免版本内容落后 |
| 版本历史 | 展示 `versionNo/status/publishedAt/publishedBy/thresholds`，最新版本排在前面 |

前端 Request/VO 对齐：

```ts
export interface ReviewDimensionDTO {
  key: string;
  name: string;
  description?: string | null;
  maxScore: number;
  weight: number;
}

export interface ReviewThresholdDTO {
  passMinScore: number;
  returnBelowScore: number;
  humanReviewMinScore?: number | null;
}

export interface SaveReviewConfigDraftRequest {
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  thresholds: ReviewThresholdDTO;
  outputSchema?: JsonObject;
}

export interface PublishReviewConfigVersionRequest {
  draftId: string;
  versionNote?: string | null;
}
```

交互规则：

- 页面加载时并行读取任务详情、审核配置草稿和版本列表；草稿不存在时依赖后端返回默认草稿。
- 表单侧先做轻量校验：维度 key 不为空且去重、阈值顺序合法、阈值不超过加权最高分、输出 schema 必须是 JSON Object。
- 发布版本前先保存当前表单，再用返回的 `draftId` 发布版本；发布成功后刷新任务详情、草稿和版本列表。
- 阶段 1.4 仅允许草稿任务编辑和发布审核配置；非草稿任务页面显示只读说明，并以后端结果为准。
- 后端结构化错误需要显示具体信息，不使用笼统“服务暂不可用”吞掉业务原因。

浏览器验收：

- 使用 Chrome DevTools MCP 在真实浏览器检查 `1280×800` 与 `1920×1080`。
- 后端必须连接 MySQL；保存/发布后确认 `review_config_drafts`、`review_config_versions`、`tasks.current_review_config_version_id` 和 `audit_logs.REVIEW_CONFIG_*` 已落库。
- Console 不应出现非预期 error/issue；Network 中审核配置接口状态码必须与契约一致。

### 9.6 阶段 1.5 Owner 发布前检查抽屉

阶段 1.5 在 Owner 任务列表、任务设置、数据集管理和审核配置页接入发布前检查抽屉。前端只展示后端阻塞项和发起受保护的发布动作，不自行绕过模板版本要求。

页面范围：

| 页面区域 | 行为 |
| --- | --- |
| 任务列表行操作 | 点击“发布检查”或草稿/暂停任务的“发布/恢复发布”时打开抽屉 |
| 任务设置页顶部操作 | 可随时打开发布检查抽屉，检查基础信息、配额、截止时间和状态 |
| 数据集管理页顶部操作 | 可检查 READY 数据集与可用题目是否满足发布前置 |
| 审核配置页顶部操作 | 可检查审核配置版本是否已绑定 |
| 发布前检查抽屉 | 展示任务状态、配额、截止时间、数据集、模板版本、审核配置六类检查；阻塞项展示后端原始 message |

前端 Request/VO 对齐：

```ts
export type PublishBlockerCode =
  | "INVALID_TASK_STATUS"
  | "MISSING_REQUIRED_FIELDS"
  | "MISSING_DATASET"
  | "MISSING_TEMPLATE_VERSION"
  | "MISSING_REVIEW_CONFIG"
  | "INVALID_QUOTA"
  | "INVALID_DEADLINE";

export interface PublishCheckVO {
  taskId: string;
  canPublish: boolean;
  blockers: PublishBlockerVO[];
  checkedAt: string;
}
```

交互规则：

- 抽屉打开时并行读取 `GET /api/tasks/{taskId}` 和 `GET /api/tasks/{taskId}/publish-check`，保证检查项和值来自最新服务端状态。
- `canPublish=false` 时，“发布任务”按钮禁用；阶段 1 的典型状态是 `MISSING_TEMPLATE_VERSION` 阻塞。
- `canPublish=true` 且任务状态为 `DRAFT` 或 `PAUSED` 时，点击“发布任务”发起 `POST /api/tasks/{taskId}/state-transitions`，仍以后端最终返回为准。
- 后端返回 `PUBLISH_BLOCKED` 或其他业务错误时，抽屉展示结构化错误并刷新检查结果。
- 所有时间通过 `formatTaskTime` 以 `Asia/Shanghai` 展示，避免 MySQL DATETIME 丢时区造成 8 小时偏差。

浏览器验收：

- 使用 Chrome DevTools MCP 在真实浏览器检查 `1280×800` 与 `1920×1080`。
- 后端必须连接 MySQL；至少验证一个已具备数据集和审核配置但缺少模板版本的任务，抽屉清晰显示 `MISSING_TEMPLATE_VERSION` 并阻止发布。
- Console 不应出现非预期 error/issue；Network 中 `publish-check` 返回 200，强制发布接口在缺模板时返回预期业务阻塞。

### 9.7 阶段 2.0 动态模板契约与前端 API 外壳

阶段 2.0 在前端只落模板类型和 API 封装，不新增 Designer 页面、不渲染模板、不实现拖拽交互。模板 API 按阶段逐步接入；当前阶段 2.7 已完成模板版本发布能力。

前端文件落点：

| 文件 | 说明 |
| --- | --- |
| `src/features/templates/types.ts` | 定义 `TemplateSchemaVO`、`TemplateComponentDTO`、`TemplateDraftVO`、`TemplateVersionVO` 等类型 |
| `src/features/templates/api.ts` | 封装模板草稿、schema 校验、模板版本列表和版本详情接口 |

前端类型：

```ts
export type TemplateComponentType =
  | "SHOW_ITEM"
  | "TEXT_INPUT"
  | "TEXTAREA"
  | "RADIO"
  | "CHECKBOX"
  | "TAG_SELECT"
  | "RICH_TEXT"
  | "FILE_UPLOAD"
  | "IMAGE_UPLOAD"
  | "JSON_EDITOR"
  | "LLM_ACTION"
  | "GROUP"
  | "TABS";

export interface TemplateSchemaVO {
  schemaVersion: string;
  components: TemplateComponentDTO[];
  layout: JsonObject;
  llmActions: JsonObject[];
  showItems: JsonObject[];
}
```

接口封装：

| 前端函数 | 后端接口 |
| --- | --- |
| `getTemplateDraft` | `GET /api/tasks/{taskId}/template-draft` |
| `saveTemplateDraft` | `PUT /api/tasks/{taskId}/template-draft` |
| `validateTemplateSchema` | `POST /api/template-schemas:validate` |
| `publishTemplateVersion` | `POST /api/tasks/{taskId}/template-versions` |
| `listTemplateVersions` | `GET /api/tasks/{taskId}/template-versions` |
| `getTemplateVersion` | `GET /api/template-versions/{templateVersionId}` |

字段对齐要求：

- 前端字段使用 camelCase，例如 `schemaVersion`、`fieldKey`、`llmActions`、`showItems`。
- 后端 Pydantic 使用 alias 对外返回同名 camelCase JSON。
- VO 中对外字段必须使用 `schema`；后端内部可用 `template_schema` 避免遮蔽 Pydantic BaseModel 方法。
- 2.1 实现业务时，Designer、Renderer、Labeler 必须复用这同一份 `TemplateSchemaVO`，不得引入前端私有 schema。

### 9.8 阶段 2.1 模板 schema 基础结构与校验反馈

阶段 2.1 在前端新增模板 schema 基础工具，不新增页面。Designer 和 Renderer 后续必须复用这些工具生成默认结构、创建物料和展示后端校验结果。

前端文件落点：

| 文件 | 说明 |
| --- | --- |
| `src/features/templates/view.ts` | 默认 schema、默认物料、采集字段提取、校验结果摘要 |
| `src/features/templates/view.test.ts` | 覆盖默认 schema、默认 fieldKey、校验摘要 |

交互边界：

- `getTemplateDraft`、`saveTemplateDraft`、`validateTemplateSchema` 已可调用真实后端业务。
- `publishTemplateVersion`、`listTemplateVersions`、`getTemplateVersion` 已在阶段 2.7 接入；2.1 阶段页面不得提前把它们当成可用发布能力。
- `TemplateLayoutDTO` 以 `root` 数组作为基础布局；字符串节点表示组件 ID，对象节点为后续 `GROUP/TABS` 预留。
- 前端只做轻量结构准备和校验结果展示，非法物料、重复字段和非法布局最终以后端校验为准。

### 9.9 阶段 2.2 Renderer 最小运行时

阶段 2.2 新增可复用 Renderer 和轻量预览壳，用于证明同一份 `TemplateSchemaVO` 既可以由 Owner 预览，也能在后续 Labeler 工作台直接复用。该阶段不实现拖拽、不实现属性面板、不保存 schema，也不发布模板版本。

前端文件落点：

| 文件 | 说明 |
| --- | --- |
| `src/features/templates/TemplateRenderer.tsx` | 运行时渲染组件，消费 `TemplateSchemaVO`、题目 payload 和表单值 |
| `src/features/templates/runtime.ts` | payload 路径读取、默认值、提交字段提取、值更新等纯函数 |
| `src/features/templates/runtime.test.tsx` | 覆盖 ShowItem、基础物料渲染和值结构 |
| `src/pages/OwnerTemplateRendererPreviewPage.tsx` | `/owner/tasks/:taskId/designer` 的阶段 2.2 预览壳 |

Renderer Props：

```ts
interface TemplateRendererProps {
  schema: TemplateSchemaVO;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  onChange: (nextValue: TemplateSubmissionValue) => void;
  readonly?: boolean;
}
```

运行规则：

- `SHOW_ITEM` 使用 `props.path` 读取 payload，例如 `$.prompt`，只展示不写入提交值。
- `TEXT_INPUT`、`TEXTAREA` 写入字符串。
- `RADIO` 写入单个字符串。
- `CHECKBOX`、`TAG_SELECT` 写入字符串数组。
- 物料顺序以 `layout.root` 为准；无效布局节点显示轻量错误，不阻断整个 Renderer。
- `props.options` 仅接受 `{ label, value }` 数组；非法选项在 Renderer 侧降级为空列表，最终以后端 schema 校验为准。

页面边界：

- `/owner/tasks/:taskId/designer` 在 2.2 只展示“模板运行时预览”，加载当前任务、模板草稿，并用一个 demo payload 渲染。
- 若模板草稿为空，显示空状态和后续 Designer 提示。
- 页面提供返回任务列表、任务设置、发布检查入口，保持 Owner 工作流一致。
- 浏览器验收必须覆盖 `1280x800` 和 `1920x1080`，Console 不应出现非预期 error。

### 9.10 阶段 2.3/2.4 Designer 三栏布局与基础物料属性

阶段 2.3/2.4 将 `/owner/tasks/:taskId/designer` 从只读预览壳升级为 Owner 模板搭建器。该阶段页面只保存模板草稿，不发布模板版本；在 2.3/2.4 交付时不得在页面上承诺“发布后可领取”。

入口策略：

- 左侧导航新增 `/owner/templates`「模板工作台」，用于集中筛选任务、查看模板准备状态并进入对应任务的 Designer。
- 任务列表仍保留行内「更多 -> 搭建模板」快捷入口，用于从具体任务上下文快速进入。
- 真正编辑 schema 的页面保持 `/owner/tasks/:taskId/designer`，因为模板草稿、模板版本和发布检查都必须绑定具体任务。
- 进入 Designer 时使用 `?from=templates|tasks|settings` 标记来源；顶部返回按钮按来源返回「模板工作台」「任务管理」或「任务设置」，直接打开 Designer 时默认返回模板工作台。

页面结构：

| 区域 | 职责 |
| --- | --- |
| 顶部工具栏 | 来源感知返回、进入任务设置、预览、校验、保存草稿、展示任务状态与草稿保存状态 |
| 左侧物料栏 | 展示 `SHOW_ITEM`、`TEXT_INPUT`、`TEXTAREA`、`RADIO`、`CHECKBOX`、`TAG_SELECT`，支持点击添加和拖拽到画布 |
| 中间画布 | 按 `layout.root` 渲染组件卡片；支持拖拽排序、上移/下移、删除和选择 |
| 右侧属性面板 | 编辑选中物料的 `label`、`fieldKey`、`props`、`validation`；ShowItem 不允许编辑 fieldKey |
| 预览抽屉 | 使用阶段 2.2 `TemplateRenderer` 和同一份 schema 预览运行时效果 |

基础物料属性：

| 物料 | 属性面板能力 |
| --- | --- |
| `SHOW_ITEM` | 展示标题、payload 路径 `props.path` |
| `TEXT_INPUT` | 字段名、标签、占位符、默认值、必填、最大长度 |
| `TEXTAREA` | 字段名、标签、占位符、默认值、必填、最大长度 |
| `RADIO` | 字段名、标签、选项增删改、默认选项、必填 |
| `CHECKBOX` | 字段名、标签、选项增删改、默认多选、必填 |
| `TAG_SELECT` | 字段名、标签、选项增删改、默认标签、必填、占位符 |

交互与错误：

- 点击或拖拽物料都会生成新的 `TemplateComponentDTO`，并追加到 `components` 与 `layout.root`。
- 画布排序只调整 `layout.root`；不得改变组件 `id`、`fieldKey` 或属性。
- 删除物料必须同步移除 `components` 与 `layout.root`。
- 保存草稿调用 `saveTemplateDraft`；后端 `INVALID_TEMPLATE_SCHEMA` 的结构化错误必须展示。
- 校验调用 `validateTemplateSchema`，成功显示通过提示，失败展示 `field + message`。
- 预览抽屉必须直接消费当前未保存 schema，验证 Designer 与 Renderer 共享协议。
- 浏览器验收覆盖 `1280x800` 与 `1920x1080`；三栏区域不得遮挡、横向溢出或出现不可见的主要操作。

文件落点：

| 文件 | 说明 |
| --- | --- |
| `src/features/templates/designer.ts` | Designer schema 增删改排、默认物料与选项工具 |
| `src/features/templates/designer.test.ts` | 覆盖添加、排序、删除、属性更新和基础物料默认值 |
| `src/pages/OwnerTemplateDesignerPage.tsx` | `/owner/tasks/:taskId/designer` 三栏搭建器 |
| `src/features/templates/TemplateRenderer.tsx` | 继续作为预览抽屉与后续 Labeler 运行时复用 |

### 9.11 阶段 2.5 高级物料

阶段 2.5 不新增后端接口，继续复用 `GET/PUT /api/tasks/{taskId}/template-draft` 与 `POST /api/template-schemas:validate`。本阶段目标是把官方要求中的高级物料纳入同一份 `TemplateSchemaVO`，并让 Designer 与 Renderer 同时识别这些物料。

Designer 物料分组：

| 分组 | 物料 |
| --- | --- |
| 基础物料 | `SHOW_ITEM`、`TEXT_INPUT`、`TEXTAREA`、`RADIO`、`CHECKBOX`、`TAG_SELECT` |
| 高级物料 | `LLM_ACTION`、`RICH_TEXT`、`FILE_UPLOAD`、`IMAGE_UPLOAD`、`JSON_EDITOR` |

高级物料属性：

| 物料 | fieldKey | props | validation |
| --- | --- | --- | --- |
| `RICH_TEXT` | 必填且唯一 | `placeholder`、`defaultValue`、`toolbarPreset` | `required`、`maxLength` |
| `FILE_UPLOAD` | 必填且唯一 | `accept` 字符串数组、`maxFiles`、`maxSizeMb` | `required` |
| `IMAGE_UPLOAD` | 必填且唯一 | `accept` 图片 MIME/扩展名数组、`maxFiles`、`maxSizeMb` | `required` |
| `JSON_EDITOR` | 必填且唯一 | `placeholder`、`defaultValue` JSON Object/Array | `required` |
| `LLM_ACTION` | 不配置 | `actionLabel`、`promptTemplate`、`inputItemPaths`、`inputFieldKeys`、`outputFieldKey`、`helperText` | 不参与提交 |

Renderer 行为：

- `RICH_TEXT` 渲染轻量富文本编辑区，提交值为字符串；本阶段不引入额外富文本依赖。
- `FILE_UPLOAD` 与 `IMAGE_UPLOAD` 渲染 Upload 区域，阶段 2.5 只在预览中记录本地文件名，真实证据文件上传在阶段 3 作答链路接入。
- `JSON_EDITOR` 渲染等宽 JSON 编辑区，默认值可以是 JSON Object/Array；输入过程允许暂存字符串，最终提交校验放在阶段 3。
- `LLM_ACTION` 渲染可读的模型动作配置卡，展示输入字段、输出字段和 prompt 摘要；阶段 3.6 起通过 `POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run` 运行题目级模型辅助。

交互规则：

- 高级物料同样支持点击/拖拽添加、排序、删除、右侧属性编辑、预览和保存草稿。
- Designer 生成的 schema 必须可被后端校验接口直接验证，不出现前端私有字段。
- Designer 新增物料的默认 `label` 必须使用中文业务语义，例如 `SHOW_ITEM=题目原文`、`TEXTAREA=回答内容`、`LLM_ACTION=AI 辅助动作`；`fieldKey` 仍使用稳定机器字段，不用中文 label 作为提交 key。
- `LLM_ACTION` 必须在高级物料分组首位展示，确保 `1280×800` 下无需滚到底部也能发现“题目级 LLM 辅助”能力。
- 物料区必须作为独立滚动区域展示完整分组；在 `1280×800` 下不应因为卡片高度裁切而无法访问 `JSON_EDITOR`、`GROUP`、`TABS`。
- `LLM_ACTION.props.inputItemPaths` 用于引用题目原始数据路径，通常来自 `SHOW_ITEM.props.path`；`inputFieldKeys/outputFieldKey` 只能引用当前 schema 中已存在的采集字段。展示项不进入提交值，但可以作为题目级 LLM 辅助的输入上下文。
- 预览抽屉必须用当前未保存 schema 渲染高级物料，验证 Designer/Renderer 共用契约。

验收标准：

- 前端测试覆盖高级物料默认 schema、初始提交值和 Renderer 静态渲染。
- 浏览器验收覆盖添加高级物料、编辑关键属性、预览抽屉渲染和布局在 `1280×800`、`1920×1080` 下无横向溢出。

### 9.12 阶段 2.6 高级布局与规则

阶段 2.6 继续使用同一份 `TemplateSchemaVO`，不引入前端私有协议。目标是让 Owner 在 Designer 中配置官方 4.2 进阶能力，并能在预览抽屉中看到 Renderer 运行效果。

新增 Designer 物料分组：

| 分组 | 物料 |
| --- | --- |
| 布局物料 | `GROUP`、`TABS` |

规则结构：

```ts
type TemplateRuleLogic = "ALL" | "ANY";
type TemplateConditionOperator = "EQUALS" | "NOT_EQUALS" | "IN" | "NOT_IN" | "NOT_EMPTY" | "EMPTY";

interface TemplateRuleConditionDTO {
  fieldKey: string;
  operator: TemplateConditionOperator;
  value?: string | number | boolean | null | string[];
}

interface TemplateRuleSetDTO {
  logic?: TemplateRuleLogic;
  conditions?: TemplateRuleConditionDTO[];
}
```

字段级配置：

| 配置 | 存放位置 | Designer 行为 | Renderer 行为 |
| --- | --- | --- | --- |
| 条件显示 | `component.visibility` | 可选择依赖字段、操作符和值 | 条件不满足时隐藏组件，隐藏采集字段从提交值中移除 |
| 正则校验 | `component.validation.pattern/patternMessage` | 文本类、富文本和 JSON 字符串输入可配置 | 值不匹配时展示字段级错误 |
| 白名单规则 | `component.validation.customRuleIds` | 多选 `NO_EMOJI`、`NO_URL`、`TRIMMED_NON_EMPTY`、`JSON_OBJECT` | 按规则展示字段级错误，不执行任意代码 |
| 联动必填 | `component.validation.requiredWhen` | 配置依赖条件与错误提示 | 条件满足且字段为空时展示字段级错误 |

布局结构：

```ts
type TemplateLayoutNodeDTO =
  | string
  | {
      componentId: string;
      children?: TemplateLayoutNodeDTO[];
      tabs?: Array<{ id: string; label: string; children: TemplateLayoutNodeDTO[] }>;
    };
```

交互规则：

- `GROUP` 默认生成空 `children`，可从分组内部添加子物料；Renderer 用分组卡片渲染 children。
- `TABS` 默认生成两个 tab，可在属性面板编辑 Tab 名称；Renderer 用 Ant Design Tabs 渲染各 tab children。
- 左侧物料区必须可完整访问布局物料，不能依赖整页滚动后碰运气露出底部内容。
- Owner 进入 `/owner/tasks/{taskId}/designer` 时使用工作台专注布局，左侧全局角色导航自动收起为窄图标栏，为物料区、画布和属性区释放宽度。
- Designer 三列布局在全局导航收起后优先保证物料区可读性；`1280×800` 下物料区宽度不应小于 280px，画布宽度可相应收缩但不得出现横向溢出。
- 嵌套在 `GROUP/TABS` 内的子物料必须能单独点击选中并打开属性配置，点击事件不得被父容器抢占。
- 已有组件必须支持跨 `GROUP/TABS` 容器移动：拖到另一个容器空白区时追加到该容器末尾，拖到另一个容器内子物料时插入到该子物料前；禁止把容器移动到自身或自身后代中。
- 未选择物料时，属性面板展示居中空状态，不贴近面板顶部。
- 删除容器时同步删除其嵌套 children 对应的组件，避免 schema 中出现孤儿组件。
- 组件上移/下移在其所在兄弟节点内生效；根节点、分组 children、Tab children 均保持同一规则。
- 预览抽屉直接消费当前未保存 schema，并展示条件显示、联动必填、正则和自定义规则的运行时反馈。
- 阶段 2.6 不实现 Labeler 提交接口；阶段 3.4 会复用运行时规则语义接入提交校验。

验收标准：

- 前端测试覆盖布局物料默认值、嵌套添加、容器删除、条件显示、隐藏字段清理和运行时校验。
- 后端 schema 校验拒绝非法条件字段、非法 operator、非法正则、未知 customRuleId、非法 GROUP/TABS layout。
- Chrome DevTools MCP 在 `1280×800` 与 `1920×1080` 检查 Designer、预览抽屉、条件显示和 Tab 切换；Console 无非预期错误。

### 9.13 阶段 2.7 模板版本发布与发布检查联动

阶段 2.7 在 Designer 中接入模板版本发布，不改变模板 schema 协议。前端必须继续以 `TemplateSchemaVO` 作为唯一渲染和保存结构，发布动作只把当前任务草稿固化为后端不可变版本。

页面入口：

| 页面 | 行为 |
| --- | --- |
| `/owner/templates` 模板工作台 | 展示任务模板准备状态；已发布模板的任务显示当前版本已绑定，未发布模板的任务提示继续搭建并发布 |
| `/owner/tasks` 任务管理 | 保留行内快捷入口，具体任务上下文中可进入 Designer；发布检查仍在任务发布动作前展示 |
| `/owner/tasks/{taskId}/designer?from=...` | 顶部返回按钮按来源返回模板工作台、任务管理或任务设置；直接进入时默认返回模板工作台 |

Designer 交互：

- 顶部展示当前模板版本状态：未发布、已发布、草稿已同步或草稿有改动。
- “保存草稿”只写入 `template_drafts`，不解除发布检查阻塞。
- “发布版本”必须先校验当前 schema；若草稿有未保存改动，应保存当前草稿后再调用 `publishTemplateVersion`。
- 发布成功后刷新任务详情和版本列表，展示 `r{versionNo}`、`ACTIVE/DISABLED` 状态、发布时间、发布人和版本备注。
- “版本记录”抽屉展示当前任务版本历史，当前绑定版本需要明确标记。
- “发布检查”抽屉复用阶段 1.5 组件；成功发布模板版本后不应再出现 `MISSING_TEMPLATE_VERSION`，但其他阻塞项仍如实展示。

VO 字段映射：

| 后端 JSON 字段 | 前端类型字段 | 用途 |
| --- | --- | --- |
| `TaskVO.currentTemplateVersionId` | `currentTemplateVersionId` | 判断当前任务是否已有模板版本 |
| `TaskVO.currentReviewConfigVersionId` | `currentReviewConfigVersionId` | 发布检查和任务列表状态展示 |
| `TaskStatsVO.templateVersionCount` | `templateVersionCount` | 任务统计与模板工作台准备状态 |
| `TemplateVersionVO.versionNo/status/versionNote/publishedAt` | 同名 camelCase | 版本记录抽屉展示 |

验收标准：

- 前端测试覆盖模板版本 API 封装字段、Designer 发布按钮状态和版本列表展示。
- Chrome DevTools MCP 使用 MySQL 数据链路验证：保存合法草稿、发布模板版本、查看版本记录、打开发布检查并确认 `MISSING_TEMPLATE_VERSION` 已解除。
- `1280×800` 与 `1920×1080` 下 Designer 顶部操作、版本抽屉和模板工作台不遮挡、不横向溢出，Console 无非预期错误。

### 9.14 阶段 3 Labeler 工作台与提交闭环

阶段 3 前端必须直接复用阶段 2 的 `TemplateRenderer`、`TemplateSubmissionValue`、`pruneHiddenSubmissionValue` 和 `validateTemplateSubmissionValue`。Labeler 作答页不得复制一套新的表单渲染逻辑；后端仍是最终校验者。

阶段 3 的前端视觉与信息架构基准以 `ui-prototypes/phase3` 为准。当前已实现到阶段 3.6，正式代码已对齐 `marketplace`、`workspace`、`contributions` 与 `revise` 四个原型：任务广场采用“统计概览 + 任务列表 + 当前队列/表现侧栏”，标注工作台采用“题目导航 + 动态 Renderer 作答区 + 任务上下文侧栏 + 底部操作条”，我的贡献页采用“统计卡 + 状态分组 + 卡片化贡献列表”，返修入口复用工作台并增强审核意见展示；题目级 `LLM_ACTION` 已在工作台内以 AI 建议卡片呈现，模型结果只作为参考或预填，Labeler 采纳后才进入草稿。

进入 `/labeler/assignments/:assignmentId` 后，角色壳左侧全局导航必须自动收起为窄图标栏，让标注工作台获得更宽的主作答区域；工作台内部的题目导航不收起，继续作为题目级操作导航。后续阶段 3 的草稿、提交、LLM 辅助和返修页也沿用该聚焦模式。

页面与路由：

| 页面 | 路由 | 行为 |
| --- | --- | --- |
| 任务广场 | `/labeler/marketplace` | 搜索、筛选、任务卡片、剩余题量、奖励、截止时间、领取或继续作答 |
| 标注工作台 | `/labeler/assignments/:assignmentId` | 展示题目 payload、模板版本 Renderer、草稿状态、上一题/下一题/跳题和提交按钮 |
| 我的贡献 | `/labeler/contributions` | 展示已提交、通过、打回、待修改统计和列表，提供继续作答、查看提交、修改并提交入口 |
| 打回修改详情 | `/labeler/assignments/:assignmentId/revise` | 展示审核意见、上一轮提交和修改再提交入口，复用标注工作台 Renderer 与保存/提交能力 |

核心前端类型：

```ts
export interface MarketplaceTaskVO {
  id: string;
  title: string;
  description?: string | null;
  tags: string[];
  rewardRule?: JsonObject | null;
  deadlineAt: string;
  quota: number;
  claimedCount: number;
  submittedCount: number;
  approvedCount: number;
  availableItemCount: number;
  claimedByMeCount: number;
  submittedByMeCount: number;
  activeAssignmentId?: string | null;
}

export interface AssignmentContextVO {
  assignment: AssignmentVO;
  task: TaskVO;
  datasetItemPayload: JsonObject;
  templateSchema: TemplateSchemaVO;
  latestSubmission?: SubmissionVO | null;
  reviewFeedback?: ReviewFeedbackVO | null;
  navigation: AssignmentNavigationVO;
}

export interface ReviewFeedbackVO {
  reason: string;
  source: string;
  reviewerId?: string | null;
  reviewerRole?: string | null;
  returnedAt: string;
  metadata: JsonObject;
}

export interface ContributionStatsVO {
  totalAssignments: number;
  draftCount: number;
  inReviewCount: number;
  submittedCount: number;
  approvedCount: number;
  returnedCount: number;
  revisionRequiredCount: number;
  totalSubmissionCount: number;
  passRate: number;
  latestUpdatedAt: string | null;
}

export interface ContributionItemVO {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  datasetItemId: string;
  datasetItemPreview: string;
  status: AssignmentStatus;
  latestSubmissionId: string | null;
  latestSubmissionVersion: number | null;
  latestSubmissionStatus: SubmissionStatus | null;
  claimedAt: string;
  draftSavedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  canContinue: boolean;
  canRevise: boolean;
  reviewFeedback: ReviewFeedbackVO | null;
}
```

交互规则：

- 任务广场只展示后端返回的可领取任务；前端不自行猜测任务是否可领。
- 领取成功后进入 `/labeler/assignments/:assignmentId`；如果当前 Labeler 已有未提交 assignment，卡片提供“继续作答”入口。
- 作答页初始化值优先级：后端 `assignment.draftValues` > `latestSubmission.values` > `getTemplateInitialValue(templateSchema)`。
- 阶段 3.2 作答页只负责上下文读取、Renderer 本地编辑和题目导航；Renderer 值变更后先调用 `pruneHiddenSubmissionValue` 清理隐藏字段，防抖保存草稿在阶段 3.3 接入。
- 提交前先运行前端 `validateTemplateSubmissionValue` 给即时反馈；仍必须调用后端提交接口，由后端做最终校验。正式提交按钮在阶段 3.4 接入。
- 文件/图片上传物料在阶段 3 需要调用现有 `createFileObject`，提交值保存文件对象 ID 数组和必要展示名，不保存浏览器本地临时路径。
- `LLM_ACTION` 按 assignment 模板版本中的组件 ID 运行：`POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run`。
- `RunLlmActionRequest` 使用 `{ inputValues, targetFieldKey, idempotencyKey }`，其中 `inputValues` 必须是当前 Renderer 值快照，`targetFieldKey` 优先使用组件 `props.outputFieldKey`；题目原始数据不由前端重复提交，后端按组件 `props.inputItemPaths` 从 assignment 的 `datasetItemPayload` 中读取，避免客户端伪造原题上下文。
- LLM 运行态只把 Owner 显式配置的 `inputItemPaths` 与 `inputFieldKeys` 作为模型输入展示和发送给后端；后端只向模型发送 `selectedItemValues` 与 `selectedInputValues`，不发送完整题目 payload 或未选择字段，避免模型建议混入其他题型、模型对比或审核结论。
- `LlmActionRunVO` 返回 `{ id, assignmentId, taskId, componentId, status, inputValues, outputValue, outputValues, errorMessage, idempotencyKey, createdAt }`。
- Renderer 不自动覆盖字段：模型成功后先展示建议结果，再由 Labeler 点击“采纳到字段”写入目标字段草稿；若无输出字段则仅展示参考文本。采纳后的草稿仍走阶段 3.3 自动保存，正式提交仍走阶段 3.4。
- 模型失败时展示后端 `errorMessage` 和可重试按钮，不阻断其他字段作答；超时类错误应明确提示当前超时秒数或排查方向，不能只显示英文内部异常；Console 不应出现未捕获异常。

验收标准：

- Chrome DevTools MCP 覆盖 `1280×800` 与 `1920×1080` 下任务广场、作答页、贡献页；无横向溢出、主要操作不遮挡。
- MySQL 链路验证：领取写入 assignment，草稿刷新恢复，提交生成 submission 版本，提交值包含固定 `templateVersionId`。
- Console 无非预期错误；Network 中业务阻塞项必须可读，例如无可领取题目、任务过期、提交校验失败。

阶段 3.0/3.1 首批落地契约：

| 页面/模块 | 路由 | 行为 |
| --- | --- | --- |
| Labeler 任务广场 | `/labeler/marketplace` | 搜索可领取任务、展示剩余题量/截止时间/奖励规则/个人领取提交数，点击领取调用 `POST /api/tasks/{taskId}/assignments` |
| 领取结果 | 任务卡片内反馈 | 阶段 3.1 只完成领取写入与状态反馈；阶段 3.2 起领取成功跳转到 assignment 作答页 |

`MarketplaceTaskVO` 字段必须与后端一致：`id`、`title`、`description`、`tags`、`rewardRule`、`quota`、`claimedCount`、`submittedCount`、`approvedCount`、`availableItemCount`、`claimedByMeCount`、`submittedByMeCount`、`activeAssignmentId`、`deadlineAt`、`distributionStrategy`、`currentTemplateVersionId`、`currentReviewConfigVersionId`、`updatedAt`。

`AssignmentVO` 字段必须与后端一致：`id`、`taskId`、`datasetItemId`、`templateVersionId`、`reviewConfigVersionId`、`labelerId`、`status`、`draftValues`、`draftSavedAt`、`currentSubmissionId`、`claimedAt`、`submittedAt`、`version`、`createdAt`、`updatedAt`。

阶段 3.2 标注工作台产品规则：

- 作答页入口只接受 `assignmentId`，所有任务、题目、模板和导航数据都来自 `GET /api/assignments/{assignmentId}`。
- 顶部操作区提供返回任务广场、上一题、下一题和领取下一题；上一题/下一题不可用时必须明确置灰，不显示无效链接。
- 页面主体直接复用阶段 2 `TemplateRenderer`，并在右侧展示题目进度、模板版本、领取时间和原始 payload 摘要，避免 Labeler 在多个页面间查上下文。
- 当前粒度不落库草稿和提交，但必须保留本地编辑值，切换题目时重新按后端上下文初始化。

阶段 3.3 草稿自动保存产品规则：

- `TemplateRenderer` 的每次值变更先经过其隐藏字段清理逻辑，再由作答页以约 1 秒防抖调用 `saveAssignmentDraft`。
- 作答页加载时先用当前模板对初始值做一次隐藏字段清理，并使用稳定 JSON 序列化作为草稿基线；Renderer 初始化规范化、对象字段顺序变化或无实际内容变化不得触发自动保存。
- 请求体为 `SaveAssignmentDraftRequest { values, clientVersion }`，其中 `clientVersion` 使用当前 `AssignmentVO.version`；保存成功后用返回的 `AssignmentVO` 更新本地上下文版本。
- 页面顶部、底部和右侧历史区必须展示可理解的草稿状态：待保存、保存中、已保存时间、保存失败可重试、版本冲突需重新加载。
- 刷新页面时继续遵循初始化优先级 `assignment.draftValues > latestSubmission.values > getTemplateInitialValue(templateSchema)`，确保草稿能从 MySQL 恢复。
- 网络失败不清空本地输入；“保存草稿”按钮作为立即保存/重试入口。`ASSIGNMENT_VERSION_CONFLICT` 不盲目覆盖远端草稿，而提示重新加载当前题目。
- 阶段 3.3 初始不接入正式提交；当前阶段 3.4 已接入 `createSubmission`，阶段 3.5 返修再次提交继续复用同一接口。

阶段 3.4 提交校验和提交版本产品规则：

| 前端契约 | 字段/行为 |
| --- | --- |
| `CreateSubmissionRequest` | `values`、`idempotencyKey?`、`clientDraftVersion?`，字段名必须与后端 JSON 一致 |
| `createSubmission` | 调用 `POST /api/assignments/{assignmentId}/submissions`，返回 `SubmissionVO` |
| `SubmissionVO` | 使用后端返回的清理后 `values`、`submissionVersion`、`status` 和 `submittedAt` 更新页面状态 |

交互规则：

- 点击“提交本题”前必须先执行 `pruneHiddenSubmissionValue` 和 `validateTemplateSubmissionValue`；有错误时在字段下方和页面提示中展示，不发起提交请求。
- 提交请求仍必须由后端最终校验；后端返回 `SUBMISSION_VALIDATION_FAILED` 时，页面展示服务端字段错误并保留当前输入，便于 Labeler 立即修正。
- 草稿处于保存中时禁用提交，避免自动保存和正式提交并发写入同一 assignment 版本。
- `ASSIGNMENT_VERSION_CONFLICT` 返回时提示重新加载题目，不用本地值覆盖远端版本。
- 提交成功后刷新作答上下文，工作台进入只读态，底部按钮显示“已提交”，右侧历史显示提交时间和提交版本。
- 文件/图片字段提交值必须是受控引用字符串数组；前端不得把浏览器本地临时路径或未上传文件对象写入最终提交值。
- 提交幂等键由前端生成，重复点击同一次提交不会产生重复 submission；页面不依赖本地状态判断成功，最终以后端响应为准。

阶段 3.5 我的贡献与返修入口产品规则：

| 前端契约 | 字段/行为 |
| --- | --- |
| `getContributionStats` | 调用 `GET /api/me/contribution-stats`，展示已提交、通过、打回、待修改、草稿/待提交和通过率 |
| `listContributions` | 调用 `GET /api/me/contributions?page=&pageSize=&bucket=&keyword=`，列表行使用 `ContributionItemVO` |
| `ContributionBucket` | `ALL`、`DRAFT`、`IN_REVIEW`、`APPROVED`、`RETURNED`、`REVISION_REQUIRED`，前端只传枚举值，不自行拼接后端状态 |
| 返修入口 | `ContributionItemVO.canRevise=true` 时主按钮进入 `/labeler/assignments/:assignmentId/revise` |
| 继续作答入口 | `canContinue=true` 时进入 `/labeler/assignments/:assignmentId` |
| 查看提交入口 | `SUBMITTED/APPROVED` 进入只读工作台，展示最新提交版本和提交时间 |

交互规则：

- `/labeler/contributions` 是 Labeler 的“我的数据”主入口，页面要同时展示统计卡、状态分组、关键词筛选和列表，不依赖任务广场上下文。
- 打回原因必须使用 `reviewFeedback.reason` 展示；若阶段 4 尚未写入真实审核意见，页面展示“暂无详细审核意见”，但不得把打回入口隐藏。
- `/labeler/assignments/:assignmentId/revise` 复用 `LabelerAssignmentWorkspacePage` 与 `TemplateRenderer`，仅在顶部和右侧增强打回意见、返修文案和返回路径。
- 从返修页点击返回必须回到 `/labeler/contributions`；从普通作答页返回仍回到 `/labeler/marketplace`。
- 返修再次提交继续调用 `createSubmission`，按钮文案为“重新提交审核”；提交成功后刷新上下文并回到只读提交态。
- 进入普通作答页或返修页时，左侧全局角色导航继续自动收起，保证 1280×800 下主作答区宽度优先。

任务广场产品规则：

- 主信息区域用卡片/列表承载任务，不复用 Owner 任务表格，避免 Labeler 被暴露模板、审核配置等管理操作。
- 领取按钮只在 `availableItemCount > 0` 时可操作；请求中和成功后要有明确反馈，失败展示后端业务错误。
- 页面需在 `1280×800` 与 `1920×1080` 下无横向溢出；任务卡片在窄屏自动换行。

阶段 3.2 已落地：

- 任务广场卡片新增 `activeAssignmentId` 继续作答入口；领取新题后直接进入 `/labeler/assignments/:assignmentId`。
- 标注工作台已接入 `GET /api/assignments/{assignmentId}`，展示 assignment 快照模板、题目 payload、本地 Renderer 作答、上一题/下一题、跳题下拉和领取下一题。
- 已通过 Chrome DevTools MCP 检查 `1280×800` 与大屏尺寸无横向溢出，Network 中上下文和列表接口均返回 200，Console 无非预期错误。

阶段 3.3 前端落点：

| 文件 | 说明 |
| --- | --- |
| `src/features/assignments/types.ts` | 增加 `SaveAssignmentDraftRequest`，保持 `values/clientVersion` 与后端一致 |
| `src/features/assignments/api.ts` | 增加 `saveAssignmentDraft`，调用 `PUT /api/assignments/{assignmentId}/draft` |
| `src/features/assignments/view.ts` | 增加草稿状态文案 helper，便于页面与测试复用；时间展示继续复用 `formatTaskTime` |
| `src/pages/LabelerAssignmentWorkspacePage.tsx` | 接入防抖自动保存、手动保存/重试、冲突重新加载和右侧历史状态 |

### 9.16 阶段 4 Reviewer 审核与 Owner 验收前端契约

阶段 4 前端必须建立在阶段 3 的 `SubmissionVO` 与不可变模板版本之上，不重新实现作答表单。Reviewer 详情页应复用 `TemplateRenderer` 的只读展示能力渲染提交值，并把 AI 预审结果、人工决策和时间线作为审核信息叠加展示。

阶段 4 页面：

| 页面 | 路由 | 产品结构 |
| --- | --- | --- |
| AI 预审队列 | `/reviewer/ai-review-queue` | 按 phase4 原型独立展示 AI job 队列、Agent 健康度、今日处理、失败兜底、结构化评分、AI 评语和 Prompt 快照摘要 |
| 人工审核任务列表 | `/reviewer/reviews` | 按任务聚合待审量、AI 建议分布和最近更新；Reviewer 必须先选择任务，避免跨任务误批量 |
| 任务内审核工作台 | `/reviewer/reviews/tasks/:taskId` | 参考 `ui-prototypes/phase4/reviewer-workbench`：左侧当前任务审核队列与批量操作，中间第 1/2 轮 diff、AI 评语和人工决策，右侧关键流转时间线与任务上下文 |
| 审核详情 | `/reviewer/reviews/:reviewId` | 深度追溯页：只读题目/提交值、完整 AI 评分、提交 diff、多轮历史、状态链路、人工决策和关键流转时间线 |
| 审核结果列表 | `/reviewer/results` | 已处理审核记录、按任务/结论/处理人筛选、可回看详情 |
| Owner 数据验收 | `/owner/tasks/:taskId/acceptance` | 任务级提交、通过、打回、待审统计，AI 结论分布和抽样审核记录 |

前端核心类型已在阶段 4.0 与后端 SDD 对齐：

```ts
export interface ReviewJobVO {
  id: string;
  taskId: string;
  taskTitle: string | null;
  assignmentId: string;
  submissionId: string;
  submissionVersion: number | null;
  reviewConfigVersionId: string;
  reviewConfigVersionNo: number | null;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NEEDS_HUMAN_REVIEW";
  reviewId: string | null;
  aiConclusion: "PASS" | "RETURN" | "NEEDS_HUMAN_REVIEW" | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  aiComment: string | null;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  lastError: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewJobSummaryVO {
  totalJobs: number;
  statusCounts: Record<string, number>;
  aiConclusionCounts: Record<string, number>;
  pendingReviewCount: number;
  todayProcessedCount: number;
  todaySucceededCount: number;
  todayFailedCount: number;
  todayFallbackCount: number;
  todayPassCount: number;
  todayReturnCount: number;
  todayManualCount: number;
  averageLatencySeconds: number | null;
  failureRate: number;
  maxAttempts: number;
  runningJobCount: number;
  staleRunningJobCount: number;
  activeWorkerCount: number;
  lockTimeoutSeconds: number;
  latestWorkerId: string | null;
  latestJobUpdatedAt: string | null;
}

export interface ReviewVO {
  id: string;
  taskId: string;
  taskTitle: string | null;
  submissionId: string;
  submissionVersion: number | null;
  assignmentId: string;
  reviewJobId: string;
  reviewConfigVersionNo: number | null;
  status: "PENDING_HUMAN_REVIEW" | "APPROVED" | "RETURNED";
  aiConclusion: "PASS" | "RETURN" | "NEEDS_HUMAN_REVIEW" | null;
  aiScores: Record<string, number>;
  aiScoreTotal: number | null;
  aiComment: string | null;
  aiIssues: Array<{ field: string | null; code: string; message: string }>;
  aiIssueCount: number;
  aiSuggestions: string | null;
  humanConclusion: "APPROVE" | "RETURN" | null;
  reviewerId: string | null;
  humanComment: string | null;
  dimensionComments: Record<string, string>;
  reviewRound: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewTaskSummaryVO {
  taskId: string;
  taskTitle: string | null;
  totalReviewCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  returnedCount: number;
  aiPassCount: number;
  aiReturnCount: number;
  aiManualCount: number;
  latestReviewId: string | null;
  latestReviewUpdatedAt: string | null;
  latestReviewRound: number | null;
  reviewConfigVersionNo: number | null;
}

export interface ReviewPromptSnapshotSummaryVO {
  snapshotAvailable: boolean;
  taskTitle: string | null;
  datasetItemKeys: string[];
  submissionFieldKeys: string[];
  templateFieldLabels: string[];
  reviewDimensionNames: string[];
  reviewConfigVersionNo: number | null;
  promptExcerpt: string | null;
}

export interface ReviewStateLinkVO {
  assignmentStatus: string;
  submissionStatus: string;
  reviewJobStatus: ReviewJobStatus | null;
  reviewStatus: ReviewStatus;
  currentStep: string;
  nextActionLabel: string;
}

export interface ReviewHistoryItemVO {
  submissionId: string;
  submissionVersion: number;
  submissionStatus: string;
  submittedAt: string;
  reviewId: string | null;
  reviewStatus: ReviewStatus | null;
  aiConclusion: AiReviewConclusion | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  aiComment: string | null;
  humanConclusion: HumanReviewDecision | null;
  humanComment: string | null;
  reviewRound: number | null;
}

export interface SubmissionDiffItemVO {
  fieldKey: string;
  label: string;
  previousValue: unknown;
  currentValue: unknown;
  changeType: "ADDED" | "REMOVED" | "CHANGED" | string;
}

export interface ReviewDetailVO {
  review: ReviewVO;
  task: TaskVO;
  assignment: AssignmentVO;
  submission: SubmissionVO;
  datasetItemPayload: JsonObject;
  templateSchema: TemplateSchemaVO;
  reviewConfigVersion: ReviewConfigVersionVO;
  promptSnapshotSummary: ReviewPromptSnapshotSummaryVO | null;
  stateLink: ReviewStateLinkVO;
  reviewHistory: ReviewHistoryItemVO[];
  submissionDiff: SubmissionDiffItemVO[];
  timeline: ReviewTimelineItemVO[];
}

export interface CreateReviewDecisionRequest {
  decision: "APPROVE" | "RETURN" | "DIRECT_REVISE";
  reason?: string;
  dimensionComments?: Record<string, string>;
  revisedValues?: JsonObject;
  expectedVersion: number;
}

export interface BatchReviewDecisionRequest {
  reviewIds: string[];
  decision: "APPROVE" | "RETURN";
  reason?: string;
  expectedVersions?: Record<string, number>;
}

export interface BatchReviewDecisionVO {
  succeededIds: string[];
  failed: Record<string, string>;
}

export interface ReviewTimelineItemVO {
  actorId: string;
  actorName: string | null;
  actorRole: string;
  action: "ASSIGNMENT_CLAIM" | "SUBMISSION_CREATE" | "REVIEW_AI_SUGGESTION" | "REVIEW_DECISION";
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface AcceptanceReviewSampleVO {
  reviewId: string;
  taskTitle: string | null;
  submissionVersion: number | null;
  reviewRound: number;
  status: ReviewStatus;
  aiConclusion: AiReviewConclusion | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  humanConclusion: HumanReviewDecision | null;
  humanComment: string | null;
  updatedAt: string;
}

export interface AcceptanceStatsVO {
  taskId: string;
  submittedCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  returnedCount: number;
  aiConclusionDistribution: Record<string, number>;
  latestReviewedAt: string | null;
  recentReviews: AcceptanceReviewSampleVO[];
}
```

交互规则：

- Reviewer 登录后的默认首页为 `/reviewer/ai-review-queue`，用于先观察 AI 预审运行态、失败兜底和写回结果；人工处理入口为 `/reviewer/reviews`。
- 阶段 4.4/4.6 信息架构必须拆分为四类入口：`/reviewer/ai-review-queue` 只展示 AI job 与 Agent 运行健康；`/reviewer/reviews` 是人工审核任务列表；`/reviewer/reviews/tasks/:taskId` 是某个任务内的流转工作台；`/reviewer/results` 只做审核结果追溯。避免把 Agent 内部流水、跨任务审核记录和任务内复审动作揉在同一主列表中。
- `/reviewer/ai-review-queue`、`/reviewer/reviews`、`/reviewer/reviews/tasks/:taskId` 与 `/reviewer/reviews/:reviewId` 属于审核工作台专注场景，进入页面时左侧全局角色导航必须自动收起为窄图标栏，为队列、评分、提交快照和人工审核主内容释放宽度。
- 人工审核任务列表支持任务关键字、审核状态、AI 结论筛选；任务内工作台必须固定 `taskId` 再查询 `ReviewVO`，批量通过/打回只允许作用于当前任务内记录。AI 预审队列页支持 job 状态和关键字筛选，并通过 `ReviewJobSummaryVO` 展示运行摘要。
- 阶段 4.5/4.6 起 `/reviewer/reviews` 不再直接承载三栏记录工作台，而是人工审核任务入口；`/reviewer/reviews/tasks/:taskId` 负责复审/终审视角、第 1/2 轮 diff、AI 评语、批量操作和关键流转时间线；`/reviewer/reviews/:reviewId` 作为深度详情页，避免工作台承载过多追溯信息。
- 从任务内工作台、AI 预审队列或审核结果页进入 `/reviewer/reviews/:reviewId` 时，详情页必须保留来源上下文；默认“返回审核工作台”应回到该 review 所属任务的 `/reviewer/reviews/tasks/:taskId`，不能退回人工审核任务列表。
- 阶段 4.4 详情页必须展示状态链路、多轮历史意见和当前提交相对上一版的 diff；阶段 4.6 的任务内工作台也必须在主流程中展示第 1/2 轮差异和可滚动关键流转时间线。
- 审核时间线只展示 `领取题目`、`提交标注结果`、`AI 预审建议`、`人工审核决策` 等关键节点，过滤 `草稿保存` 这类高频过程日志；展示结构为“人员名称 + 右侧时间 + 下方动作”，与官方原型保持一致。
- Reviewer 队列列表与最近待审记录应优先展示任务标题、提交版本和审核配置版本；`reviewJobId`、`submissionId`、`idempotencyKey` 等内部追踪字段不得作为主标题，必要时只作为可复制的短流水号或详情追踪信息。
- AI 预审队列左侧 job 标题必须在卡片宽度内单行省略，不得因长任务名撑出列表容器；选中 job 头部的更新时间、人工审核入口和问题数应作为同一操作区展示，避免按钮与状态文字堆叠。
- AI 预审队列左侧列表必须在视口高度内形成内部滚动，筛选区和摘要区保持稳定，不得随着 job 数量增加把整页无限拉长。
- Agent 健康态必须区分“真实活跃 worker”和“数据库中超时 RUNNING job”：`activeWorkerCount` 只代表未超过锁超时的 worker；当 `staleRunningJobCount > 0` 时前端显示“有超时待回收”，并提示 Agent 再次领取时会回收重试。
- Reviewer 侧维度评分统一按 100 分制展示。前端根据 `score / dimension.maxScore * 100` 归一化渲染；后端仍保存配置版本定义下的原始分，兼容早期 5 分制历史记录。
- `RETURN` 决策必须填写理由；前端即时校验，但以后端状态机为最终结果。
- `DIRECT_REVISE` 表示 Reviewer 直接修订当前提交值并入库；前端需提供修订确认入口，后端必须按当前模板版本校验 `revisedValues` 后才能写入 submission 并置为通过。
- 批量打回也必须提供统一理由，并在每条 review 上写独立审计。
- 阶段 4.5 起，任务内工作台人工决策启用“打回 / 直接修订 / 通过入库”三张动作卡；详情页保留“通过/打回”深度追溯入口。成功后刷新状态并提示变化，已处理记录禁用重复决策。
- 人工审核工作台支持选择待审记录批量通过/打回；批量响应可能部分成功，前端必须展示成功数量和失败原因，并刷新列表。
- AI 结论只作为建议展示，不在前端直接决定终审状态。
- Reviewer 审核通过或打回后，Labeler 贡献页和返修页必须能通过现有 `ReviewFeedbackVO` 看到最新打回意见。
- Owner 数据验收页从 `/owner/tasks/:taskId/acceptance` 进入，展示任务通过率、打回率、待审量、AI 结论分布和最近验收样本；页面为只读分析视图，不承担人工审核决策。
- 阶段 4 所有 Reviewer 页面仍需使用 Chrome DevTools MCP 在 `1280×800` 与 `1920×1080` 下验收，重点检查列表操作区、详情页右侧决策面板、批量操作条和时间线不遮挡。

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

本次阶段 3.0/3.1 验收使用过的有效方式：

- MySQL：`localhost:3306`，执行 `uv run alembic upgrade head` 后迁移版本进入 `0004_create_labeler_foundation`。
- API：`http://localhost:8000`，Vite proxy 通过 `/api` 转发。
- Web：`http://localhost:5173`，Labeler 登录后默认进入 `/labeler/marketplace`。
- 已验证：`GET /api/marketplace/tasks` 返回 200；`POST /api/tasks/{taskId}/assignments` 返回 201；领取后页面“当前页剩余题目”减少、“我已领取”增加。
- 浏览器侧确认：Chrome DevTools MCP 在 `1280×800` 与 `1920×1080` 下检查任务广场，无横向溢出；Network 核心请求均为预期状态码；Console 仅有 Vite/React 开发提示，无业务 error/issue。
