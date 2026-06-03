import { describe, expect, it, vi } from "vitest";

import {
  appendComponentToSchema,
  createDesignerComponent,
  createDesignerComponentId,
  getOrderedDesignerComponents,
  moveComponentByOffset,
  moveComponentInSchema,
  normalizeDesignerOptions,
  removeComponentFromSchema,
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

    vi.restoreAllMocks();
  });
});
