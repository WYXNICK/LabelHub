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
      {
        id: "rich",
        type: "RICH_TEXT",
        fieldKey: "richText",
        label: "富文本说明",
        props: { placeholder: "请输入富文本", defaultValue: "" },
        validation: {},
        visibility: {},
      },
      {
        id: "file",
        type: "FILE_UPLOAD",
        fieldKey: "attachments",
        label: "附件",
        props: { accept: [".pdf"], maxFiles: 2, maxSizeMb: 20 },
        validation: {},
        visibility: {},
      },
      {
        id: "image",
        type: "IMAGE_UPLOAD",
        fieldKey: "screenshots",
        label: "截图",
        props: { accept: ["image/png"], maxFiles: 3, maxSizeMb: 10 },
        validation: {},
        visibility: {},
      },
      {
        id: "json",
        type: "JSON_EDITOR",
        fieldKey: "metadata",
        label: "结构化信息",
        props: { defaultValue: { source: "demo" } },
        validation: {},
        visibility: {},
      },
      {
        id: "llm",
        type: "LLM_ACTION",
        label: "AI 参考建议",
        props: {
          actionLabel: "生成建议",
          promptTemplate: "请结合题目和字段生成参考建议。",
          inputFieldKeys: ["answer", "metadata"],
          outputFieldKey: "reason",
          helperText: "输出仅作参考",
        },
        validation: {},
        visibility: {},
      },
    ],
    layout: {
      root: ["show_prompt", "answer", "reason", "quality", "issues", "tags", "rich", "file", "image", "json", "llm"],
    },
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
      "rich",
      "file",
      "image",
      "json",
      "llm",
    ]);
    expect(getTemplateInitialValue(schema)).toEqual({
      answer: "",
      reason: "",
      quality: "",
      issues: [],
      tags: [],
      richText: "",
      attachments: [],
      screenshots: [],
      metadata: { source: "demo" },
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
    expect(html).toContain("富文本说明");
    expect(html).toContain("加粗");
    expect(html).toContain("格式预览");
    expect(html).toContain("附件");
    expect(html).toContain("结构化信息");
    expect(html).toContain("AI 参考建议");
    expect(html).toContain("阶段 3.6 接入真实调用");
  });
});
