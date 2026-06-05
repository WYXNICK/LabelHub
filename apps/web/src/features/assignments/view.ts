import { getTemplateInitialValue } from "../templates/runtime";
import type { TemplateSubmissionValue } from "../templates/types";
import type { AssignmentContextVO, AssignmentNavigationVO, AssignmentStatus, AssignmentVO, MarketplaceTaskVO } from "./types";

export const assignmentStatusMeta: Record<AssignmentStatus, { label: string; color: string }> = {
  CLAIMED: { label: "待作答", color: "processing" },
  DRAFT_SAVED: { label: "草稿已保存", color: "blue" },
  SUBMITTED: { label: "已提交", color: "default" },
  RETURNED: { label: "已打回", color: "warning" },
  APPROVED: { label: "已通过", color: "success" },
  CANCELLED: { label: "已取消", color: "default" },
};

export function formatRewardRule(rewardRule: MarketplaceTaskVO["rewardRule"]): string {
  if (!rewardRule) {
    return "奖励规则待任务负责人补充";
  }
  const description = rewardRule.description;
  if (typeof description === "string" && description.trim()) {
    return description.trim();
  }
  return JSON.stringify(rewardRule);
}

export function getClaimButtonText(
  task: Pick<MarketplaceTaskVO, "availableItemCount" | "claimedByMeCount" | "activeAssignmentId">,
): string {
  if (task.activeAssignmentId) {
    return "继续作答";
  }
  if (task.availableItemCount <= 0) {
    return "已领完";
  }
  return task.claimedByMeCount > 0 ? "领取下一题" : "领取题目";
}

export function buildClaimIdempotencyKey(taskId: string): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now();
  return `stage3-claim:${taskId}:${randomPart}`;
}

export function summarizeMarketplace(tasks: MarketplaceTaskVO[]) {
  return {
    taskCount: tasks.length,
    availableItemCount: tasks.reduce((sum, task) => sum + task.availableItemCount, 0),
    claimedByMeCount: tasks.reduce((sum, task) => sum + task.claimedByMeCount, 0),
    submittedByMeCount: tasks.reduce((sum, task) => sum + task.submittedByMeCount, 0),
  };
}

export function summarizeAssignmentQueue(assignments: AssignmentVO[]) {
  return {
    totalCount: assignments.length,
    activeCount: assignments.filter((item) => item.status === "CLAIMED" || item.status === "DRAFT_SAVED").length,
    submittedCount: assignments.filter((item) => item.status === "SUBMITTED").length,
    approvedCount: assignments.filter((item) => item.status === "APPROVED").length,
    returnedCount: assignments.filter((item) => item.status === "RETURNED").length,
  };
}

export function formatAssignmentQueueLabel(assignment: Pick<AssignmentVO, "datasetItemId">, index: number): string {
  const ordinal = String(index + 1).padStart(3, "0");
  return `#${ordinal} ${assignment.datasetItemId.slice(0, 13)}`;
}

export function buildLabelerAssignmentPath(assignmentId: string): string {
  return `/labeler/assignments/${assignmentId}`;
}

export function matchLabelerAssignmentPath(path: string): string | null {
  const match = /^\/labeler\/assignments\/([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

export function getAssignmentProgressText(navigation: AssignmentNavigationVO): string {
  if (navigation.totalCount <= 0) {
    return "暂无题目";
  }
  return `第 ${navigation.currentIndex} / ${navigation.totalCount} 题`;
}

export function resolveAssignmentInitialValue(context: AssignmentContextVO): TemplateSubmissionValue {
  if (context.assignment.draftValues) {
    return context.assignment.draftValues as TemplateSubmissionValue;
  }
  if (context.latestSubmission?.values) {
    return context.latestSubmission.values;
  }
  return getTemplateInitialValue(context.templateSchema);
}
