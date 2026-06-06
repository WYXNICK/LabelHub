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

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
