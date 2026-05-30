import type { JsonObject } from "../../shared/types/api";

export type TemplateComponentType =
  | "SHOW_ITEM"
  | "TEXT_INPUT"
  | "TEXTAREA"
  | "RADIO"
  | "CHECKBOX"
  | "TAG_SELECT"
  | "RICH_TEXT"
  | "FILE_UPLOAD"
  | "IMAGE_UPLOAD"
  | "JSON_EDITOR"
  | "LLM_ACTION"
  | "GROUP"
  | "TABS";

export type TemplateVersionStatus = "ACTIVE" | "DISABLED";

export interface TemplateComponentDTO {
  id: string;
  type: TemplateComponentType;
  fieldKey?: string | null;
  label: string;
  props: JsonObject;
  validation: JsonObject;
  visibility: JsonObject;
}

export interface TemplateSchemaVO {
  schemaVersion: string;
  components: TemplateComponentDTO[];
  layout: JsonObject;
  llmActions: JsonObject[];
  showItems: JsonObject[];
}

export interface TemplateSchemaValidationErrorVO {
  field: string;
  message: string;
}

export interface TemplateSchemaValidationVO {
  valid: boolean;
  errors: TemplateSchemaValidationErrorVO[];
}

export interface TemplateDraftVO {
  id: string;
  taskId: string;
  schema: TemplateSchemaVO;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersionVO {
  id: string;
  taskId: string;
  versionNo: number;
  schema: TemplateSchemaVO;
  status: TemplateVersionStatus;
  versionNote: string | null;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveTemplateDraftRequest {
  schema: TemplateSchemaVO;
}

export interface ValidateTemplateSchemaRequest {
  schema: TemplateSchemaVO;
}

export interface PublishTemplateVersionRequest {
  draftId: string;
  versionNote?: string | null;
}

export interface ListTemplateVersionsRequest {
  page?: number;
  pageSize?: number;
}
