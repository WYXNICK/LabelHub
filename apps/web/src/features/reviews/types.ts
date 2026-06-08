import type { AssignmentVO, SubmissionVO } from "../assignments/types";
import type { ReviewConfigVersionVO } from "../review-config/types";
import type { TaskVO } from "../tasks/types";
import type { TemplateSchemaVO } from "../templates/types";
import type { JsonObject } from "../../shared/types/api";

export type ReviewJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NEEDS_HUMAN_REVIEW";
export type AiReviewConclusion = "PASS" | "RETURN" | "NEEDS_HUMAN_REVIEW";
export type ReviewStatus = "PENDING_HUMAN_REVIEW" | "APPROVED" | "RETURNED";
export type HumanReviewDecision = "APPROVE" | "RETURN" | "DIRECT_REVISE";

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
  reviewId: string | null;
  aiConclusion: AiReviewConclusion | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  aiComment: string | null;
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

export interface ReviewJobSummaryVO {
  totalJobs: number;
  statusCounts: Record<ReviewJobStatus, number>;
  aiConclusionCounts: Record<AiReviewConclusion, number>;
  pendingReviewCount: number;
  todayProcessedCount: number;
  todaySucceededCount: number;
  todayFailedCount: number;
  todayFallbackCount: number;
  todayPassCount: number;
  todayReturnCount: number;
  todayManualCount: number;
  averageLatencySeconds: number | null;
  failureRate: number;
  maxAttempts: number;
  runningJobCount: number;
  staleRunningJobCount: number;
  activeWorkerCount: number;
  lockTimeoutSeconds: number;
  latestWorkerId: string | null;
  latestJobUpdatedAt: string | null;
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

export interface ReviewTaskSummaryVO {
  taskId: string;
  taskTitle: string | null;
  totalReviewCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  returnedCount: number;
  aiPassCount: number;
  aiReturnCount: number;
  aiManualCount: number;
  latestReviewId: string | null;
  latestReviewUpdatedAt: string | null;
  latestReviewRound: number | null;
  reviewConfigVersionNo: number | null;
}

export interface ReviewTimelineItemVO {
  actorId: string;
  actorName: string | null;
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

export interface ReviewStateLinkVO {
  assignmentStatus: string;
  submissionStatus: string;
  reviewJobStatus: ReviewJobStatus | null;
  reviewStatus: ReviewStatus;
  currentStep: string;
  nextActionLabel: string;
}

export interface ReviewHistoryItemVO {
  submissionId: string;
  submissionVersion: number;
  submissionStatus: string;
  submittedAt: string;
  reviewId: string | null;
  reviewStatus: ReviewStatus | null;
  aiConclusion: AiReviewConclusion | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  aiComment: string | null;
  humanConclusion: HumanReviewDecision | null;
  humanComment: string | null;
  reviewRound: number | null;
}

export interface SubmissionDiffItemVO {
  fieldKey: string;
  label: string;
  previousValue: unknown;
  currentValue: unknown;
  changeType: "ADDED" | "REMOVED" | "CHANGED" | string;
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
  stateLink: ReviewStateLinkVO;
  reviewHistory: ReviewHistoryItemVO[];
  submissionDiff: SubmissionDiffItemVO[];
  timeline: ReviewTimelineItemVO[];
}

export interface CreateReviewDecisionRequest {
  decision: HumanReviewDecision;
  reason?: string;
  dimensionComments?: Record<string, string>;
  revisedValues?: JsonObject;
  expectedVersion: number;
}

export interface BatchReviewDecisionRequest {
  reviewIds: string[];
  decision: HumanReviewDecision;
  reason?: string;
  expectedVersions?: Record<string, number>;
}

export interface BatchReviewDecisionVO {
  succeededIds: string[];
  failed: Record<string, string>;
}

export interface AcceptanceReviewSampleVO {
  reviewId: string;
  taskTitle: string | null;
  submissionVersion: number | null;
  reviewRound: number;
  status: ReviewStatus;
  aiConclusion: AiReviewConclusion | null;
  aiScoreTotal: number | null;
  aiIssueCount: number;
  humanConclusion: HumanReviewDecision | null;
  humanComment: string | null;
  updatedAt: string;
}

export interface AcceptanceStatsVO {
  taskId: string;
  submittedCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  returnedCount: number;
  aiConclusionDistribution: Record<string, number>;
  latestReviewedAt: string | null;
  recentReviews: AcceptanceReviewSampleVO[];
}

export interface ListReviewJobsRequest {
  page?: number;
  pageSize?: number;
  status?: ReviewJobStatus;
  taskId?: string;
  keyword?: string;
}

export interface GetReviewJobSummaryRequest {
  taskId?: string;
  keyword?: string;
}

export interface ListReviewsRequest {
  page?: number;
  pageSize?: number;
  status?: ReviewStatus;
  taskId?: string;
  keyword?: string;
  aiConclusion?: AiReviewConclusion;
}

export interface ListReviewTasksRequest {
  page?: number;
  pageSize?: number;
  status?: ReviewStatus;
  keyword?: string;
  aiConclusion?: AiReviewConclusion;
}
