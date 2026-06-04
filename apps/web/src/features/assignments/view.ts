import type { MarketplaceTaskVO } from "./types";

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

export function getClaimButtonText(task: Pick<MarketplaceTaskVO, "availableItemCount" | "claimedByMeCount">): string {
  if (task.availableItemCount <= 0) {
    return "已领完";
  }
  return task.claimedByMeCount > 0 ? "继续领取" : "领取题目";
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
