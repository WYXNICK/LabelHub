import { describe, expect, it } from "vitest";

import {
  getTaskTransitionActions,
  isPublishCheckTargetStatus,
  matchOwnerTaskSettingsPath,
  parseApiDateTime,
  sortPublishBlockers,
  taskStatusMeta,
} from "./view";

describe("task view helpers", () => {
  it("uses a stable completed label for published tasks", () => {
    expect(taskStatusMeta.PUBLISHED.label).toBe("已发布");
  });

  it("maps task statuses to allowed owner actions", () => {
    expect(getTaskTransitionActions({ status: "DRAFT" }).map((action) => action.targetStatus)).toEqual([
      "PUBLISHED",
      "ENDED",
    ]);
    expect(getTaskTransitionActions({ status: "PUBLISHED" }).map((action) => action.targetStatus)).toEqual([
      "PAUSED",
      "ENDED",
    ]);
    expect(getTaskTransitionActions({ status: "PAUSED" }).map((action) => action.targetStatus)).toEqual([
      "PUBLISHED",
      "ENDED",
    ]);
    expect(getTaskTransitionActions({ status: "ENDED" })).toEqual([]);
  });

  it("extracts task id from owner task settings path", () => {
    expect(matchOwnerTaskSettingsPath("/owner/tasks/task_123/settings")).toBe("task_123");
    expect(matchOwnerTaskSettingsPath("/owner/tasks/new")).toBeNull();
    expect(matchOwnerTaskSettingsPath("/owner/tasks/task_123/datasets")).toBeNull();
  });

  it("sorts publish blockers by owner remediation order", () => {
    expect(
      sortPublishBlockers([
        { code: "MISSING_TEMPLATE_VERSION", message: "缺少模板", field: "currentTemplateVersionId" },
        { code: "INVALID_QUOTA", message: "配额错误", field: "quota" },
        { code: "MISSING_DATASET", message: "缺少数据集", field: "datasets" },
      ]).map((blocker) => blocker.code),
    ).toEqual(["INVALID_QUOTA", "MISSING_DATASET", "MISSING_TEMPLATE_VERSION"]);
  });

  it("marks draft and paused tasks as publish check targets", () => {
    expect(isPublishCheckTargetStatus("DRAFT")).toBe(true);
    expect(isPublishCheckTargetStatus("PAUSED")).toBe(true);
    expect(isPublishCheckTargetStatus("PUBLISHED")).toBe(false);
    expect(isPublishCheckTargetStatus("ENDED")).toBe(false);
  });

  it("treats database datetime without timezone as UTC", () => {
    expect(parseApiDateTime("2026-05-29T02:09:00").toISOString()).toBe("2026-05-29T02:09:00.000Z");
    expect(parseApiDateTime("2026-05-29 02:09:00").toISOString()).toBe("2026-05-29T02:09:00.000Z");
    expect(parseApiDateTime("2026-05-29T10:09:00+08:00").toISOString()).toBe(
      "2026-05-29T02:09:00.000Z",
    );
  });
});
