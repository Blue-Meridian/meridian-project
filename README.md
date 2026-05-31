# Project Meridian

**An agentic AI planner for Newfoundland & Labrador's clean-energy transition.**
IBM × Memorial University watsonx Hackathon · Team Blue Meridian · May 29–31, 2026

> Twenty communities in Newfoundland and Labrador live off the grid, running entirely on diesel.
> Meridian drafts the clean-energy transition plan for any one of them — what to build, what it
> costs, how much diesel and CO₂ it saves, the payback, and which federal program could fund it —
> then ranks **all twenty** under a budget to show what to build **first**.

**Live:** [blue-meridian-ai.vercel.app](https://blue-meridian-ai.vercel.app) · **API:** [meridian-api.okraks.fyi](https://meridian-api.okraks.fyi)

---

## 1. The problem (all public, all verified)

Newfoundland & Labrador's main grid is ~97% hydro — but **20 small communities are off-grid and
run entirely on diesel** (mostly coastal Labrador; ~34 MW total). That power is:

- **Costly** — fuel is shipped in by sea and air.
- **Polluting** — diesel combustion, year-round.
- **Fragile** — supply chains break; outages follow weather.
- **An equity & reconciliation issue** — 17 of the 20 are Indigenous-governed (Nunatsiavut
  Government, Mushuau Innu First Nation, NunatuKavut Community Council).

A **$220M federal program** targets diesel reduction; the goal is clean power for these communities
by **2030**, and the province targets net-zero by 2050. NL Hydro's own **2020 Hatch study** found
**wind + battery storage + reduced diesel** the lowest-cost path — which is exactly what Meridian's
engine recommends, and what the real **Nain** project under construction is building.

---

## 2. What Meridian does — two layers

| Layer | What it produces |
|---|---|
| **Layer 1 — one community** | A full seven-section pre-feasibility brief: resource → system design → economics → funding match → validation. |
| **Layer 2 — the whole province** | A portfolio optimizer that ranks all 20 communities under a budget and weight preferences ($ savings / CO₂ / equity), and sequences what to build first. |

**Mental model:** *a financial advisor for a province's clean-energy budget.*

---

## 3. The core architectural principle

> **Numbers come from deterministic Python, not the LLM.**

LLMs are unreliable at arithmetic. So in Meridian, **all** numbers — capacity sizing, capital cost,
diesel displaced, CO₂ avoided, payback, the portfolio ranking — are computed by deterministic Python
tools. The LLM (**Granite**) does only what it's good at: orchestration, retrieval over funding
documents, and writing the brief's prose. The finished brief is fetched **verbatim** from the
deterministic engine, so a figure can never drift as it passes through the model.

This is the project's credibility thesis, and everything is built around it.

---

## 4. The agents — a "consulting firm"

| Agent | Job | Implemented as |
|---|---|---|
| **Coordinator** | Drives the five-step pipeline, returns the finished brief | watsonx Orchestrate (orchestrator) |
| **Resource Scout** | Wind / solar / load at the community's coordinates | deterministic tool (`api/resource.py`) |
| **System Designer** | Sizes wind + solar + battery + retained diesel | deterministic tool (`api/design.py`) |
| **Number Cruncher** | Capital cost, diesel displaced, CO₂ avoided, payback | deterministic tool (`api/economics.py`) |
| **Grant Finder** | Matches federal funding programs + eligibility | Granite + RAG (`api/funding.py` + funding docs) |
| **Brief Writer** | Assembles the readable seven-section brief | Granite (`get_brief` returns it verbatim) |
| **Portfolio Planner** | Ranks + sequences all 20 under a budget | deterministic optimizer (`api/portfolio.py`) |

The Coordinator runs Resource Scout → System Designer → Number Cruncher → Grant Finder → Brief
Writer in order. The Brief Writer calls a `get_brief` tool that returns the finished, number-verified
brief — so the visible 5-agent collaboration happens, but the authoritative numbers come from the
deterministic engine, never from relayed LLM text.

---

## 5. System architecture

```
┌──────────────────────────── Users (browser) ─────────────────────────────┐
│                                                                           │
│   React dashboard  ── blue-meridian-ai.vercel.app (Vercel)                │
│   ├─ Chat  ── two modes:  Granite (direct)  ⇄  Coordinator (5-agent)      │
│   ├─ Map   ── 20 communities, ranked live under a budget                  │
│   └─ Brief ── selected community's 7-section pre-feasibility brief        │
│                                                                           │
│   watsonx Orchestrate chat  ── the agentic Layer-1 surface (live agents)  │
└───────────┬───────────────────────────────────────────┬──────────────────┘
            │ HTTPS (SSE stream for chat)                 │ calls tools via OpenAPI
            ▼                                             ▼
┌──────────────── FastAPI backend ────────────────┐  ┌─── IBM Cloud · Dallas ───┐
│  api/main.py   (meridian-api.okraks.fyi)         │  │                          │
│                                                  │  │  watsonx Orchestrate     │
│  Agent tools (called by Orchestrate + frontend): │  │  └─ Coordinator + 6      │
│   GET  /resource/{id}      resource.py           │◄─┼──── agents               │
│   POST /design             design.py             │  │                          │
│   POST /economics          economics.py          │  │  watsonx.ai (Granite     │
│   GET  /funding/programs   funding.py            │  │  └─ 3-8b-instruct)       │
│   POST /portfolio/rank     portfolio.py          │  │     reasoning · RAG ·    │
│   GET  /brief/{id}         (verbatim brief)      │  │     brief prose          │
│                                                  │  │                          │
│  Frontend support:                               │  │  watsonx Runtime         │
│   GET  /briefs   GET /chat (SSE → watsonx)       │──┼──► Granite model serving │
│                                                  │  │                          │
│  Source of truth:  data/briefs.json              │  └──────────────────────────┘
│   └─ baked at Docker build by run_batch.py       │
└──────────────────────────────────────────────────┘

Deterministic engine (pure Python, no LLM):
   resource → design → economics → portfolio   ──►  data/briefs.json (20 briefs)
   The frontend also bundles briefs.json so the map/brief/optimizer render offline.
```

**The bet:** the expensive part (LLM coordination, 20-community runs) happens **offline** in a batch
pre-compute (`scripts/run_batch.py`), baked into `briefs.json`. The interactive surfaces read that
static JSON and do pure-Python math, so the budget slider feels instant — it never waits on an LLM.
The React app even bundles `briefs.json` at build time, so the map, briefs, and optimizer keep
working if the backend VM is cold; only live AI chat needs the backend.

---

## 6. Repository layout

```
api/            FastAPI backend — the 5 agent tools, the verbatim /brief, chat SSE proxy, /briefs
  main.py         App + all routes (the OpenAPI imported into Orchestrate)
  chat.py         watsonx.ai Granite streaming + Orchestrate Coordinator path
  resource.py     Resource Scout tool      design.py      System Designer tool
  economics.py    Number Cruncher tool     funding.py     Grant Finder catalog
  portfolio.py    Portfolio Planner (greedy impact-per-dollar ranker)
  schemas.py      Pydantic contract shared by API, agents, frontend
agents/         7 paste-ready watsonx Orchestrate agent definitions (profile + instructions)
data/           20 communities, 4 funding programs, generated briefs.json
frontend/       React + Vite + Tailwind + Leaflet — the dashboard (deployed to Vercel)
scripts/        run_batch.py (builds briefs.json), evaluate_briefs.py (self-check)
tests/          pytest — tool math smoke tests
Dockerfile · docker-compose.yml · Caddyfile.example · DEPLOY.md   — VM deploy
```

Key docs: **`problem_statement.md`** (read first) · **`spec.md`** (developer handoff) ·
**`architecture.md`** (design rationale) · **`data_sources.md`** (every public source) ·
**`flows.md`** (sequence diagrams).

---

## 7. IBM watsonx products used

Meridian genuinely uses **three** watsonx services, each doing a distinct job:

| Product | Role in Meridian |
|---|---|
| **watsonx.ai** (Granite `granite-3-8b-instruct`) | Reasoning, RAG over funding docs, and the brief's prose (`api/chat.py`, `agents/*.md`). |
| **watsonx Orchestrate** | Hosts the Coordinator + 6 agents and the live Layer-1 agentic chat surface. |
| **watsonx Runtime** | Serves the Granite model that the chat and every agent call. |

watsonx.ai **Studio / Prompt Lab** was used to author and iterate the agent prompts in `agents/*.md`.

> **Note on number integrity:** Meridian guards against hallucinated numbers with its **own**
> deterministic self-check — `scripts/evaluate_briefs.py` re-verifies that every headline number in
> each brief matches its structured field (257/257 pass in deterministic mode). This is plain Python,
> not an IBM product, and it's how the "numbers can't drift" guarantee is enforced.

---

## 8. Quick start

```bash
# 1. Python 3.11+
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Smoke-test the deterministic tools (no LLM, no API keys)
pytest

# 3. Pre-compute the 20 community briefs → data/briefs.json
python scripts/run_batch.py --no-llm     # deterministic (no Orchestrate needed)
#   set PYTHONIOENCODING=utf-8 first on Windows to avoid a cosmetic final-print crash

# 4. (optional) Re-verify every number in every brief
python scripts/evaluate_briefs.py        # writes governance/eval_briefs_report.json; expect 257/257

# 5. Configure credentials for live chat (data endpoints don't need them)
cp .env.example .env                      # IBM_CLOUD_API_KEY, WATSONX_PROJECT_ID, WATSONX_URL,
                                          # ORCHESTRATE_AGENT_URL/ID/API_KEY for Coordinator mode

# 6. Run the API
uvicorn api.main:app --reload --port 8000
#   Swagger UI  http://localhost:8000/docs   ·  OpenAPI  http://localhost:8000/openapi.json

# 7. Run the frontend (separate terminal)
cd frontend && npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
npm run dev                               # http://localhost:5173
```

---

## 9. Deployment

See **`DEPLOY.md`**. In short:

- **API** → Linux VM via `docker compose up -d --build`, fronted by Caddy for automatic HTTPS. The
  Dockerfile bakes `briefs.json` at build (`run_batch.py --no-llm`), so the deployed API serves the
  20 briefs with no runtime LLM dependency.
- **Frontend** → Vercel. `git push` to `main` auto-deploys; `VITE_API_BASE_URL` points at the API.
  The frontend bundles `briefs.json`, so the dashboard renders even if the API is briefly unreachable.

---

## 10. Security & data integrity

- **Public data only.** CER, NRCan, Pembina Institute, NL Hydro PUB filings, Global Wind Atlas,
  NASA POWER, NL Hydro 2020 Hatch study. No PII, no client data.
- **Secrets** live in `.env` (gitignored). Rotate `IBM_CLOUD_API_KEY` after the event.
- **CORS** is open (`*`) because the API is read-only over public data. Tighten for production.
- **Numbers are auditable.** Every brief's headline figures are re-verified against the structured
  engine output by `scripts/evaluate_briefs.py`.

See `architecture.md` for the full design rationale and security walk-through.
