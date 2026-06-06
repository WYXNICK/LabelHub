import type { AiReviewConclusion, ReviewJobStatus, ReviewStatus } from "./types";

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

const reviewerReviewDetailPattern = /^\/reviewer\/reviews\/([^/?#]+)$/;

export function buildReviewerReviewDetailPath(reviewId: string): string {
  return `/reviewer/reviews/${reviewId}`;
}

export function matchReviewerReviewDetailPath(path: string): string | null {
  return reviewerReviewDetailPattern.exec(path)?.[1] ?? null;
}

export function formatSubmissionVersion(version: number | null): string {
  return version ? `提交 v${version}` : "提交版本";
}

export function formatReviewConfigVersion(version: number | null): string {
  return version ? `审核配置 v${version}` : "审核配置";
}

export function formatAiScoreTotal(score: number | null): string {
  return typeof score === "number" ? `${score}` : "待评分";
}

export function formatReviewTraceCode(id: string): string {
  const tail = id.split("_").pop() ?? id;
  return `#${tail.slice(-8).toUpperCase()}`;
}

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
