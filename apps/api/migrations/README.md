# LabelHub API Migrations

Alembic 迁移目录，用于维护 MySQL 表结构版本。当前迁移覆盖用户、任务、数据集、导入、审核配置、模板、标注、AI 预审、人工审核、审计日志和导出相关表。

运行方式：

```bash
uv run alembic upgrade head
```
