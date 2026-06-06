# Phase 4 原型说明

阶段 4 原型覆盖官方要求中的「AI 自动预审 Agent」与「多角色人工审核流转」，用于后续按 SDD 流程实现前端页面和后端接口前的视觉与产品基准。

## 页面清单

| 页面 | 原型 | 目标路由 | 核心职责 |
| --- | --- | --- | --- |
| AI 自动预审队列 | `ai-review-queue/code.html` | `/internal/review-jobs` 或系统运维视角 | 展示 job 队列、Agent 运行状态、结构化评分、Prompt 快照、失败重试和人工兜底 |
| Reviewer 审核工作台 | `reviewer-workbench/code.html` | `/reviewer/reviews` | 待审队列、任务/AI 结论筛选、批量通过/打回、AI 建议与人工决策 |
| Reviewer 审核详情 | `reviewer-detail/code.html` | `/reviewer/reviews/:reviewId` | 原题、提交值、AI 评分、diff、审核意见、时间线和终审操作 |
| Reviewer 审核结果列表 | `review-results/code.html` | `/reviewer/review-results` | 已通过/已打回/人工复核历史，支持筛选和追溯 |
| Owner 数据验收 | `owner-acceptance/code.html` | `/owner/tasks/:taskId/acceptance` | 任务级通过率、打回率、AI 结论分布、抽样记录和导出准备 |

## 设计原则

- AI 预审不直接终审通过，只生成 Reviewer 可见的建议、评分和问题列表。
- Reviewer 页面优先满足高密度审核效率：左侧队列，中间证据与决策，右侧 SLA/时间线/上下文。
- Owner 验收页不重复 Reviewer 操作，重点展示质量趋势、审核分布与可导出数据健康度。
- 所有状态都以文字 + 色彩共同表达，避免只靠颜色判断。
- 页面宽度按官方要求优先保证 `1280×800` 与 `1920×1080` 无横向溢出。
