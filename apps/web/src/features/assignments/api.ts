import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  AssignmentContextVO,
  AssignmentVO,
  ContributionItemVO,
  ContributionStatsVO,
  CreateAssignmentRequest,
  CreateSubmissionRequest,
  LlmActionRunVO,
  ListAssignmentsRequest,
  ListContributionsRequest,
  ListMarketplaceTasksRequest,
  MarketplaceTaskVO,
  RunLlmActionRequest,
  SaveAssignmentDraftRequest,
  SubmissionVO,
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

export function getContributionStats(): Promise<ContributionStatsVO> {
  return apiRequest<ContributionStatsVO>("/api/me/contribution-stats");
}

export function listContributions(
  request: ListContributionsRequest = {},
): Promise<PageVO<ContributionItemVO>> {
  return apiRequest<PageVO<ContributionItemVO>>(
    withQuery("/api/me/contributions", {
      page: request.page,
      pageSize: request.pageSize,
      bucket: request.bucket,
      keyword: request.keyword,
    }),
  );
}

export function getAssignmentContext(assignmentId: string): Promise<AssignmentContextVO> {
  return apiRequest<AssignmentContextVO>(`/api/assignments/${assignmentId}`);
}

export function saveAssignmentDraft(
  assignmentId: string,
  request: SaveAssignmentDraftRequest,
): Promise<AssignmentVO> {
  return apiRequest<AssignmentVO>(`/api/assignments/${assignmentId}/draft`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function createSubmission(
  assignmentId: string,
  request: CreateSubmissionRequest,
): Promise<SubmissionVO> {
  return apiRequest<SubmissionVO>(`/api/assignments/${assignmentId}/submissions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function runLlmAction(
  assignmentId: string,
  componentId: string,
  request: RunLlmActionRequest,
): Promise<LlmActionRunVO> {
  return apiRequest<LlmActionRunVO>(
    `/api/assignments/${assignmentId}/llm-actions/${encodeURIComponent(componentId)}:run`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}
