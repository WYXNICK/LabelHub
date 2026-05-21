# LabelHub 后端 SDD 文档

## 1. 文档定位

本文档是 `apps/api` 的后端 SDD 基线，覆盖 Python API 服务以及 `apps/agent` AI 预审 worker 与后端接口之间的契约。正式开发前，本文件必须与 `apps/web/SDD.md` 中的前端 VO 和接口调用逐字段对齐。

当前文档不代表已经进入正式开发阶段；它定义后续开发必须遵守的 SDD 对齐流程和接口契约规则。

## 2. 技术基线

- 后端语言：Python 3.11+
- Web 框架：待后端设计阶段确认，当前只固定 Python
- 数据校验：待后端设计阶段确认，必须支持 Request/VO/DTO 结构校验
- ORM：待后端设计阶段确认
- 迁移：待后端设计阶段确认
- 数据库：MySQL
- 队列：待 Agent 设计阶段确认
- 包管理器：uv
- LLM 接入：OpenAI API 格式，具体模型暂未定

## 3. uv 包管理规则

`apps/api` 和 `apps/agent` 必须分别使用 `uv` 管理 Python 依赖。

后端 API：

```bash
cd apps/api
uv sync
uv run python -m labelhub_api
```

AI Agent：

```bash
cd apps/agent
uv sync
uv run python -m labelhub_agent
```

规则：

- 新增运行依赖使用 `uv add <package>`。
- 新增开发依赖使用 `uv add --dev <package>`。
- 不使用全局 `pip install` 安装项目依赖。
- `uv.lock` 由正式依赖安装阶段生成后提交。

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

## 8. 当前首批接口占位

正式开发前，以下接口必须与前端 SDD 完整展开：

| 接口 | Request | VO | 状态 |
| --- | --- | --- | --- |
| `GET /api/tasks` | `ListTasksRequest` | `PageVO[TaskVO]` | 待细化 |
| `POST /api/tasks` | `CreateTaskRequest` | `TaskDetailVO` | 待细化 |
| `GET /api/tasks/{taskId}` | `GetTaskRequest` | `TaskDetailVO` | 待细化 |
| `POST /api/tasks/{taskId}/import-jobs` | `CreateImportJobRequest` | `ImportJobVO` | 待细化 |
| `POST /api/tasks/{taskId}/template-versions` | `CreateTemplateVersionRequest` | `TemplateVersionVO` | 待细化 |
| `POST /api/tasks/{taskId}/assignments` | `CreateAssignmentRequest` | `AssignmentVO` | 待细化 |
| `POST /api/assignments/{assignmentId}/submissions` | `CreateSubmissionRequest` | `SubmissionVO` | 待细化 |
| `GET /api/reviews/{reviewId}` | `GetReviewRequest` | `ReviewVO` | 待细化 |
| `POST /api/reviews/{reviewId}/decisions` | `CreateReviewDecisionRequest` | `ReviewVO` | 待细化 |
| `POST /api/tasks/{taskId}/export-jobs` | `CreateExportJobRequest` | `ExportJobVO` | 待细化 |

## 9. Agent 与 OpenAI API 格式契约

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
- `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 从环境变量读取。
- LLM 输出必须通过后端结构化模型校验。
- 校验失败不能进入终审流程，应重试或进入人工复核。
- Agent 写回结果必须通过后端受控服务或内部接口，不直接绕过状态机。

## 10. 前后端字段映射检查清单

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

## 11. 未确认事项

正式开发前需要确认：

- Python Web 框架。
- Python 数据校验库。
- ORM 与迁移工具。
- 队列实现方案。
- 鉴权使用 Cookie Session 还是 Bearer Token。
- 前端类型是否从后端 OpenAPI 自动生成。
- OpenAI API 格式供应商的 base URL、模型名和结构化输出能力。
