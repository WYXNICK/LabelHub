import type { DistributionStrategy } from "../tasks/types";
import type { JsonObject } from "../../shared/types/api";

export type AssignmentStatus =
  | "CLAIMED"
  | "DRAFT_SAVED"
  | "SUBMITTED"
  | "RETURNED"
  | "APPROVED"
  | "CANCELLED";

export interface MarketplaceTaskVO {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  rewardRule: JsonObject | null;
  quota: number;
  claimedCount: number;
  submittedCount: number;
  approvedCount: number;
  availableItemCount: number;
  claimedByMeCount: number;
  submittedByMeCount: number;
  deadlineAt: string | null;
  distributionStrategy: DistributionStrategy;
  currentTemplateVersionId: string;
  currentReviewConfigVersionId: string;
  updatedAt: string;
}

export interface ListMarketplaceTasksRequest {
  page?: number;
  pageSize?: number;
  keyword?: string;
  tag?: string;
}

export interface CreateAssignmentRequest {
  idempotencyKey?: string | null;
}

export interface AssignmentVO {
  id: string;
  taskId: string;
  datasetItemId: string;
  templateVersionId: string;
  reviewConfigVersionId: string;
  labelerId: string;
  status: AssignmentStatus;
  draftValues: JsonObject | null;
  draftSavedAt: string | null;
  currentSubmissionId: string | null;
  claimedAt: string;
  submittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
