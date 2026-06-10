FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_HTTP_TIMEOUT=300

WORKDIR /app/apps/agent

COPY apps/agent/ ./
RUN uv sync --frozen --no-dev

CMD ["/app/apps/agent/.venv/bin/python", "-m", "labelhub_agent", "--loop"]
