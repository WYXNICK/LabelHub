import type { JsonObject } from "../../shared/types/api";

export type DatasetType = "QA_QUALITY" | "PREFERENCE_COMPARE" | "CUSTOM";
export type DatasetSourceFormat = "JSON" | "JSONL" | "EXCEL" | "MIXED";
export type DatasetStatus = "IMPORTING" | "READY" | "FAILED";
export type DatasetItemStatus = "AVAILABLE" | "CLAIMED" | "DISABLED";
export type ImportStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface DatasetVO {
  id: string;
  taskId: string;
  name: string;
  datasetType: DatasetType;
  sourceFormat: DatasetSourceFormat;
  itemCount: number;
  enabledItemCount: number;
  disabledItemCount: number;
  status: DatasetStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRefVO {
  kind: string;
  url: string;
  fieldPath: string | null;
}

export interface DatasetItemVO {
  id: string;
  datasetId: string;
  taskId: string;
  externalItemId: string | null;
  sourceFormat: DatasetSourceFormat;
  sourceRowNumber: number | null;
  payload: JsonObject;
  mediaRefs: MediaRefVO[];
  checksum: string | null;
  status: DatasetItemStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportJobRequest {
  datasetName: string;
  datasetType?: DatasetType;
  sourceFormat: DatasetSourceFormat;
  fileObjectId: string;
  idempotencyKey?: string | null;
}

export interface ImportJobVO {
  id: string;
  taskId: string;
  datasetId: string | null;
  fileObjectId: string;
  sourceFormat: DatasetSourceFormat;
  status: ImportStatus;
  successCount: number;
  failedCount: number;
  errorSummary: JsonObject | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportErrorRowVO {
  id: string;
  importJobId: string;
  taskId: string;
  datasetId: string | null;
  sourceRowNumber: number | null;
  fieldPath: string | null;
  errorCode: string;
  errorMessage: string;
  rawFragment: JsonObject | null;
  createdAt: string;
}

export interface ListImportErrorsRequest {
  page?: number;
  pageSize?: number;
}

export interface ListDatasetsRequest {
  page?: number;
  pageSize?: number;
}

export interface ListDatasetItemsRequest {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface BatchUpdateDatasetItemsRequest {
  itemIds: string[];
  enabled?: boolean | null;
  tags?: string[] | null;
  reason?: string | null;
  expectedVersion?: number | null;
}

export interface BatchUpdateDatasetItemsVO {
  updatedCount: number;
  skippedCount: number;
  auditLogId: string | null;
}
