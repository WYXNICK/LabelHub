import { describe, expect, it } from "vitest";

import {
  buildDefaultExportFieldMappings,
  formatSampleValue,
  matchOwnerTaskExportsPath,
  toOutputKey,
} from "./view";

describe("export view helpers", () => {
  it("extracts owner export task id from route", () => {
    expect(matchOwnerTaskExportsPath("/owner/tasks/task_123/exports")).toBe("task_123");
    expect(matchOwnerTaskExportsPath("/owner/tasks/task_123/acceptance")).toBeNull();
  });

  it("builds stable default field mappings from selected options", () => {
    const mappings = buildDefaultExportFieldMappings([
      {
        source: "DATASET_PAYLOAD",
        path: "$.prompt",
        label: "题目原文",
        sampleValue: "question",
        defaultSelected: true,
      },
      {
        source: "SUBMISSION_VALUE",
        path: "$.answer",
        label: "回答",
        sampleValue: "answer",
        defaultSelected: true,
      },
      {
        source: "REVIEW_METADATA",
        path: "$.aiConclusion",
        label: "AI 结论",
        sampleValue: "PASS",
        defaultSelected: false,
      },
    ]);

    expect(mappings).toEqual([
      {
        source: "DATASET_PAYLOAD",
        path: "$.prompt",
        outputKey: "item_prompt",
        label: "题目原文",
        order: 0,
        selected: true,
      },
      {
        source: "SUBMISSION_VALUE",
        path: "$.answer",
        outputKey: "value_answer",
        label: "回答",
        order: 1,
        selected: true,
      },
    ]);
  });

  it("prefixes output keys by field source to avoid collisions", () => {
    expect(toOutputKey({ source: "DATASET_PAYLOAD", path: "$.answer" })).toBe("item_answer");
    expect(toOutputKey({ source: "SUBMISSION_VALUE", path: "$.answer" })).toBe("value_answer");
  });

  it("keeps sample values compact", () => {
    expect(formatSampleValue(null)).toBe("暂无样例");
    expect(formatSampleValue({ a: 1 })).toBe('{"a":1}');
    expect(formatSampleValue("x".repeat(90))).toHaveLength(83);
  });
});
