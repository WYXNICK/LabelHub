import { describe, expect, it } from "vitest";

import { getTaskTransitionActions, matchOwnerTaskSettingsPath } from "./view";

describe("task view helpers", () => {
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
});
