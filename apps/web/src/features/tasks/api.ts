import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  CreateTaskRequest,
  ListTasksRequest,
  PublishCheckVO,
  TaskDetailVO,
  TaskStateTransitionRequest,
  TaskVO,
  UpdateTaskRequest,
} from "./types";

export function listTasks(request: ListTasksRequest = {}): Promise<PageVO<TaskVO>> {
  return apiRequest<PageVO<TaskVO>>(
    withQuery("/api/tasks", {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
      keyword: request.keyword,
    }),
  );
}

export function createTask(request: CreateTaskRequest): Promise<TaskDetailVO> {
  return apiRequest<TaskDetailVO>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getTask(taskId: string): Promise<TaskDetailVO> {
  return apiRequest<TaskDetailVO>(`/api/tasks/${taskId}`);
}

export function updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskDetailVO> {
  return apiRequest<TaskDetailVO>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(request),
  });
}

export function transitionTaskState(
  taskId: string,
  request: TaskStateTransitionRequest,
): Promise<TaskDetailVO> {
  return apiRequest<TaskDetailVO>(`/api/tasks/${taskId}/state-transitions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getPublishCheck(taskId: string): Promise<PublishCheckVO> {
  return apiRequest<PublishCheckVO>(`/api/tasks/${taskId}/publish-check`);
}
