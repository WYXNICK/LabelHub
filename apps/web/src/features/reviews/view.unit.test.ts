import { describe, expect, it } from "vitest";

import {
  buildReviewerReviewDetailPath,
  calculateDistributionPercent,
  formatAiScoreTotal,
  formatLatency,
  formatReviewConfigVersion,
  formatReviewScorePercent,
  formatReviewTraceCode,
  formatReviewValue,
  formatSubmissionVersion,
  getReviewerReviewDetailReturnTarget,
  matchReviewerReviewDetailPath,
  normalizeReviewScoreToPercent,
} from "./view";
import { isAttachmentValue } from "../files/AttachmentValue";

describe("review view helpers", () => {
  it("builds and matches reviewer detail paths", () => {
    expect(buildReviewerReviewDetailPath("review_1")).toBe("/reviewer/reviews/review_1");
    expect(buildReviewerReviewDetailPath("review_1", { from: "task", taskId: "task_1" })).toBe(
      "/reviewer/reviews/review_1?from=task&taskId=task_1",
    );
    expect(matchReviewerReviewDetailPath("/reviewer/reviews/review_1")).toBe("review_1");
    expect(matchReviewerReviewDetailPath("/reviewer/reviews/review_1?from=task&taskId=task_1")).toBe("review_1");
    expect(matchReviewerReviewDetailPath("/reviewer/reviews")).toBeNull();
  });

  it("keeps reviewer detail back navigation aligned with the entry page", () => {
    expect(getReviewerReviewDetailReturnTarget("?from=task&taskId=task_1", "fallback_task")).toEqual({
      label: "返回审核工作台",
      path: "/reviewer/reviews/tasks/task_1",
    });
    expect(getReviewerReviewDetailReturnTarget("?from=task&taskId=bad/id", "fallback_task").path).toBe(
      "/reviewer/reviews/tasks/fallback_task",
    );
    expect(getReviewerReviewDetailReturnTarget("?from=ai-review-queue", "task_1")).toEqual({
      label: "返回 AI 预审队列",
      path: "/reviewer/ai-review-queue",
    });
    expect(getReviewerReviewDetailReturnTarget("?from=results", "task_1")).toEqual({
      label: "返回审核结果",
      path: "/reviewer/results",
    });
    expect(getReviewerReviewDetailReturnTarget("", "task_1")).toEqual({
      label: "返回审核工作台",
      path: "/reviewer/reviews/tasks/task_1",
    });
  });

  it("formats user-facing review metadata", () => {
    expect(formatSubmissionVersion(2)).toBe("提交 v2");
    expect(formatSubmissionVersion(null)).toBe("提交版本");
    expect(formatReviewConfigVersion(3)).toBe("审核配置 v3");
    expect(formatReviewConfigVersion(null)).toBe("审核配置");
    expect(formatAiScoreTotal(12.5)).toBe("12.5");
    expect(formatAiScoreTotal(null)).toBe("待评分");
    expect(formatLatency(1.48)).toBe("1.48s");
    expect(formatLatency(90)).toBe("1.5min");
    expect(formatReviewTraceCode("review_job_5ca3391ce2514b89934d1c43dd249c22")).toBe("#DD249C22");
  });

  it("calculates distribution percentages against the real total", () => {
    expect(calculateDistributionPercent(2, 3)).toBe(66.7);
    expect(calculateDistributionPercent(1, 3)).toBe(33.3);
    expect(calculateDistributionPercent(0, 3)).toBe(0);
    expect(calculateDistributionPercent(1, 0)).toBe(0);
  });

  it("formats dimension scores as normalized 100-point values", () => {
    expect(normalizeReviewScoreToPercent(1, 5)).toBe(20);
    expect(normalizeReviewScoreToPercent(87.5, 100)).toBe(87.5);
    expect(normalizeReviewScoreToPercent(8, 4)).toBe(100);
    expect(normalizeReviewScoreToPercent(null, 100)).toBe(0);
    expect(formatReviewScorePercent(4.25, 5)).toBe("85 分");
    expect(formatReviewScorePercent(87.5, 100)).toBe("87.5 分");
  });

  it("formats review values as readable business text", () => {
    expect(formatReviewValue([])).toBe("未填写");
    expect(formatReviewValue({})).toBe("未填写");
    expect(formatReviewValue(["准确性", "安全性"])).toBe("准确性、安全性");
    expect(formatReviewValue({ reason: "表达清晰", score: 5 })).toBe("reason：表达清晰；score：5");
  });

  it("does not treat normal option arrays as file attachments", () => {
    expect(isAttachmentValue(["证据附件"])).toBe(false);
    expect(isAttachmentValue([{ id: "issue_security", label: "安全问题" }])).toBe(false);
    expect(isAttachmentValue(["file_abc123"])).toBe(true);
  });
});
