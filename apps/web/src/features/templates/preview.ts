import type { JsonObject } from "../../shared/types/api";
import type { DatasetItemVO } from "../datasets/types";

export interface PayloadFieldOption {
  label: string;
  value: string;
  valuePreview: string;
  kind: "array" | "boolean" | "null" | "number" | "object" | "string";
}

export const fallbackPreviewPayload: JsonObject = {
  id: "preview_item_001",
  prompt: "请判断下面的回答是否准确、完整，并给出必要的修正建议。",
  question: "上海交通大学位于哪里？",
  model_answer: "上海交通大学位于上海，是中国重点高校之一。",
  reference: "回答需要判断事实正确性、覆盖度和表达清晰度。",
  response_a: "回答准确，覆盖了地点和高校属性。",
  response_b: "回答不完整，没有说明判断依据。",
};

export function collectPayloadFieldOptions(payload: JsonObject, maxDepth = 3): PayloadFieldOption[] {
  const options: PayloadFieldOption[] = [];
  visitPayload(payload, "$", 0, maxDepth, options);
  return options.slice(0, 120);
}

export function formatDatasetSampleLabel(item: DatasetItemVO, index: number): string {
  const external = item.externalItemId ? ` · ${item.externalItemId}` : "";
  const preview = summarizePayload(item.payload);
  return `#${String(index + 1).padStart(3, "0")}${external}${preview ? ` · ${preview}` : ""}`;
}

function visitPayload(
  value: unknown,
  path: string,
  depth: number,
  maxDepth: number,
  options: PayloadFieldOption[],
) {
  if (path !== "$") {
    options.push({
      label: `${path} · ${previewValue(value)}`,
      value: path,
      valuePreview: previewValue(value),
      kind: getValueKind(value),
    });
  }
  if (depth >= maxDepth || !value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, index) => visitPayload(item, `${path}[${index}]`, depth + 1, maxDepth, options));
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    visitPayload(child, path === "$" ? `$.${key}` : `${path}.${key}`, depth + 1, maxDepth, options);
  });
}

function summarizePayload(payload: JsonObject): string {
  for (const key of ["prompt", "question", "title", "content", "response_a", "model_answer"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return previewValue(value);
    }
  }
  return "";
}

function previewValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "未提供";
  }
  if (typeof value === "string") {
    return truncate(value.replace(/\s+/g, " ").trim(), 36);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `数组 ${value.length} 项`;
  }
  if (typeof value === "object") {
    return `对象 ${Object.keys(value).length} 个字段`;
  }
  return String(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function getValueKind(value: unknown): PayloadFieldOption["kind"] {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "string";
}
