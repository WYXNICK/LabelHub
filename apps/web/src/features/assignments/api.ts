import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  AssignmentContextVO,
  AssignmentVO,
  CreateAssignmentRequest,
  ListAssignmentsRequest,
  ListMarketplaceTasksRequest,
  MarketplaceTaskVO,
} from "./types";

export function listMarketplaceTasks(
  request: ListMarketplaceTasksRequest = {},
): Promise<PageVO<MarketplaceTaskVO>> {
  return apiRequest<PageVO<MarketplaceTaskVO>>(
    withQuery("/api/marketplace/tasks", {
      page: request.page,
      pageSize: request.pageSize,
      keyword: request.keyword,
      tag: request.tag,
    }),
  );
}

export function claimAssignment(taskId: string, request: CreateAssignmentRequest = {}): Promise<AssignmentVO> {
  return apiRequest<AssignmentVO>(`/api/tasks/${taskId}/assignments`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listAssignments(request: ListAssignmentsRequest = {}): Promise<PageVO<AssignmentVO>> {
  return apiRequest<PageVO<AssignmentVO>>(
    withQuery("/api/assignments", {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
    }),
  );
}

export function getAssignmentContext(assignmentId: string): Promise<AssignmentContextVO> {
  return apiRequest<AssignmentContextVO>(`/api/assignments/${assignmentId}`);
}
