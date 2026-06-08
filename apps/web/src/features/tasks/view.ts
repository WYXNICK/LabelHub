import type { PublishBlockerCode, PublishBlockerVO, TaskStatus, TaskVO } from "./types";

export const taskStatusMeta: Record<TaskStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "已发布", color: "processing" },
  PAUSED: { label: "已暂停", color: "warning" },
  ENDED: { label: "已结束", color: "error" },
};

export const distributionStrategyOptions = [
  { label: "先到先得", value: "FIRST_COME_FIRST_SERVED" },
  { label: "指派", value: "ASSIGNED" },
  { label: "配额抢单", value: "QUOTA_GRAB" },
];

export const publishBlockerMeta: Record<
  PublishBlockerCode,
  { label: string; color: string; priority: number }
> = {
  INVALID_TASK_STATUS: { label: "任务状态", color: "red", priority: 0 },
  MISSING_REQUIRED_FIELDS: { label: "基础信息", color: "red", priority: 1 },
  INVALID_QUOTA: { label: "配额", color: "red", priority: 2 },
  INVALID_DEADLINE: { label: "截止时间", color: "red", priority: 3 },
  MISSING_DATASET: { label: "数据集", color: "orange", priority: 4 },
  MISSING_TEMPLATE_VERSION: { label: "标注模板", color: "orange", priority: 5 },
  MISSING_REVIEW_CONFIG: { label: "审核配置", color: "orange", priority: 6 },
};

export interface TaskTransitionAction {
  targetStatus: TaskStatus;
  label: string;
  danger?: boolean;
}

export function getTaskTransitionActions(task: Pick<TaskVO, "status">): TaskTransitionAction[] {
  switch (task.status) {
    case "DRAFT":
      return [
        { targetStatus: "PUBLISHED", label: "发布" },
        { targetStatus: "ENDED", label: "结束", danger: true },
      ];
    case "PUBLISHED":
      return [
        { targetStatus: "PAUSED", label: "暂停" },
        { targetStatus: "ENDED", label: "结束", danger: true },
      ];
    case "PAUSED":
      return [
        { targetStatus: "PUBLISHED", label: "恢复发布" },
        { targetStatus: "ENDED", label: "结束", danger: true },
      ];
    case "ENDED":
      return [];
  }
}

export function isPublishCheckTargetStatus(status: TaskStatus): boolean {
  return status === "DRAFT" || status === "PAUSED";
}

export function sortPublishBlockers(blockers: PublishBlockerVO[]): PublishBlockerVO[] {
  return [...blockers].sort((left, right) => {
    const leftMeta = publishBlockerMeta[left.code];
    const rightMeta = publishBlockerMeta[right.code];
    return leftMeta.priority - rightMeta.priority || left.message.localeCompare(right.message, "zh-CN");
  });
}

export function matchOwnerTaskSettingsPath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/settings$/.exec(path);
  return match?.[1] ?? null;
}

export function matchOwnerTaskAcceptancePath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/acceptance$/.exec(path);
  return match?.[1] ?? null;
}

export function parseApiDateTime(value: string): Date {
  const normalizedSeparator = value.trim().replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?)/,
    "$1T$2",
  );
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalizedSeparator);
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalizedSeparator);
  // MySQL DATETIME 经 PyMySQL 返回后会丢失 UTC 标记；无时区的后端时间统一按 UTC 解析。
  const normalizedValue = isDateTime && !hasExplicitTimezone ? `${normalizedSeparator}Z` : normalizedSeparator;
  return new Date(normalizedValue);
}

export function formatTaskTime(value: string | null): string {
  if (!value) {
    return "未设置";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseApiDateTime(value));
}
