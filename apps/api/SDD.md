# LabelHub 后端 SDD 文档

## 1. 文档定位

本文档是 `apps/api` 的后端 SDD 基线，覆盖 Python API 服务以及 `apps/agent` AI 预审 worker 与后端接口之间的契约。正式开发前，本文件必须与 `apps/web/SDD.md` 中的前端 VO 和接口调用逐字段对齐。

当前文档已经进入阶段 0 实现基线；阶段 0 先固化鉴权、健康检查、OpenAPI、通用错误结构、用户角色 VO、数据库迁移骨架和 Agent 结构化输出契约。后续阶段如需变更公共契约，必须先更新本文档与 `apps/web/SDD.md`。

## 2. 技术基线

- 后端语言：Python 3.11+
- Web 框架：FastAPI
- 数据校验：Pydantic v2
- ORM：SQLAlchemy 2
- 迁移：Alembic
- 数据库：MySQL
- MySQL Driver：PyMySQL
- 队列：阶段 0 只保留接口边界，正式队列实现后续阶段确认
- 包管理器：uv
- LLM 接入：OpenAI API 格式；Agent 默认 `BASE_URL=https://token-plan-cn.xiaomimimo.com/v1`、`MODEL_NAME=mimo-v2.5-pro`、thinking 关闭
- 鉴权：HttpOnly Cookie Session

## 3. uv 包管理规则

`apps/api` 和 `apps/agent` 必须分别使用 `uv` 管理 Python 依赖。

后端 API：

```bash
cd apps/api
uv sync --extra dev
uv run python -m labelhub_api
```

AI Agent：

```bash
cd apps/agent
uv sync --extra dev
uv run python -m labelhub_agent
```

规则：

- 新增运行依赖使用 `uv add <package>`。
- 新增开发依赖使用 `uv add --dev <package>`。
- 不使用全局 `pip install` 安装项目依赖。
- `uv.lock` 已纳入仓库；后续依赖变更必须同步更新并提交对应锁文件。

## 4. SDD 驱动流程

后续每个完整功能必须按以下顺序推进：

1. 明确业务场景、接口范围和状态迁移。
2. 在后端 SDD 中定义 Request、DTO、BO、Entity、VO。
3. 在前端 SDD 中定义页面、VO、接口调用和交互状态。
4. 对齐前后端接口契约，字段名、类型、枚举、必填性、错误结构必须一致。
5. 对齐完成后，才能并行生成前端与后端代码。
6. 后端实现必须以结构化 Request/DTO/VO 为接口边界。
7. Agent 的 LLM 输出也必须先定义结构化模型，再进入业务流程。
8. 如开发中发现契约变化，先更新两份 SDD，再继续编码。

## 5. 概念分层

| 缩写 | 全称 | 含义 | 方向 |
| --- | --- | --- | --- |
| VO | Value Object | 返回给前端的数据结构 | 后端 -> 前端 |
| DTO | Data Transfer Object | 服务层或模块间传输结构 | 接口间传递 |
| BO | Business Object | 业务对象，承载内部业务逻辑 | 内部业务逻辑 |
| Entity | Entity | 数据库表映射对象 | 与数据库对应 |
| Request | Request Object | 前端传给后端的入参 | 前端 -> 后端 |

约束：

- Request 只用于 API 入参校验。
- VO 只用于 API 出参。
- DTO 用于服务层输入输出，不直接暴露数据库细节。
- BO 用于领域规则和状态迁移。
- Entity 与数据库表结构对应，不直接返回给前端。

## 6. 命名规则

Python 后端命名：

- Request：`<Action><Domain>Request`
- VO：`<Domain>VO`
- DTO：`<Domain>DTO`
- BO：`<Domain>BO`
- Entity：`<Domain>Entity`
- Service：`<Domain>Service`
- Repository：`<Domain>Repository`

示例：

```python
class CreateTaskRequest:
    title: str
    description: str | None
    quota: int


class TaskVO:
    id: str
    title: str
    status: str
    quota: int
    claimedCount: int
    deadlineAt: str | None
```

注意：返回给前端的 JSON 字段使用 camelCase。Python 内部可以使用 snake_case，但必须通过最终选定的数据校验/序列化方案明确 alias 映射，避免前后端字段漂移。

## 7. 通用接口契约

通用分页 VO：

```python
class PaginationVO:
    page: int
    pageSize: int
    totalItems: int
    totalPages: int
```

通用错误 VO：

```python
class ApiErrorDetailVO:
    code: str
    message: str
    details: object | None
    requestId: str


class ApiErrorVO:
    error: ApiErrorDetailVO
```

HTTP 状态语义：

- `400`：请求格式错误。
- `401`：未登录。
- `403`：无权限。
- `404`：资源不存在。
- `409`：状态冲突或版本冲突。
- `422`：业务校验失败。
- `500`：服务端错误。

阶段 0 所有错误响应必须统一为：

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "请先登录。",
    "details": null,
    "requestId": "req_..."
  }
}
```

字段约定：

- JSON 出参统一使用 camelCase。
- Python 内部模型使用 snake_case，通过 Pydantic alias 映射到 camelCase。
- 时间字段统一为 ISO 8601 字符串。
- 枚举统一使用 UPPER_SNAKE 字符串。

## 8. 阶段 0 已对齐接口契约

### 8.1 通用枚举

```python
class UserRole(str, Enum):
    OWNER = "OWNER"
    LABELER = "LABELER"
    REVIEWER = "REVIEWER"
    SYSTEM = "SYSTEM"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"
```

### 8.2 `GET /api/health`

Request：无。

VO：

```python
class HealthVO:
    status: str
    service: str
    version: str
    environment: str
    serverTime: str
```

### 8.3 `POST /api/auth/login`

Request：

```python
class LoginRequest:
    email: str
    password: str
```

VO：

```python
class UserVO:
    id: str
    email: str
    name: str
    role: str
    status: str
    createdAt: str


class AuthSessionVO:
    expiresAt: str


class LoginResponseVO:
    user: UserVO
    session: AuthSessionVO
```

行为：

- 登录成功后后端写入 `labelhub_session` HttpOnly Cookie。
- 账号不存在、密码错误或账号禁用统一返回 `401 INVALID_CREDENTIALS`。
- Cookie 默认 `SameSite=Lax`，开发环境允许非 secure，生产环境必须开启 secure。

### 8.4 `GET /api/auth/me`

Request：通过 `labelhub_session` Cookie 鉴权。

VO：`UserVO`。

行为：

- 未登录或 Session 无效返回 `401 UNAUTHORIZED`。

### 8.5 `POST /api/auth/logout`

Request：无。

VO：

```python
class LogoutResponseVO:
    success: bool
