import type { PageVO } from "../../shared/types/api";

export type ExportFormat = "JSON" | "JSONL" | "CSV" | "EXCEL";
export type ExportJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ExportFieldSource =
  | "DATASET_PAYLOAD"
  | "SUBMISSION_VALUE"
  | "REVIEW_METADATA"
  | "AUDIT_TIMELINE";

export interface ExportFieldOptionVO {
  source: ExportFieldSource;
  path: string;
  label: string;
  sampleValue: unknown | null;
  defaultSelected: boolean;
}

export interface ExportFieldOptionsVO {
  taskId: string;
  taskTitle: string;
  approvedCount: number;
  latestApprovedAt: string | null;
  options: ExportFieldOptionVO[];
}

export interface ExportFieldMappingDTO {
  source: ExportFieldSource;
  path: string;
  outputKey: string;
  label?: string | null;
  order: number;
  selected: boolean;
}

export interface CreateExportJobRequest {
  format: ExportFormat;
  fieldMappings: ExportFieldMappingDTO[];
  includeReviewRecords?: boolean;
  includeAuditTimeline?: boolean;
  idempotencyKey?: string | null;
}

export interface ExportJobVO {
  id: string;
  taskId: string;
  taskTitle: string;
  format: ExportFormat;
  status: ExportJobStatus;
  totalRows: number;
  exportedRows: number;
  fieldMappings: ExportFieldMappingDTO[];
  includeReviewRecords: boolean;
  includeAuditTimeline: boolean;
  fileObjectId: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  canDownload: boolean;
  canRetry: boolean;
  isStale: boolean;
  durationSeconds: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type ExportJobPageVO = PageVO<ExportJobVO>;
