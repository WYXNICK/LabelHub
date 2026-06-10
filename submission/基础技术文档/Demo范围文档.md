# LabelHub Demo 范围文档

## 1. 文档目的

本文档说明 `demo_data` 可支撑的演示范围、数据规模、字段结构和端到端验收方式。Demo 数据用于验证主链路真实可运行，不用于限定系统能力边界。

## 2. Demo 数据清单

| 数据集 | 路径 | 格式 | 记录数 | 主要用途 |
| --- | --- | --- | ---: | --- |
| 问答质量标注 `qa_quality` | `demo_data/datasets/qa_quality` | JSON、JSONL、Excel | 30 | 验证问答质量评分、富文本说明、证据上传、AI 辅助、AI 预审与人工审核 |
| 偏好对比标注 `preference_compare` | `demo_data/datasets/preference_compare` | JSON、JSONL、Excel | 12 | 验证 A/B 对比、偏好选择、理由填写、多轮复核和结构化导出 |

导入器会忽略 `.DS_Store`、`.~*.xlsx`、`~$*.xlsx` 等系统或编辑器临时文件。

## 3. 数据字段覆盖

### 3.1 qa_quality

`qa_quality` 覆盖文本、图片、视频和 Markdown 图文题：

| 媒体类型 | 数量 |
| --- | ---: |
| text | 20 |
| image | 4 |
| video | 3 |
| markdown | 3 |

核心字段包括 `id`、`category`、`difficulty`、`lang`、`media_type`、`media_url`、`content_markdown`、`prompt`、`model_answer`、`reference`、`tags`、`source`、`expected_dimensions`。

### 3.2 preference_compare

核心字段包括 `id`、`task_type`、`lang`、`prompt`、`response_a`、`model_a`、`response_b`、`model_b`、`preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`。

## 4. 可演示链路

| 链路 | 演示内容 |
| --- | --- |
| 账号与角色 | Owner、Labeler、Reviewer 三类账号登录并进入对应工作台 |
| 任务管理 | Owner 创建任务、编辑基础信息、配置配额、截止时间、标签和奖励规则 |
| 数据导入 | 导入 JSON、JSONL、Excel，查看导入统计、错误行、题目预览和批量启用/禁用 |
| 模板搭建 | 使用 Designer 搭建 ShowItem、输入、选择、富文本、文件/图片上传、JSON 编辑器、LLM 交互、分组容器、多 Tab 等物料 |
| 模板运行时 | 使用任务数据集样本预览模板，Labeler 作答页复用同一套 Renderer |
| 审核配置 | 配置审核 Prompt、评分维度、阈值和结构化输出 Schema，并发布版本 |
| 发布检查 | 检查数据集、模板版本、审核配置、配额和截止时间，全部满足后发布任务 |
| 标注工作台 | Labeler 领取题目、自动保存草稿、提交作答、查看返修、重新提交 |
| 题目级 LLM 辅助 | 按模板配置调用 OpenAI 兼容 LLM，生成参考建议但不自动提交 |
| AI 自动预审 | Agent 异步领取预审 Job，写回结构化评分、结论和原因 |
| 人工审核 | Reviewer 按任务进入审核工作台，查看 diff、AI 评语、关键时间线，执行通过、打回或直接修订 |
| 数据验收 | Owner 查看通过、打回、待审、AI 结论分布和最近样本 |
| 多格式导出 | 导出已通过数据，支持 JSON、JSONL、CSV、Excel、字段映射、历史和下载 |

## 5. 推荐演示路径

### 5.1 问答质量标注

1. Owner 创建 `qa_quality` 任务。
2. 导入 `demo_data/datasets/qa_quality/jsonl/qa_quality.jsonl`。
3. 搭建问答质量模板：题目原文、模型回答、参考答案、四维评分、问题类型、评语、证据附件、证据截图和 LLM 辅助；证据附件支持常见文档、JSON/Markdown 和图片缩略图预览。
4. 发布审核配置和任务。
5. Labeler 领取题目，提交一条正常样本和一条返修样本。
6. Agent 完成 AI 预审。
7. Reviewer 对正常样本通过，对异常样本打回；Labeler 修订后再次提交；Reviewer 复核通过。
8. Owner 在数据验收页确认通过数据，并导出 JSONL、CSV 或 Excel。

### 5.2 偏好对比标注

1. Owner 创建 `preference_compare` 任务。
2. 导入 `demo_data/datasets/preference_compare/jsonl/preference_compare.jsonl`。
3. 搭建偏好对比模板：用户问题、回答 A、回答 B、偏好结论、优势程度、理由、问题维度、结构化评分和证据字段。
4. 发布任务后由 Labeler 完成偏好判断。
5. Agent 预审偏好与理由是否符合原始数据。
6. Reviewer 根据 diff 和 AI 评语执行复核。
7. Owner 导出结构化结果。

## 6. 当前实现状态

当前代码已完成 Demo 数据可覆盖的主链路：

- `qa_quality` 与 `preference_compare` 可通过 JSON、JSONL 和 Excel 导入。
- 动态模板支持基础物料、高级物料、布局物料、条件显示和联动校验。
- 标注工作台支持草稿、提交、返修、题目导航和题目级 LLM 辅助。
- AI 自动预审与人工审核流转均已接入 MySQL，并保留关键审计时间线。
- Owner 数据验收和多格式导出可基于人工审核通过数据生成真实文件。
- 文件/图片证据使用受控文件对象引用，审核侧可查看图片预览、文件名、大小和下载入口。

## 7. 非 Demo 重点

以下能力为生产扩展方向，当前 Demo 不作为主要展示重点：

- 多组织、多租户和复杂成员权限。
- 超大文件对象存储、断点续传和病毒扫描。
- 大规模数据集下的分布式导出和队列扩容。
- 复杂指派策略和多人重复标注一致性分析。
