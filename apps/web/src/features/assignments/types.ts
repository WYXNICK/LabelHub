import type { DistributionStrategy } from "../tasks/types";
import type { TaskVO } from "../tasks/types";
import type { TemplateSchemaVO, TemplateSubmissionValue } from "../templates/types";
import type { JsonObject } from "../../shared/types/api";

export type AssignmentStatus =
  | "CLAIMED"
  | "DRAFT_SAVED"
  | "SUBMITTED"
  | "RETURNED"
  | "APPROVED"
  | "CANCELLED";

export type SubmissionStatus =
  | "SUBMITTED"
  | "AI_REVIEWING"
  | "HUMAN_REVIEWING"
  | "RETURNED"
  | "APPROVED";

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
  activeAssignmentId: string | null;
  deadlineAt: string | null;
  distributionStrategy: DistributionStrategy;
  currentTemplateVersionId: string;
  currentReviewConfigVersionId: string;
  updatedAt: string;
}

export interface SubmissionVO {
  id: string;
  assignmentId: string;
  taskId: string;
  datasetItemId: string;
  labelerId: string;
  templateVersionId: string;
  submissionVersion: number;
  values: TemplateSubmissionValue;
  status: SubmissionStatus;
  idempotencyKey: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentNavigationVO {
  previousAssignmentId: string | null;
  nextAssignmentId: string | null;
  currentIndex: number;
  totalCount: number;
  canClaimNext: boolean;
  nextClaimableTaskId: string | null;
}

export interface AssignmentContextVO {
  assignment: AssignmentVO;
  task: TaskVO;
  datasetItemPayload: JsonObject;
  templateSchema: TemplateSchemaVO;
  latestSubmission: SubmissionVO | null;
  reviewFeedback: JsonObject | null;
  navigation: AssignmentNavigationVO;
}

export interface ListAssignmentsRequest {
  page?: number;
  pageSize?: number;
  status?: AssignmentStatus;
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

export interface SaveAssignmentDraftRequest {
  values: TemplateSubmissionValue;
  clientVersion: number;
}

export interface AssignmentVO {
  id: string;
  taskId: string;
  datasetItemId: string;
  templateVersionId: string;
  reviewConfigVersionId: string;
  labelerId: string;
  status: AssignmentStatus;
  draftValues: TemplateSubmissionValue | null;
  draftSavedAt: string | null;
  currentSubmissionId: string | null;
  claimedAt: string;
  submittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
