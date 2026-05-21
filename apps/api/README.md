# @labelhub/api

Python 后端 API 服务，负责：

- 鉴权与角色权限
- 任务、模板、数据集、领取、提交、审核、导出
- 状态机、事务一致性、审计日志
- AI 预审入队与内部写回接口

技术基线：

- Python
- MySQL
- uv

Web 框架、数据校验库、ORM、迁移工具、队列实现尚未作为最终选型固定；确认前必须先更新后端 SDD。

当前为占位骨架，可运行：

```bash
uv run --python 3.11 python -m labelhub_api
```

PowerShell:

```powershell
uv run --python 3.11 python -m labelhub_api
```

包管理规则：

- 使用 `uv` 管理依赖和虚拟环境。
- 新增运行依赖：`uv add <package>`。
- 新增开发依赖：`uv add --dev <package>`。
- 不在全局 Python 环境中安装项目依赖。
