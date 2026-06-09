import { ApiClientError, apiRequest, withQuery } from "../../shared/api/client";
import type { ApiErrorVO } from "../../shared/types/api";
import type {
  CreateExportJobRequest,
  ExportFieldOptionsVO,
  ExportJobPageVO,
  ExportJobStatus,
  ExportJobVO,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function getExportFieldOptions(taskId: string): Promise<ExportFieldOptionsVO> {
  return apiRequest<ExportFieldOptionsVO>(`/api/tasks/${taskId}/export-field-options`);
}

export function listExportJobs(
  taskId: string,
  request: { page?: number; pageSize?: number; status?: ExportJobStatus | null } = {},
): Promise<ExportJobPageVO> {
  return apiRequest<ExportJobPageVO>(
    withQuery(`/api/tasks/${taskId}/export-jobs`, {
      page: request.page,
      pageSize: request.pageSize,
      status: request.status,
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

export function retryExportJob(exportJobId: string): Promise<ExportJobVO> {
  return apiRequest<ExportJobVO>(`/api/export-jobs/${exportJobId}/retry`, {
    method: "POST",
  });
}

export function buildExportDownloadPath(exportJobId: string): string {
  return `/api/export-jobs/${exportJobId}/download`;
}

export async function downloadExportJobFile(exportJobId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`${API_BASE_URL}${buildExportDownloadPath(exportJobId)}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await parseApiError(response);
    throw new ApiClientError(response.status, payload);
  }
  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(response.headers.get("content-disposition")) ?? "labelhub_export",
  };
}

async function parseApiError(response: Response): Promise<ApiErrorVO | null> {
  try {
    return (await response.json()) as ApiErrorVO;
  } catch {
    return null;
  }
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (!value) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const normalMatch = /filename="?([^";]+)"?/i.exec(value);
  return normalMatch?.[1] ?? null;
}