```

行为：

- 后端删除 `labelhub_session` Cookie。

### 8.6 `GET /api/openapi.json`

由 FastAPI 自动暴露 OpenAPI 契约，路径固定为 `/api/openapi.json`。

## 9. 后续首批业务接口占位

正式开发前，以下接口必须与前端 SDD 完整展开。阶段 1 只做任务、数据集、审核配置和发布前检查底座；缺少模板版本时发布必须被阻塞，真正可领取发布在阶段 2 模板版本完成后放开。

| 阶段 | 接口 | Request | VO | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/tasks` | `ListTasksRequest` | `PageVO[TaskVO]` | 阶段 1.1 已实现 |
| 1 | `GET /api/tasks/summary` | `GetTaskSummaryRequest` | `TaskSummaryVO` | 阶段 1.1 已实现 |
| 1 | `POST /api/tasks` | `CreateTaskRequest` | `TaskDetailVO` | 阶段 1.1 已实现 |
| 1 | `GET /api/tasks/{taskId}` | `GetTaskRequest` | `TaskDetailVO` | 阶段 1.1 已实现 |
| 1 | `PATCH /api/tasks/{taskId}` | `UpdateTaskRequest` | `TaskDetailVO` | 阶段 1.1 已实现 |
| 1 | `POST /api/tasks/{taskId}/state-transitions` | `TaskStateTransitionRequest` | `TaskDetailVO` | 阶段 1.1 已实现 |
| 1 | `GET /api/tasks/{taskId}/publish-check` | `GetPublishCheckRequest` | `PublishCheckVO` | 阶段 1.5 已实现 |
| 1 | `POST /api/tasks/{taskId}/import-jobs` | `CreateImportJobRequest` | `ImportJobVO` | 阶段 1.2 已实现 |
| 1 | `GET /api/import-jobs/{importJobId}` | `GetImportJobRequest` | `ImportJobVO` | 阶段 1.2 已实现 |
| 1 | `GET /api/import-jobs/{importJobId}/errors` | `ListImportErrorsRequest` | `PageVO[ImportErrorRowVO]` | 阶段 1.2 已实现 |
| 1 | `GET /api/tasks/{taskId}/datasets` | `ListDatasetsRequest` | `PageVO[DatasetVO]` | 阶段 1.2 已实现 |
| 1 | `GET /api/datasets/{datasetId}/items` | `ListDatasetItemsRequest` | `PageVO[DatasetItemVO]` | 阶段 1.3 已实现 |
| 1 | `PATCH /api/datasets/{datasetId}/items:batch` | `BatchUpdateDatasetItemsRequest` | `BatchUpdateDatasetItemsVO` | 阶段 1.3 已实现 |
| 1 | `GET /api/tasks/{taskId}/review-config-draft` | `GetReviewConfigDraftRequest` | `ReviewConfigDraftVO` | 阶段 1.4 已实现 |
| 1 | `PUT /api/tasks/{taskId}/review-config-draft` | `SaveReviewConfigDraftRequest` | `ReviewConfigDraftVO` | 阶段 1.4 已实现 |
| 1 | `POST /api/tasks/{taskId}/review-config-versions` | `PublishReviewConfigVersionRequest` | `ReviewConfigVersionVO` | 阶段 1.4 已实现 |
| 1 | `GET /api/tasks/{taskId}/review-config-versions` | `ListReviewConfigVersionsRequest` | `PageVO[ReviewConfigVersionVO]` | 阶段 1.4 已实现 |
| 1 | `GET /api/audit-logs` | `ListAuditLogsRequest` | `PageVO[AuditLogVO]` | 阶段 1.1 已实现 |
| 2 | `GET /api/tasks/{taskId}/template-draft` | `GetTemplateDraftRequest` | `TemplateDraftVO` | 阶段 2.1 已实现 |
| 2 | `PUT /api/tasks/{taskId}/template-draft` | `SaveTemplateDraftRequest` | `TemplateDraftVO` | 阶段 2.1 已实现 |
| 2 | `POST /api/template-schemas:validate` | `ValidateTemplateSchemaRequest` | `TemplateSchemaValidationVO` | 阶段 2.1 已实现 |
| 2 | `POST /api/tasks/{taskId}/template-versions` | `PublishTemplateVersionRequest` | `TemplateVersionVO` | 阶段 2.7 已实现 |
| 2 | `GET /api/tasks/{taskId}/template-versions` | `ListTemplateVersionsRequest` | `PageVO[TemplateVersionVO]` | 阶段 2.7 已实现 |
| 2 | `GET /api/template-versions/{templateVersionId}` | `GetTemplateVersionRequest` | `TemplateVersionVO` | 阶段 2.7 已实现 |
| 3 | `GET /api/marketplace/tasks` | `ListMarketplaceTasksRequest` | `PageVO[MarketplaceTaskVO]` | 阶段 3.1 已实现 |
| 3 | `POST /api/tasks/{taskId}/assignments` | `CreateAssignmentRequest` | `AssignmentVO` | 阶段 3.1 已实现 |
| 3 | `GET /api/assignments` | `ListAssignmentsRequest` | `PageVO[AssignmentVO]` | 阶段 3.2 已实现，阶段 3.5 继续复用 |
| 3 | `GET /api/assignments/{assignmentId}` | `GetAssignmentRequest` | `AssignmentContextVO` | 阶段 3.2 已实现 |
| 3 | `PUT /api/assignments/{assignmentId}/draft` | `SaveAssignmentDraftRequest` | `AssignmentVO` | 阶段 3.3 已实现 |
| 3/4 | `POST /api/assignments/{assignmentId}/submissions` | `CreateSubmissionRequest` | `SubmissionVO` | 阶段 3.4 已实现；阶段 4.1 已接入 Review job 幂等入队 |
| 3 | `POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run` | `RunLlmActionRequest` | `LlmActionRunVO` | 阶段 3.6 已实现 |
| 3 | `GET /api/me/contribution-stats` | `GetContributionStatsRequest` | `ContributionStatsVO` | 阶段 3.5 已实现 |
| 3 | `GET /api/me/contributions` | `ListContributionsRequest` | `PageVO[ContributionItemVO]` | 阶段 3.5 已实现 |
| 4 | `GET /api/review-jobs` | `ListReviewJobsRequest` | `PageVO[ReviewJobVO]` | 阶段 4.0 已实现 |
| 4 | `POST /api/internal/review-jobs:claim` | `ClaimReviewJobRequest` | `ClaimReviewJobResponse` | 阶段 4.0 已实现 |
| 4 | `POST /api/internal/review-jobs/{jobId}/results` | `CompleteReviewJobRequest` | `ReviewJobVO` | 阶段 4.0 基线已实现；阶段 4.3 深化 AI 结果写回 |
| 4 | `GET /api/reviews` | `ListReviewsRequest` | `PageVO[ReviewVO]` | 阶段 4.4 已深化为待审记录主视角，支持 `keyword/status/aiConclusion` 筛选 |
| 4 | `GET /api/reviews/{reviewId}` | `GetReviewRequest` | `ReviewDetailVO` | 阶段 4.4 已补充状态链路、多轮历史和提交 diff |
| 4 | `POST /api/reviews/{reviewId}/decisions` | `CreateReviewDecisionRequest` | `ReviewVO` | 阶段 4.5 待实现 |
| 4 | `POST /api/reviews:batch-decide` | `BatchReviewDecisionRequest` | `BatchReviewDecisionVO` | 阶段 4.5 待实现 |
| 5 | `POST /api/tasks/{taskId}/export-jobs` | `CreateExportJobRequest` | `ExportJobVO` | 待细化 |

### 9.1 阶段 1.0 已对齐契约

阶段 1.0 只交付 Owner 任务、数据集、导入、审核配置、发布检查与审计的契约和数据底座，不实现真实 CRUD、导入解析或状态迁移业务。所有阶段 1.0 业务接口在 OpenAPI 中暴露，并在业务实现完成前统一返回 `501 NOT_IMPLEMENTED`。

阶段 1.0 枚举：

```python
class TaskStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    PAUSED = "PAUSED"
    ENDED = "ENDED"


class DistributionStrategy(str, Enum):
    FIRST_COME_FIRST_SERVED = "FIRST_COME_FIRST_SERVED"
    ASSIGNED = "ASSIGNED"
    QUOTA_GRAB = "QUOTA_GRAB"


class DatasetType(str, Enum):
    QA_QUALITY = "QA_QUALITY"
    PREFERENCE_COMPARE = "PREFERENCE_COMPARE"
    CUSTOM = "CUSTOM"


class DatasetSourceFormat(str, Enum):
    JSON = "JSON"
    JSONL = "JSONL"
    EXCEL = "EXCEL"
    MIXED = "MIXED"


class DatasetStatus(str, Enum):
    IMPORTING = "IMPORTING"
    READY = "READY"
    FAILED = "FAILED"


class DatasetItemStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    CLAIMED = "CLAIMED"
    DISABLED = "DISABLED"


class ImportStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class ReviewConfigVersionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


class PublishBlockerCode(str, Enum):
    INVALID_TASK_STATUS = "INVALID_TASK_STATUS"
    MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS"
    MISSING_DATASET = "MISSING_DATASET"
    MISSING_TEMPLATE_VERSION = "MISSING_TEMPLATE_VERSION"
    MISSING_REVIEW_CONFIG = "MISSING_REVIEW_CONFIG"
    INVALID_QUOTA = "INVALID_QUOTA"
    INVALID_DEADLINE = "INVALID_DEADLINE"
```

阶段 1.0 Request 与 VO 字段：

| 契约 | 字段 |
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

阶段 1.0 Entity 与迁移表：`tasks`、`task_state_transitions`、`file_objects`、`datasets`、`dataset_items`、`import_jobs`、`import_error_rows`、`review_config_drafts`、`review_config_versions`、`audit_logs`。

### 9.2 阶段 1.1 任务 CRUD 与状态机

阶段 1.1 将 `GET/POST/PATCH /api/tasks`、`GET /api/tasks/summary`、`GET /api/tasks/{taskId}`、`POST /api/tasks/{taskId}/state-transitions` 和 `GET /api/audit-logs` 从契约占位推进为可用业务能力。`GET /api/tasks/summary` 返回当前 Owner 全量任务聚合，不受任务列表分页和筛选影响，用于任务管理页顶部总览卡片。

状态迁移规则：

| 当前状态 | 允许目标状态 | 说明 |
| --- | --- | --- |
| `DRAFT` | `PUBLISHED`、`ENDED` | 发布前必须通过最小发布保护；结束后不可恢复 |
| `PUBLISHED` | `PAUSED`、`ENDED` | 已发布任务可暂停或结束；该状态对应官方“发布中”，表示可领取/运行，不表示异步发布仍在处理中 |
| `PAUSED` | `PUBLISHED`、`ENDED` | 重新发布仍需通过最小发布保护 |
| `ENDED` | 无 | 终态，不允许继续迁移 |

发布最小保护：

- `quota > 0`。
- `deadlineAt` 必须存在且晚于当前时间。
- 至少存在一个 `READY` 数据集。
- `currentTemplateVersionId` 必须存在；阶段 2 前通常会被 `MISSING_TEMPLATE_VERSION` 阻塞。
- `currentReviewConfigVersionId` 必须存在。

业务错误：

- 非 Owner 访问任务写接口返回 `403 FORBIDDEN`。
- 任务不存在或不属于当前 Owner 返回 `404 NOT_FOUND`。
- 非 `DRAFT` 任务更新基础信息返回 `409 TASK_NOT_EDITABLE`。
- 乐观锁版本不匹配返回 `409 VERSION_CONFLICT`。
- 非法状态迁移返回 `409 INVALID_STATE_TRANSITION`。
- 发布保护不通过返回 `409 PUBLISH_BLOCKED`，`details.blockers` 使用 `PublishBlockerVO` 字段。

审计：

- 创建任务写入 `audit_logs.action=CREATE`。
- 更新任务写入 `audit_logs.action=UPDATE`。
- 状态迁移必须同时写入 `task_state_transitions` 与 `audit_logs.action=STATE_TRANSITION`。

### 9.3 阶段 1.2 JSON/JSONL/Excel 导入契约

阶段 1.2 将文件登记、导入任务、数据集列表和导入错误行查询从契约占位推进为可用能力；题目预览与批量编辑仍属于阶段 1.3。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `POST /api/files` | 已实现 | 创建导入文件对象，阶段 1.2 支持 `contentText` 或 `contentBase64` 写入本地临时上传目录 |
| `POST /api/tasks/{taskId}/import-jobs` | 已实现 | 同步解析导入文件并创建数据集、题目行、错误行和审计记录 |
| `GET /api/import-jobs/{importJobId}` | 已实现 | 查询导入任务状态和成功/失败统计 |
| `GET /api/import-jobs/{importJobId}/errors` | 已实现 | 分页查询导入错误行 |
| `GET /api/tasks/{taskId}/datasets` | 已实现 | 分页查询当前任务下的数据集 |
| `GET /api/datasets/{datasetId}/items` | 阶段 1.3 | 题目预览，不在 1.2 内实现 |
| `PATCH /api/datasets/{datasetId}/items:batch` | 阶段 1.3 | 批量启用/禁用或标签编辑，不在 1.2 内实现 |

