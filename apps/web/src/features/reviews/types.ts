import type { AssignmentVO, SubmissionVO } from "../assignments/types";
import type { ReviewConfigVersionVO } from "../review-config/types";
import type { TaskVO } from "../tasks/types";
import type { TemplateSchemaVO } from "../templates/types";
import type { JsonObject } from "../../shared/types/api";

export type ReviewJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NEEDS_HUMAN_REVIEW";
export type AiReviewConclusion = "PASS" | "RETURN" | "NEEDS_HUMAN_REVIEW";
export type ReviewStatus = "PENDING_HUMAN_REVIEW" | "APPROVED" | "RETURNED";
export type HumanReviewDecision = "APPROVE" | "RETURN";

export interface ReviewJobVO {
  id: string;
  taskId: string;
  taskTitle: string | null;
  assignmentId: string;
  submissionId: string;
  submissionVersion: number | null;
  reviewConfigVersionId: string;
  reviewConfigVersionNo: number | null;
  status: ReviewJobStatus;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  lastError: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiReviewIssueDTO {
  field: string | null;
  code: string;
  message: string;
}

export interface ReviewVO {
  id: string;
  taskId: string;
  taskTitle: string | null;
  submissionId: string;
  submissionVersion: number | null;
  assignmentId: string;
  reviewJobId: string;
  reviewConfigVersionNo: number | null;
  status: ReviewStatus;
  aiConclusion: AiReviewConclusion | null;
  aiScores: Record<string, number>;
  aiScoreTotal: number | null;
  aiComment: string | null;
  aiIssues: AiReviewIssueDTO[];
  aiIssueCount: number;
  aiSuggestions: string | null;
  humanConclusion: HumanReviewDecision | null;
  reviewerId: string | null;
  humanComment: string | null;
  dimensionComments: Record<string, string>;
  reviewRound: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewTimelineItemVO {
  actorRole: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface ReviewPromptSnapshotSummaryVO {
  snapshotAvailable: boolean;
  taskTitle: string | null;
  datasetItemKeys: string[];
  submissionFieldKeys: string[];
  templateFieldLabels: string[];
  reviewDimensionNames: string[];
  reviewConfigVersionNo: number | null;
  promptExcerpt: string | null;
}

export interface ReviewDetailVO {
  review: ReviewVO;
  task: TaskVO;
  assignment: AssignmentVO;
  submission: SubmissionVO;
  datasetItemPayload: JsonObject;
  templateSchema: TemplateSchemaVO;
  reviewConfigVersion: ReviewConfigVersionVO;
  promptSnapshotSummary: ReviewPromptSnapshotSummaryVO | null;
  timeline: ReviewTimelineItemVO[];
}

export interface ListReviewJobsRequest {
  page?: number;
  pageSize?: number;
  status?: ReviewJobStatus;
  taskId?: string;
}

export interface ListReviewsRequest {
  page?: number;
  pageSize?: number;
  status?: ReviewStatus;
  taskId?: string;
  aiConclusion?: AiReviewConclusion;
}
