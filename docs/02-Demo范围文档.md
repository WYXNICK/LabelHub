# LabelHub Demo 范围文档

## 1. 文档目的

本文档定义 LabelHub 第一阶段 Demo 的数据范围、演示范围、功能边界和验收场景。Demo 目标不是覆盖所有生产能力，而是围绕课题最关键的三点建立可运行闭环：

- 动态标注模板。
- 长链路工作流状态流转。
- AI 自动预审与人工审核结合。

## 2. Demo 数据来源

当前可用数据位于 `demo_data/datasets`，包含两个数据集。

| 数据集 | 目录 | 格式 | 记录数 | 主要用途 |
| --- | --- | --- | ---: | --- |
| 问答质量标注 | `qa_quality` | JSON、JSONL、Excel | 30 | 多维度评分、媒体渲染、AI 质检 |
| 偏好对比标注 | `preference_compare` | JSON、JSONL、Excel | 12 | A/B 回答对比、偏好判断、RLHF 数据 |

目录中存在 `.DS_Store`、Excel 临时文件等噪声文件，导入流程应忽略。

## 3. qa_quality 数据说明

### 3.1 任务背景

该数据集用于大模型问答质量标注。每条题目包含用户输入、模型回答、参考答案和若干元信息。标注员需要结合参考答案，对模型回答进行多维度评分。

部分题目包含图片、视频或 Markdown 图文，需要先渲染原始素材，再进行标注。

### 3.2 字段清单

| 字段 | 含义 | Demo 用途 |
| --- | --- | --- |
| `id` | 题目唯一编号 | 展示、去重 |
| `category` | 题目类别 | 筛选、展示 |
| `difficulty` | 难度 | 展示 |
| `lang` | 语言或翻译方向 | 展示 |
| `media_type` | 原始数据类型 | 决定 ShowItem 渲染方式 |
| `media_url` | 图片/视频地址 | 图片、视频展示 |
| `content_markdown` | Markdown 图文正文 | Markdown 安全渲染 |
| `prompt` | 用户输入 | 展示项 |
| `model_answer` | 待评估回答 | 展示项 |
| `reference` | 参考答案 | 辅助判断 |
| `tags` | 标签 | 展示、筛选 |
| `source` | 数据来源 | 展示或审计 |
| `expected_dimensions` | 推荐评估维度 | 生成默认评分字段 |

### 3.3 数据分布

媒体类型分布：

| 类型 | 数量 |
| --- | ---: |
| text | 20 |
| image | 4 |
| video | 3 |
| markdown | 3 |

高频评分维度：

| 维度 | 出现次数 |
| --- | ---: |
| 准确性 | 22 |
| 相关性 | 19 |
| 格式合规 | 16 |
| 安全性 | 6 |

题目类别覆盖：

- 知识问答。
- 代码生成。
- 文本摘要。
- 安全合规。
- 多轮对话。
- 数学推理。
- 翻译。
- 创意写作。
- 视频审核、视频描述、视频质检。
- 图像描述、图像审核、图像 OCR、图像质检。
- 图文审核、图文质检、图文摘要。

### 3.4 qa_quality Demo 标注模板

展示区：

- 题目编号、类别、难度、语言、标签。
- `prompt`。
- `model_answer`。
- `reference`。
- 根据 `media_type` 渲染图片、视频或 Markdown 图文。

采集区：

| 字段 | 组件 | 说明 |
| --- | --- | --- |
| `relevanceScore` | 单选 | 相关性 1-5 分 |
| `accuracyScore` | 单选 | 准确性 1-5 分 |
| `formatScore` | 单选 | 格式合规 1-5 分 |
| `safetyScore` | 单选 | 安全性 1-5 分 |
| `issueTags` | 多选/标签选择 | 事实错误、答非所问、格式问题、安全违规、信息缺失等 |
| `summary` | 单行输入 | 一句话总评 |
| `comment` | 多行文本 | 详细评语或打回理由 |
| `revisionSuggestion` | 富文本 | 修订建议 |
| `correctedAnswer` | JSON 编辑器 | 修正后的标准答案或评分明细 |
| `evidenceFiles` | 图片/文件上传 | 佐证材料 |
| `aiAssist` | LLM 交互组件 | AI 预评分参考 |

## 4. preference_compare 数据说明

### 4.1 任务背景

该数据集用于偏好对比标注。每条题目给出同一 prompt 下两个模型回答 A 和 B，标注员需要判断哪个回答更好，并说明判断依据。

### 4.2 字段清单

