import { describe, expect, it } from "vitest";

import {
  buildDefaultReviewOutputSchema,
  calculateReviewMaxScore,
  matchOwnerTaskReviewConfigPath,
  normalizeReviewDimensions,
  validateReviewThresholds,
} from "./view";

describe("review config view helpers", () => {
  it("extracts task id from owner review config path", () => {
    expect(matchOwnerTaskReviewConfigPath("/owner/tasks/task_123/review-config")).toBe("task_123");
    expect(matchOwnerTaskReviewConfigPath("/owner/tasks/task_123/datasets")).toBeNull();
  });

  it("normalizes dimensions and removes blank values", () => {
    expect(
      normalizeReviewDimensions([
        { key: " relevance ", name: " 相关性 ", description: " ", maxScore: 5, weight: 1 },
        { key: "accuracy", name: "准确性", description: "判断是否准确", maxScore: 10, weight: 1.2 },
      ]),
    ).toEqual([
      { key: "relevance", name: "相关性", description: null, maxScore: 5, weight: 1 },
      { key: "accuracy", name: "准确性", description: "判断是否准确", maxScore: 10, weight: 1.2 },
    ]);
  });

  it("calculates weighted max score and validates threshold order", () => {
    const dimensions = [
      { key: "relevance", name: "相关性", description: null, maxScore: 5, weight: 1 },
      { key: "accuracy", name: "准确性", description: null, maxScore: 5, weight: 1.2 },
    ];
    expect(calculateReviewMaxScore(dimensions)).toBe(11);
    expect(
      validateReviewThresholds({
        thresholds: { passMinScore: 9, humanReviewMinScore: 6, returnBelowScore: 3 },
        dimensions,
      }),
    ).toBeNull();
    expect(
      validateReviewThresholds({
        thresholds: { passMinScore: 2, humanReviewMinScore: 4, returnBelowScore: 6 },
        dimensions,
      }),
    ).toMatch(/打回阈值/);
  });

  it("builds a stable structured output schema from dimensions", () => {
    const schema = buildDefaultReviewOutputSchema([
      { key: "relevance", name: "相关性", description: null, maxScore: 5, weight: 1 },
    ]);
    expect(schema.required).toEqual(["decision", "totalScore", "dimensionScores", "comment"]);
    const properties = schema.properties as Record<string, unknown>;
    expect(properties.dimensionScores).toMatchObject({
      type: "object",
      properties: {
        relevance: { type: "number", minimum: 0, maximum: 5 },
      },
    });
  });
});
