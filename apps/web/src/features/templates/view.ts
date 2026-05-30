import type { TemplateComponentDTO, TemplateComponentType, TemplateSchemaValidationVO, TemplateSchemaVO } from "./types";

export const TEMPLATE_SCHEMA_VERSION = "labelhub-template/v1";

export const collectableTemplateComponentTypes = new Set<TemplateComponentType>([
  "TEXT_INPUT",
  "TEXTAREA",
  "RADIO",
  "CHECKBOX",
  "TAG_SELECT",
  "RICH_TEXT",
  "FILE_UPLOAD",
  "IMAGE_UPLOAD",
  "JSON_EDITOR",
]);

export const templateComponentTypeLabels: Record<TemplateComponentType, string> = {
  SHOW_ITEM: "展示项",
  TEXT_INPUT: "单行输入",
  TEXTAREA: "多行文本",
  RADIO: "单选",
  CHECKBOX: "多选",
  TAG_SELECT: "标签选择",
  RICH_TEXT: "富文本",
  FILE_UPLOAD: "文件上传",
  IMAGE_UPLOAD: "图片上传",
  JSON_EDITOR: "JSON 编辑器",
  LLM_ACTION: "LLM 交互",
  GROUP: "分组容器",
  TABS: "多 Tab",
};

export function createEmptyTemplateSchema(): TemplateSchemaVO {
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    components: [],
    layout: { root: [] },
    llmActions: [],
    showItems: [],
  };
}

export function createTemplateComponent(input: {
  id: string;
  type: TemplateComponentType;
  label?: string;
  fieldKey?: string | null;
}): TemplateComponentDTO {
  return {
    id: input.id,
    type: input.type,
    fieldKey: input.fieldKey ?? (collectableTemplateComponentTypes.has(input.type) ? input.id : null),
    label: input.label ?? templateComponentTypeLabels[input.type],
    props: {},
    validation: {},
    visibility: {},
  };
}

export function collectTemplateFieldKeys(schema: TemplateSchemaVO): string[] {
  return schema.components
    .filter((component) => collectableTemplateComponentTypes.has(component.type))
    .map((component) => component.fieldKey?.trim() ?? "")
    .filter(Boolean);
}

export function summarizeTemplateValidation(validation: TemplateSchemaValidationVO): string {
  if (validation.valid) {
    return "模板 schema 校验通过";
  }
  return validation.errors.map((error) => `${error.field}: ${error.message}`).join("\n");
}
