# LabelHub Demo 范围文档

## 1. 文档目的

本文档说明当前 `demo_data` 可支撑的演示范围、数据规模、字段结构和分阶段验收方式。官方要求文档仍是最终标准；Demo 数据用于验证主链路是否真实可运行，而不是削减功能范围。

## 2. Demo 数据清单

| 数据集 | 路径 | 格式 | 记录数 | 主要用途 |
| --- | --- | --- | --- | --- |
| 问答质量标注 `qa_quality` | `demo_data/datasets/qa_quality` | JSON、JSONL、Excel | 30 | 验证多媒体 ShowItem、质量评分、AI 预审与人工审核 |
| 偏好对比标注 `preference_compare` | `demo_data/datasets/preference_compare` | JSON、JSONL、Excel | 12 | 验证 A/B 对比、偏好选择、理由填写和结构化导出 |

导入器实现时应忽略 `.DS_Store`、`.~*.xlsx`、`~$*.xlsx` 等系统或编辑器临时文件。

## 3. 数据覆盖

`qa_quality` 覆盖文本、图片、视频和 Markdown 图文题：

| 媒体类型 | 数量 |
| --- | ---: |
| text | 20 |
| image | 4 |
| video | 3 |
| markdown | 3 |

`qa_quality` 字段包括 `id`、`category`、`difficulty`、`lang`、`media_type`、`media_url`、`content_markdown`、`prompt`、`model_answer`、`reference`、`tags`、`source`、`expected_dimensions`。

`preference_compare` 字段包括 `id`、`task_type`、`lang`、`prompt`、`response_a`、`model_a`、`response_b`、`model_b`、`preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`。

## 4. 分阶段演示范围

| 阶段 | Demo 验收方式 |
| --- | --- |
| 阶段 0 | 使用三类 Demo 账号登录，进入 Owner、Labeler、Reviewer 角色入口；后端健康检查和 OpenAPI 可访问；Agent 配置读取与 DTO 测试通过 |
| 阶段 1 | Owner 创建任务，导入两个数据集的 JSON、JSONL、Excel；记录数一致；错误行可展示；发布前检查能阻塞缺少模板版本 |
| 阶段 2 | 为 `qa_quality` 搭建质量评分模板，为 `preference_compare` 搭建偏好对比模板；同一 schema 可预览并发布版本 |
| 阶段 3 | Labeler 在任务广场领取题目，基于模板作答，自动保存草稿，提交并看到校验错误或成功结果 |
| 阶段 4 | 提交进入 AI 预审队列，AI 结果可追溯；Reviewer 查看 AI 评语、历史意见和 diff，并能通过或打回 |
| 阶段 5 | Owner 对已通过数据执行 JSON、JSONL、CSV、Excel 导出；导出历史、进度、字段映射和下载入口可见 |

## 5. 当前代码状态

当前代码已经接入阶段 1 Demo 数据导入：Owner 可导入 `qa_quality` 和 `preference_compare` 的 JSON、JSONL、Excel 文件，导入结果、错误行、题目预览和批量编辑会持久化到 MySQL。发布前检查也能基于当前任务数据、审核配置和模板版本返回阻塞项。

阶段 2 已实现动态模板 Designer/Renderer、官方要求物料、进阶布局/规则、模板版本发布与发布检查联动。当前 Demo 可演示“缺少模板版本时发布检查阻塞”以及“发布模板版本后 `MISSING_TEMPLATE_VERSION` 解除”。

阶段 3 已实现 Labeler 任务广场、先到先得领取、基于模板版本的作答工作台、草稿自动保存、正式提交、提交校验、我的贡献、返修入口和题目级 LLM 辅助。当前 Demo 可以按「Owner 发布任务 -> Labeler 领取题目 -> 自动保存草稿 -> 提交 -> 查看贡献/返修入口」演示真实 MySQL 链路。

阶段 4 已实现提交后的 AI 自动预审和 Reviewer 人工审核：Labeler 正式提交后进入 AI 预审队列，Agent 按 OpenAI API 兼容格式写回结构化评分和建议，Reviewer 可在 AI 预审队列、人工审核任务列表、任务内工作台、审核详情和审核结果页追溯处理，并执行通过、打回、直接修订和批量审核。Owner 可通过数据验收页查看通过、打回、待审、AI 结论分布和最近样本。阶段 3 的题目级 LLM 辅助仍只是 Labeler 作答参考，不等同于阶段 4 的提交后 AI 自动预审。

阶段 5 尚未实现多格式导出，演示导出前需要先完成 JSON/JSONL/CSV/Excel 导出、导出历史和下载入口。

## 6. 非 Demo 范围

以下能力属于正式功能要求的一部分，但不由当前 Demo 数据直接覆盖，需要通过构造数据或专项测试补充：

- 多租户或组织权限。
- 一题多人标注与复杂分配策略。
- 大文件对象存储、断点续传和病毒扫描。
- 真实生产 LLM 供应商的限流、费用统计和降级策略。
- 大规模数据集下的分页性能和导出吞吐。
