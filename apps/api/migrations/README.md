# LabelHub API Migrations

Alembic 迁移目录。阶段 0 先创建 `users` 表，后续业务阶段继续在这里追加任务、数据集、模板、标注、审核与导出相关迁移。

运行方式：

```bash
uv run alembic upgrade head
```
