import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  AcceptanceStatsVO,
  BatchReviewDecisionRequest,
  BatchReviewDecisionVO,
  CreateReviewDecisionRequest,
  GetReviewJobSummaryRequest,
  ListReviewJobsRequest,
  ListReviewTasksRequest,
  ListReviewsRequest,
  ReviewDetailVO,
  ReviewJobSummaryVO,
  ReviewJobVO,
  ReviewTaskSummaryVO,
  ReviewVO,
} from "./types";

export function listReviewJobs(request: ListReviewJobsRequest = {}): Promise<PageVO<ReviewJobVO>> {
  return apiRequest<PageVO<ReviewJobVO>>(
    withQuery("/api/review-jobs", {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
      taskId: request.taskId,
      keyword: request.keyword,
    }),
  );
}

export function getReviewJobSummary(request: GetReviewJobSummaryRequest = {}): Promise<ReviewJobSummaryVO> {
  return apiRequest<ReviewJobSummaryVO>(
    withQuery("/api/review-jobs/summary", {
      taskId: request.taskId,
      keyword: request.keyword,
    }),
  );
}

export function listReviews(request: ListReviewsRequest = {}): Promise<PageVO<ReviewVO>> {
  return apiRequest<PageVO<ReviewVO>>(
    withQuery("/api/reviews", {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
      taskId: request.taskId,
      keyword: request.keyword,
      aiConclusion: request.aiConclusion,
    }),
  );
}

export function listReviewTasks(request: ListReviewTasksRequest = {}): Promise<PageVO<ReviewTaskSummaryVO>> {
  return apiRequest<PageVO<ReviewTaskSummaryVO>>(
    withQuery("/api/reviews/tasks", {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
      keyword: request.keyword,
      aiConclusion: request.aiConclusion,
    }),
  );
}

export function getReviewDetail(reviewId: string): Promise<ReviewDetailVO> {
  return apiRequest<ReviewDetailVO>(`/api/reviews/${reviewId}`);
}

export function decideReview(reviewId: string, request: CreateReviewDecisionRequest): Promise<ReviewVO> {
  return apiRequest<ReviewVO>(`/api/reviews/${reviewId}/decisions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function batchDecideReviews(request: BatchReviewDecisionRequest): Promise<BatchReviewDecisionVO> {
  return apiRequest<BatchReviewDecisionVO>("/api/reviews:batch-decide", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getTaskAcceptanceStats(taskId: string): Promise<AcceptanceStatsVO> {
  return apiRequest<AcceptanceStatsVO>(`/api/tasks/${taskId}/acceptance-stats`);
}
