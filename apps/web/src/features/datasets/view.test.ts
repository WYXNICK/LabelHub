import { describe, expect, it } from "vitest";

import {
  buildPayloadSummary,
  buildImportIdempotencyKey,
  defaultDatasetName,
  inferDatasetSourceFormat,
  inferDatasetType,
  matchOwnerTaskDatasetsPath,
  normalizeBatchTags,
} from "./view";

describe("dataset view helpers", () => {
  it("extracts task id from owner dataset path", () => {
    expect(matchOwnerTaskDatasetsPath("/owner/tasks/task_123/datasets")).toBe("task_123");
    expect(matchOwnerTaskDatasetsPath("/owner/tasks/task_123/settings")).toBeNull();
  });

  it("infers import metadata from file name", () => {
    expect(inferDatasetSourceFormat("qa_quality.json")).toBe("JSON");
    expect(inferDatasetSourceFormat("qa_quality.jsonl")).toBe("JSONL");
    expect(inferDatasetSourceFormat("qa_quality.xlsx")).toBe("EXCEL");
    expect(inferDatasetType("qa_quality.json")).toBe("QA_QUALITY");
    expect(inferDatasetType("preference_compare.jsonl")).toBe("PREFERENCE_COMPARE");
    expect(inferDatasetType("custom.json")).toBe("CUSTOM");
    expect(defaultDatasetName("qa_quality.jsonl")).toBe("qa_quality");
  });

  it("builds stable import idempotency key", () => {
    const key = buildImportIdempotencyKey({
      taskId: "task_1",
      fileName: "qa_quality.json",
      sizeBytes: 10,
      datasetName: "qa_quality",
      datasetType: "QA_QUALITY",
      sourceFormat: "JSON",
    });
    expect(key).toMatch(/^stage1-import:[a-f0-9]{8}$/);
    expect(key).toBe(
      buildImportIdempotencyKey({
        taskId: "task_1",
        fileName: "qa_quality.json",
        sizeBytes: 10,
        datasetName: "qa_quality",
        datasetType: "QA_QUALITY",
        sourceFormat: "JSON",
      }),
    );
  });

  it("normalizes batch tags from comma and newline input", () => {
    expect(normalizeBatchTags("golden, needs_review\n黄金样本，golden")).toEqual([
      "golden",
      "needs_review",
      "黄金样本",
    ]);
  });

  it("builds compact payload summary from preferred fields", () => {
    expect(buildPayloadSummary({ prompt: "请判断回答是否准确", response_a: "A" })).toBe("请判断回答是否准确");
    expect(buildPayloadSummary({ id: "item_1" })).toBe('{"id":"item_1"}');
  });
});
