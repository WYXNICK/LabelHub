from __future__ import annotations

import json

from labelhub_agent.config import AgentSettings


def main() -> None:
    settings = AgentSettings()
    print(
        json.dumps(
            {
                "service": "labelhub-agent",
                "status": "ready",
                "apiBaseUrl": settings.api_base_url,
                "openaiBaseUrl": settings.openai_base_url,
                "modelConfigured": bool(settings.openai_model),
                "apiKeyConfigured": bool(settings.openai_api_key),
            },
            ensure_ascii=False,
        )
    )
