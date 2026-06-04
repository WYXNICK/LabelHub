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
| 2 | 模板版本 | `TemplateVersionVO`、`PublishTemplateVersionRequest` | `POST/GET /api/tasks/{taskId}/template-versions`、`GET /api/template-versions/{templateVersionId}` | 阶段 2.0 契约已暴露，业务占位 |
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
- 顶部总览读取 `GET /api/tasks/summary`，展示 Owner 全量发布中任务、草稿任务、可用题目和累计提交；搜索/状态筛选只影响下方列表。
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

阶段 2.0 在前端只落模板类型和 API 封装，不新增 Designer 页面、不渲染模板、不实现拖拽交互。当前后端模板接口仍是 `501 NOT_IMPLEMENTED` 占位，2.1 开始再接入草稿保存和 schema 校验。

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
- `publishTemplateVersion`、`listTemplateVersions`、`getTemplateVersion` 仍是 2.7 占位接口，前端页面不得把它们当成可用发布能力。
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

阶段 2.3/2.4 将 `/owner/tasks/:taskId/designer` 从只读预览壳升级为 Owner 模板搭建器。该页面仍只保存模板草稿，不发布模板版本；2.7 前不得在页面上承诺“发布后可领取”。

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
| 高级物料 | `RICH_TEXT`、`FILE_UPLOAD`、`IMAGE_UPLOAD`、`JSON_EDITOR`、`LLM_ACTION` |

高级物料属性：

| 物料 | fieldKey | props | validation |
| --- | --- | --- | --- |
| `RICH_TEXT` | 必填且唯一 | `placeholder`、`defaultValue`、`toolbarPreset` | `required`、`maxLength` |
| `FILE_UPLOAD` | 必填且唯一 | `accept` 字符串数组、`maxFiles`、`maxSizeMb` | `required` |
| `IMAGE_UPLOAD` | 必填且唯一 | `accept` 图片 MIME/扩展名数组、`maxFiles`、`maxSizeMb` | `required` |
| `JSON_EDITOR` | 必填且唯一 | `placeholder`、`defaultValue` JSON Object/Array | `required` |
| `LLM_ACTION` | 不配置 | `actionLabel`、`promptTemplate`、`inputFieldKeys`、`outputFieldKey`、`helperText` | 不参与提交 |

Renderer 行为：

- `RICH_TEXT` 渲染轻量富文本编辑区，提交值为字符串；本阶段不引入额外富文本依赖。
- `FILE_UPLOAD` 与 `IMAGE_UPLOAD` 渲染 Upload 区域，阶段 2.5 只在预览中记录本地文件名，真实证据文件上传在阶段 3 作答链路接入。
- `JSON_EDITOR` 渲染等宽 JSON 编辑区，默认值可以是 JSON Object/Array；输入过程允许暂存字符串，最终提交校验放在阶段 3。
- `LLM_ACTION` 渲染可读的模型动作配置卡，展示输入字段、输出字段和 prompt 摘要；真实调用由阶段 3.6 `POST /api/llm-actions/{actionId}/runs` 接入。

交互规则：

- 高级物料同样支持点击/拖拽添加、排序、删除、右侧属性编辑、预览和保存草稿。
- Designer 生成的 schema 必须可被后端校验接口直接验证，不出现前端私有字段。
- `LLM_ACTION.props.inputFieldKeys/outputFieldKey` 只能引用当前 schema 中已存在的采集字段；后端负责最终校验。
- 预览抽屉必须用当前未保存 schema 渲染高级物料，验证 Designer/Renderer 共用契约。

验收标准：

- 前端测试覆盖高级物料默认 schema、初始提交值和 Renderer 静态渲染。
- 浏览器验收覆盖添加高级物料、编辑关键属性、预览抽屉渲染和布局在 `1280×800`、`1920×1080` 下无横向溢出。

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
