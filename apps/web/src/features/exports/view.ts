import type {
  ExportFieldMappingDTO,
  ExportFieldOptionVO,
  ExportFieldSource,
  ExportFormat,
  ExportJobStatus,
} from "./types";

export const exportFormatMeta: Record<ExportFormat, { label: string; description: string }> = {
  JSON: { label: "JSON", description: "结构化对象数组，适合接口验收" },
  JSONL: { label: "JSONL", description: "一行一条记录，适合大规模数据流转" },
  CSV: { label: "CSV", description: "表格通用格式，适合轻量查看" },
  EXCEL: { label: "Excel", description: "面向业务验收与离线交付" },
};

export const exportJobStatusMeta: Record<ExportJobStatus, { label: string; color: string }> = {
  QUEUED: { label: "等待生成", color: "blue" },
  RUNNING: { label: "生成中", color: "processing" },
  SUCCEEDED: { label: "已完成", color: "success" },
  FAILED: { label: "失败", color: "error" },
};

export const exportFieldSourceMeta: Record<ExportFieldSource, { label: string; color: string; prefix: string }> = {
  DATASET_PAYLOAD: { label: "原始数据", color: "geekblue", prefix: "item" },
  SUBMISSION_VALUE: { label: "标注结果", color: "green", prefix: "value" },
  REVIEW_METADATA: { label: "审核信息", color: "purple", prefix: "review" },
  AUDIT_TIMELINE: { label: "审计轨迹", color: "orange", prefix: "audit" },
};

export function matchOwnerTaskExportsPath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/exports$/.exec(path);
  return match?.[1] ?? null;
}

export function buildDefaultExportFieldMappings(options: ExportFieldOptionVO[]): ExportFieldMappingDTO[] {
  const usedKeys = new Set<string>();
  return options
    .filter((option) => option.defaultSelected)
    .map((option, index) => {
      const outputKey = uniqueOutputKey(toOutputKey(option), usedKeys);
      return {
        source: option.source,
        path: option.path,
        outputKey,
        label: option.label,
        order: index,
        selected: true,
      };
    });
}

export function toOutputKey(option: Pick<ExportFieldOptionVO, "source" | "path">): string {
  const sourcePrefix = exportFieldSourceMeta[option.source].prefix;
  const pathKey = option.path
    .replace(/^\$\./, "")
    .replace(/^\$/, "root")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${sourcePrefix}_${pathKey || "field"}`.toLowerCase();
}

export function formatSampleValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "暂无样例";
  }
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }
  const serialized = JSON.stringify(value);
  return serialized.length > 80 ? `${serialized.slice(0, 80)}...` : serialized;
}

function uniqueOutputKey(rawKey: string, usedKeys: Set<string>): string {
  let candidate = rawKey;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${rawKey}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}
