import { apiRequest } from "../../shared/api/client";
import type { CreateFileObjectRequest, FileObjectVO } from "./types";

export function createFileObject(request: CreateFileObjectRequest): Promise<FileObjectVO> {
  return apiRequest<FileObjectVO>("/api/files", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
