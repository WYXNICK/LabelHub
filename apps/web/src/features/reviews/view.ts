import type { AiReviewConclusion, ReviewJobStatus, ReviewStatus, ReviewTimelineItemVO } from "./types";

export const reviewJobStatusMeta: Record<ReviewJobStatus, { label: string; color: string; tone: string }> = {
  QUEUED: { label: "等待 AI 预审", color: "blue", tone: "blue" },
  RUNNING: { label: "AI 处理中", color: "processing", tone: "blue" },
  SUCCEEDED: { label: "预审完成", color: "green", tone: "green" },
  FAILED: { label: "等待重试", color: "orange", tone: "orange" },
  NEEDS_HUMAN_REVIEW: { label: "人工兜底", color: "red", tone: "red" },
};

export const aiConclusionMeta: Record<AiReviewConclusion, { label: string; color: string }> = {
  PASS: { label: "AI 建议通过", color: "green" },
  RETURN: { label: "AI 建议打回", color: "orange" },
  NEEDS_HUMAN_REVIEW: { label: "建议人工复核", color: "purple" },
};

export const reviewStatusMeta: Record<ReviewStatus, { label: string; color: string }> = {
  PENDING_HUMAN_REVIEW: { label: "待人工审核", color: "processing" },
  APPROVED: { label: "已通过", color: "green" },
  RETURNED: { label: "已打回", color: "red" },
};

export const reviewStateStepMeta: Record<string, { label: string; color: string }> = {
  AI_REVIEWING: { label: "AI 预审中", color: "blue" },
  WAITING_HUMAN_REVIEW: { label: "等待人工复核", color: "processing" },
  APPROVED: { label: "已通过", color: "green" },
  RETURNED: { label: "已打回", color: "red" },
};

export const reviewerSubmissionStatusMeta: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  SUBMITTED: { label: "已提交", color: "blue" },
  AI_REVIEWING: { label: "AI 预审中", color: "processing" },
  HUMAN_REVIEWING: { label: "待人工复核", color: "purple" },
  APPROVED: { label: "已通过", color: "green" },
  RETURNED: { label: "已打回", color: "red" },
};

export const reviewerAssignmentStatusMeta: Record<string, { label: string; color: string }> = {
  CLAIMED: { label: "已领取", color: "blue" },
  DRAFT_SAVED: { label: "草稿已保存", color: "default" },
  SUBMITTED: { label: "审核中", color: "processing" },
  RETURNED: { label: "待返修", color: "red" },
  APPROVED: { label: "已通过", color: "green" },
};

export const submissionDiffChangeMeta: Record<string, { label: string; color: string }> = {
  ADDED: { label: "新增", color: "green" },
  REMOVED: { label: "删除", color: "red" },
  CHANGED: { label: "已修改", color: "orange" },
};

