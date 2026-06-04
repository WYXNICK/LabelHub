import { describe, expect, it } from "vitest";

import {
  collectTemplateFieldKeys,
  buildOwnerTaskDesignerPath,
  createEmptyTemplateSchema,
  createTemplateComponent,
  getTemplateDesignerEntry,
  getTemplateDesignerReturnTarget,
  getTemplatePublishState,
  isTemplateEditableStatus,
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
    expect(matchOwnerTaskDesignerPath("/owner/tasks/task_123/designer?from=tasks")).toBe("task_123");
    expect(matchOwnerTaskDesignerPath("/owner/tasks/task_123/settings")).toBeNull();
  });

  it("builds source-aware designer paths and return targets", () => {
    expect(buildOwnerTaskDesignerPath("task_123", "tasks")).toBe("/owner/tasks/task_123/designer?from=tasks");
    expect(getTemplateDesignerEntry("?from=templates")).toBe("templates");
    expect(getTemplateDesignerEntry("?from=unknown")).toBeNull();
    expect(getTemplateDesignerReturnTarget("task_123", "tasks")).toEqual({
      label: "返回任务管理",
      path: "/owner/tasks",
    });
    expect(getTemplateDesignerReturnTarget("task_123", "settings")).toEqual({
      label: "返回任务设置",
      path: "/owner/tasks/task_123/settings",
    });
    expect(getTemplateDesignerReturnTarget("task_123", null)).toEqual({
      label: "返回模板工作台",
      path: "/owner/templates",
    });
  });

  it("describes task-bound template publish state", () => {
    expect(getTemplatePublishState({ status: "DRAFT", currentTemplateVersionId: "tv_1" })).toMatchObject({
      label: "已发布",
      color: "green",
    });
    expect(getTemplatePublishState({ status: "DRAFT", currentTemplateVersionId: null })).toMatchObject({
      label: "草稿待发布",
      color: "blue",
    });
    expect(getTemplatePublishState({ status: "ENDED", currentTemplateVersionId: null })).toMatchObject({
      label: "未绑定版本",
      color: "orange",
    });
  });

  it("allows template edits only for draft tasks", () => {
    expect(isTemplateEditableStatus("DRAFT")).toBe(true);
    expect(isTemplateEditableStatus("PUBLISHED")).toBe(false);
  });
});
