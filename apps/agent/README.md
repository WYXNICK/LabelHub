# @labelhub/agent

Python AI 自动预审 Agent，负责：

- 消费 AI 审核队列
- 读取提交数据、模板版本和审核配置
- 通过 OpenAI API 格式调用 LLM，并校验结构化输出
- 写回 AI 审核结果和审计记录

Agent 不应直接终审通过数据，也不应绕过后端状态机。

技术基线：

- Python
- OpenAI API 格式
- uv

Agent 当前按 OpenAI API 兼容协议读取 LLM 配置：

| 环境变量 | 当前默认/说明 |
| --- | --- |
| `OPENAI_API_KEY` | 必填；真实密钥只放本地 `.env` 或部署密钥，不写入仓库 |
| `BASE_URL` | `https://maas-coding-api.cn-huabei-1.xf-yun.com/v2` |
| `MODEL_NAME` | `astron-code-latest` |
| `OPENAI_EXTRA_BODY_JSON` / `LLM_EXTRA_BODY_JSON` | 可选；供应商需要额外请求体参数时显式填写，默认留空 |

仍兼容旧变量名 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。当前 LLM API 按标准 OpenAI Chat Completions 兼容格式请求，不默认注入供应商私有扩展；如供应商需要额外 body，可通过 `OPENAI_EXTRA_BODY_JSON` / `LLM_EXTRA_BODY_JSON` 显式配置。具体 SDK/client、队列实现如需调整，必须先更新后端 SDD。

阶段 4.2 已提供配置读取、结构化输出 DTO、System 身份领取、OpenAI 兼容调用和失败重试写回，可运行：

```bash
uv sync --extra dev
uv run pytest
uv run python -m labelhub_agent --health
uv run python -m labelhub_agent --once
uv run python -m labelhub_agent --loop
```

`--loop` 会输出少量运行日志，包括启动配置摘要、空闲等待、领取 job、完成写回和失败摘要。日志只用于观察运行状态，不会打印 API Key、完整 Prompt、完整题目 payload 或提交全文。

PowerShell:

```powershell
uv sync --extra dev
uv run pytest
uv run python -m labelhub_agent --health
uv run python -m labelhub_agent --once
uv run python -m labelhub_agent --loop
```

包管理规则：

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
