FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app/apps/agent

COPY apps/agent/ ./
RUN uv sync --frozen --no-dev

CMD ["uv", "run", "python", "-m", "labelhub_agent", "--loop"]
