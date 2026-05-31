"""
FastAPI app — the single backend for Meridian.

Exposes:
  Tools (called by watsonx Orchestrate agents)
    GET  /resource/{community_id}     → get_resource_data
    POST /design                       → size_system
    POST /economics                    → compute_economics
    GET  /funding/programs             → get_funding_programs
    POST /portfolio/rank               → rank_portfolio

  Frontend support
    GET  /briefs                       → all 20 pre-computed briefs
    GET  /governance/report            → latest governance evaluation
    POST /chat                         → SSE proxy to watsonx.ai / Orchestrate

  Meta
    GET  /health                       → liveness
    GET  /docs                         → Swagger UI
    GET  /openapi.json                 → OpenAPI spec (import into Orchestrate)

/* USAGE:
    # Local dev:
    uvicorn api.main:app --reload --port 8000

    # Then in Orchestrate:
    # Catalog → Tools → Import → OpenAPI → http://localhost:8000/openapi.json
    # (or via ngrok / your VM if remote)
*/
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env so IBM_CLOUD_API_KEY, WATSONX_PROJECT_ID, etc. reach the chat
# proxy. uvicorn doesn't load .env automatically.
load_dotenv(_PROJECT_ROOT / ".env")

from . import design, economics, funding, portfolio, resource
from .chat import stream_chat, stream_via_orchestrate
from .schemas import (
    CommunityBrief,
    Economics,
    FundingProgram,
    PortfolioRanking,
    ResourceData,
    SystemSizing,
)

_BRIEFS_PATH = _PROJECT_ROOT / "data" / "briefs.json"
_GOVERNANCE_REPORT_PATH = _PROJECT_ROOT / "governance" / "eval_briefs_report.json"

# Orchestrate (or any remote consumer) needs an absolute URL in the OpenAPI
# `servers` block to know where to call. Set TOOLS_PUBLIC_URL at deploy time
# (your VM domain, ngrok URL, etc.).
_PUBLIC_URL = os.environ.get("TOOLS_PUBLIC_URL", "http://localhost:8000")

app = FastAPI(
    title="Project Meridian — API",
    description=(
        "Backend for Meridian: the five tools the watsonx Orchestrate agents "
        "call, plus the React frontend's chat and data endpoints. Same Granite "
        "model, same briefs.json, single source of truth."
    ),
    version="0.2.0",
    servers=[{"url": _PUBLIC_URL, "description": "Public base URL Orchestrate calls"}],
)

# Public data only (no PII). CORS open so Orchestrate cloud agents and the
# Vercel-deployed React frontend can both reach the API. Tighten before any
# production use.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Agent tools ─────────────────────────────────────────────────────────────


@app.get(
    "/resource/{community_id}",
    response_model=ResourceData,
    operation_id="get_resource_data",
    summary="get_resource_data",
    description="Get cached wind, solar, load, and governance data for a community.",
    tags=["resource-scout"],
)
def get_resource(community_id: str):
    try:
        return resource.get_resource_data(community_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class DesignRequest(BaseModel):
    community_id: str = Field(..., examples=["nain"])
    wind_quality: Optional[str] = Field(
        None, description="strong / moderate / weak (auto-classified if omitted)"
    )
    solar_quality: Optional[str] = Field(
        None, description="strong / moderate / weak (auto-classified if omitted)"
    )


@app.post(
    "/design",
    response_model=SystemSizing,
    operation_id="size_system",
    summary="size_system",
    description="Size wind + solar + battery + retained diesel for a community.",
    tags=["system-designer"],
)
def design_system(req: DesignRequest):
    try:
        return design.size_system(req.community_id, req.wind_quality, req.solar_quality)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class EconomicsRequest(BaseModel):
    community_id: str = Field(..., examples=["nain"])
    sizing: SystemSizing


@app.post(
    "/economics",
    response_model=Economics,
    operation_id="compute_economics",
    summary="compute_economics",
    description="Compute capital cost, fuel and dollar saved, CO2 avoided, payback.",
    tags=["number-cruncher"],
)
def compute_economics_endpoint(req: EconomicsRequest):
    try:
        return economics.compute_economics(req.community_id, req.sizing.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get(
    "/funding/programs",
    response_model=List[FundingProgram],
    operation_id="get_funding_programs",
    summary="get_funding_programs",
    description="List the four federal funding programs in Grant Finder's catalog.",
    tags=["grant-finder"],
)
def list_funding():
    return funding.get_funding_programs()


class PortfolioRequest(BaseModel):
    budget_cad: int = Field(..., ge=0, examples=[50_000_000])
    weight_dollar: float = Field(0.4, ge=0, le=1)
    weight_co2: float = Field(0.4, ge=0, le=1)
    weight_equity: float = Field(0.2, ge=0, le=1)


@app.post(
    "/portfolio/rank",
    response_model=PortfolioRanking,
    operation_id="rank_portfolio",
    summary="rank_portfolio",
    description=(
        "Rank the 20 communities under a budget cap and three weight sliders "
        "(dollar savings, CO2 avoided, equity)."
    ),
    tags=["portfolio-planner"],
)
def rank_portfolio_endpoint(req: PortfolioRequest):
    return portfolio.rank_portfolio(
        req.budget_cad,
        req.weight_dollar,
        req.weight_co2,
        req.weight_equity,
    )


@app.get(
    "/brief/{community_id}",
    response_model=CommunityBrief,
    operation_id="get_brief",
    summary="get_brief",
    description=(
        "Return the finished pre-feasibility brief for ONE community: the "
        "seven-section `brief_markdown` plus the structured numbers (resource, "
        "system, economics, funding, validation). These come straight from the "
        "deterministic Python pipeline (the same source as the dashboard), so "
        "every number is exact. The Brief Writer agent calls this and returns "
        "`brief_markdown` verbatim — numbers never pass through the LLM, so they "
        "cannot drift. Accepts a community id ('nain') or display name ('Mary's "
        "Harbour'); names are normalised to ids."
    ),
    tags=["brief-writer"],
)
def get_brief(community_id: str):
    if not _BRIEFS_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="data/briefs.json not found — run `python scripts/run_batch.py --no-llm` first.",
        )
    data = json.loads(_BRIEFS_PATH.read_text(encoding="utf-8"))
    cid = (
        community_id.strip()
        .lower()
        .replace(" ", "_")
        .replace("’", "")  # curly right apostrophe (e.g. "Pinsent's Arm")
        .replace("‘", "")  # curly left apostrophe (defensive)
        .replace("'", "")       # ASCII apostrophe
    )
    for community in data.get("communities", []):
        if community.get("id") == cid:
            return community
    valid = ", ".join(c.get("id", "") for c in data.get("communities", []))
    raise HTTPException(
        status_code=404,
        detail=f"Unknown community '{community_id}'. Valid ids: {valid}",
    )


# ── Meta ────────────────────────────────────────────────────────────────────


@app.get(
    "/health",
    operation_id="health_check",
    summary="health_check",
    description="Liveness probe. Not an agent tool.",
    tags=["meta"],
    include_in_schema=False,
)
def health():
    return {"status": "ok", "service": "meridian-api", "version": "0.2.0"}


# ── Frontend-supporting routes ──────────────────────────────────────────────
# include_in_schema=False keeps these out of /openapi.json so Orchestrate
# doesn't see them as agent tools when you re-import the spec. The routes
# still work for the React frontend — they're just not advertised.


@app.get("/briefs", tags=["frontend"], include_in_schema=False)
def get_briefs():
    """Serve the 20 pre-computed community briefs to the React frontend."""
    if not _BRIEFS_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="data/briefs.json not found — run `python scripts/run_batch.py --no-llm` first.",
        )
    return json.loads(_BRIEFS_PATH.read_text(encoding="utf-8"))


@app.get("/governance/report", tags=["frontend"], include_in_schema=False)
def get_governance_report():
    """Serve the latest governance evaluation report."""
    if not _GOVERNANCE_REPORT_PATH.exists():
        return {
            "verdict": "NOT_RUN",
            "overall_match_rate": None,
            "total_checks": 0,
            "total_passed": 0,
            "generation_mode": "unknown",
            "note": "Run `python scripts/evaluate_briefs.py` to generate the report.",
        }
    return json.loads(_GOVERNANCE_REPORT_PATH.read_text(encoding="utf-8"))


class ChatProxyMessage(BaseModel):
    role: str
    content: str


class ChatProxyRequest(BaseModel):
    messages: List[ChatProxyMessage]
    mode: str = Field(
        "granite",
        description="`granite` for direct watsonx.ai, `coordinator` for Orchestrate.",
    )
    current_state: Optional[Dict] = None


@app.post("/chat", tags=["frontend"], include_in_schema=False)
async def chat_proxy(req: ChatProxyRequest):
    """
    Proxy the React frontend's chat to watsonx.ai (granite mode) or the
    Orchestrate Coordinator (coordinator mode). Streams Server-Sent Events
    back to the browser so the response renders progressively.
    """
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    last = req.messages[-1]
    if last.role != "user":
        raise HTTPException(
            status_code=400, detail="last message must have role='user'"
        )

    briefs = (
        json.loads(_BRIEFS_PATH.read_text(encoding="utf-8"))
        if _BRIEFS_PATH.exists()
        else {"communities": [], "metadata": {}}
    )

    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages[:-1]
        if m.role in ("user", "assistant")
    ]

    def event_stream():
        try:
            if req.mode == "coordinator":
                full_messages = [
                    {"role": m.role, "content": m.content} for m in req.messages
                ]
                for chunk in stream_via_orchestrate(
                    messages=full_messages,
                    current_state=req.current_state,
                ):
                    payload = json.dumps({"content": chunk})
                    yield f"data: {payload}\n\n"
            else:
                for chunk in stream_chat(
                    user_message=last.content,
                    history=history,
                    briefs=briefs,
                    current_state=req.current_state,
                ):
                    payload = json.dumps({"content": chunk})
                    yield f"data: {payload}\n\n"
        except Exception as e:
            err = json.dumps({"content": f"\n\n⚠️ {type(e).__name__}: {e}"})
            yield f"data: {err}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
