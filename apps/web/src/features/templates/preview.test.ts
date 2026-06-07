import { describe, expect, it } from "vitest";

import { collectPayloadFieldOptions, formatDatasetSampleLabel } from "./preview";
import type { DatasetItemVO } from "../datasets/types";

describe("template preview helpers", () => {
  it("collects selectable JSONPath fields from a payload sample", () => {
    const options = collectPayloadFieldOptions({
      id: "P0001",
      prompt: "请选择更好的回答",
      response_a: { text: "A answer", score: 1 },
      tags: ["math", "short"],
    });

    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining(["$.id", "$.prompt", "$.response_a", "$.response_a.text", "$.response_a.score", "$.tags", "$.tags[0]"]),
    );
    expect(options.find((option) => option.value === "$.prompt")?.label).toContain("请选择更好的回答");
  });

  it("formats dataset item labels with stable index and payload summary", () => {
    const item: DatasetItemVO = {
      id: "item_1",
      datasetId: "dataset_1",
      taskId: "task_1",
      externalItemId: "P0009",
      sourceFormat: "JSON",
      sourceRowNumber: 9,
      payload: { prompt: "地球到月球的平均距离大约是多少？" },
      mediaRefs: [],
      checksum: null,
      status: "AVAILABLE",
      tags: [],
      createdAt: "2026-06-08T00:00:00Z",
      updatedAt: "2026-06-08T00:00:00Z",
    };

    expect(formatDatasetSampleLabel(item, 8)).toBe("#009 · P0009 · 地球到月球的平均距离大约是多少？");
  });
});