`CreateFileObjectRequest` 在阶段 1.2 追加可选字段，`FileObjectVO` 不返回文件内容：

```python
class CreateFileObjectRequest:
    bucket: str
    objectKey: str
    fileName: str
    mimeType: str | None
    sizeBytes: int
    checksum: str | None
    purpose: FilePurpose
    contentText: str | None
    contentBase64: str | None
```

导入解析规则：

- `sourceFormat=JSON`：支持 JSON 数组；也支持对象内含 `items` 数组的结构。
- `sourceFormat=JSONL`：每一行必须是一个 JSON Object，空行跳过。
- `sourceFormat=EXCEL`：阶段 1.2 使用标准库解析 `.xlsx` 第一张工作表，首行为字段名。
- 每行必须是对象，且必须包含非空 `id`；该值映射为 `DatasetItemVO.externalItemId`。
- `QA_QUALITY` 至少需要 `prompt`、`model_answer`、`reference`。
- `PREFERENCE_COMPARE` 至少需要 `prompt`、`response_a`、`response_b`。
- 校验失败行写入 `import_error_rows`，不阻断其他合法行导入。

幂等与去重策略：

- `idempotencyKey` 非空且已存在时，直接返回既有 `ImportJobVO`，不得重复写入数据集或题目。
- 单次导入内部按 `externalItemId` 去重；重复行写入错误行，错误码为 `DUPLICATE_ITEM`。
- 数据库继续保留 `dataset_id + external_item_id` 唯一约束，作为最终一致性保护。

审计要求：

- 创建导入任务写入 `audit_logs.action=IMPORT_CREATE`，实体类型为 `IMPORT_JOB`。
- 导入完成写入 `audit_logs.action=IMPORT_COMPLETE`，同时记录成功数、失败数和数据集 ID。

验收标准：

- `demo_data/datasets/qa_quality` 的 JSON、JSONL、Excel 均可导入 30 条。
- `demo_data/datasets/preference_compare` 的 JSON、JSONL、Excel 均可导入 12 条。
- 错误行可通过 `GET /api/import-jobs/{importJobId}/errors` 追踪到行号、字段、错误码、错误信息和原始片段。
- 重复请求同一 `idempotencyKey` 不产生重复数据。

### 9.4 阶段 1.3 数据预览与批量编辑契约

阶段 1.3 将题目预览与批量编辑从契约占位推进为可用能力，继续复用阶段 1.0 已落库的 `dataset_items`、`datasets` 与 `audit_logs`，不新增数据库表。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /api/datasets/{datasetId}/items` | 已实现 | Owner 分页预览题目，支持 `page`、`pageSize`、`keyword` |
| `PATCH /api/datasets/{datasetId}/items:batch` | 已实现 | 批量启用/禁用题目或替换标签，写入审计日志 |

`GET /api/datasets/{datasetId}/items` 规则：

- 仅 Owner 可访问，且数据集必须归属于当前 Owner 创建的任务；否则分别返回 `403 FORBIDDEN` 或 `404 NOT_FOUND`。
- `keyword` 为空时按 `sourceRowNumber ASC, createdAt ASC` 返回；非空时匹配 `externalItemId`、`payload` 序列化内容或 `tags` 序列化内容。
- 返回 `PageVO[DatasetItemVO]`，字段名必须继续使用 camelCase，与前端 `DatasetItemVO` 一一对应。

`PATCH /api/datasets/{datasetId}/items:batch` 规则：

- `itemIds` 必填，最多 500 条；后端按顺序去重。
- `enabled` 与 `tags` 至少提供一个：`enabled=true` 将选中题目置为 `AVAILABLE`，`enabled=false` 将选中题目置为 `DISABLED`；`tags` 使用去空白、去重后的列表整体替换。
- `expectedVersion` 为可选保护字段；传入时，所有实际命中的题目版本必须一致，否则返回 `409 VERSION_CONFLICT`。
- 不属于当前数据集的 `itemIds` 不报错，计入 `skippedCount`；实际命中的题目写入 `updatedAt` 并将 `version + 1`。
- 批量操作完成后必须重算 `datasets.itemCount`、`enabledItemCount`、`disabledItemCount`，并写入 `audit_logs.action=BATCH_UPDATE`、`entityType=DATASET`、`entityId=datasetId`，`metadata` 记录 `taskId`、`itemIds`、`enabled`、`tags`、`updatedCount`、`skippedCount`。
- 返回 `BatchUpdateDatasetItemsVO`：`updatedCount`、`skippedCount`、`auditLogId`。

验收标准：

- 可分页查看导入后的 `qa_quality` 和 `preference_compare` payload。
- 可通过关键词搜索题目内容或外部题目 ID。
- 可批量禁用、重新启用和替换标签，并同步更新数据集统计。
- 批量操作可在审计接口中查询到 `BATCH_UPDATE` 记录。

### 9.5 阶段 1.4 审核配置草稿与版本契约

阶段 1.4 将审核配置从契约占位推进为可用能力，用于为阶段 4 AI 自动预审提供稳定的 Prompt、评分维度、阈值和结构化输出 schema。该阶段只保存和发布配置版本，不触发 AI 调用、不生成预审记录。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /api/tasks/{taskId}/review-config-draft` | 已实现 | Owner 获取任务审核配置草稿；不存在时返回默认草稿并落库 |
| `PUT /api/tasks/{taskId}/review-config-draft` | 已实现 | Owner 保存 Prompt、评分维度、阈值和输出 schema |
| `POST /api/tasks/{taskId}/review-config-versions` | 已实现 | 从草稿发布不可变审核配置版本，并绑定到任务当前审核配置版本 |
| `GET /api/tasks/{taskId}/review-config-versions` | 已实现 | 分页查看任务下的审核配置版本，按版本号倒序返回 |

`SaveReviewConfigDraftRequest` 规则：

- `promptTemplate` 必填，长度 1-8000；后端统一去除首尾空白。
- `dimensions` 至少 1 个、最多 20 个；`key` 在同一配置内必须唯一，字段去除首尾空白；`maxScore` 范围为 1-100，`weight` 范围为 `(0, 10]`。
- `thresholds.returnBelowScore <= thresholds.humanReviewMinScore <= thresholds.passMinScore`；当 `humanReviewMinScore` 为空时要求 `returnBelowScore <= passMinScore`。
- 阈值不能超过 `sum(maxScore * weight)` 计算出的配置最高分。
- `outputSchema` 为空时由后端按维度生成默认结构化输出 JSON Schema；非空时按调用方传入值保存。
- 阶段 1.4 仅允许 Owner 在 `DRAFT` 任务上保存和发布审核配置，避免运行中任务被阶段性能力意外改写。

`POST /api/tasks/{taskId}/review-config-versions` 规则：

- `draftId` 必须属于当前任务。
- 发布前复用草稿校验规则。
- 新版本 `versionNo = 当前最大版本号 + 1`，新版本状态为 `ACTIVE`，同任务既有 `ACTIVE` 版本置为 `DISABLED`。
- 发布成功后更新 `tasks.currentReviewConfigVersionId`，并将 `tasks.version + 1`，供发布前检查和乐观锁使用。
- 发布版本不可变；后续修改必须先保存草稿，再发布新版本。

审计要求：

- 保存草稿写入 `audit_logs.action=REVIEW_CONFIG_SAVE`，`entityType=REVIEW_CONFIG`，`entityId=draftId`。
- 发布版本写入 `audit_logs.action=REVIEW_CONFIG_PUBLISH`，`entityType=REVIEW_CONFIG`，`entityId=versionId`，`metadata` 记录 `taskId`、`draftId`、`versionNo`、`versionNote`。

验收标准：

- Owner 可进入任务审核配置页，加载默认草稿，保存 Prompt、维度、阈值和输出 schema。
- 发布版本后任务详情中的 `currentReviewConfigVersionId` 指向最新版本，版本列表展示历史版本。
- 发布第二个版本时旧版本自动变为 `DISABLED`，新版本为 `ACTIVE`。
- 重复维度 key、阈值顺序错误或阈值超过最高分时返回结构化 `422 INVALID_REVIEW_CONFIG`。
- 非 Owner 访问返回 `403 FORBIDDEN`，不存在或不归属当前 Owner 的任务返回 `404 NOT_FOUND`。

### 9.6 阶段 1.5 发布前检查契约

