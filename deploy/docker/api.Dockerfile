FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_HTTP_TIMEOUT=300

WORKDIR /app/apps/api

COPY apps/api/ ./
RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["/app/apps/api/.venv/bin/uvicorn", "labelhub_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
