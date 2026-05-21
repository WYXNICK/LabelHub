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

具体 LLM 模型、SDK/client、队列实现尚未作为最终选型固定；确认前必须先更新后端 SDD。

当前为占位骨架，可运行：

```bash
uv run --python 3.11 python -m labelhub_agent
```

PowerShell:

```powershell
uv run --python 3.11 python -m labelhub_agent
```

包管理规则：

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
