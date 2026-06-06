import { describe, expect, it } from "vitest";

import {
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatReviewTraceCode,
  formatSubmissionVersion,
  matchReviewerReviewDetailPath,
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
    expect(formatReviewTraceCode("review_job_5ca3391ce2514b89934d1c43dd249c22")).toBe("#DD249C22");
  });
});
