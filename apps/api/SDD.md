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
| 1 | `GET /api/tasks` | `ListTasksRequest` | `PageVO[TaskVO]` | 待细化 |
| 1 | `POST /api/tasks` | `CreateTaskRequest` | `TaskDetailVO` | 待细化 |
| 1 | `GET /api/tasks/{taskId}` | `GetTaskRequest` | `TaskDetailVO` | 待细化 |
| 1 | `PATCH /api/tasks/{taskId}` | `UpdateTaskRequest` | `TaskDetailVO` | 待细化 |
| 1 | `POST /api/tasks/{taskId}/state-transitions` | `TaskStateTransitionRequest` | `TaskDetailVO` | 待细化 |
| 1 | `GET /api/tasks/{taskId}/publish-check` | `GetPublishCheckRequest` | `PublishCheckVO` | 待细化 |
| 1 | `POST /api/tasks/{taskId}/import-jobs` | `CreateImportJobRequest` | `ImportJobVO` | 待细化 |
| 1 | `GET /api/import-jobs/{importJobId}` | `GetImportJobRequest` | `ImportJobVO` | 待细化 |
| 1 | `GET /api/import-jobs/{importJobId}/errors` | `ListImportErrorsRequest` | `PageVO[ImportErrorRowVO]` | 待细化 |
| 1 | `GET /api/tasks/{taskId}/datasets` | `ListDatasetsRequest` | `PageVO[DatasetVO]` | 待细化 |
| 1 | `GET /api/datasets/{datasetId}/items` | `ListDatasetItemsRequest` | `PageVO[DatasetItemVO]` | 阶段 1.3 已实现 |
| 1 | `PATCH /api/datasets/{datasetId}/items:batch` | `BatchUpdateDatasetItemsRequest` | `BatchUpdateDatasetItemsVO` | 阶段 1.3 已实现 |
| 1 | `GET /api/tasks/{taskId}/review-config-draft` | `GetReviewConfigDraftRequest` | `ReviewConfigDraftVO` | 待细化 |
| 1 | `PUT /api/tasks/{taskId}/review-config-draft` | `SaveReviewConfigDraftRequest` | `ReviewConfigDraftVO` | 待细化 |
| 1 | `POST /api/tasks/{taskId}/review-config-versions` | `PublishReviewConfigVersionRequest` | `ReviewConfigVersionVO` | 待细化 |
| 1 | `GET /api/tasks/{taskId}/review-config-versions` | `ListReviewConfigVersionsRequest` | `PageVO[ReviewConfigVersionVO]` | 待细化 |
| 1 | `GET /api/audit-logs` | `ListAuditLogsRequest` | `PageVO[AuditLogVO]` | 待细化 |
| 2 | `POST /api/tasks/{taskId}/template-versions` | `CreateTemplateVersionRequest` | `TemplateVersionVO` | 待细化 |
| 3 | `POST /api/tasks/{taskId}/assignments` | `CreateAssignmentRequest` | `AssignmentVO` | 待细化 |
| 3 | `POST /api/assignments/{assignmentId}/submissions` | `CreateSubmissionRequest` | `SubmissionVO` | 待细化 |
| 4 | `GET /api/reviews/{reviewId}` | `GetReviewRequest` | `ReviewVO` | 待细化 |
| 4 | `POST /api/reviews/{reviewId}/decisions` | `CreateReviewDecisionRequest` | `ReviewVO` | 待细化 |
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

阶段 1.1 将 `GET/POST/PATCH /api/tasks`、`GET /api/tasks/{taskId}`、`POST /api/tasks/{taskId}/state-transitions` 和 `GET /api/audit-logs` 从契约占位推进为可用业务能力。

状态迁移规则：

| 当前状态 | 允许目标状态 | 说明 |
| --- | --- | --- |
| `DRAFT` | `PUBLISHED`、`ENDED` | 发布前必须通过最小发布保护；结束后不可恢复 |
| `PUBLISHED` | `PAUSED`、`ENDED` | 发布中任务可暂停或结束 |
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
```

要求：

- LLM 请求使用 OpenAI API 格式。
- `BASE_URL`、`MODEL_NAME`、`OPENAI_API_KEY`、`OPENAI_THINKING_ENABLED` 从环境变量读取；兼容旧别名 `OPENAI_BASE_URL`、`OPENAI_MODEL`；日志中不得输出 API Key。当前 MiMo OpenAI 兼容服务关闭 thinking 需要在请求体中携带 `chat_template_kwargs.enable_thinking=false`。
- LLM 输出必须通过后端结构化模型校验。
- 校验失败不能进入终审流程，应重试或进入人工复核。
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
