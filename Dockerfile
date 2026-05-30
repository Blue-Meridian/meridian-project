# Project Meridian — FastAPI image.
#
# Single-stage Python image. Bakes briefs.json at build time so the API
# can serve /briefs immediately on first start. No Streamlit, no
# WeasyPrint, no native deps beyond curl for the healthcheck.

FROM python:3.11-slim-bookworm

# Only system dep we need at runtime is curl for the container healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (cached layer).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY api/ api/
COPY scripts/ scripts/
COPY data/ data/

# Bake briefs.json at build time with the deterministic fallback so /briefs
# works on first start. The .dockerignore excludes any host-side briefs.json,
# so this always regenerates from community_data.json + agents/templates.
RUN python scripts/run_batch.py --no-llm

ENV PYTHONPATH=/app \
    TOOLS_PUBLIC_URL=http://localhost:8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
