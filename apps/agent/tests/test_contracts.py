from __future__ import annotations

import pytest
from pydantic import ValidationError

from labelhub_agent.config import AgentSettings
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


def test_agent_settings_accepts_provider_aliases_and_disables_thinking(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1")
    monkeypatch.setenv("MODEL_NAME", "mimo-v2.5-pro")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_THINKING_ENABLED", "false")

    settings = AgentSettings(_env_file=None)

    assert settings.openai_base_url == "https://token-plan-cn.xiaomimimo.com/v1"
    assert settings.openai_model == "mimo-v2.5-pro"
    assert settings.openai_api_key == "test-key"
    assert settings.openai_thinking_enabled is False
    assert settings.is_llm_configured is True
    assert settings.chat_completion_extra_body == {
        "chat_template_kwargs": {
            "enable_thinking": False,
        }
    }
