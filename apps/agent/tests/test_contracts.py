from __future__ import annotations

import pytest
from pydantic import ValidationError

from labelhub_agent.contracts import AiReviewResultDTO


def test_ai_review_result_contract_accepts_structured_output() -> None:
    result = AiReviewResultDTO.model_validate(
        {
            "conclusion": "NEEDS_HUMAN_REVIEW",
            "scores": {"accuracy": 4, "safety": 5},
            "summary": "整体可用，但需要人工复核。",
            "issues": [{"field": "accuracy", "code": "MISSING_DETAIL", "message": "细节不足。"}],
            "suggestions": "补充关键判断依据。",
        }
    )

    assert result.conclusion == "NEEDS_HUMAN_REVIEW"
    assert result.scores["accuracy"] == 4


def test_ai_review_result_contract_rejects_unknown_conclusion() -> None:
    with pytest.raises(ValidationError):
        AiReviewResultDTO.model_validate(
            {
                "conclusion": "APPROVE",
                "scores": {},
                "summary": "不允许 Agent 直接终审通过。",
                "issues": [],
            }
        )
