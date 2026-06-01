import { describe, expect, it } from "vitest";

import {
  collectTemplateFieldKeys,
  createEmptyTemplateSchema,
  createTemplateComponent,
  matchOwnerTaskDesignerPath,
  summarizeTemplateValidation,
} from "./view";

describe("template view helpers", () => {
  it("creates the stage 2 schema skeleton shared by designer and renderer", () => {
    expect(createEmptyTemplateSchema()).toEqual({
      schemaVersion: "labelhub-template/v1",
      components: [],
      layout: { root: [] },
      llmActions: [],
      showItems: [],
    });
  });

  it("defaults field keys only for collectable materials", () => {
    expect(createTemplateComponent({ id: "answer", type: "TEXTAREA" }).fieldKey).toBe("answer");
    expect(createTemplateComponent({ id: "prompt", type: "SHOW_ITEM" }).fieldKey).toBeNull();
  });

  it("collects field keys for submit-capable components", () => {
    const schema = createEmptyTemplateSchema();
    schema.components = [
      createTemplateComponent({ id: "prompt", type: "SHOW_ITEM" }),
      createTemplateComponent({ id: "answer", type: "TEXTAREA" }),
      createTemplateComponent({ id: "quality", type: "RADIO" }),
    ];

    expect(collectTemplateFieldKeys(schema)).toEqual(["answer", "quality"]);
  });

  it("summarizes backend validation result for future designer feedback", () => {
    expect(summarizeTemplateValidation({ valid: true, errors: [] })).toBe("模板 schema 校验通过");
    expect(
      summarizeTemplateValidation({
        valid: false,
        errors: [{ field: "components", message: "fieldKey 重复：answer。" }],
      }),
    ).toBe("components: fieldKey 重复：answer。");
  });

  it("extracts task id from owner designer path", () => {
    expect(matchOwnerTaskDesignerPath("/owner/tasks/task_123/designer")).toBe("task_123");
    expect(matchOwnerTaskDesignerPath("/owner/tasks/task_123/settings")).toBeNull();
  });
});
