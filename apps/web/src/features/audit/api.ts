import { apiRequest, withQuery } from "../../shared/api/client";
import type { PageVO } from "../../shared/types/api";
import type { AuditLogVO, ListAuditLogsRequest } from "./types";

export function listAuditLogs(request: ListAuditLogsRequest = {}): Promise<PageVO<AuditLogVO>> {
  return apiRequest<PageVO<AuditLogVO>>(
    withQuery("/api/audit-logs", {
      entityType: request.entityType,
      entityId: request.entityId,
      page: request.page,
      pageSize: request.pageSize,
    }),
  );
}
