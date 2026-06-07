import { describe, expect, it } from "vitest";

import {
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatLatency,
  formatReviewConfigVersion,
  formatReviewScorePercent,
  formatReviewTraceCode,
  formatSubmissionVersion,
  matchReviewerReviewDetailPath,
  normalizeReviewScoreToPercent,
} from "./view";

describe("review view helpers", () => {
  it("builds and matches reviewer detail paths", () => {
    expect(buildReviewerReviewDetailPath("review_1")).toBe("/reviewer/reviews/review_1");
    expect(matchReviewerReviewDetailPath("/reviewer/reviews/review_1")).toBe("review_1");
    expect(matchReviewerReviewDetailPath("/reviewer/reviews")).toBeNull();
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

  it("formats dimension scores as normalized 100-point values", () => {
    expect(normalizeReviewScoreToPercent(1, 5)).toBe(20);
    expect(normalizeReviewScoreToPercent(87.5, 100)).toBe(87.5);
    expect(normalizeReviewScoreToPercent(8, 4)).toBe(100);
    expect(normalizeReviewScoreToPercent(null, 100)).toBe(0);
    expect(formatReviewScorePercent(4.25, 5)).toBe("85 分");
    expect(formatReviewScorePercent(87.5, 100)).toBe("87.5 分");
  });
});
