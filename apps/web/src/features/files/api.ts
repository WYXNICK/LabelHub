import { apiRequest } from "../../shared/api/client";
import type { CreateFileObjectRequest, FileObjectVO } from "./types";

export function createFileObject(request: CreateFileObjectRequest): Promise<FileObjectVO> {
  return apiRequest<FileObjectVO>("/api/files", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getFileObject(fileId: string): Promise<FileObjectVO> {
  return apiRequest<FileObjectVO>(`/api/files/${fileId}`);
}

export function buildFileDownloadUrl(fileId: string, inline = false): string {
  return `/api/files/${fileId}/download${inline ? "?inline=true" : ""}`;
}
