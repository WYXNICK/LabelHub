import { getTemplateInitialValue } from "../templates/runtime";
import type { TemplateSubmissionValue } from "../templates/types";
import type {
  AssignmentContextVO,
  AssignmentNavigationVO,
  AssignmentStatus,
  AssignmentVO,
  ContributionBucket,
  ContributionItemVO,
  MarketplaceTaskVO,
} from "./types";

export type DraftSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export const assignmentStatusMeta: Record<AssignmentStatus, { label: string; color: string }> = {
  CLAIMED: { label: "待作答", color: "processing" },
  DRAFT_SAVED: { label: "草稿已保存", color: "blue" },
  SUBMITTED: { label: "已提交", color: "default" },
  RETURNED: { label: "已打回", color: "warning" },
  APPROVED: { label: "已通过", color: "success" },
  CANCELLED: { label: "已取消", color: "default" },
};

export const draftSaveStatusMeta: Record<
  DraftSaveStatus,
  { label: string; color: string; message: string }
> = {
  idle: { label: "未保存", color: "default", message: "开始编辑后会自动保存草稿。" },
  dirty: { label: "待保存", color: "warning", message: "已检测到改动，稍后自动保存。" },
  saving: { label: "保存中", color: "processing", message: "正在保存草稿，请稍候。" },
  saved: { label: "已保存", color: "success", message: "草稿已同步到服务端。" },
  error: { label: "保存失败", color: "error", message: "网络或服务异常，当前输入仍保留在页面中。" },
  conflict: { label: "版本冲突", color: "error", message: "服务端已有更新，请重新加载题目后继续编辑。" },
};

export const contributionBucketTabs: Array<{ key: ContributionBucket; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "DRAFT", label: "待提交" },
  { key: "IN_REVIEW", label: "审核中" },
  { key: "APPROVED", label: "已通过" },
  { key: "RETURNED", label: "已打回" },
  { key: "REVISION_REQUIRED", label: "待修改" },
];

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
  return `assignment-claim:${taskId}:${randomPart}`;
}

export function buildSubmissionIdempotencyKey(assignmentId: string): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now();
  return `assignment-submit:${assignmentId}:${randomPart}`;
}

export function buildLlmActionIdempotencyKey(assignmentId: string, componentId: string): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now();
  return `llm-action:${assignmentId}:${componentId}:${randomPart}`;
}

export function isAssignmentEditable(status: AssignmentStatus): boolean {
  return status === "CLAIMED" || status === "DRAFT_SAVED" || status === "RETURNED";
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

export function buildLabelerAssignmentRevisePath(assignmentId: string): string {
  return `/labeler/assignments/${assignmentId}/revise`;
}

export function matchLabelerAssignmentPath(path: string): string | null {
  const match = /^\/labeler\/assignments\/([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

export function matchLabelerAssignmentRevisePath(path: string): string | null {
  const match = /^\/labeler\/assignments\/([^/]+)\/revise$/.exec(path);
  return match?.[1] ?? null;
}

export function getContributionAction(item: ContributionItemVO): { label: string; path: string } {
  if (item.canRevise) {
    return { label: "修改并提交", path: buildLabelerAssignmentRevisePath(item.assignmentId) };
  }
  if (item.canContinue) {
    return { label: "继续作答", path: buildLabelerAssignmentPath(item.assignmentId) };
  }
  return { label: "查看提交", path: buildLabelerAssignmentPath(item.assignmentId) };
}

export function formatContributionVersion(item: ContributionItemVO): string {
  return item.latestSubmissionVersion ? `v${item.latestSubmissionVersion}` : "暂无提交";
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

export function serializeAssignmentDraftValue(value: TemplateSubmissionValue): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, item]) => [key, toStableJsonValue(item)]),
  );
}
