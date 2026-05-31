# Architecture — Project Meridian

**IBM × Memorial University watsonx Hackathon · Team Blue Meridian · May 29–31, 2026**

This document is the implementation reference. It explains the **why** behind the choices in `spec.md` — what each component is responsible for, which technologies were picked, what trade-offs were made, and what to watch for security-wise. Read `problem_statement.md` for context and `spec.md` for the literal build details. Read this when you need to understand why something is shaped the way it is.

---

## 1. Architectural overview

Meridian has two demo surfaces (Streamlit dashboard, Orchestrate chat), one source of truth (`briefs.json`), one batch pre-compute step, and a single tools layer that both demos share. Everything except the IBM cloud services runs on a laptop.

```
┌──────────────────── User devices (browsers) ──────────────────────┐
│                                                                    │
│   Layer 2 demo:  Streamlit dashboard (pydeck map + sliders)        │
│   Layer 1 demo:  watsonx Orchestrate Chat UI                       │
│                                                                    │
└────────┬──────────────────────────────────────────┬────────────────┘
         │                                          │
   reads JSON                                       │ HTTPS
         │                                          │
┌────────▼──── Local laptop ──────────────┐         │
│                                          │        │
│   data/briefs.json  ◄────  scripts/      │        │
│   data/community_data.json   run_batch   │        │
│   data/funding_programs/*.md             │        │
│                                          │        │
│   tools/api.py  (FastAPI, localhost:8000)│◄───────┤
│        │                                 │        │
│        └── invokes ── tools/             │        │
│                  resource.py, design.py, │        │
│                  economics.py,           │        │
│                  funding.py,             │        │
│                  portfolio.py            │        │
│                                          │        │
└──────────────────────────────────────────┘        │
                                                    │
                       ┌────────────────────────────▼─────────┐
                       │  IBM Cloud — Dallas region            │
                       │                                       │
                       │  watsonx Orchestrate                  │
                       │  └─ 7 agents:                          │
                       │      1 Coordinator                     │
                       │      5 specialists (Resource Scout,    │
                       │        System Designer,                │
                       │        Number Cruncher,                │
                       │        Grant Finder,                   │
                       │        Brief Writer)                   │
                       │      1 Portfolio Planner               │
                       │                                       │
                       │  watsonx.ai                            │
                       │  └─ granite-3-8b-instruct (inference)  │
                       │                                       │
                       └───────────────────────────────────────┘
```

**The architectural bet:** the expensive part (LLM coordination, 20 community runs) happens **offline** in the batch pre-compute. The interactive part (Streamlit dashboard) reads a static JSON and does pure-Python math in-process. The slider feels live because it isn't waiting on LLM calls.

---

## 2. System components and responsibilities

### 2.1 Streamlit dashboard — Layer 2 demo surface

`dashboard/app.py`. Renders the NL map, sliders, ranked table, and brief detail view. Reads `data/briefs.json` once at startup, keeps it in `st.session_state`. Calls `tools.portfolio.rank_portfolio` in-process on every slider change. No HTTP, no LLM — sub-200ms response.

### 2.2 watsonx Orchestrate — Layer 1 demo surface and agent host

Hosts all seven agents. Provides the chat UI for the Layer 1 demo. Routes agent collaboration. Calls the Python tools via HTTPS. Calls watsonx.ai for inference internally.

### 2.3 Tools service — FastAPI HTTP layer

`tools/api.py`. Thin FastAPI wrapper exposing each Python tool as a REST endpoint. FastAPI auto-generates an OpenAPI spec at `/openapi.json`, which Orchestrate imports to register the tools. Lives on `localhost:8000` during the hackathon; surfaced to Orchestrate via the team's tunnel of choice (ngrok or Orchestrate's local-tool support) if Orchestrate cannot reach localhost directly.

### 2.4 Domain logic — pure Python tools

`tools/resource.py`, `tools/design.py`, `tools/economics.py`, `tools/funding.py`, `tools/portfolio.py`. Each is a module with pure functions and type hints. No HTTP, no Streamlit, no Orchestrate awareness. Same functions are imported directly by the Streamlit app (for in-process speed) and called through HTTP by the agents (because Orchestrate needs a network endpoint).

### 2.5 Pre-compute batch — bridge from agents to JSON

`scripts/run_batch.py`. Walks the 20 communities in `community_data.json`. For each, calls the three deterministic Python tools (resource, design, economics) synchronously, then calls Grant Finder and Brief Writer through the Orchestrate REST API to get the funding match and the brief markdown. Writes the assembled record into `briefs.json`. Runs in a few minutes; rerun whenever inputs or agent prompts change.

