import type { JsonObject } from "../../shared/types/api";

export type ReviewConfigVersionStatus = "ACTIVE" | "DISABLED";

export interface ReviewDimensionDTO {
  key: string;
  name: string;
  description?: string | null;
  maxScore: number;
  weight: number;
}

export interface ReviewThresholdDTO {
  passMinScore: number;
  returnBelowScore: number;
  humanReviewMinScore?: number | null;
}

export interface ReviewConfigDraftVO {
  id: string;
  taskId: string;
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  thresholds: ReviewThresholdDTO;
  outputSchema: JsonObject;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewConfigVersionVO {
  id: string;
  taskId: string;
  versionNo: number;
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  thresholds: ReviewThresholdDTO;
  outputSchema: JsonObject;
  status: ReviewConfigVersionStatus;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReviewConfigDraftRequest {
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  thresholds: ReviewThresholdDTO;
  outputSchema?: JsonObject;
}

export interface PublishReviewConfigVersionRequest {
  draftId: string;
  versionNote?: string | null;
}

export interface ListReviewConfigVersionsRequest {
  page?: number;
  pageSize?: number;
}
