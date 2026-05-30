import type { UserRole } from "../auth/types";
import type { JsonObject } from "../../shared/types/api";

export type AuditEntityType =
  | "TASK"
  | "DATASET"
  | "DATASET_ITEM"
  | "IMPORT_JOB"
  | "REVIEW_CONFIG"
  | "FILE_OBJECT";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "STATE_TRANSITION"
  | "IMPORT_CREATE"
  | "IMPORT_COMPLETE"
  | "BATCH_UPDATE"
  | "REVIEW_CONFIG_SAVE"
  | "REVIEW_CONFIG_PUBLISH"
  | "PUBLISH_CHECK";

export interface AuditLogVO {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  actorId: string;
  actorRole: UserRole;
  action: AuditAction;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  metadata: JsonObject | null;
  requestId: string | null;
  createdAt: string;
}

export interface ListAuditLogsRequest {
  entityType?: AuditEntityType;
  entityId?: string;
  page?: number;
  pageSize?: number;
}
