import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TemplateRenderer } from "./TemplateRenderer";
import {
  formatPayloadValue,
  getRenderableComponents,
  getTemplateInitialValue,
  getTemplateOptions,
  readPayloadPath,
  updateTemplateSubmissionValue,
} from "./runtime";
import type { TemplateSchemaVO } from "./types";

function rendererSchema(): TemplateSchemaVO {
  return {
    schemaVersion: "labelhub-template/v1",
    components: [
      {
        id: "show_prompt",
        type: "SHOW_ITEM",
        label: "题目",
        props: { path: "$.prompt" },
        validation: {},
        visibility: {},
      },
      {
        id: "answer",
        type: "TEXT_INPUT",
        fieldKey: "answer",
        label: "答案",
        props: { placeholder: "请输入答案" },
        validation: { required: true },
        visibility: {},
      },
      {
        id: "reason",
        type: "TEXTAREA",
        fieldKey: "reason",
        label: "理由",
        props: {},
        validation: {},
        visibility: {},
      },
      {
        id: "quality",
        type: "RADIO",
        fieldKey: "quality",
        label: "质量",
        props: { options: [{ label: "好", value: "good" }] },
        validation: {},
        visibility: {},
      },
      {
        id: "issues",
        type: "CHECKBOX",
        fieldKey: "issues",
        label: "问题",
        props: { options: [{ label: "事实错误", value: "fact_error" }] },
        validation: {},
        visibility: {},
      },
      {
        id: "tags",
        type: "TAG_SELECT",
        fieldKey: "tags",
        label: "标签",
        props: { options: [{ label: "高质量", value: "high_quality" }] },
        validation: {},
        visibility: {},
      },
    ],
    layout: { root: ["show_prompt", "answer", "reason", "quality", "issues", "tags"] },
    llmActions: [],
    showItems: [],
  };
}

describe("template runtime helpers", () => {
  it("reads payload values by a small JSONPath subset", () => {
    expect(readPayloadPath({ prompt: "hello", nested: { items: [{ text: "A" }] } }, "$.prompt")).toBe(
      "hello",
    );
    expect(readPayloadPath({ nested: { items: [{ text: "A" }] } }, "$.nested.items[0].text")).toBe("A");
    expect(formatPayloadValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("derives renderable components and initial submission values", () => {
    const schema = rendererSchema();
    expect(getRenderableComponents(schema).map((component) => ("id" in component ? component.id : component.missingId))).toEqual([
      "show_prompt",
      "answer",
      "reason",
      "quality",
      "issues",
      "tags",
    ]);
    expect(getTemplateInitialValue(schema)).toEqual({
      answer: "",
      reason: "",
      quality: "",
      issues: [],
      tags: [],
    });
  });

  it("parses renderer options and updates controlled values", () => {
    const schema = rendererSchema();
    const quality = schema.components.find((component) => component.id === "quality");
    expect(quality).toBeDefined();
    expect(getTemplateOptions(quality!)).toEqual([{ label: "好", value: "good" }]);
    expect(updateTemplateSubmissionValue({}, quality!, "good")).toEqual({ quality: "good" });
  });

  it("renders minimal runtime materials from the shared schema", () => {
    const html = renderToStaticMarkup(
      <TemplateRenderer
        schema={rendererSchema()}
        itemPayload={{ prompt: "请判断回答质量" }}
        value={getTemplateInitialValue(rendererSchema())}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("请判断回答质量");
    expect(html).toContain("请输入答案");
    expect(html).toContain("事实错误");
    expect(html).toContain("标签");
  });
});
