import type { TaskStatus, TaskVO } from "../tasks/types";
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

export type TemplateDesignerEntry = "tasks" | "templates" | "settings";

export interface TemplateDesignerReturnTarget {
  label: string;
  path: string;
}

export interface TemplatePublishState {
  label: string;
  color: string;
  description: string;
}

export function getTemplatePublishState(
  task: Pick<TaskVO, "status" | "currentTemplateVersionId">,
): TemplatePublishState {
  if (task.currentTemplateVersionId) {
    return {
      label: "已发布",
      color: "green",
      description: "当前任务已绑定模板版本，可进入发布检查",
    };
  }
  if (task.status === "DRAFT") {
    return {
      label: "草稿待发布",
      color: "blue",
      description: "可继续搭建、校验并发布模板版本",
    };
  }
  return {
    label: "未绑定版本",
    color: "orange",
    description: "非草稿任务当前无法发布新的模板版本",
  };
}

export function isTemplateEditableStatus(status: TaskStatus): boolean {
  return status === "DRAFT";
}

export function buildOwnerTaskDesignerPath(taskId: string, entry: TemplateDesignerEntry): string {
  return `/owner/tasks/${taskId}/designer?from=${entry}`;
}

export function getTemplateDesignerEntry(search: string): TemplateDesignerEntry | null {
  const entry = new URLSearchParams(search).get("from");
  return entry === "tasks" || entry === "templates" || entry === "settings" ? entry : null;
}

export function getTemplateDesignerReturnTarget(
  taskId: string,
  entry: TemplateDesignerEntry | null,
): TemplateDesignerReturnTarget {
  if (entry === "tasks") {
    return { label: "返回任务管理", path: "/owner/tasks" };
  }
  if (entry === "settings") {
    return { label: "返回任务设置", path: `/owner/tasks/${taskId}/settings` };
  }
  return { label: "返回模板工作台", path: "/owner/templates" };
}

export function matchOwnerTaskDesignerPath(path: string): string | null {
  const match = path.match(/^\/owner\/tasks\/([^/]+)\/designer(?:\?.*)?$/);
  return match?.[1] ?? null;
}