阶段 1.5 将发布前检查从契约占位推进为可用能力。该接口不绕过阶段 2 模板要求；如果任务尚未绑定模板版本，必须返回 `MISSING_TEMPLATE_VERSION`，并且实际状态迁移仍由 `POST /api/tasks/{taskId}/state-transitions` 做最终保护。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /api/tasks/{taskId}/publish-check` | 已实现 | Owner 读取任务发布阻塞项，返回 `PublishCheckVO` |

`PublishBlockerCode` 当前取值：

| Code | 说明 |
| --- | --- |
| `INVALID_TASK_STATUS` | 任务不是 `DRAFT` 或 `PAUSED`，不能执行发布/恢复发布 |
| `MISSING_REQUIRED_FIELDS` | 预留基础信息缺失兜底码 |
| `INVALID_QUOTA` | `quota <= 0` |
| `INVALID_DEADLINE` | `deadlineAt` 为空或不晚于当前时间 |
| `MISSING_DATASET` | 当前任务没有 `READY` 数据集 |
| `MISSING_TEMPLATE_VERSION` | 当前任务没有 `currentTemplateVersionId`；阶段 2 前这是预期阻塞 |
| `MISSING_REVIEW_CONFIG` | 当前任务没有 `currentReviewConfigVersionId` |

接口规则：

- 仅 Owner 可访问；任务不存在或不归属当前 Owner 返回 `404 NOT_FOUND`。
- `canPublish = blockers.length == 0`。
- `checkedAt` 使用后端当前时间。
- `GET /publish-check` 为只读检查，不写审计日志；真正发布成功时由状态迁移写入 `task_state_transitions` 与 `audit_logs.STATE_TRANSITION`。
- `POST /state-transitions` 迁移到 `PUBLISHED` 时必须复用同一套阻塞规则，即使前端未先调用发布检查也不能绕过。

验收标准：

- 草稿任务缺少数据集、模板版本和审核配置时，接口返回 `200` 且 `canPublish=false`，阻塞项至少包含 `MISSING_DATASET`、`MISSING_TEMPLATE_VERSION`、`MISSING_REVIEW_CONFIG`。
- 补齐 READY 数据集、模板版本 ID 和审核配置版本 ID 后，接口返回 `canPublish=true`。
- 已结束任务返回 `INVALID_TASK_STATUS`，不得显示为可发布。

### 9.7 阶段 2.0 动态模板契约与数据底座

阶段 2.0 只交付动态模板的契约、OpenAPI 可见性、Entity 和 Alembic 迁移，不实现真实保存、校验、Designer 拖拽或模板版本发布业务。模板接口按 2.1、2.2、2.3-2.7 分粒度推进，当前阶段 2.7 已完成模板版本发布能力。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /api/tasks/{taskId}/template-draft` | 契约已暴露 | 获取任务模板草稿，2.1 实现 |
| `PUT /api/tasks/{taskId}/template-draft` | 契约已暴露 | 保存任务模板草稿，2.1 实现 |
| `POST /api/template-schemas:validate` | 契约已暴露 | 校验模板 schema，2.1 实现 |
| `POST /api/tasks/{taskId}/template-versions` | 阶段 2.7 已实现 | 发布不可变模板版本 |
| `GET /api/tasks/{taskId}/template-versions` | 阶段 2.7 已实现 | 查询任务模板版本列表 |
| `GET /api/template-versions/{templateVersionId}` | 阶段 2.7 已实现 | 获取单个模板版本详情 |

阶段 2.0 枚举：

```python
class TemplateComponentType(str, Enum):
    SHOW_ITEM = "SHOW_ITEM"
    TEXT_INPUT = "TEXT_INPUT"
    TEXTAREA = "TEXTAREA"
    RADIO = "RADIO"
    CHECKBOX = "CHECKBOX"
    TAG_SELECT = "TAG_SELECT"
    RICH_TEXT = "RICH_TEXT"
    FILE_UPLOAD = "FILE_UPLOAD"
    IMAGE_UPLOAD = "IMAGE_UPLOAD"
    JSON_EDITOR = "JSON_EDITOR"
    LLM_ACTION = "LLM_ACTION"
    GROUP = "GROUP"
    TABS = "TABS"


class TemplateVersionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"
```

Request 与 VO 字段：

| 契约 | 字段 |
| --- | --- |
| `TemplateComponentDTO` | `id`、`type`、`fieldKey`、`label`、`props`、`validation`、`visibility` |
| `TemplateSchemaVO` | `schemaVersion`、`components`、`layout`、`llmActions`、`showItems` |
| `TemplateDraftVO` | `id`、`taskId`、`schema`、`updatedBy`、`createdAt`、`updatedAt` |
| `TemplateVersionVO` | `id`、`taskId`、`versionNo`、`schema`、`status`、`versionNote`、`publishedBy`、`publishedAt`、`createdAt`、`updatedAt` |
| `SaveTemplateDraftRequest` | `schema` |
| `ValidateTemplateSchemaRequest` | `schema` |
| `TemplateSchemaValidationVO` | `valid`、`errors` |
| `PublishTemplateVersionRequest` | `draftId`、`versionNote` |

阶段 2.0 Entity 与迁移表：`template_drafts`、`template_versions`。

数据表约束：

- `template_drafts.task_id` 唯一，一个任务只保留一个当前可编辑草稿。
- `template_versions.task_id + version_no` 唯一，发布版本不可原地覆盖。
- `template_versions.status` 使用 `ACTIVE/DISABLED`，2.7 发布新版本时再处理旧版本停用和 `tasks.current_template_version_id` 绑定。
- `tasks.current_template_version_id` 当前仍保持普通索引，不在 2.0 强加外键，避免阶段 1 既有测试或演示数据中的临时模板 ID 被迁移破坏。

验收标准：

- `/api/openapi.json` 包含阶段 2 模板接口与 `Template*` schema。
- SQLAlchemy metadata 注册 `template_drafts`、`template_versions`。
- Alembic `0003_create_template_foundation` 可在 MySQL 上执行。
- 阶段 2.0 的版本接口在当时仅作为契约底座；阶段 2.7 完成后不得再返回 `501 NOT_IMPLEMENTED`。

### 9.8 阶段 2.1 模板 schema 基础结构与后端校验

阶段 2.1 将模板草稿和 schema 校验从占位推进为可用能力。该阶段仍不实现 Renderer、Designer 拖拽、基础物料属性面板或模板版本发布；版本发布继续由 2.7 完成。

