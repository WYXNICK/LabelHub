import { describe, expect, it } from "vitest";

import type { MarketplaceTaskVO } from "./types";
import type { AssignmentVO } from "./types";
import {
  buildLabelerAssignmentPath,
  formatAssignmentQueueLabel,
  formatRewardRule,
  getAssignmentProgressText,
  getClaimButtonText,
  matchLabelerAssignmentPath,
  summarizeAssignmentQueue,
  summarizeMarketplace,
} from "./view";

function makeTask(overrides: Partial<MarketplaceTaskVO> = {}): MarketplaceTaskVO {
  return {
    id: "task_1",
    title: "QA quality",
    description: "Quality task",
    tags: ["qa"],
    rewardRule: { description: "0.30 元 / 条" },
    quota: 10,
    claimedCount: 2,
    submittedCount: 1,
    approvedCount: 0,
    availableItemCount: 8,
    claimedByMeCount: 0,
    submittedByMeCount: 0,
    activeAssignmentId: null,
    deadlineAt: "2027-01-01T00:00:00Z",
    distributionStrategy: "FIRST_COME_FIRST_SERVED",
    currentTemplateVersionId: "template_version_1",
    currentReviewConfigVersionId: "review_config_1",
    updatedAt: "2026-06-05T00:00:00Z",
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<AssignmentVO> = {}): AssignmentVO {
  return {
    id: "assignment_1",
    taskId: "task_1",
    datasetItemId: "dataset_item_abcdef123456",
    templateVersionId: "template_version_1",
    reviewConfigVersionId: "review_config_1",
    labelerId: "user_labeler_demo",
    status: "CLAIMED",
    draftValues: null,
    draftSavedAt: null,
    currentSubmissionId: null,
    claimedAt: "2026-06-05T00:00:00Z",
    submittedAt: null,
    version: 1,
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
    ...overrides,
  };
}

describe("assignment marketplace view helpers", () => {
  it("formats reward rule from description or JSON fallback", () => {
    expect(formatRewardRule({ description: " 0.30 元 / 条 " })).toBe("0.30 元 / 条");
    expect(formatRewardRule({ unit: "piece" })).toBe('{"unit":"piece"}');
    expect(formatRewardRule(null)).toBe("奖励规则待任务负责人补充");
  });

  it("builds claim button text from task availability", () => {
    expect(getClaimButtonText(makeTask())).toBe("领取题目");
    expect(getClaimButtonText(makeTask({ claimedByMeCount: 2 }))).toBe("领取下一题");
    expect(getClaimButtonText(makeTask({ activeAssignmentId: "assignment_1" }))).toBe("继续作答");
    expect(getClaimButtonText(makeTask({ availableItemCount: 0 }))).toBe("已领完");
  });

  it("builds and matches labeler assignment routes", () => {
    expect(buildLabelerAssignmentPath("assignment_1")).toBe("/labeler/assignments/assignment_1");
    expect(matchLabelerAssignmentPath("/labeler/assignments/assignment_1")).toBe("assignment_1");
    expect(matchLabelerAssignmentPath("/labeler/marketplace")).toBeNull();
  });

  it("formats assignment progress text", () => {
    expect(
      getAssignmentProgressText({
        currentIndex: 2,
        totalCount: 5,
        previousAssignmentId: "assignment_1",
        nextAssignmentId: "assignment_3",
        canClaimNext: true,
        nextClaimableTaskId: "task_1",
      }),
    ).toBe("第 2 / 5 题");
  });

  it("summarizes current marketplace page", () => {
    expect(
      summarizeMarketplace([
        makeTask({ availableItemCount: 3, claimedByMeCount: 1, submittedByMeCount: 1 }),
        makeTask({ id: "task_2", availableItemCount: 7, claimedByMeCount: 2, submittedByMeCount: 0 }),
      ]),
    ).toEqual({
      taskCount: 2,
      availableItemCount: 10,
      claimedByMeCount: 3,
      submittedByMeCount: 1,
    });
  });

  it("summarizes assignment queue by visible labeler status buckets", () => {
    expect(
      summarizeAssignmentQueue([
        makeAssignment({ status: "CLAIMED" }),
        makeAssignment({ id: "assignment_2", status: "DRAFT_SAVED" }),
        makeAssignment({ id: "assignment_3", status: "SUBMITTED" }),
        makeAssignment({ id: "assignment_4", status: "APPROVED" }),
        makeAssignment({ id: "assignment_5", status: "RETURNED" }),
        makeAssignment({ id: "assignment_6", status: "CANCELLED" }),
      ]),
    ).toEqual({
      totalCount: 6,
      activeCount: 2,
      submittedCount: 1,
      approvedCount: 1,
      returnedCount: 1,
    });
  });

  it("formats assignment queue labels from stable index and dataset item id", () => {
    expect(formatAssignmentQueueLabel(makeAssignment(), 7)).toBe("#008 dataset_item_");
  });
});
