import type { DatasetSourceFormat, DatasetStatus, DatasetType, ImportStatus } from "./types";

export const datasetTypeOptions: Array<{ label: string; value: DatasetType }> = [
  { label: "QA 质量评估", value: "QA_QUALITY" },
  { label: "偏好对比", value: "PREFERENCE_COMPARE" },
  { label: "自定义数据", value: "CUSTOM" },
];

export const sourceFormatOptions: Array<{ label: string; value: DatasetSourceFormat }> = [
  { label: "JSON", value: "JSON" },
  { label: "JSONL", value: "JSONL" },
  { label: "Excel", value: "EXCEL" },
];

export const datasetStatusMeta: Record<DatasetStatus, { label: string; color: string }> = {
  IMPORTING: { label: "导入中", color: "processing" },
  READY: { label: "可用", color: "success" },
  FAILED: { label: "导入失败", color: "error" },
};

export const importStatusMeta: Record<ImportStatus, { label: string; color: string }> = {
  QUEUED: { label: "排队中", color: "default" },
  RUNNING: { label: "导入中", color: "processing" },
  SUCCEEDED: { label: "导入完成", color: "success" },
  FAILED: { label: "导入失败", color: "error" },
};

export function matchOwnerTaskDatasetsPath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/datasets$/.exec(path);
  return match?.[1] ?? null;
}

export function inferDatasetSourceFormat(fileName: string): DatasetSourceFormat {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".jsonl")) {
    return "JSONL";
  }
  if (normalizedName.endsWith(".xlsx")) {
    return "EXCEL";
  }
  return "JSON";
}

export function inferDatasetType(fileName: string): DatasetType {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.includes("qa_quality")) {
    return "QA_QUALITY";
  }
  if (normalizedName.includes("preference_compare")) {
    return "PREFERENCE_COMPARE";
  }
  return "CUSTOM";
}

export function defaultDatasetName(fileName: string): string {
  return fileName.replace(/\.(jsonl|json|xlsx)$/i, "") || "dataset";
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function buildImportIdempotencyKey(input: {
  taskId: string;
  fileName: string;
  sizeBytes: number;
  datasetName: string;
  datasetType: DatasetType;
  sourceFormat: DatasetSourceFormat;
}): string {
  const rawKey = [
    input.taskId,
    input.datasetName,
    input.datasetType,
    input.sourceFormat,
    input.fileName,
    input.sizeBytes,
  ].join(":");
  return `stage1-import:${stableHash(rawKey)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
