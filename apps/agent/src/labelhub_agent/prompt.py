from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from labelhub_agent.contracts import AiReviewResultDTO, ClaimReviewJobResponse, ReviewDimensionDTO


class AiReviewParseError(RuntimeError):
    pass


def build_review_messages(context: ClaimReviewJobResponse) -> tuple[list[dict[str, str]], str]:
    if context.job is None or context.submission is None or context.task is None or context.review_config_version is None:
        raise ValueError("Review job context is incomplete.")

    review_config = context.review_config_version
    prompt_payload = {
        "task": {
            "id": context.task.id,
            "title": context.task.title,
            "description": context.task.description,
            "tags": context.task.tags,
        },
        "datasetItemPayload": context.dataset_item_payload or {},
        "templateFields": _extract_template_fields(context),
        "submissionValues": context.submission.values,
        "reviewConfig": {
            "id": review_config.id,
            "versionNo": review_config.version_no,
            "dimensions": [dimension.model_dump(by_alias=True) for dimension in review_config.dimensions],
            "thresholds": review_config.thresholds.model_dump(by_alias=True),
            "outputSchema": review_config.output_schema,
        },
    }
    prompt_snapshot = _json_dumps(prompt_payload)
    system_message = (
        "你是 LabelHub 的 AI 自动预审 Agent。你的职责是按任务负责人发布的审核配置，"
        "对标注员提交内容进行质量预审，输出可追溯的审核建议。"
        "你必须结合任务说明、题目原始数据、模板字段语义和 submissionValues，判断标注回答是否正确、完整、合规；"
        "如果字段语义是概括、摘要、清洗、分类、多选或打分，应按该语义检查，不只做格式或安全检查。"
        "不要输出思考过程，不要自动终审；PASS、RETURN、NEEDS_HUMAN_REVIEW 都只是给 Reviewer 的建议。"
        "必须只返回一个 JSON 对象，字段为 conclusion、scores、summary、issues、suggestions。"
    )
    user_message = (
        f"任务负责人审核 Prompt：\n{review_config.prompt_template}\n\n"
        "请基于以下上下文完成预审。scores 的 key 必须来自 reviewConfig.dimensions，"
        "分值必须是 0 到该维度 maxScore 之间的整数；issues 可为空数组。"
        "结论规则：内容正确且只存在轻微可选优化时可给 PASS；明显答错、遗漏关键约束、格式不可接收或与原题矛盾时给 RETURN；"
        "题目、规则或证据不足以可靠判断时给 NEEDS_HUMAN_REVIEW。summary 要面向 Reviewer 简要说明主要依据，"
        "不要泛泛写“格式合规”或输出与题目无关的比较、平局、模型对比结论。\n\n"
        f"{prompt_snapshot}"
    )
    return [{"role": "system", "content": system_message}, {"role": "user", "content": user_message}], prompt_snapshot


def parse_ai_review_result(
    *,
    content: str,
    dimensions: list[ReviewDimensionDTO],
    prompt_snapshot: str,
) -> AiReviewResultDTO:
    parsed = _extract_json_object(content)
    normalized = _normalize_provider_payload(parsed)
    try:
        result = AiReviewResultDTO.model_validate(
            {
                **normalized,
                "rawOutput": parsed,
                "promptSnapshot": prompt_snapshot,
            }
        )
    except ValidationError as exc:
        raise AiReviewParseError(f"AI review result schema validation failed: {exc}") from exc

    _validate_scores(result, dimensions)
    return result


def _normalize_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    if "conclusion" not in normalized and "decision" in normalized:
        normalized["conclusion"] = _normalize_decision(str(normalized["decision"]))
    if "scores" not in normalized and isinstance(normalized.get("dimensionScores"), dict):
        normalized["scores"] = normalized["dimensionScores"]
    if "summary" not in normalized and isinstance(normalized.get("comment"), str):
        normalized["summary"] = normalized["comment"]
    if "issues" not in normalized:
        normalized["issues"] = []

    # 保留最终 DTO 的严格性：归一化后移除审核配置旧 schema 中的兼容字段。
    for legacy_key in ["decision", "totalScore", "dimensionScores", "comment"]:
        normalized.pop(legacy_key, None)
    return normalized


def _normalize_decision(value: str) -> str:
    mapping = {
        "PASS": "PASS",
        "RETURN": "RETURN",
        "HUMAN_REVIEW": "NEEDS_HUMAN_REVIEW",
        "NEEDS_HUMAN_REVIEW": "NEEDS_HUMAN_REVIEW",
    }
    return mapping.get(value, value)


def _extract_template_fields(context: ClaimReviewJobResponse) -> list[dict[str, Any]]:
    if context.template_schema is None:
        return []
    fields: list[dict[str, Any]] = []
    for component in context.template_schema.components:
        field_key = component.get("fieldKey")
        item_path = component.get("props", {}).get("path") if isinstance(component.get("props"), dict) else None
        if field_key or item_path:
            fields.append(
                {
                    "id": component.get("id"),
                    "type": component.get("type"),
                    "label": component.get("label"),
                    "fieldKey": field_key,
                    "itemPath": item_path,
                    "required": bool(component.get("validation", {}).get("required"))
                    if isinstance(component.get("validation"), dict)
                    else False,
                }
            )
    return fields


def _extract_json_object(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AiReviewParseError("AI review result is not valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise AiReviewParseError("AI review result must be a JSON object.")
    return parsed


def _validate_scores(result: AiReviewResultDTO, dimensions: list[ReviewDimensionDTO]) -> None:
    dimension_limits = {dimension.key: dimension.max_score for dimension in dimensions}
    missing = [key for key in dimension_limits if key not in result.scores]
    unknown = [key for key in result.scores if key not in dimension_limits]
    if missing:
        raise AiReviewParseError(f"AI review result missing score dimensions: {', '.join(missing)}.")
    if unknown:
        raise AiReviewParseError(f"AI review result contains unknown score dimensions: {', '.join(unknown)}.")
    for key, score in result.scores.items():
        max_score = dimension_limits[key]
        if score < 0 or score > max_score:
            raise AiReviewParseError(f"Score {key}={score} is outside 0..{max_score}.")


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)
