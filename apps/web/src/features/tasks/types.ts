import type { JsonObject } from "../../shared/types/api";

export type TaskStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "ENDED";
export type DistributionStrategy = "FIRST_COME_FIRST_SERVED" | "ASSIGNED" | "QUOTA_GRAB";

export type PublishBlockerCode =
  | "MISSING_REQUIRED_FIELDS"
  | "MISSING_DATASET"
  | "MISSING_TEMPLATE_VERSION"
  | "MISSING_REVIEW_CONFIG"
  | "INVALID_QUOTA"
  | "INVALID_DEADLINE";

export interface TaskStatsVO {
  datasetCount: number;
  itemCount: number;
  enabledItemCount: number;
  reviewConfigVersionCount: number;
}

export interface TaskVO {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  quota: number;
  claimedCount: number;
  submittedCount: number;
  approvedCount: number;
  deadlineAt: string | null;
  distributionStrategy: DistributionStrategy;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailVO extends TaskVO {
  instructionRichText: JsonObject | null;
  rewardRule: JsonObject | null;
  currentTemplateVersionId: string | null;
  currentReviewConfigVersionId: string | null;
  version: number;
  stats: TaskStatsVO;
}

export interface ListTasksRequest {
  page?: number;
  pageSize?: number;
  status?: TaskStatus;
  keyword?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  instructionRichText?: JsonObject | null;
  tags?: string[];
  rewardRule?: JsonObject | null;
  quota: number;
  deadlineAt?: string | null;
  distributionStrategy?: DistributionStrategy;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  instructionRichText?: JsonObject | null;
  tags?: string[];
  rewardRule?: JsonObject | null;
  quota?: number;
  deadlineAt?: string | null;
  distributionStrategy?: DistributionStrategy;
  version: number;
}

export interface TaskStateTransitionRequest {
  targetStatus: TaskStatus;
  reason?: string | null;
  version: number;
}

export interface PublishBlockerVO {
  code: PublishBlockerCode;
  message: string;
  field: string | null;
}

export interface PublishCheckVO {
  taskId: string;
  canPublish: boolean;
  blockers: PublishBlockerVO[];
  checkedAt: string;
}