| 字段 | 含义 | Demo 用途 |
| --- | --- | --- |
| `id` | 题目唯一编号 | 展示、去重 |
| `task_type` | 任务类型 | 展示、筛选 |
| `lang` | 语言方向 | 展示 |
| `prompt` | 用户输入 | 展示项 |
| `response_a` | A 回答 | 展示项 |
| `model_a` | A 模型来源 | 可匿名展示 |
| `response_b` | B 回答 | 展示项 |
| `model_b` | B 模型来源 | 可匿名展示 |
| `preferred` | 示例偏好结论 | 可作为验收参考，不直接作为标注员提交 |
| `margin` | 优势程度 | 可作为验收参考 |
| `dimensions` | 判断维度 | 生成默认维度选项 |
| `safety_flag` | 是否有安全风险 | 标注字段 |
| `annotator_note` | 示例理由 | 验收参考 |

### 4.3 数据分布

任务类型覆盖：

| 类型 | 数量 |
| --- | ---: |
| 知识问答 | 2 |
| 代码生成 | 2 |
| 文本摘要 | 2 |
| 创意写作 | 2 |
| 翻译 | 1 |
| 数学推理 | 1 |
| 多轮对话 | 1 |
| 安全合规 | 1 |

示例偏好结论：

| 结论 | 数量 |
| --- | ---: |
| A | 11 |
| tie | 1 |

### 4.4 preference_compare Demo 标注模板

展示区：

- 题目编号、任务类型、语言。
- `prompt`。
- `response_a` 与 `response_b` 并排展示。
- `model_a` 与 `model_b` 默认匿名或折叠，避免模型来源影响判断。

采集区：

| 字段 | 组件 | 说明 |
| --- | --- | --- |
| `preferred` | 单选 | A 更优、B 更优、平局 |
| `margin` | 单选 | 明显优于、略优于、相当 |
| `safetyFlag` | 单选 | 是、否 |
| `dimensions` | 多选 | 相关性、准确性、安全性、完整性、可读性、创意性、地道性等 |
| `summary` | 单行输入 | 一句话结论 |
| `annotatorNote` | 多行文本 | 判断理由，必填 |
| `revisionSuggestion` | 富文本 | 改写或优化建议 |
| `structuredComment` | JSON 编辑器 | 结构化批注 |
| `evidenceFiles` | 图片/文件上传 | 佐证材料 |
| `aiAssist` | LLM 交互组件 | AI 预判参考 |

## 5. 第一阶段 Demo 范围

### 5.1 必须演示

第一阶段建议以 `qa_quality` 为主线，跑通完整闭环：

1. Owner 登录。
2. Owner 创建问答质量标注任务。
3. Owner 导入 `qa_quality.json`。
4. Owner 预览导入数据。
5. Owner 使用预设模板或简单 Designer 配置标注页面。
6. Owner 配置 AI 审核维度。
7. Owner 发布任务。
8. Labeler 在任务广场领取题目。
9. Labeler 完成作答并保存草稿。
10. Labeler 提交标注。
11. AI Agent 自动生成预审结果。
12. Reviewer 查看 AI 评语与提交内容。
13. Reviewer 打回一次。
14. Labeler 修改并再次提交。
15. Reviewer 通过。
16. Owner 导出 JSONL 或 Excel。

### 5.2 建议演示

在主线闭环完成后，加入以下增强点：

- 展示 `image`、`video`、`markdown` 三种 ShowItem 渲染。
- 展示 `preference_compare` 的 A/B 并排标注模板。
- 展示批量审核。
- 展示导出字段映射。
- 展示 AI 审核失败后进入人工复核。

### 5.3 暂不纳入第一阶段

- 完整计费或奖励结算。
- 多租户组织管理。
- 复杂任务指派策略。
- 多人重复标注和一致性分析。
- 高级数据看板。
- 移动端专项适配。
- 真实生产级对象存储与 CDN。

## 6. Demo 验收标准

| 模块 | 验收标准 |
| --- | --- |
| 数据导入 | JSON、JSONL、Excel 至少一种跑通；最终需三种都支持 |
| 模板渲染 | 能根据 schema 渲染问答质量标注表单 |
| 草稿 | 刷新后不丢失 |
| 提交 | 必填和字段校验生效 |
| AI 预审 | 生成结构化评分与结论 |
| 人工审核 | 可通过、可打回、打回必须有理由 |
| 返修 | Labeler 可看到意见并再次提交 |
| 导出 | 至少 JSONL 可导出，最终支持 JSON、JSONL、CSV、Excel |
| 审计 | 关键状态变化可追溯 |

## 7. 演示脚本建议

```text
0:00 - 0:40 介绍平台目标、角色和 Demo 数据
0:40 - 2:00 Owner 创建任务、导入 qa_quality、配置模板
2:00 - 3:10 Labeler 领取题目、作答、草稿恢复、提交
3:10 - 4:20 AI Agent 自动预审，展示评分和建议
4:20 - 5:40 Reviewer 打回，Labeler 修改，Reviewer 通过
5:40 - 6:40 Owner 导出数据
6:40 - 8:00 说明架构亮点：monorepo、动态 schema、状态机、AI 预审
```
