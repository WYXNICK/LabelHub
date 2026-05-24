import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  ListReviewConfigVersionsRequest,
  PublishReviewConfigVersionRequest,
  ReviewConfigDraftVO,
  ReviewConfigVersionVO,
  SaveReviewConfigDraftRequest,
} from "./types";

export function getReviewConfigDraft(taskId: string): Promise<ReviewConfigDraftVO> {
  return apiRequest<ReviewConfigDraftVO>(`/api/tasks/${taskId}/review-config-draft`);
}

export function saveReviewConfigDraft(
  taskId: string,
  request: SaveReviewConfigDraftRequest,
): Promise<ReviewConfigDraftVO> {
  return apiRequest<ReviewConfigDraftVO>(`/api/tasks/${taskId}/review-config-draft`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function publishReviewConfigVersion(
  taskId: string,
  request: PublishReviewConfigVersionRequest,
): Promise<ReviewConfigVersionVO> {
  return apiRequest<ReviewConfigVersionVO>(`/api/tasks/${taskId}/review-config-versions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listReviewConfigVersions(
  taskId: string,
  request: ListReviewConfigVersionsRequest = {},
): Promise<PageVO<ReviewConfigVersionVO>> {
  return apiRequest<PageVO<ReviewConfigVersionVO>>(
    withQuery(`/api/tasks/${taskId}/review-config-versions`, {
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}
