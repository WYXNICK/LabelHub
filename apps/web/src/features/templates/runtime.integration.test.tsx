import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TemplateRenderer } from "./TemplateRenderer";
import {
  evaluateTemplateCondition,
  formatPayloadValue,
  getRenderableLayoutItems,
  getRenderableComponents,
  getTemplateInitialValue,
  getTemplateOptions,
  isTemplateComponentVisible,
  pruneHiddenSubmissionValue,
  readPayloadPath,
  updateTemplateSubmissionValue,
  validateTemplateSubmissionValue,
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

function stage26Schema(): TemplateSchemaVO {
  return {
    schemaVersion: "labelhub-template/v1",
    components: [
      {
        id: "group_review",
        type: "GROUP",
        label: "质检分组",
        props: { description: "质量较差时需要补充原因", collapsible: false },
        validation: {},
        visibility: {},
      },
      {
        id: "quality",
        type: "RADIO",
        fieldKey: "quality",
        label: "质量",
        props: { options: [{ label: "差", value: "bad" }, { label: "好", value: "good" }] },
        validation: { required: true },
        visibility: {},
      },
      {
        id: "reason",
        type: "TEXTAREA",
        fieldKey: "reason",
        label: "修正原因",
        props: { placeholder: "请说明原因" },
        validation: {
          requiredWhen: {
            logic: "ALL",
            conditions: [{ fieldKey: "quality", operator: "EQUALS", value: "bad" }],
            message: "质量较差时必须填写原因",
          },
          pattern: "^[^@#$]+$",
          patternMessage: "不能包含特殊符号",
          customRuleIds: ["NO_EMOJI"],
        },
        visibility: { logic: "ALL", conditions: [{ fieldKey: "quality", operator: "EQUALS", value: "bad" }] },
      },
      {
        id: "tabs",
        type: "TABS",
        label: "多阶段信息",
        props: { defaultTabId: "basic" },
        validation: {},
        visibility: {},
      },
      {
        id: "note",
        type: "TEXT_INPUT",
        fieldKey: "note",
        label: "备注",
        props: { placeholder: "请输入备注" },
        validation: {},
        visibility: {},
      },
    ],
    layout: {
      root: [
        { componentId: "group_review", children: ["quality", "reason"] },
        { componentId: "tabs", tabs: [{ id: "basic", label: "基础", children: ["note"] }] },
      ],
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
    expect(html).toContain("OpenAI 兼容调用");
  });

  it("renders and validates uploaded file references with metadata", () => {
    const schema = rendererSchema();
    const value = {
      answer: "ok",
      attachments: [
        {
          id: "file_pdf",
          fileName: "evidence.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          downloadUrl: "/api/files/file_pdf/download",
          previewUrl: null,
          isImage: false,
        },
      ],
      screenshots: [
        {
          id: "file_png",
          fileName: "screen.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          downloadUrl: "/api/files/file_png/download",
          previewUrl: "/api/files/file_png/download?inline=true",
          isImage: true,
        },
      ],
    };

    expect(validateTemplateSubmissionValue(schema, value)).toEqual([]);
    const legacyDefaultUploadSchema = {
      ...schema,
      components: schema.components.map((component) =>
        component.id === "file"
          ? { ...component, props: { ...component.props, accept: [".pdf", ".docx", ".xlsx", ".json", ".txt"] } }
          : component,
      ),
    };
    expect(
      validateTemplateSubmissionValue(legacyDefaultUploadSchema, {
        answer: "ok",
        attachments: [
          {
            id: "file_md",
            fileName: "guide.md",
            mimeType: "text/markdown",
            sizeBytes: 512,
          },
        ],
      }),
    ).toEqual([]);
    const html = renderToStaticMarkup(
      <TemplateRenderer schema={schema} itemPayload={{ prompt: "prompt" }} value={value} onChange={() => undefined} readonly />,
    );
    expect(html).toContain("evidence.pdf");
    expect(html).toContain("screen.png");
    expect(html).toContain("PDF");
    expect(html).toContain("PNG");
    expect(html).toContain("1.0 KB");
    expect(html).toContain("2.0 KB");

    expect(
      validateTemplateSubmissionValue(schema, {
        answer: "ok",
        attachments: [
          {
            id: "file_doc",
            fileName: "wrong.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 1024,
          },
        ],
      }),
    ).toEqual([{ fieldKey: "attachments", message: "附件 包含不支持的文件类型" }]);
  });

  it("evaluates stage 2.6 layout, visibility and linked validation rules", () => {
    const schema = stage26Schema();
    const reason = schema.components.find((component) => component.id === "reason");
    expect(reason).toBeDefined();
    expect(getRenderableLayoutItems(schema)).toHaveLength(2);
    expect(isTemplateComponentVisible(reason!, { quality: "good", reason: "hidden" })).toBe(false);
    expect(pruneHiddenSubmissionValue(schema, { quality: "good", reason: "hidden", note: "ok" })).toEqual({
      quality: "good",
      note: "ok",
    });
    expect(validateTemplateSubmissionValue(schema, { quality: "bad", reason: "" })).toEqual([
      { fieldKey: "reason", message: "质量较差时必须填写原因" },
    ]);
    expect(validateTemplateSubmissionValue(schema, { quality: "bad", reason: "不要😀" })).toEqual([
      { fieldKey: "reason", message: "修正原因 不能包含 Emoji" },
    ]);

    const html = renderToStaticMarkup(
      <TemplateRenderer
        schema={schema}
        itemPayload={{}}
        value={{ quality: "bad", reason: "", note: "n" }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("质检分组");
    expect(html).toContain("多阶段信息");
    expect(html).toContain("请说明原因");
  });

  it("matches IN and NOT_IN conditions against multi-select field values", () => {
    const value = { issues: ["fact_error", "unsafe"] };

    expect(
      evaluateTemplateCondition(
        { fieldKey: "issues", operator: "IN", value: ["format_error", "fact_error"] },
        value,
      ),
    ).toBe(true);
    expect(
      evaluateTemplateCondition(
        { fieldKey: "issues", operator: "NOT_IN", value: ["format_error", "fact_error"] },
        value,
      ),
    ).toBe(false);
  });
});
