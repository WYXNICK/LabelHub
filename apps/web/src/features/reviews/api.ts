import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type { ListReviewJobsRequest, ListReviewsRequest, ReviewDetailVO, ReviewJobVO, ReviewVO } from "./types";

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

export function getReviewDetail(reviewId: string): Promise<ReviewDetailVO> {
  return apiRequest<ReviewDetailVO>(`/api/reviews/${reviewId}`);
}
