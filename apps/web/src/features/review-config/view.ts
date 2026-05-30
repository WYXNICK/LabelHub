import type { JsonObject } from "../../shared/types/api";
import type { ReviewConfigVersionStatus, ReviewDimensionDTO, ReviewThresholdDTO } from "./types";

export const reviewConfigVersionStatusMeta: Record<ReviewConfigVersionStatus, { label: string; color: string }> = {
  ACTIVE: { label: "启用中", color: "success" },
  DISABLED: { label: "已停用", color: "default" },
};

export function matchOwnerTaskReviewConfigPath(path: string): string | null {
  const match = /^\/owner\/tasks\/([^/]+)\/review-config$/.exec(path);
  return match?.[1] ?? null;
}

export function normalizeReviewDimensions(dimensions: ReviewDimensionDTO[]): ReviewDimensionDTO[] {
  return dimensions.map((dimension) => ({
    key: dimension.key.trim(),
    name: dimension.name.trim(),
    description: dimension.description?.trim() || null,
    maxScore: dimension.maxScore,
    weight: dimension.weight,
  }));
}

export function calculateReviewMaxScore(dimensions: ReviewDimensionDTO[]): number {
  return dimensions.reduce((total, dimension) => total + dimension.maxScore * dimension.weight, 0);
}

export function validateReviewThresholds(input: {
  thresholds: ReviewThresholdDTO;
  dimensions: ReviewDimensionDTO[];
}): string | null {
  const { thresholds, dimensions } = input;
  const humanReviewMinScore = thresholds.humanReviewMinScore ?? null;
  if (thresholds.returnBelowScore > thresholds.passMinScore) {
    return "打回阈值不能高于通过阈值。";
  }
  if (
    humanReviewMinScore !== null &&
    !(thresholds.returnBelowScore <= humanReviewMinScore && humanReviewMinScore <= thresholds.passMinScore)
  ) {
    return "人工复核阈值必须位于打回阈值和通过阈值之间。";
  }
  const maxScore = calculateReviewMaxScore(dimensions);
  const thresholdValues = [
    thresholds.passMinScore,
    thresholds.returnBelowScore,
    ...(humanReviewMinScore === null ? [] : [humanReviewMinScore]),
  ];
  if (Math.max(...thresholdValues) > maxScore) {
    return `阈值不能超过当前最高分 ${Number(maxScore.toFixed(2))}。`;
  }
  return null;
}

export function buildDefaultReviewOutputSchema(dimensions: ReviewDimensionDTO[]): JsonObject {
  return {
    type: "object",
    required: ["decision", "totalScore", "dimensionScores", "comment"],
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["PASS", "RETURN", "HUMAN_REVIEW"] },
      totalScore: { type: "number", minimum: 0 },
      dimensionScores: {
        type: "object",
        required: dimensions.map((dimension) => dimension.key),
        properties: Object.fromEntries(
          dimensions.map((dimension) => [
            dimension.key,
            { type: "number", minimum: 0, maximum: dimension.maxScore },
          ]),
        ),
      },
      comment: { type: "string" },
    },
  };
}

export function formatJsonObject(value: JsonObject): string {
  return JSON.stringify(value, null, 2);
}

export function parseJsonObject(value: string): JsonObject {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("输出 Schema 必须是 JSON Object。");
  }
  return parsed as JsonObject;
}
