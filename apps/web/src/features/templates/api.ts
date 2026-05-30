import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type {
  ListTemplateVersionsRequest,
  PublishTemplateVersionRequest,
  SaveTemplateDraftRequest,
  TemplateDraftVO,
  TemplateSchemaValidationVO,
  TemplateVersionVO,
  ValidateTemplateSchemaRequest,
} from "./types";

export function getTemplateDraft(taskId: string): Promise<TemplateDraftVO> {
  return apiRequest<TemplateDraftVO>(`/api/tasks/${taskId}/template-draft`);
}

export function saveTemplateDraft(
  taskId: string,
  request: SaveTemplateDraftRequest,
): Promise<TemplateDraftVO> {
  return apiRequest<TemplateDraftVO>(`/api/tasks/${taskId}/template-draft`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function validateTemplateSchema(
  request: ValidateTemplateSchemaRequest,
): Promise<TemplateSchemaValidationVO> {
  return apiRequest<TemplateSchemaValidationVO>("/api/template-schemas:validate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function publishTemplateVersion(
  taskId: string,
  request: PublishTemplateVersionRequest,
): Promise<TemplateVersionVO> {
  return apiRequest<TemplateVersionVO>(`/api/tasks/${taskId}/template-versions`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listTemplateVersions(
  taskId: string,
  request: ListTemplateVersionsRequest = {},
): Promise<PageVO<TemplateVersionVO>> {
  return apiRequest<PageVO<TemplateVersionVO>>(
    withQuery(`/api/tasks/${taskId}/template-versions`, {
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}

export function getTemplateVersion(templateVersionId: string): Promise<TemplateVersionVO> {
  return apiRequest<TemplateVersionVO>(`/api/template-versions/${templateVersionId}`);
}