const reviewerReviewDetailPattern = /^\/reviewer\/reviews\/([^/?#]+)(?:[?#].*)?$/;
const reviewerReviewTaskPattern = /^\/reviewer\/reviews\/tasks\/([^/?#]+)(?:[?#].*)?$/;
export const reviewerAiReviewQueuePath = "/reviewer/ai-review-queue";
export const reviewerManualReviewPath = "/reviewer/reviews";
export const reviewerReviewResultsPath = "/reviewer/results";
export type ReviewerReviewDetailEntry = "task" | "ai-review-queue" | "results";

export interface ReviewerReviewDetailReturnTarget {
  label: string;
  path: string;
}

export function buildReviewerReviewTaskPath(taskId: string): string {
  return `/reviewer/reviews/tasks/${taskId}`;
}

export function buildReviewerReviewDetailPath(
  reviewId: string,
  entry?: { from?: ReviewerReviewDetailEntry; taskId?: string },
): string {
  const params = new URLSearchParams();
  if (entry?.from) {
    params.set("from", entry.from);
  }
  if (entry?.from === "task" && entry.taskId) {
    params.set("taskId", entry.taskId);
  }
  const search = params.toString();
  return `/reviewer/reviews/${reviewId}${search ? `?${search}` : ""}`;
}

export function matchReviewerReviewTaskPath(path: string): string | null {
  return reviewerReviewTaskPattern.exec(path)?.[1] ?? null;
}

export function matchReviewerReviewDetailPath(path: string): string | null {
  return reviewerReviewDetailPattern.exec(path)?.[1] ?? null;
}

export function getReviewerReviewDetailReturnTarget(search: string, taskId: string): ReviewerReviewDetailReturnTarget {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  if (from === "task") {
    const sourceTaskId = normalizeRouteId(params.get("taskId")) ?? taskId;
    return { label: "返回审核工作台", path: buildReviewerReviewTaskPath(sourceTaskId) };
  }
  if (from === "ai-review-queue") {
    return { label: "返回 AI 预审队列", path: reviewerAiReviewQueuePath };
  }
  if (from === "results") {
    return { label: "返回审核结果", path: reviewerReviewResultsPath };
  }
  return { label: "返回审核工作台", path: buildReviewerReviewTaskPath(taskId) };
}

function normalizeRouteId(value: string | null): string | null {
  if (!value || /[/?#]/.test(value)) {
    return null;
  }
  return value;
}

export function formatSubmissionVersion(version: number | null): string {
  return version ? `提交 v${version}` : "提交版本";
}

export function formatReviewConfigVersion(version: number | null): string {
  return version ? `审核配置 v${version}` : "审核配置";
}

export function formatAiScoreTotal(score: number | null): string {
  if (typeof score !== "number") {
    return "待评分";
  }
  return Number.isInteger(score) ? `${score}` : `${Number(score.toFixed(2))}`;
}

export function calculateDistributionPercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) {
    return 0;
  }
  return Math.round((count / total) * 1000) / 10;
}

export function normalizeReviewScoreToPercent(score: number | null | undefined, maxScore: number | null | undefined): number {
  if (typeof score !== "number" || typeof maxScore !== "number" || maxScore <= 0) {
    return 0;
  }
  const percent = (score / maxScore) * 100;
  return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
}

export function formatReviewScorePercent(score: number | null | undefined, maxScore: number | null | undefined): string {
  const percent = normalizeReviewScoreToPercent(score, maxScore);
  const value = Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1);
  return `${value} 分`;
}

export function formatLatency(seconds: number | null): string {
  if (typeof seconds !== "number") {
    return "暂无";
  }
  if (seconds < 60) {
    return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 2)}s`;
  }
  return `${(seconds / 60).toFixed(1)}min`;
}

export function formatReviewTraceCode(id: string): string {
  const tail = id.split("_").pop() ?? id;
  return `#${tail.slice(-8).toUpperCase()}`;
}

export function formatReviewTimelineActor(item: ReviewTimelineItemVO): string {
  if (item.actorName) return item.actorName;
  const roleLabels: Record<string, string> = {
    OWNER: "任务负责人",
    LABELER: "标注员",
    REVIEWER: "审核员",
    SYSTEM: "AI 预审 Agent",
  };
  return roleLabels[item.actorRole] ?? item.actorRole;
}

export function formatReviewTimelineAction(item: ReviewTimelineItemVO): string {
  if (item.action === "ASSIGNMENT_CLAIM") return "领取题目";
  if (item.action === "SUBMISSION_CREATE") {
    const version = metadataNumber(item, "submissionVersion");
    return version ? `提交第 ${version} 轮` : "提交标注结果";
  }
  if (item.action === "REVIEW_AI_SUGGESTION") {
    const score = metadataNumber(item, "scoreTotal");
    const conclusion = metadataString(item, "aiConclusion");
    const conclusionLabel = conclusion ? (aiConclusionMeta[conclusion as AiReviewConclusion]?.label ?? conclusion) : "完成预审";
    return typeof score === "number" ? `预审 ${score} 分 → ${conclusionLabel}` : conclusionLabel;
  }
  if (item.action === "REVIEW_DECISION") {
    const decision = metadataString(item, "decision");
    const labels: Record<string, string> = {
      APPROVE: "通过入库",
      RETURN: "打回到标注员",
      DIRECT_REVISE: "直接修订并入库",
    };
    return decision ? (labels[decision] ?? decision) : "人工审核决策";
  }
  return item.action;
}

export function getReviewTimelineDotColor(item: ReviewTimelineItemVO): string {
  if (item.action === "REVIEW_AI_SUGGESTION") {
    const conclusion = metadataString(item, "aiConclusion");
    if (conclusion === "RETURN") return "#ff4d4f";
    if (conclusion === "NEEDS_HUMAN_REVIEW") return "#7c3aed";
    return "#13a867";
  }
  if (item.action === "REVIEW_DECISION") {
    const decision = metadataString(item, "decision");
    if (decision === "RETURN") return "#ff4d4f";
    if (decision === "DIRECT_REVISE") return "#d46b08";
    return "#13a867";
  }
  if (item.action === "SUBMISSION_CREATE") return "#3370ff";
  return "#8f959e";
}

function metadataString(item: ReviewTimelineItemVO, key: string): string | null {
  const value = item.metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(item: ReviewTimelineItemVO, key: string): number | null {
  const value = item.metadata[key];
  return typeof value === "number" ? value : null;
}

export function formatReviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "未填写";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const readableItems = value.map((item) => formatNestedReviewValue(item)).filter((item) => item !== "未填写");
    return readableItems.length > 0 ? readableItems.join("、") : "未填写";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const formatted = formatNestedReviewValue(item);
        return formatted === "未填写" ? "" : `${key}：${formatted}`;
      })
      .filter(Boolean);
    return entries.length > 0 ? entries.join("；") : "未填写";
  }
  return String(value);
}

function formatNestedReviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "未填写";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map(formatNestedReviewValue).filter((item) => item !== "未填写");
    return items.length > 0 ? items.join("、") : "未填写";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const formatted = formatNestedReviewValue(item);
        return formatted === "未填写" ? "" : `${key}：${formatted}`;
      })
      .filter(Boolean);
    return entries.length > 0 ? entries.join("；") : "未填写";
  }
  return String(value);
}

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