### 2.6 Data layer — JSON files on disk

- `data/community_data.json` — cached inputs (lat, lon, load, wind, solar, governance) for the 20 communities. Hand-curated for Nain and Natuashish; light estimates for the other 18.
- `data/briefs.json` — pre-computed output. The Streamlit dashboard's single source of truth.
- `data/funding_programs/*.md` — four markdown documents loaded as the Grant Finder agent's RAG corpus.
- `agents/*.md` — the seven agent profiles and instructions. Versioned alongside code, treated as content rather than configuration.

### 2.7 PDF renderer

`dashboard/pdf.py`. Single function: `brief_to_pdf(markdown, name) -> bytes`. Used by the dashboard's download button. Markdown → HTML → PDF via WeasyPrint, styled by a minimal embedded CSS block.

### 2.8 Configuration

`.env` holds `IBM_CLOUD_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL` (Dallas region endpoint), and `ORCHESTRATE_INSTANCE_URL`. Loaded by `python-dotenv`. Never committed.

---

## 3. Technology stack

| Layer                    | Choice                                                     | Why this, not the obvious alternative                                                                                                              |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent orchestration**  | IBM **watsonx Orchestrate**                                | Hosts the seven Meridian agents and gives us the visible multi-agent chat demo. Coordinator + 5 specialists + Portfolio Planner.                  |
| **Model inference**      | IBM **watsonx.ai Runtime** (`/ml/v1/text/chat_stream`)     | The actual Granite inference endpoint. Used by both the Orchestrate agents and the in-dashboard chat tab (`dashboard/chat.py`).                   |
| **Prompt development**   | IBM **watsonx.ai Studio** (Prompt Lab)                     | All seven agent prompts in `agents/*.md` are authored and iterated in Prompt Lab; the project workspace hosts the Granite deployment.             |
| **Number integrity**     | `scripts/evaluate_briefs.py` (Meridian's own — **not** watsonx.governance) | Headline-number drift check: every brief in `briefs.json` verified against its structured fields. Model card at `governance/model_card.md`.       |
| **Foundation model**     | granite-3-8b-instruct                                      | Right cost/quality balance. 3-2b would be cheaper but weaker on Brief Writer's seven-section prose. 405b would be overkill and slow the batch run. |
| **Application language** | Python 3.11+                                               | One language across tools, batch, dashboard, and PDF. No JS-Python context-switch overhead.                                                        |
| **Tool service**         | FastAPI + Pydantic                                         | Free OpenAPI export for Orchestrate import. Pydantic gives us schema validation as types.                                                          |
| **Dashboard framework**  | Streamlit                                                  | Python-only, builds the budget/weight/map UX in a day. No bundler, no React, no Node.                                                              |
| **Map rendering**        | pydeck (deck.gl) with Carto basemap                        | Interactive scatter layer on an NL basemap. Carto basemap means no Mapbox token to manage.                                                         |
| **PDF rendering**        | WeasyPrint + markdown lib                                  | Markdown → styled PDF without writing layout code. ReportLab would force manual positioning.                                                       |
| **HTTP client**          | httpx                                                      | Async for the batch script (call multiple agents in parallel where order allows).                                                                  |
| **Config**               | python-dotenv                                              | Smallest viable config story.                                                                                                                      |
| **Testing**              | pytest                                                     | Each tool has a unit test for its public function. Schemas have golden-file tests on Nain inputs.                                                  |
| **Storage**              | JSON files on disk                                         | 20 records. SQLite would be ceremony. PostgreSQL would be malpractice.                                                                             |
| **Process model**        | Streamlit + FastAPI + Orchestrate (all separate processes) | Each can be restarted independently. Failures are isolated.                                                                                        |

**What was considered and rejected:**

- React + Mapbox dashboard — slower to build, requires a JS-comfortable team member, polish gains don't outweigh time cost.
- LangChain or LangGraph for orchestration — re-implements what Orchestrate gives us; would also bypass the hackathon's watsonx Orchestrate scoring lever.
- Live API calls (Global Wind Atlas, NASA POWER) at runtime — API flakiness becomes demo flakiness. We pre-fetch and cache to `community_data.json`.
- A dedicated database — 20 records doesn't justify it; the JSON-as-source-of-truth pattern is easier to inspect and diff.

---

## 4. Programming languages

| Where                                        | Language                                                 |
| -------------------------------------------- | -------------------------------------------------------- |
| Tools, dashboard, batch script, PDF renderer | Python                                                   |
| Agent profiles and instructions              | Markdown (read by humans, pasted into Orchestrate)       |
| Tool API contracts                           | OpenAPI (auto-generated by FastAPI from Pydantic models) |
| Data files                                   | JSON                                                     |
| Funding RAG corpus                           | Markdown (loaded as Orchestrate knowledge documents)     |
| PDF styling                                  | HTML + CSS (embedded in PDF renderer, minimal)           |

No JavaScript. No TypeScript. No SQL. The pydeck JS engine runs in the browser but the team writes no JS.

---

## 5. Data flow and APIs

### 5.1 Data flow — Layer 1 chat demo (live)

```
User types "Build a plan for Nain"
        │
        ▼
Orchestrate Chat UI
        │
        ▼
Coordinator agent (instructions enforce order)
        │
        ├─→ Resource Scout → tool: GET /resource/nain
        │       returns wind/solar JSON
        │
        ├─→ System Designer → tool: POST /design
        │       returns sizing ranges JSON
        │
        ├─→ Number Cruncher → tool: POST /economics
        │       returns cost/savings/CO2/payback JSON
        │
        ├─→ Grant Finder → tool: GET /funding/programs
        │       + RAG over 4 funding markdown docs
        │       returns eligible programs JSON
        │
        └─→ Brief Writer (no tool call)
                composes 7-section markdown
                │
                ▼
        Result rendered in Orchestrate chat
```

### 5.2 Data flow — Batch pre-compute (offline)

```
scripts/run_batch.py
        │
        ▼
for each community in community_data.json:
        ├─→ tools.resource.get_resource_data(id)     [in-process]
        ├─→ tools.design.size_system(id, ...)         [in-process]
        ├─→ tools.economics.compute_economics(...)    [in-process]
        ├─→ Orchestrate API → Grant Finder agent      [HTTPS]
        └─→ Orchestrate API → Brief Writer agent      [HTTPS]
                │
                ▼
        append assembled record to briefs.json
```

### 5.3 Data flow — Layer 2 dashboard (live)

```
Streamlit loads briefs.json into st.session_state on startup
        │
        ▼
User moves a slider
        │
        ▼
Streamlit re-runs the script
        │
        ▼
dashboard.app calls tools.portfolio.rank_portfolio(
        budget, w_dollar, w_co2, w_equity
)   [in-process import, no HTTP]
        │
        ▼
pydeck map + table re-render with updated `fundable` flags
```

### 5.4 APIs

**FastAPI tools service** (`tools/api.py`) — five endpoints:

| Endpoint                   | Method | Body / params                                            | Returns               |
| -------------------------- | ------ | -------------------------------------------------------- | --------------------- |
| `/resource/{community_id}` | GET    | path param                                               | Resource data JSON    |
| `/design`                  | POST   | `{community_id, wind_quality, solar_quality}`            | Sizing JSON           |
| `/economics`               | POST   | `{community_id, sizing}`                                 | Economics JSON        |
| `/funding/programs`        | GET    | —                                                        | Program metadata list |
| `/portfolio/rank`          | POST   | `{budget_cad, weight_dollar, weight_co2, weight_equity}` | Ranked list JSON      |

All bodies and responses are typed with Pydantic. OpenAPI spec auto-served at `/openapi.json`, imported into Orchestrate via the Catalog → Tools → Import flow.

**Orchestrate API** (consumed by the batch script and any custom integration):

| Endpoint (Orchestrate-provided) | Used for                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| Agent invocation REST endpoint  | `run_batch.py` calls Grant Finder and Brief Writer per community  |
| Knowledge document upload       | One-time prep: upload the 4 funding markdown docs to Grant Finder |

The Coordinator agent is **never** called from the batch script — its job is to drive the live chat demo. The batch deliberately calls the specialists directly to avoid LLM-routing variability over 20 sequential runs.

---

## 6. Libraries and tools to cut developer time

| Library                   | What it saves the team                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Streamlit**             | Removes the entire front-end framework problem. No router, no state library, no bundler.                                                                     |
| **pydeck**                | Interactive map with custom layers without writing JavaScript or learning Mapbox GL.                                                                         |
| **FastAPI**               | Free OpenAPI export. Orchestrate's tool-import flow consumes it directly. No hand-written schemas.                                                           |
| **Pydantic**              | The JSON contracts in `spec.md` become Python types. Validation happens automatically; mismatches throw at the boundary instead of corrupting `briefs.json`. |
| **WeasyPrint**            | Markdown → styled PDF in three lines. No template engine, no layout work.                                                                                    |
| **markdown** (Python lib) | Cleanly converts the brief markdown into HTML for both the dashboard and the PDF path.                                                                       |
| **httpx**                 | Async HTTP for the batch script. If the team wants to parallelize across communities, the upgrade is one keyword.                                            |
| **python-dotenv**         | One `.env` file holds all keys. Nothing to wire up.                                                                                                          |
| **Jinja2**                | Reserved as the Brief Writer fallback: if Granite drifts, swap Brief Writer for a Jinja template that substitutes the computed numbers.                      |
| **pytest + pytest-cov**   | Unit tests for the math-heavy tools (sizing, economics, portfolio ranking). Golden-file tests against Nain inputs catch regressions.                         |
| **ruff**                  | One-config-file linter + formatter. No black + isort + flake8 stack to maintain.                                                                             |
| **rich** (optional)       | Pretty CLI output for `run_batch.py` so the team can see batch progress at a glance.                                                                         |

**Tools we are explicitly not pulling in:**

- A heavy ORM (SQLAlchemy, Django ORM). No database in scope.
- A web framework other than Streamlit (Flask, Django). Streamlit covers the dashboard; FastAPI covers the tools.
- A test runner beyond pytest. No Tox, no Nox.
- A monorepo tool (Pants, Bazel). Single project, single repo.
- A container runtime in scope. We're running on a laptop and demoing via video.

---

## 7. Key design patterns

### 7.1 Coordinator–Specialists (Orchestrate-native)

The Coordinator agent has the five specialists as collaborators in its toolset. Its instructions explicitly fix the call order. This gives us the "watch agents talk" demo moment while keeping the run deterministic.

The Portfolio Planner is intentionally **outside** the Coordinator's collaborators — it's a separate, standalone agent that handles Layer 2 chat queries. Splitting it keeps the Coordinator focused on Layer 1 and avoids the Coordinator over-routing to portfolio answers when the user just wants a community brief.

### 7.2 Pre-compute and cache

The batch step is the architectural heart of the demo experience. LLM latency × 20 communities × 6 agents per community ≈ a multi-minute slider drag in the naïve design. By pre-computing once and serving JSON, the slider stays sub-200ms.

Trade-off: the pre-compute has to be rerun whenever inputs, tools, or agent prompts change. We're treating `briefs.json` as a **derived artifact**, not a database — it's regenerable from source.

### 7.3 CQRS-lite split between layers

Layer 1 is a **write-once** compute path that produces a record in `briefs.json`. Layer 2 is a **read-only** consumer of that file. The two demos share a contract (the JSON schema) but no live coupling. This means the Layer 2 dashboard works even when Orchestrate is offline, and vice versa.

### 7.4 Tools-as-services with dual invocation

Each Python tool has one definition (`tools/portfolio.py`) but two callers:

- **HTTP, by Orchestrate agents** — via the FastAPI wrapper for live chat. Network hop is acceptable here because the agents themselves are slow (LLM latency).
- **In-process, by the dashboard and batch script** — direct Python import. No HTTP. Sub-millisecond.

The same function returns the same result either way. The FastAPI layer is a thin shim, not a re-implementation.

### 7.5 Numbers from Python, prose from Granite

The split-by-agent rule (`spec.md` §4): deterministic math lives in tools; Granite only writes prose around the computed numbers, reads funding documents for eligibility, and characterizes resource data. Brief Writer's instructions explicitly forbid changing, rounding, or inventing numbers. This is the single most important pattern for demo credibility.

### 7.6 Schemas as contracts

The two JSON shapes (`community_data.json`, `briefs.json`) are Pydantic models in a `schemas.py` module. Both the producer (batch script) and consumer (dashboard) import and validate against the same model. Adding a field requires touching both ends.

### 7.7 Fail-soft fallback chains

Every demo-critical component has a documented fallback:

- pydeck map → `st.map` if pydeck fails to render.
- WeasyPrint PDF → markdown `.md` download.
- Coordinator multi-agent → single `run_pipeline(community_id)` tool that Python-orchestrates the same five steps and returns the assembled brief.
- Brief Writer Granite → Jinja2 template substitution.

Each fallback is one swap, not a rebuild. The team should rehearse the swap before Sunday demo time.

### 7.8 Agents-as-content

The seven agent profiles live as markdown files in `agents/`. They get pasted into Orchestrate's UI, but version-control lives with the team. This makes it easy to compare what we shipped against what we said we'd ship, and to rebuild the agents from scratch if the Orchestrate environment gets reset.

---

## 8. Trade-offs (explicit)

| Decision                           | What we gain                                                     | What we give up                                                     |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Pre-computed JSON                  | Sub-200ms slider, deterministic demo                             | Freshness — rerun batch when anything changes                       |
| Streamlit + pydeck                 | One day of build                                                 | Design polish vs a React/Mapbox build                               |
| Coordinator + collaborators        | Visible agent handoffs (Innovation rubric)                       | Some LLM-routing risk vs a flat scripted pipeline                   |
| FastAPI tools service              | Free OpenAPI for Orchestrate; in-process speed for the dashboard | One extra process to manage                                         |
| Granite 3-8b                       | Good prose, fast batches, low cost                               | 405b would be slightly better on the brief, much slower and pricier |
| JSON files vs SQLite               | Human-inspectable, diffable, no schema migrations                | Doesn't scale past ~1k records                                      |
| Local-only deployment              | Zero hosting cost, hackathon-policy compliant                    | No remote access, no shareable link                                 |
| Hand-curated `community_data.json` | Predictable demo values, no API flake risk                       | Manual work; updates require rerunning the batch                    |
| 4 funding programs in RAG          | Reliable eligibility matching                                    | Other real programs (CIB, provincial) are out of scope              |
| WeasyPrint                         | Clean markdown → PDF with CSS                                    | Native install can be fiddly; Linux/macOS easier than Windows       |
| Two deep + 18 light communities    | Focus on validation case; portfolio dashboard still has 20 pins  | The 18 light briefs are estimated, must be labelled as such         |

---

## 9. Security considerations

This is a hackathon prototype running locally, but the spec still has to be defensible.

### 9.1 Secrets

- IBM Cloud API key and watsonx project ID live in `.env`, loaded with python-dotenv.
- `.env` is in `.gitignore`. README has a banner: never share screenshots that show the keys.
- The keys are scoped to the team's hackathon-provisioned IBM Cloud account; they expire at the end of the event.
- No keys, tokens, or service credentials hard-coded in agent profiles or markdown files.

### 9.2 Data — public-only

Every data source in `community_data.json`, `funding_programs/`, and the brief content is public (CER, NRCan, NL Hydro PUB filings, Pembina, NL Hydro public studies). No proprietary data, no client data, no scraped social media, no PII. The hackathon's data policy is explicitly satisfied.

### 9.3 No personal information

Community records contain population aggregates and infrastructure metrics. No individual names, no contact data. The brief refers to **governments** (Nunatsiavut Government, Mushuau Innu First Nation, NunatuKavut Community Council), never to individuals.

### 9.4 Indigenous-data governance

The product treats Indigenous Nations as governments, not as stakeholders or data subjects. No traditional knowledge is being extracted, used, or modelled. The brief recommends a project; it does not represent or speak for the Nations. The validation slide for Nain cites the publicly announced NL Hydro project, not internal community planning.

### 9.5 Tool service exposure

The FastAPI tools server binds to `localhost:8000` and is not reachable from the public internet. If Orchestrate needs to reach it (depending on which Orchestrate setup the team uses), a temporary tunnel (ngrok or an Orchestrate-supported local agent runtime) is acceptable for the hackathon. After the event, the tunnel is closed.

- CORS: locked to localhost only.
- No authentication on the FastAPI service — acceptable because it's never internet-exposed and serves no sensitive data.
- No rate limiting — not needed at the scale of this demo.

### 9.6 Prompt-injection surface

The Layer 1 chat surface accepts free-form user input through the Orchestrate Chat UI. The Coordinator's instructions are explicit and constraining (five-step pipeline, no skipping, no inventing). Even if a user types a prompt-injection attempt, the worst case is Brief Writer producing a garbled brief — there's no privileged data to exfiltrate and no admin function to invoke.

Brief Writer's instructions also reinforce the no-invention rule, so a prompt-injection trying to make it estimate a fake number gets rejected by its own system prompt. Pre-compute also gives us a chance to review every brief before showing it to judges.

### 9.7 Funding documents — public web pages

Each of the four programs' source pages is public, has no NDA, and is cited by URL in the brief. RAG only loads what the team explicitly uploads as a knowledge document.

### 9.8 LLM output review

Because the batch pre-compute runs offline, the team reviews `briefs.json` for all 20 communities before the demo. Any drift, hallucination, or unfortunate phrasing gets caught before judges see it. This is a property of the pre-compute pattern that a live-on-stage architecture would not give us.

### 9.9 Post-event cleanup

- The team revokes the IBM Cloud API key after the event.
- `.env` and any cached IAM tokens are deleted from team machines.
- The hackathon-provisioned IBM Cloud account is deactivated automatically per the guide.

---

## 10. Scalability

Not a hackathon priority, but the architecture has room.

- **More communities (200, 500, 1000).** Batch run gets longer linearly. Architecture unchanged. JSON file remains tolerable until ~1k records (a few MB); beyond that, switch to SQLite.
- **More funding programs.** Add markdown files to `data/funding_programs/`, upload to Grant Finder's knowledge base. No code change.
- **More agents.** Add a markdown file to `agents/`, register in Orchestrate, add to the Coordinator's collaborator list, and update the Coordinator's instruction ordering.
- **More users.** Streamlit single-instance handles ~10–20 concurrent users comfortably. Beyond that, host behind a Streamlit Community Cloud or container deployment. Not in scope for the hackathon.
- **Live data instead of cached.** Replace `tools.resource.get_resource_data` with a live Global Wind Atlas / NASA POWER call. Add a TTL cache. Pre-compute pattern is unchanged.

---

## 11. Maintainability

- **One language across the stack** keeps context-switching low.
- **Each agent's profile is one markdown file.** Diff-able by non-developers (the team's storytelling lead can edit Brief Writer's tone without touching code).
- **Pure-function tools** are testable in isolation. The math is unit-testable without spinning up Orchestrate.
- **One schema module** (`schemas.py`) is the single contract for both `community_data.json` and `briefs.json`. Adding a field is a one-place change at the producer and the consumer.
- **The fallback chain** (§7.7) means an individual component breaking doesn't sink the demo.
- **No build step** beyond `pip install -r requirements.txt`. Runnable on any team member's laptop.

---

## 12. Cost

Hackathon scope, so cost is essentially zero, but let's be explicit:

| Item                                                    | Cost during the hackathon                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| watsonx.ai inference (granite-3-8b)                     | Covered by the team's hackathon credits. Batch run is ~60k tokens total; interactive chat demos add ~10–20k more. Well within trial limits. |
| watsonx Orchestrate                                     | Covered by hackathon access.                                                                                                                |
| FastAPI, Streamlit, pydeck, WeasyPrint, all Python libs | Open-source. Zero.                                                                                                                          |
| Mapbox token                                            | Avoided by using pydeck's Carto basemap.                                                                                                    |
| Hosting / domain                                        | Not in scope — local-only.                                                                                                                  |
| Storage                                                 | A few MB of JSON.                                                                                                                           |

Post-hackathon production cost (if continued) would be dominated by inference (cents-per-batch-rerun on Granite, scaling linearly with community count) and the Orchestrate licence.

---

## 13. What this architecture is not

To save the team from drift, here's what was explicitly left out:

- **A real database.** JSON files cover the scope.
- **A user-auth system.** No accounts, no logins.
- **Multi-tenancy.** Single-team, single-province.
- **A worker queue (Celery, RQ).** The batch is a script, not a service.
- **Logging infrastructure.** Print statements + `briefs.json` review is enough.
- **Telemetry / observability.** The hackathon guide mentions Langfuse + IBM Telemetry as optional; the team will mention them in the video but not wire them in.
- **CI / CD.** No remote deployment to deploy to.
- **A native mobile app.** The dashboard is a browser experience on a laptop.

If any of these become relevant in a continuation of the project, they slot in cleanly because the boundaries between components are explicit and HTTP/import-based rather than monolithic.

---

## 14. References

- `problem_statement.md` — problem framing, users, rubric mapping.
- `spec.md` — concrete component specs, agent prompts, tool implementations, build sequence.
- `ideas.md` — earlier ideation, including alternatives considered and rejected.
- IBM watsonx Orchestrate documentation — Coordinator pattern, collaborators, knowledge documents, OpenAPI tool import.
- IBM watsonx.ai documentation — Granite 3 model family, Prompt Lab, API reference.
- FastAPI, Streamlit, pydeck, WeasyPrint, Pydantic — official docs.
- NL Hydro 2020 Hatch study — cost benchmarks (referenced by `tools.economics`).
- Pembina Institute "Restoring the Flow" — community list and governance taxonomy.
- Canada Energy Regulator NL Renewable Power and Energy Profile — authoritative community list and diesel load data.
