# 本地基础设施

阶段 0 已提供最小本地依赖配置，用于启动：

- MySQL
- Redis

启动：

```bash
docker compose -f infra/docker/compose.yaml up -d
```

停止：

```bash
docker compose -f infra/docker/compose.yaml down
```

说明：

- MySQL 用于后端 Alembic 迁移和后续业务数据。
- Redis 是后续 Agent 队列的预留基础设施，阶段 0 不消费队列。
- 当前不会自动创建对象存储，导入/导出文件存储在后续阶段确认。