接口范围：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /api/tasks/{taskId}/template-draft` | 已实现 | Owner 获取任务模板草稿；不存在时创建默认空 schema 草稿 |
| `PUT /api/tasks/{taskId}/template-draft` | 已实现 | Owner 保存模板草稿；非法 schema 返回结构化错误 |
| `POST /api/template-schemas:validate` | 已实现 | Owner 校验模板 schema；返回 `valid=false` 与错误列表，不写库 |
| `POST/GET /api/tasks/{taskId}/template-versions` | 阶段 2.7 已实现 | 发布版本与版本列表 |
| `GET /api/template-versions/{templateVersionId}` | 阶段 2.7 已实现 | 版本详情 |

基础校验规则：

- `schemaVersion` 当前必须为 `labelhub-template/v1`。
- `component.id` 在同一 schema 内必须唯一。
- `component.type` 必须属于官方物料白名单。
- 采集类物料必须配置非空 `fieldKey`，且同一 schema 内 `fieldKey` 必须唯一。
- `SHOW_ITEM`、`LLM_ACTION`、`GROUP`、`TABS` 不参与提交，不应配置 `fieldKey`。
- `layout.root` 必须是数组，布局节点只能是组件 ID 字符串或包含 `componentId` 的对象。
- 布局引用的组件必须存在；同一组件不能在布局中重复出现；组件也不能成为孤儿节点。
- `children` 仅允许用于 `GROUP`；`tabs` 仅允许用于 `TABS`。

错误语义：

- `POST /api/template-schemas:validate` 校验失败时返回 `200`，`TemplateSchemaValidationVO.valid=false`，`errors` 中包含 `field` 和 `message`。
- `PUT /api/tasks/{taskId}/template-draft` 校验失败时返回 `422 INVALID_TEMPLATE_SCHEMA`，`details.errors` 与校验接口字段一致。
- 非 Owner 返回 `403 FORBIDDEN`；任务不存在或不归属当前 Owner 返回 `404 NOT_FOUND`。
- 当前仅允许在 `DRAFT` 任务上保存模板草稿；非草稿任务返回 `409 TASK_NOT_EDITABLE`。

审计要求：

- 保存草稿写入 `audit_logs.action=TEMPLATE_SAVE`，`entityType=TEMPLATE`，`entityId=draftId`。
- `metadata` 记录 `taskId`、`componentCount` 和 `schemaVersion`。

验收标准：

- Owner 可获取默认空模板草稿，默认 `layout.root=[]`。
- 合法 schema 可保存到 `template_drafts.schema`。
- 非法物料、重复 `fieldKey`、重复布局引用、引用不存在组件、孤儿组件均能得到结构化错误。
- MySQL 环境下可以真实创建任务、保存模板草稿，并在 `template_drafts` 中查询到 schema。

### 9.9 阶段 2.2 Renderer 最小运行时契约

阶段 2.2 不新增后端接口，也不改变模板版本发布语义。后端责任是继续保证 2.1 的 `TemplateSchemaVO` 可作为 Renderer 的唯一输入 schema；前端 Renderer 必须直接消费该 schema，不允许引入前端私有模板协议。

Renderer 最小支持范围：

| 物料类型 | Renderer 行为 |
| --- | --- |
| `SHOW_ITEM` | 从题目 payload 中按 `props.path` 读取并只读展示，不进入提交值 |
| `TEXT_INPUT` | 渲染单行输入，值写入 `fieldKey` |
| `TEXTAREA` | 渲染多行文本，值写入 `fieldKey` |
| `RADIO` | 按 `props.options` 渲染单选，值写入 `fieldKey` |
| `CHECKBOX` | 按 `props.options` 渲染多选，值写入 `fieldKey` 数组 |
| `TAG_SELECT` | 按 `props.options` 渲染标签选择，允许多选，值写入 `fieldKey` 数组 |

后端校验继续覆盖：

- 上述采集物料必须有唯一 `fieldKey`。
- `SHOW_ITEM` 不得配置 `fieldKey`。
- `layout.root` 引用的组件必须存在，且不能重复。
- 2.2 所用 demo schema 必须可通过 `POST /api/template-schemas:validate`。

验收标准：

- 后端测试覆盖包含 `SHOW_ITEM`、`TEXT_INPUT`、`TEXTAREA`、`RADIO`、`CHECKBOX`、`TAG_SELECT` 的最小 Renderer schema，并确认校验通过。
- 保存到 `template_drafts.schema` 的同一份 schema 可被前端 Renderer 直接渲染。
- 阶段 2.7 完成后 `template-versions` 相关接口必须解除占位；只有任务尚未绑定当前模板版本时才返回 `MISSING_TEMPLATE_VERSION`。

### 9.10 阶段 2.3/2.4 Designer 与基础物料校验契约

阶段 2.3/2.4 不新增后端接口，继续复用阶段 2.1 已实现的模板草稿与校验接口：

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 获取草稿 | `GET /api/tasks/{taskId}/template-draft` | Designer 初始化时读取同一份 `TemplateSchemaVO` |
| 保存草稿 | `PUT /api/tasks/{taskId}/template-draft` | Designer 保存当前画布、物料属性、默认值与校验配置 |
| 校验 schema | `POST /api/template-schemas:validate` | Designer 点击校验或保存前展示结构化错误 |

基础物料后端语义校验：

| 物料 | 必填契约 | props/validation 约束 |
| --- | --- | --- |
| `SHOW_ITEM` | `fieldKey=null` | `props.path` 为空或以 `$` 开头 |
| `TEXT_INPUT` | 唯一 `fieldKey` | `props.placeholder/defaultValue` 为字符串；`validation.required` 为布尔值；`validation.maxLength` 为 1-500 |
| `TEXTAREA` | 唯一 `fieldKey` | `props.placeholder/defaultValue` 为字符串；`validation.required` 为布尔值；`validation.maxLength` 为 1-5000 |
| `RADIO` | 唯一 `fieldKey` | `props.options` 至少 1 项；每项包含非空 `label/value`；`props.defaultValue` 为空或存在于 options |
| `CHECKBOX` | 唯一 `fieldKey` | `props.options` 至少 1 项；`props.defaultValue` 为空或为 options value 子集数组 |
| `TAG_SELECT` | 唯一 `fieldKey` | 与 `CHECKBOX` 相同；运行时以多选标签渲染 |

验收标准：

- 保存 Designer 生成的基础物料 schema 时，后端不接受非法 options、非法默认值、非法最大长度或非法 ShowItem 路径。
- `TemplateSchemaValidationVO.errors` 仍保持 `field + message` 结构，前端可直接映射到右侧属性或顶部错误提示。
- Designer 保存草稿不等于发布模板版本；只有阶段 2.7 发布成功并更新 `tasks.current_template_version_id` 后，才解除任务发布前检查中的 `MISSING_TEMPLATE_VERSION`。

### 9.11 阶段 2.5 高级物料校验契约

阶段 2.5 不新增 API，也不新增数据库表。后端继续用 `TemplateSchemaVO` 作为唯一模板协议，在 `POST /api/template-schemas:validate` 与 `PUT /api/tasks/{taskId}/template-draft` 中补齐高级物料的语义校验。

高级物料规则：

| 物料 | fieldKey | props/validation 约束 |
| --- | --- | --- |
| `RICH_TEXT` | 唯一且非空 | `props.placeholder/defaultValue` 为字符串；`props.toolbarPreset` 为空或字符串；`validation.required` 为布尔值；`validation.maxLength` 为 1-10000 |
| `FILE_UPLOAD` | 唯一且非空 | `props.accept` 为空或非空字符串数组；`props.maxFiles` 为 1-20 整数；`props.maxSizeMb` 为 1-100 整数；`props.defaultValue` 为空或字符串数组 |
| `IMAGE_UPLOAD` | 唯一且非空 | 与 `FILE_UPLOAD` 相同，但 `accept` 只能使用 `image/*`、图片 MIME 或图片扩展名 |
| `JSON_EDITOR` | 唯一且非空 | `props.placeholder` 为空或字符串；`props.defaultValue` 为空或 JSON Object/Array；`validation.required` 为布尔值 |
| `LLM_ACTION` | 必须为空 | `props.promptTemplate` 必填且长度不超过 8000；`props.actionLabel/helperText` 为空或字符串；`props.inputItemPaths` 为空或以 `$` 开头的题目 payload 路径数组；`props.inputFieldKeys` 为空或采集字段数组；`props.outputFieldKey` 为空或引用已存在采集字段 |

LLM 边界：

- 阶段 2.5 的 `LLM_ACTION` 只保存配置，不调用模型、不生成结果、不写预审记录。
- `inputItemPaths` 引用题目 payload 路径，通常来自 `SHOW_ITEM.props.path`；`inputFieldKeys` 与 `outputFieldKey` 使用模板采集字段 `fieldKey`，不使用组件 ID，保证后续 Labeler 提交值和 LLM 输入映射稳定。
- `TemplateComponentDTO.label` 是 Owner 配置并展示给标注员的用户文案；前端 Designer 新增物料默认使用中文业务语义，后端只做快照保存和校验，不在保存或发布时自动翻译 label。
- 真实题目级调用接口将在阶段 3.6 通过 `POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run` 接入，必须继续使用 OpenAI API 格式和结构化输出模型。

验收标准：

- 合法高级物料 schema 可以通过校验并保存到 `template_drafts.schema`。
- 非法上传限制、非法 JSON 默认值、缺失 LLM prompt、引用不存在字段的 LLM 映射都返回结构化 `TemplateSchemaValidationVO.errors`。
- 保存草稿仍只允许草稿任务，且继续写入 `audit_logs.action=TEMPLATE_SAVE`。

### 9.12 阶段 2.6 高级布局与规则校验契约

阶段 2.6 不新增 API 和数据库表，继续复用 `POST /api/template-schemas:validate` 与 `PUT /api/tasks/{taskId}/template-draft`。本阶段补齐官方 4.2 进阶要求中的条件显示、联动校验、正则/白名单自定义规则、分组容器和多 Tab 布局。

规则协议：

```json
{
  "visibility": {
    "logic": "ALL",
    "conditions": [
      { "fieldKey": "quality", "operator": "EQUALS", "value": "bad" }
    ]
  },
  "validation": {
    "required": true,
    "maxLength": 500,
    "pattern": "^[^@#$]+$",
    "patternMessage": "不能包含特殊符号",
    "customRuleIds": ["NO_EMOJI"],
    "requiredWhen": {
      "logic": "ALL",
      "conditions": [
        { "fieldKey": "quality", "operator": "EQUALS", "value": "bad" }
      ],
      "message": "质量较差时必须填写原因"
    }
  }
}
```

支持的条件操作符：

| operator | 语义 |
| --- | --- |
| `EQUALS` | 字段值等于 `value` |
| `NOT_EQUALS` | 字段值不等于 `value` |
| `IN` | 字段值或数组字段任一项命中 `value[]` |
| `NOT_IN` | 字段值或数组字段均未命中 `value[]` |
| `NOT_EMPTY` | 字段存在且非空 |
| `EMPTY` | 字段不存在或为空 |

白名单自定义规则：

| ruleId | 语义 |
| --- | --- |
| `NO_EMOJI` | 文本不得包含 emoji |
| `NO_URL` | 文本不得包含 URL |
| `TRIMMED_NON_EMPTY` | 去除首尾空白后不得为空 |
| `JSON_OBJECT` | JSON 编辑器值必须是 Object |

布局协议：

| 物料 | fieldKey | props | layout |
| --- | --- | --- | --- |
| `GROUP` | 必须为空 | `description?: string`、`collapsible?: boolean` | `{ "componentId": "group_id", "children": [...] }` |
| `TABS` | 必须为空 | `defaultTabId?: string` | `{ "componentId": "tabs_id", "tabs": [{ "id": "tab_1", "label": "基础信息", "children": [...] }] }` |

后端校验要求：

- `visibility.logic` 与 `validation.requiredWhen.logic` 只能是 `ALL` 或 `ANY`，缺省按 `ALL`。
- 条件 `fieldKey` 必须引用当前 schema 中已存在的采集字段；不得引用当前组件自身的 `fieldKey`。
- `operator=IN/NOT_IN` 时 `value` 必须是非空字符串数组；`EQUALS/NOT_EQUALS` 时 `value` 必须是字符串、数字、布尔值或 null。
- `validation.pattern` 必须是可编译正则；`patternMessage` 为空或字符串。
- `validation.customRuleIds` 只能使用白名单 ID，不允许保存任意函数体或脚本。
- `GROUP` 的 layout 节点必须使用 `children`；非 GROUP 不允许使用 `children`。
- `TABS` 的 layout 节点必须使用 `tabs`，每个 tab 必须有唯一非空 `id`、非空 `label` 和 `children` 数组；非 TABS 不允许使用 `tabs`。
- 嵌套布局中每个组件只能出现一次；所有组件都必须出现在 layout 中。

阶段边界：

- 阶段 2.6 只校验规则定义和 Owner 预览运行时效果，不新增 Labeler 提交接口。
- 真正提交时的后端字段级校验将在阶段 3.4 复用同一套规则语义接入。

### 9.13 阶段 2.7 模板版本发布与发布检查联动契约

阶段 2.7 将模板版本接口从契约占位推进为可用业务能力。模板版本是任务级不可变快照：一个任务拥有一份 `template_drafts`，可以发布多个 `template_versions`，但任意时刻只有一个 `ACTIVE` 版本绑定到 `tasks.current_template_version_id`。

接口契约：

| 接口 | 权限 | 行为 |
| --- | --- | --- |
| `POST /api/tasks/{taskId}/template-versions` | Owner 且只能操作自己创建的草稿任务 | 校验并发布当前草稿快照，返回 `TemplateVersionVO` |
| `GET /api/tasks/{taskId}/template-versions?page&pageSize` | Owner 且只能查看自己创建的任务 | 按 `versionNo` 倒序返回版本分页 |
| `GET /api/template-versions/{templateVersionId}` | Owner 且只能查看自己任务下的版本 | 返回单个不可变版本详情 |

`PublishTemplateVersionRequest`：

```json
{
  "draftId": "draft_xxx",
  "versionNote": "补齐商品清洗标签"
}
```

发布规则：

- 任务必须处于 `DRAFT`，已发布、暂停或结束任务不得继续改写模板版本。
- `draftId` 必须等于当前任务草稿 ID，避免跨任务或旧草稿误发布。
- 发布前必须复用 `POST /api/template-schemas:validate` 的完整校验，并追加发布级校验：`components` 至少 1 个、`layout.root` 非空、至少存在 1 个可提交字段。
- 发布成功后写入新的 `TemplateVersionEntity`，`versionNo=max+1`，`schema` 为发布时的完整 JSON 快照，后续草稿修改不得改变历史版本。
- 发布新版本时将同任务旧 `ACTIVE` 版本更新为 `DISABLED`，新版本为 `ACTIVE`。
- 同一事务内更新 `tasks.current_template_version_id`、递增 `tasks.version` 并写入 `audit_logs.action=TEMPLATE_PUBLISH`。
- 发布失败返回统一错误结构；schema 不可发布时使用 `422 INVALID_TEMPLATE_SCHEMA` 并返回字段级 `errors`。

发布检查联动：

- `GET /api/tasks/{taskId}/publish-check` 以 `tasks.currentTemplateVersionId` 判断模板是否就绪。
- 成功发布模板版本后，同一任务的发布检查不再返回 `MISSING_TEMPLATE_VERSION`；是否可发布仍取决于数据集、审核配置、配额、截止时间和任务状态。
- `TaskVO` 与 `TaskDetailVO` 必须返回 `currentTemplateVersionId`、`currentReviewConfigVersionId`；`TaskStatsVO` 返回 `templateVersionCount`，用于前端展示模板准备状态。

验收标准：

- 发布合法草稿后返回 `TemplateVersionVO.status=ACTIVE`，版本列表按版本号倒序展示。
- 连续发布两次时，新版本为 `ACTIVE`，旧版本为 `DISABLED`，旧版本 schema 保持不可变。
- 发布空默认草稿返回 `422 INVALID_TEMPLATE_SCHEMA`，错误中至少包含 `components` 和 `layout.root`。
- 发布模板版本后发布检查不再出现 `MISSING_TEMPLATE_VERSION`。

### 9.14 阶段 3 Labeler 工作台与提交闭环契约

阶段 3 必须以阶段 2 的 `TemplateVersionVO.schema` 为唯一作答协议。后端不能信任前端提交值，必须实现与前端 Renderer 等价的字段级提交校验，并以 assignment 领取时绑定的模板版本快照为准。

新增实体：

| Entity | 说明 |
| --- | --- |
| `AssignmentEntity` | Labeler 对某个任务题目的领取记录，保存模板版本、审核配置版本、草稿和导航状态 |
| `SubmissionEntity` | 正式提交版本，保存不可变提交值和当次使用的模板版本 |
| `LlmActionRunEntity` 或等价审计结构 | 记录题目级 LLM_ACTION 调用、输入、输出、错误和幂等键 |

核心 VO/Request：

| 契约 | 字段 |
| --- | --- |
| `MarketplaceTaskVO` | `id`、`title`、`description`、`tags`、`rewardRule`、`deadlineAt`、`quota`、`availableItemCount`、`claimedByMeCount`、`submittedByMeCount`、`activeAssignmentId` |
| `AssignmentVO` | `id`、`taskId`、`datasetItemId`、`templateVersionId`、`reviewConfigVersionId`、`status`、`draftValues`、`draftSavedAt`、`version`、`createdAt`、`updatedAt` |
| `AssignmentContextVO` | `assignment`、`task`、`datasetItemPayload`、`templateSchema`、`latestSubmission`、`reviewFeedback`、`navigation` |
| `SaveAssignmentDraftRequest` | `values`、`clientVersion` |
| `CreateSubmissionRequest` | `values`、`idempotencyKey`、`clientDraftVersion` |
| `SubmissionVO` | `id`、`assignmentId`、`submissionVersion`、`values`、`status`、`submittedAt` |
| `RunLlmActionRequest` | `inputValues`、`targetFieldKey`、`idempotencyKey` |
| `LlmActionRunVO` | `id`、`assignmentId`、`taskId`、`componentId`、`status`、`inputValues`、`outputValue`、`outputValues`、`errorMessage`、`idempotencyKey`、`createdAt` |

任务广场与领取规则：

- `GET /api/marketplace/tasks` 只返回 `PUBLISHED`、未过期、未结束、已绑定模板版本和审核配置版本、且存在可用未领取题目的任务。
- `POST /api/tasks/{taskId}/assignments` 在同一数据库事务内选择一个 `READY` 且未被有效 assignment 占用的 `dataset_items`，创建 assignment，并更新任务领取计数。
- MVP 使用先到先得且同一题目只允许一个有效 assignment；多人标注以后扩展。
- 创建 assignment 时必须固化 `template_version_id` 和 `review_config_version_id`，后续 Owner 发布新版本不得影响已领取题目。

阶段 3.0/3.1 首批落地契约：

| 名称 | 字段 |
| --- | --- |
| `MarketplaceTaskVO` | `id`、`title`、`description`、`tags`、`rewardRule`、`quota`、`claimedCount`、`submittedCount`、`approvedCount`、`availableItemCount`、`claimedByMeCount`、`submittedByMeCount`、`activeAssignmentId`、`deadlineAt`、`distributionStrategy`、`currentTemplateVersionId`、`currentReviewConfigVersionId`、`updatedAt` |
| `AssignmentVO` | `id`、`taskId`、`datasetItemId`、`templateVersionId`、`reviewConfigVersionId`、`labelerId`、`status`、`draftValues`、`draftSavedAt`、`currentSubmissionId`、`claimedAt`、`submittedAt`、`version`、`createdAt`、`updatedAt` |
| `CreateAssignmentRequest` | `idempotencyKey?`，用于后续防重复点击；阶段 3.1 可为空 |

阶段 3.2 作答上下文契约：

| 名称 | 字段/规则 |
| --- | --- |
| `GET /api/assignments` | 仅返回当前 Labeler 的领取列表，支持 `status`、`page`、`pageSize`，用于后续“我的贡献”和跳题候选 |
| `GET /api/assignments/{assignmentId}` | 返回当前 Labeler 对该 assignment 的完整作答上下文；非本人领取不可访问 |
| `AssignmentContextVO` | `assignment`、`task`、`datasetItemPayload`、`templateSchema`、`latestSubmission`、`reviewFeedback`、`navigation` |
| `SubmissionVO` | `id`、`assignmentId`、`taskId`、`datasetItemId`、`templateVersionId`、`submissionVersion`、`values`、`status`、`submittedAt`、`createdAt`、`updatedAt` |
| `AssignmentNavigationVO` | `previousAssignmentId`、`nextAssignmentId`、`currentIndex`、`totalCount`、`canClaimNext`、`nextClaimableTaskId` |

导航规则：

- 上一题/下一题限定在当前 Labeler、当前任务、未取消的 assignment 内，按 `claimedAt`、`id` 稳定排序。
- `datasetItemPayload` 使用领取时绑定的题目原始 payload；`templateSchema` 使用 assignment 上的不可变 `templateVersionId`，不得读取任务当前草稿。
- `latestSubmission` 取同一 assignment 下 `submissionVersion` 最大的一条；阶段 3.2 可为空，阶段 3.4 提交后复用。
- `canClaimNext` 必须继续复用任务发布、截止时间、配额和可用题目检查；前端不可自行推断。

阶段 3.3 草稿自动保存契约：

| 名称 | 字段/规则 |
| --- | --- |
| `PUT /api/assignments/{assignmentId}/draft` | 当前 Labeler 保存本人领取题目的作答草稿；非本人领取不可访问 |
| `SaveAssignmentDraftRequest` | `values` 为 JSON Object；`clientVersion` 必须等于当前 `assignments.version` |
| `AssignmentVO` | 保存成功后返回最新 assignment，包含递增后的 `version`、`draftValues`、`draftSavedAt` 和 `status` |

保存规则：

- 草稿保存不做 required 完整性校验，允许半成品内容落库；最终提交校验放在阶段 3.4。
- 后端仍只接受 JSON Object，拒绝数组、字符串等非对象根值，避免提交协议漂移。
- 只允许 `CLAIMED`、`DRAFT_SAVED`、`RETURNED` 状态保存草稿；`SUBMITTED`、`APPROVED`、`CANCELLED` 返回 `409 ASSIGNMENT_NOT_EDITABLE`。
- `clientVersion` 与当前 `assignment.version` 不一致时返回 `409 ASSIGNMENT_VERSION_CONFLICT`，`details.currentVersion` 给前端展示冲突和重新加载。
- 首次保存从 `CLAIMED` 迁移到 `DRAFT_SAVED`；后续保存保持当前可编辑状态。
- 每次保存写入 `audit_logs.action=ASSIGNMENT_DRAFT_SAVE`，`metadata` 至少记录 `taskId`、`datasetItemId`、`fieldKeys`。

阶段 3.4 提交校验和提交版本契约：

| 名称 | 字段/规则 |
| --- | --- |
| `POST /api/assignments/{assignmentId}/submissions` | 当前 Labeler 正式提交本人领取题目；非本人领取不可访问 |
| `CreateSubmissionRequest` | `values` 为 JSON Object；`idempotencyKey?` 防重复点击；`clientDraftVersion?` 用于提交前乐观冲突检查 |
| `SubmissionVO` | 返回新建或幂等命中的提交版本，包含 `submissionVersion`、清理后的 `values`、`status=SUBMITTED` 和 `submittedAt` |

提交规则：

- 只允许 `CLAIMED`、`DRAFT_SAVED`、`RETURNED` 状态提交；`SUBMITTED`、`APPROVED`、`CANCELLED` 返回 `409 ASSIGNMENT_NOT_EDITABLE`。
- 若 `clientDraftVersion` 存在且落后于当前 `assignments.version`，返回 `409 ASSIGNMENT_VERSION_CONFLICT`，前端必须重新加载后再提交。
- 后端使用 assignment 固化的 `template_version_id` 读取不可变 schema，不能读取任务当前草稿或最新模板。
- 后端先按 `visibility`/`requiredWhen` 规则计算可见字段，清理隐藏字段；`SHOW_ITEM`、`GROUP`、`TABS`、`LLM_ACTION` 等非采集组件不得进入提交值。
- 后端最终校验必须覆盖 required、requiredWhen、maxLength、pattern、customRuleIds、RADIO/CHECKBOX/TAG_SELECT 枚举值、JSON Object，以及 FILE/IMAGE 受控引用数组和数量限制。
- 校验失败返回 `422 SUBMISSION_VALIDATION_FAILED`，`details.errors` 使用 `{ fieldKey, message }[]`，字段名和前端 VO 一致。
- 每次成功提交生成 `submission_version=max+1`，写入 `submissions`，更新 `assignments.current_submission_id`、`assignments.status=SUBMITTED`、`assignments.submitted_at`、`assignments.version+1`，并递增任务提交计数。
- `idempotencyKey` 命中同一 assignment 的既有 submission 时直接返回既有 `SubmissionVO`；命中其他 assignment 或其他用户时返回 `409 SUBMISSION_IDEMPOTENCY_CONFLICT`。
- 提交成功写入 `audit_logs.entity_type=SUBMISSION`、`action=SUBMISSION_CREATE`，metadata 至少记录 `taskId`、`assignmentId`、`datasetItemId`、`templateVersionId`、`submissionVersion` 和 `fieldKeys`。

新增枚举：

| 枚举 | 值 |
| --- | --- |
| `AssignmentStatus` | `CLAIMED`、`DRAFT_SAVED`、`SUBMITTED`、`RETURNED`、`APPROVED`、`CANCELLED` |
| `SubmissionStatus` | `SUBMITTED`、`AI_REVIEWING`、`HUMAN_REVIEWING`、`RETURNED`、`APPROVED` |
| `LlmActionRunStatus` | `SUCCEEDED`、`FAILED` |

阶段 3.1 错误码：

| code | 场景 |
| --- | --- |
| `FORBIDDEN` | 非 Labeler 调用任务广场或领取接口 |
| `TASK_NOT_CLAIMABLE` | 任务不是发布中、已过期、缺模板版本、缺审核配置或分发策略暂不支持 |
| `NO_AVAILABLE_ITEMS` | 任务没有可领取题目或配额已满 |
| `CLAIM_CONFLICT` | 并发领取时目标题目已被其他 Labeler 抢先锁定 |
| `ASSIGNMENT_NOT_EDITABLE` | assignment 已提交、已通过、已取消或处于不可编辑状态 |
| `ASSIGNMENT_VERSION_CONFLICT` | 草稿保存时 `clientVersion` 已落后服务端版本 |

草稿与提交规则：

- 草稿保存在 `assignments.draft_values`，并使用 `assignments.version` 做乐观锁；前端刷新后从 assignment 恢复。
- 提交时以后端模板版本 schema 校验最终值，覆盖 required、requiredWhen、maxLength、pattern、customRuleIds、枚举值、JSON Object、文件/图片数量和受控文件引用。
- `SHOW_ITEM`、`GROUP`、`TABS`、`LLM_ACTION` 不允许进入提交值；隐藏字段必须清理后再提交。
- 每次正式提交生成递增 `submission_version`，写入 `SUBMISSION_CREATE` 审计，并更新 assignment 当前提交 ID 与状态。
- 阶段 3 提交后状态保持 `SUBMITTED`，阶段 4 再接入 AI 预审队列和人工审核状态迁移。

题目级 LLM 辅助：

- `POST /api/assignments/{assignmentId}/llm-actions/{componentId}:run` 只能运行 assignment 模板版本中的 `LLM_ACTION` 组件。
- `RunLlmActionRequest.inputValues` 使用当前 Renderer 提交值快照；题目原始数据由后端按 `LLM_ACTION.props.inputItemPaths` 从 assignment 固化的 dataset item payload 中读取，不能由前端伪造；`targetFieldKey` 为空时以后端模板 `LLM_ACTION.props.outputFieldKey` 为准。
- 后端发送给模型的上下文只能包含 `selectedItemValues` 与 `selectedInputValues`：`selectedItemValues` 来自 `inputItemPaths` 显式选择的路径，`selectedInputValues` 来自 `inputFieldKeys` 显式选择的提交字段。不得把完整 `datasetItemPayload` 或未选择字段传给模型，避免题目级辅助读取无关列后串题。
- 后端必须用 assignment 固化的 `template_version_id` 定位组件，不能读取任务当前草稿或最新模板；组件不存在、组件类型不是 `LLM_ACTION`、输出字段不在当前 schema 中都返回结构化错误。
- 请求使用 OpenAI API 兼容 Chat Completions 格式，配置从 `OPENAI_API_KEY`、`BASE_URL`/`OPENAI_BASE_URL`、`MODEL_NAME`/`OPENAI_MODEL_NAME`、`OPENAI_TIMEOUT_SECONDS`/`LLM_TIMEOUT_SECONDS` 读取；真实密钥不得进入仓库。题目级 LLM 辅助默认请求超时为 90 秒，允许本地或部署环境调大到 300 秒以内。
- thinking 必须关闭：服务端系统提示禁止输出思考过程；如供应商需要显式参数，通过 `LLM_EXTRA_BODY_JSON` 注入。当前 MiMo OpenAI 兼容服务在 `OPENAI_THINKING_ENABLED=false` 且识别到 MiMo Provider 时，后端会自动携带 `{"chat_template_kwargs":{"enable_thinking":false}}`；显式 `LLM_EXTRA_BODY_JSON` 优先级更高。未知 Provider 不自动注入额外字段，保证后续更换同协议 Provider 时仍可请求。
- 模型输出必须解析为结构化 JSON，优先读取 `outputValues[targetFieldKey]`，其次读取 `outputValue`、目标字段同名字段或 `text`；解析失败时把原始文本作为 `outputValue`。
- 输出只作为参考或预填草稿，不自动提交。前端采纳后仍需 Labeler 手动保存/提交，后端提交接口继续做最终模板校验。
- 后端必须记录调用输入、输出、错误和幂等键；同一 `idempotencyKey` 重试直接返回既有 `LlmActionRunVO`，避免重复扣费或重复写入。
- Provider 调用失败也要落 `llm_action_runs.status=FAILED` 并返回 `LlmActionRunVO`，前端用 `errorMessage` 告知用户，不把一次模型失败伪装成提交失败。超时错误必须包含当前超时秒数和排查方向，避免只显示英文内部异常。

### 9.15 阶段 3.5 我的贡献与返修入口契约

阶段 3.5 只消费 Labeler 已有 assignment、submission 与 audit 记录，不提前实现 Reviewer 审核流。Reviewer 阶段真正写入打回审计后，Labeler 侧继续沿用本节 VO。

新增接口：

| 接口 | Request | VO | 说明 |
| --- | --- | --- | --- |
| `GET /api/me/contribution-stats` | Cookie 鉴权，无请求体 | `ContributionStatsVO` | 返回当前 Labeler 的已提交、通过、打回、待修改、草稿/待提交、通过率等聚合统计 |
| `GET /api/me/contributions` | `page`、`pageSize`、`bucket?`、`keyword?` | `PageVO[ContributionItemVO]` | 返回当前 Labeler 的贡献列表，支持按状态分组和任务/题目关键词筛选 |

VO 字段：

```python
class ReviewFeedbackVO(CamelModel):
    reason: str
    source: str
    reviewerId: str | None
    reviewerRole: str | None
    returnedAt: datetime
    metadata: dict[str, Any]


class ContributionStatsVO(CamelModel):
    totalAssignments: int
    draftCount: int
    inReviewCount: int
    submittedCount: int
    approvedCount: int
    returnedCount: int
    revisionRequiredCount: int
    totalSubmissionCount: int
    passRate: float
    latestUpdatedAt: datetime | None


class ContributionItemVO(CamelModel):
    assignmentId: str
    taskId: str
    taskTitle: str
    taskDescription: str | None
    datasetItemId: str
    datasetItemPreview: str
    status: AssignmentStatus
    latestSubmissionId: str | None
    latestSubmissionVersion: int | None
    latestSubmissionStatus: SubmissionStatus | None
    claimedAt: datetime
    draftSavedAt: datetime | None
    submittedAt: datetime | None
    updatedAt: datetime
    canContinue: bool
    canRevise: bool
    reviewFeedback: ReviewFeedbackVO | None
```

状态分组 `bucket` 取值：`ALL`、`DRAFT`、`IN_REVIEW`、`APPROVED`、`RETURNED`、`REVISION_REQUIRED`。其中 `DRAFT` 对应 `CLAIMED/DRAFT_SAVED`，`IN_REVIEW` 对应阶段 3 的 `SUBMITTED`，`RETURNED` 与 `REVISION_REQUIRED` 均对应 `RETURNED`。

`AssignmentContextVO.reviewFeedback` 从最新一条 `audit_logs` 中 `entityType=ASSIGNMENT`、`entityId=assignment.id`、`toState=RETURNED` 的记录生成。阶段 4 写入真实审核打回后，必须把打回原因写入 `audit_logs.reason` 或 `metadata.reason`，Labeler 工作台即可展示上一轮审核意见。

返修再提交规则：

- `RETURNED` assignment 仍可保存草稿和再次提交。
- 再次提交复用 `POST /api/assignments/{assignmentId}/submissions`，后端必须生成递增 `submissionVersion`，不覆盖历史 submission。
- 再次提交成功后 assignment 回到 `SUBMITTED`，`reviewFeedback` 作为历史意见保留在审计日志中，不删除。
- 当前阶段只展示最近一次打回意见；完整多轮审核时间线在阶段 4 接入审核流后扩展。

### 9.16 阶段 4 AI 自动预审与人工审核流转契约

阶段 4 必须在阶段 3 的正式提交版本之上推进，不修改 submission 的历史值，不读取模板草稿。提交成功后由后端创建 `review_jobs`，Agent 以 `SYSTEM` 身份领取并写回结构化 AI 预审结果，Reviewer 再做最终人工审核决策。

新增枚举建议：

```python
class ReviewJobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"


class AiReviewConclusion(str, Enum):
    PASS = "PASS"
    RETURN = "RETURN"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"


class HumanReviewDecision(str, Enum):
    APPROVE = "APPROVE"
    RETURN = "RETURN"
```

核心 Entity：

| Entity | 关键字段 |
| --- | --- |
| `ReviewJobEntity` | `id`、`task_id`、`assignment_id`、`submission_id`、`review_config_version_id`、`status`、`attempt_count`、`max_attempts`、`idempotency_key`、`last_error`、`locked_by`、`locked_at`、`started_at`、`finished_at` |
| `ReviewEntity` | `id`、`task_id`、`submission_id`、`assignment_id`、`review_job_id`、`status`、`ai_conclusion`、`ai_scores`、`ai_comment`、`ai_issues`、`ai_suggestions`、`raw_output`、`prompt_snapshot`、`human_conclusion`、`reviewer_id`、`human_comment`、`dimension_comments`、`review_round`、`version` |

核心接口：

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `GET /api/review-jobs` | `REVIEWER` | 查询 AI 预审 job 队列，支持 `status`、`taskId`、`keyword`、分页；阶段 4.1 Reviewer 页面用于展示提交入队状态 |
| `POST /api/internal/review-jobs:claim` | `SYSTEM` | 通过 `X-LabelHub-System-Token` 领取最早可执行的 `QUEUED/FAILED 可重试` job，并原子迁移为 `RUNNING` |
| `POST /api/internal/review-jobs/{jobId}/results` | `SYSTEM` | 写回结构化 AI 预审结果或失败原因，生成 AI review 建议并写审计 |
| `GET /api/reviews` | `REVIEWER` | 待审/已审列表，支持 `status`、`taskId`、`keyword`、`aiConclusion` 分页筛选 |
| `GET /api/reviews/{reviewId}` | `REVIEWER` | 审核详情，包含原题 payload、submission values、模板版本、AI 结果、Prompt 摘要、状态链路、多轮历史、提交 diff 与时间线 |
| `POST /api/reviews/{reviewId}/decisions` | `REVIEWER` | 单条人工通过或打回 |
| `POST /api/reviews:batch-decide` | `REVIEWER` | 批量通过或打回，逐条校验并写审计 |

状态规则：

- `review_jobs.idempotency_key = submission_id + submission_version + review_config_version_id`，同一提交版本只能有一个有效 AI 预审 job。
- 阶段 4.1 起，Labeler 正式提交后 `submissions.status=AI_REVIEWING`，`assignments.status=SUBMITTED`；Labeler 侧仍表现为“审核中”，系统侧可追踪 AI 队列状态。
- Agent 写回 `PASS/RETURN/NEEDS_HUMAN_REVIEW` 只代表 AI 建议，不直接终审；submission 进入人工审核可见状态。
- 人工 `APPROVE` 后，`submissions.status=APPROVED`、`assignments.status=APPROVED`，并递增任务 `approved_count`。
- 人工 `RETURN` 后，`submissions.status=RETURNED`、`assignments.status=RETURNED`，打回理由必须写入 `audit_logs.reason` 或 `metadata.reason`，供阶段 3 `ReviewFeedbackVO` 复用。
- Agent 超过最大重试、结构化输出不合法或 Provider 异常时，必须生成需要人工兜底的待审记录，不能让 job 永久卡在 `RUNNING`。
- 所有状态迁移必须写 `audit_logs`；Actor 为 Agent 时使用 `SYSTEM` 账号，人工审核使用 Reviewer 用户。
- Agent 成功或兜底生成 `ReviewEntity` 时必须同步写入 `AuditAction.REVIEW_AI_SUGGESTION`，metadata 记录 `reviewJobId`、`submissionId`、`reviewConfigVersionId`、`aiConclusion`、`scoreTotal`、`issueCount` 和 Prompt 摘要。

阶段 4.0/4.1/4.2/4.3/4.4 当前完成状态：

- Alembic `0005_create_review_foundation.py` 已创建 `review_jobs` 与 `reviews` 表，并注册到 SQLAlchemy metadata。
- `ReviewJobStatus`、`AiReviewConclusion`、`ReviewStatus`、`HumanReviewDecision` 枚举已进入后端统一枚举。
- `POST /api/assignments/{assignmentId}/submissions` 在同一事务内创建唯一 `review_jobs`，重复提交命中同一 submission 时不会生成重复 job。
- `ReviewJobVO` 与 `ReviewVO` 在保留内部追踪 ID 的同时，补充 `taskTitle`、`submissionVersion`、`reviewConfigVersionNo`，供 Reviewer UI 优先展示业务可读信息，避免把内部 ID 作为列表主标题。
- `POST /api/internal/review-jobs:claim` 已返回 job、submission、assignment、task、dataset item payload、template schema 和 review config version，供阶段 4.2 Agent 组装 Prompt。
- `apps/agent` 已实现 `--once` 单次处理与 `--loop` 轮询：System 身份领取 job，基于审核配置版本、题目 payload、模板字段和提交值组装 Prompt，调用 OpenAI 兼容 Chat Completions，并用 Pydantic 校验结构化 JSON。
- Agent 写回失败时使用同一内部结果接口提交 `errorMessage`；后端会将 job 置为 `FAILED` 供重试，达到 `maxAttempts` 后置为 `NEEDS_HUMAN_REVIEW` 并生成人工兜底 review。
- Agent 对 MiMo Provider 自动注入 `chat_template_kwargs.enable_thinking=false`；未知 OpenAI 兼容 Provider 不注入私有扩展，可通过 `OPENAI_EXTRA_BODY_JSON`/`LLM_EXTRA_BODY_JSON` 显式扩展。
- `ReviewVO` 已补充 `aiScoreTotal` 与 `aiIssueCount`；`ReviewDetailVO` 已补充 `promptSnapshotSummary`，用于 Reviewer 查看 AI 建议时快速理解 Agent 使用的任务、题目字段、提交字段和评分维度。
- 阶段 4.4 起，`ReviewDetailVO` 进一步补充 `stateLink`、`reviewHistory` 与 `submissionDiff`：`stateLink` 展示 assignment/submission/job/review 当前状态与下一步动作；`reviewHistory` 展示同一 assignment 的多轮提交与 AI/人工意见；`submissionDiff` 只比较当前提交与上一版提交的可提交字段，辅助 Reviewer 快速判断返修改动。
- `GET /api/review-jobs`、`GET /api/reviews`、`GET /api/reviews/{reviewId}` 已进入 OpenAPI；人工审核决策接口保留到阶段 4.5 实现。

## 10. 阶段 0 Entity 与迁移契约

阶段 0 先落地 `users` 表迁移，便于后续 Auth/User 模块切换到数据库持久化。

```python
class UserEntity:
    id: str
    email: str
    name: str
    password_hash: str | None
    role: str
    status: str
    created_at: datetime
    updated_at: datetime
```

约束：

- `email` 唯一。
- `role` 取值必须属于 `OWNER`、`LABELER`、`REVIEWER`、`SYSTEM`。
- `status` 取值必须属于 `ACTIVE`、`DISABLED`。
- Entity 不直接作为 API VO 返回。

## 11. Agent 与 OpenAI API 格式契约

Agent 调用 LLM 前必须定义结构化输出模型。

```python
class AiReviewIssueDTO:
    field: str | None
    code: str
    message: str


class AiReviewResultDTO:
    conclusion: str
    scores: dict[str, int]
    summary: str
    issues: list[AiReviewIssueDTO]
    suggestions: str | None
    raw_output: dict | None
    prompt_snapshot: str | None
```

要求：

- LLM 请求使用 OpenAI API 格式。
- `BASE_URL`、`MODEL_NAME`、`OPENAI_API_KEY`、`OPENAI_THINKING_ENABLED`、`OPENAI_TIMEOUT_SECONDS` 从环境变量读取；兼容旧别名 `OPENAI_BASE_URL`、`OPENAI_MODEL`、`LLM_TIMEOUT_SECONDS`；日志中不得输出 API Key。当前 MiMo OpenAI 兼容服务关闭 thinking 需要在请求体中携带 `chat_template_kwargs.enable_thinking=false`，Agent 根据 MiMo Provider 自动注入该扩展；未知 Provider 保持标准 OpenAI Chat Completions 请求。
- Agent 使用 `response_format={"type":"json_object"}` 请求 JSON 对象。最终写回统一 `AiReviewResultDTO`；为兼容阶段 1.4 审核配置默认 `outputSchema`，模型返回 `decision/dimensionScores/comment` 时会先归一化为 `conclusion/scores/summary`。归一化后通过 Pydantic 校验；`scores` 必须覆盖审核配置维度，不能包含未知维度，分数不能超过维度 `maxScore`。
- 校验失败不能进入终审流程，Agent 必须通过内部接口写回失败原因，由后端状态机重试或进入人工复核。
- Agent 写回结果必须通过后端受控服务或内部接口，不直接绕过状态机。

## 12. 前后端字段映射检查清单

每次开发前必须检查：

- 后端 VO 字段名与前端 VO 字段名一致。
- 后端 Request 字段名与前端 Request 字段名一致。
- Python snake_case 到 JSON camelCase 的 alias 映射明确。
- 枚举值完全一致。
- ID 字段统一为 string。
- 时间字段统一为 ISO 8601 字符串。
- 分页结构统一为 `data + pagination`。
- 错误结构统一为 `error` 包裹。
- Entity 不直接返回给前端。
- LLM 输出 DTO 不直接等同于人工审核 VO，必须经过业务规则转换。

## 13. 未确认事项

阶段 0 已确认：FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、PyMySQL、HttpOnly Cookie Session。

后续阶段仍需确认：

- 队列实现方案。
- 前端类型是否从后端 OpenAPI 自动生成，阶段 0 先手写契约类型。
- 当前 OpenAI API 兼容供应商的基础 Chat Completions 请求和 `chat_template_kwargs.enable_thinking=false` 已验证可用；结构化输出能力仍需在正式 Agent 调用阶段联调。
