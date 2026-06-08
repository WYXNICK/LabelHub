import { apiRequest, withQuery } from "../../shared/api/client";
import type {
  CreateExportJobRequest,
  ExportFieldOptionsVO,
  ExportJobPageVO,
  ExportJobVO,
} from "./types";

export function getExportFieldOptions(taskId: string): Promise<ExportFieldOptionsVO> {
  return apiRequest<ExportFieldOptionsVO>(`/api/tasks/${taskId}/export-field-options`);
}

export function listExportJobs(
  taskId: string,
  request: { page?: number; pageSize?: number } = {},
): Promise<ExportJobPageVO> {
  return apiRequest<ExportJobPageVO>(
    withQuery(`/api/tasks/${taskId}/export-jobs`, {
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}

export function createExportJob(taskId: string, request: CreateExportJobRequest): Promise<ExportJobVO> {
  return apiRequest<ExportJobVO>(`/api/tasks/${taskId}/export-jobs`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getExportJob(exportJobId: string): Promise<ExportJobVO> {
  return apiRequest<ExportJobVO>(`/api/export-jobs/${exportJobId}`);
}

export function buildExportDownloadPath(exportJobId: string): string {
  return `/api/export-jobs/${exportJobId}/download`;
}
