import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  BatchUpdateDatasetItemsRequest,
  BatchUpdateDatasetItemsVO,
  CreateImportJobRequest,
  DatasetItemVO,
  DatasetVO,
  ImportErrorRowVO,
  ImportJobVO,
  ListDatasetItemsRequest,
  ListDatasetsRequest,
  ListImportErrorsRequest,
} from "./types";

export function createImportJob(
  taskId: string,
  request: CreateImportJobRequest,
): Promise<ImportJobVO> {
  return apiRequest<ImportJobVO>(`/api/tasks/${taskId}/import-jobs`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getImportJob(importJobId: string): Promise<ImportJobVO> {
  return apiRequest<ImportJobVO>(`/api/import-jobs/${importJobId}`);
}

export function listImportErrors(
  importJobId: string,
  request: ListImportErrorsRequest = {},
): Promise<PageVO<ImportErrorRowVO>> {
  return apiRequest<PageVO<ImportErrorRowVO>>(
    withQuery(`/api/import-jobs/${importJobId}/errors`, {
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}

export function listTaskDatasets(
  taskId: string,
  request: ListDatasetsRequest = {},
): Promise<PageVO<DatasetVO>> {
  return apiRequest<PageVO<DatasetVO>>(
    withQuery(`/api/tasks/${taskId}/datasets`, {
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}

export function listDatasetItems(
  datasetId: string,
  request: ListDatasetItemsRequest = {},
): Promise<PageVO<DatasetItemVO>> {
  return apiRequest<PageVO<DatasetItemVO>>(
    withQuery(`/api/datasets/${datasetId}/items`, {
      page: request.page,
      pageSize: request.pageSize,
      keyword: request.keyword,
    }),
  );
}

export function batchUpdateDatasetItems(
  datasetId: string,
  request: BatchUpdateDatasetItemsRequest,
): Promise<BatchUpdateDatasetItemsVO> {
  return apiRequest<BatchUpdateDatasetItemsVO>(`/api/datasets/${datasetId}/items:batch`, {
    method: "PATCH",
    body: JSON.stringify(request),
  });
}
