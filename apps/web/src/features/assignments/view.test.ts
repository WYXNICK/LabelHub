import { describe, expect, it } from "vitest";

import type { MarketplaceTaskVO } from "./types";
import { formatRewardRule, getClaimButtonText, summarizeMarketplace } from "./view";

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
    deadlineAt: "2027-01-01T00:00:00Z",
    distributionStrategy: "FIRST_COME_FIRST_SERVED",
    currentTemplateVersionId: "template_version_1",
    currentReviewConfigVersionId: "review_config_1",
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
    expect(getClaimButtonText(makeTask({ claimedByMeCount: 2 }))).toBe("继续领取");
    expect(getClaimButtonText(makeTask({ availableItemCount: 0 }))).toBe("已领完");
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
});
