import { describe, expect, it, vi } from "vitest";

import {
  appendComponentToSchema,
  createDesignerComponent,
  createDesignerComponentId,
  designerMaterialGroups,
  getDesignerLayoutItems,
  getLayoutTabs,
  getOrderedDesignerComponents,
  moveComponentByOffset,
  moveComponentInSchema,
  normalizeDesignerOptions,
  removeComponentFromSchema,
  updateLayoutTabs,
  updateTemplateComponent,
} from "./designer";
import { createEmptyTemplateSchema } from "./view";

describe("template designer helpers", () => {
  it("creates stage 2.4 basic materials with editable defaults", () => {
    expect(createDesignerComponent({ type: "SHOW_ITEM", id: "show_prompt" })).toMatchObject({
      fieldKey: null,
      props: { path: "$.prompt" },
    });
    expect(createDesignerComponent({ type: "TEXT_INPUT", id: "title", index: 2 })).toMatchObject({
      fieldKey: "text_input_2",
      props: { placeholder: "请输入内容", defaultValue: "" },
      validation: { required: true, maxLength: 120 },
    });
    expect(createDesignerComponent({ type: "TAG_SELECT", id: "tags" }).props.defaultValue).toEqual([]);
  });

  it("creates stage 2.5 advanced materials with serializable defaults", () => {
    expect(designerMaterialGroups.map((group) => group.title)).toEqual(["基础物料", "高级物料", "布局物料"]);
    expect(createDesignerComponent({ type: "RICH_TEXT", id: "rich", index: 4 })).toMatchObject({
      fieldKey: "rich_text_4",
      props: { placeholder: "请输入富文本内容", defaultValue: "", toolbarPreset: "basic" },
      validation: { required: false, maxLength: 5000 },
    });
    expect(createDesignerComponent({ type: "FILE_UPLOAD", id: "file" })).toMatchObject({
      props: { accept: [".pdf", ".docx", ".xlsx", ".json"], maxFiles: 3, maxSizeMb: 20 },
      validation: { required: false },
    });
    expect(createDesignerComponent({ type: "IMAGE_UPLOAD", id: "image" }).props.accept).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    expect(createDesignerComponent({ type: "JSON_EDITOR", id: "json" }).props.defaultValue).toEqual({});
    expect(createDesignerComponent({ type: "LLM_ACTION", id: "llm" })).toMatchObject({
      fieldKey: null,
      props: {
        actionLabel: "生成参考建议",
        inputFieldKeys: [],
        outputFieldKey: "",
      },
    });
  });

  it("creates stage 2.6 layout materials and nested layout targets", () => {
    let schema = createEmptyTemplateSchema();
    const group = createDesignerComponent({ type: "GROUP", id: "group" });
    const tabs = createDesignerComponent({ type: "TABS", id: "tabs" });
    const answer = createDesignerComponent({ type: "TEXT_INPUT", id: "answer" });
    const reason = createDesignerComponent({ type: "TEXTAREA", id: "reason" });

    expect(group).toMatchObject({ fieldKey: null, props: { collapsible: false } });
    expect(tabs).toMatchObject({ fieldKey: null, props: { defaultTabId: "basic" } });

    schema = appendComponentToSchema(schema, group);
    schema = appendComponentToSchema(schema, answer, null, { containerId: "group" });
    schema = appendComponentToSchema(schema, tabs);
    schema = appendComponentToSchema(schema, reason, null, { containerId: "tabs", tabId: "extra" });

    const layoutItems = getDesignerLayoutItems(schema);
    expect(layoutItems[0].children?.map((item) => item.component.id)).toEqual(["answer"]);
    expect(getLayoutTabs(schema, "tabs")[1].children).toEqual(["reason"]);
    expect(getOrderedDesignerComponents(schema).map((component) => component.id)).toEqual(["group", "answer", "tabs", "reason"]);

    schema = updateLayoutTabs(schema, "tabs", (currentTabs) =>
      currentTabs.map((tab) => (tab.id === "basic" ? { ...tab, label: "基础" } : tab)),
    );
    expect(getLayoutTabs(schema, "tabs")[0].label).toBe("基础");

    schema = removeComponentFromSchema(schema, "group");
    expect(schema.components.map((component) => component.id)).toEqual(["tabs", "reason"]);
  });

  it("appends and orders components through layout.root", () => {
    let schema = createEmptyTemplateSchema();
    const prompt = createDesignerComponent({ type: "SHOW_ITEM", id: "show_prompt" });
    const answer = createDesignerComponent({ type: "TEXTAREA", id: "answer" });
    const quality = createDesignerComponent({ type: "RADIO", id: "quality" });

    schema = appendComponentToSchema(schema, prompt);
    schema = appendComponentToSchema(schema, answer);
    schema = appendComponentToSchema(schema, quality, "answer");

    expect(schema.layout.root).toEqual(["show_prompt", "quality", "answer"]);
    expect(getOrderedDesignerComponents(schema).map((component) => component.id)).toEqual([
      "show_prompt",
      "quality",
      "answer",
    ]);
  });

  it("moves and removes components without changing component data", () => {
    let schema = createEmptyTemplateSchema();
    schema = appendComponentToSchema(schema, createDesignerComponent({ type: "SHOW_ITEM", id: "show_prompt" }));
    schema = appendComponentToSchema(schema, createDesignerComponent({ type: "TEXT_INPUT", id: "answer" }));
    schema = appendComponentToSchema(schema, createDesignerComponent({ type: "RADIO", id: "quality" }));

    schema = moveComponentInSchema(schema, "quality", "show_prompt");
    expect(schema.layout.root).toEqual(["quality", "show_prompt", "answer"]);

    schema = moveComponentByOffset(schema, "quality", 1);
    expect(schema.layout.root).toEqual(["show_prompt", "quality", "answer"]);

    schema = removeComponentFromSchema(schema, "quality");
    expect(schema.components.map((component) => component.id)).toEqual(["show_prompt", "answer"]);
    expect(schema.layout.root).toEqual(["show_prompt", "answer"]);
  });

  it("updates component properties and normalizes option rows", () => {
    let schema = createEmptyTemplateSchema();
    schema = appendComponentToSchema(schema, createDesignerComponent({ type: "RADIO", id: "quality" }));
    schema = updateTemplateComponent(schema, "quality", (component) => ({
      ...component,
      label: "质量结论",
      props: { ...component.props, options: [{ label: "好", value: "good" }] },
    }));

    expect(schema.components[0].label).toBe("质量结论");
    expect(normalizeDesignerOptions(schema.components[0])).toEqual([{ label: "好", value: "good" }]);
  });

  it("generates stable-prefixed ids for dropped materials", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.12345);

    expect(createDesignerComponentId("TEXTAREA", 3)).toContain("textarea_");
    expect(createDesignerComponentId("JSON_EDITOR", 4)).toContain("json_editor_");

    vi.restoreAllMocks();
  });
});
