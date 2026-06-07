from __future__ import annotations

import argparse
import json
import logging

from labelhub_agent.config import AgentSettings
from labelhub_agent.worker import ReviewAgentWorker


def main() -> None:
    _configure_logging()
    parser = argparse.ArgumentParser(description="LabelHub AI review agent")
    parser.add_argument("--health", action="store_true", help="print configuration health and exit")
    parser.add_argument("--once", action="store_true", help="claim and process one review job")
    parser.add_argument("--loop", action="store_true", help="continuously poll and process review jobs")
    args = parser.parse_args()
    settings = AgentSettings()
    if args.health:
        print(json.dumps(_health_payload(settings), ensure_ascii=False))
        return
    if args.loop:
        ReviewAgentWorker(settings=settings).run_forever()
        return

    result = ReviewAgentWorker(settings=settings).run_once()
    print(result.model_dump_json(by_alias=True))


def _health_payload(settings: AgentSettings) -> dict[str, object]:
    return {
        "service": "labelhub-agent",
        "status": "ready",
        "apiBaseUrl": settings.api_base_url,
        "openaiBaseUrl": settings.openai_base_url,
        "modelName": settings.openai_model,
        "modelConfigured": bool(settings.openai_model),
        "apiKeyConfigured": bool(settings.openai_api_key),
        "llmConfigured": settings.is_llm_configured,
        "thinkingEnabled": settings.openai_thinking_enabled,
        "workerId": settings.worker_id,
    }


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
