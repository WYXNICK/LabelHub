import type { TaskStatus, TaskVO } from "./types";

export const taskStatusMeta: Record<TaskStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "发布中", color: "processing" },
  PAUSED: { label: "已暂停", color: "warning" },
  ENDED: { label: "已结束", color: "error" },
};

export const distributionStrategyOptions = [
  { label: "先到先得", value: "FIRST_COME_FIRST_SERVED" },
  { label: "指派", value: "ASSIGNED" },
  { label: "配额抢单", value: "QUOTA_GRAB" },
];

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

export function matchOwnerTaskSettingsPath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/settings$/.exec(path);
  return match?.[1] ?? null;
}

export function formatTaskTime(value: string | null): string {
  if (!value) {
    return "未设置";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
