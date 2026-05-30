# Flows — Project Meridian (sketcher's reference)

Companion to `architecture.md`. That doc explains the _why_; this doc breaks the system into five concrete flows you can draw as arrows between named boxes.

## Box vocabulary (draw the whole cast once at the top)

| Shape                      | What it represents            | Items                                                                                                        |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Rectangle (solid)**      | Process / code that runs      | `scripts/run_batch.py`, FastAPI server, Streamlit dashboard, `dashboard/pdf.py`, `tools/*.py`                |
| **Cylinder**               | Persistent storage on disk    | `community_data.json`, `briefs.json`, `funding_programs/*.md`, `.env`                                        |
| **Rounded rectangle**      | External IBM Cloud service    | watsonx Orchestrate, watsonx.ai (Granite)                                                                    |
| **Hexagon**                | An agent inside Orchestrate   | Coordinator, Resource Scout, System Designer, Number Cruncher, Grant Finder, Brief Writer, Portfolio Planner |
| **Person icon**            | A human user                  | NL Hydro planner, Federal program officer                                                                    |
| **Browser / screen frame** | The user-facing surface       | Orchestrate Chat UI, Streamlit dashboard                                                                     |
| **Dashed boundary**        | A trust / deployment boundary | "Local laptop" (blue), "IBM Cloud" (purple)                                                                  |

**Colour suggestion:** local on the laptop in blue; IBM Cloud in purple; user-facing surfaces in green; storage in gray.

**Arrows:**

- Solid arrow = synchronous call returning a value
- Dashed arrow = read from / write to storage
- Thick arrow = HTTPS across the local↔cloud boundary
- Number every arrow within a flow so you can step through it in the demo video

---

## Suggested canvas layout (three lanes)

```
┌─ Top lane ─────────────────────────────────────────────────────────┐
│                                                                     │
│   👤 NL Hydro planner          👤 Federal program officer            │
│           │                              │                          │
│           ▼                              ▼                          │
│   ┌──────────────┐               ┌──────────────────┐               │
│   │ Orchestrate  │               │ Streamlit         │               │
│   │ Chat UI      │               │ Dashboard         │               │
│   └──────────────┘               └──────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
┌─ Middle lane ──────────────────────────────────────────────────────┐
│                                                                     │
│  ╔═ watsonx Orchestrate (purple) ═════╗   ╔═ Laptop (blue) ════════╗│
│  ║  ⬡ Coordinator                     ║   ║  ┌──────────────────┐  ║│
│  ║    ├─ ⬡ Resource Scout              ║   ║  │ FastAPI :8000    │  ║│
│  ║    ├─ ⬡ System Designer             ║   ║  │ (5 tool routes)  │  ║│
│  ║    ├─ ⬡ Number Cruncher             ║   ║  └────────┬─────────┘  ║│
│  ║    ├─ ⬡ Grant Finder                ║   ║           │ in-proc    ║│
│  ║    └─ ⬡ Brief Writer                ║   ║  ┌────────▼─────────┐  ║│
│  ║                                     ║   ║  │ tools/ modules   │  ║│
│  ║  ⬡ Portfolio Planner (standalone)   ║   ║  └──────────────────┘  ║│
│  ║                                     ║   ║                        ║│
│  ║  ⌒ watsonx.ai Granite (inference)   ║   ║  ┌──────────────────┐  ║│
│  ║                                     ║   ║  │ scripts/run_batch│  ║│
│  ╚═════════════════════════════════════╝   ║  └──────────────────┘  ║│
│                                              ╚═══════════════════════╝│
└─────────────────────────────────────────────────────────────────────┘
┌─ Bottom lane (storage row) ────────────────────────────────────────┐
│                                                                     │
│   🗄 community_data.json     🗄 funding_programs/*.md                │
│   🗄 briefs.json (⭐)         🗄 .env                                │
└─────────────────────────────────────────────────────────────────────┘
```

Now thread the five flows through that layout.

---

## Flow 1 — One-time setup

Linear pipeline. No live data. Draw once on its own area of the canvas (or label arrows with `[setup]` if drawing on the main diagram).

| #   | Arrow          | From → To                              | Label                               |
| --- | -------------- | -------------------------------------- | ----------------------------------- |
| 1   | dashed         | Team → `community_data.json`           | curates 20 records                  |
| 2   | dashed         | Team → `funding_programs/*.md`         | writes 4 cheat sheets               |
| 3   | solid          | Team → FastAPI server                  | starts uvicorn :8000                |
| 4   | thick          | FastAPI → Orchestrate                  | imports OpenAPI spec                |
| 5   | solid          | Team → Orchestrate                     | creates 7 agents from `agents/*.md` |
| 6   | thick (dashed) | `funding_programs/*.md` → Grant Finder | uploaded as knowledge documents     |
| 7   | solid          | Team → Coordinator                     | wires 5 collaborators               |

---

## Flow 2 — Batch pre-compute (offline)

Trigger: `python scripts/run_batch.py` at the terminal. Runs once when inputs or prompts change. The result, `briefs.json`, is the single source of truth Flows 4 and 5 read.

Draw it as a **loop** over 20 communities. One iteration looks like this:

| #   | Arrow  | From → To                                 | Label                             |
| --- | ------ | ----------------------------------------- | --------------------------------- |
| 1   | dashed | `community_data.json` → `run_batch.py`    | read next record                  |
| 2   | solid  | `run_batch.py` → `tools.resource`         | in-process call                   |
| 3   | solid  | `run_batch.py` → `tools.design`           | in-process call                   |
| 4   | solid  | `run_batch.py` → `tools.economics`        | in-process call                   |
| 5   | thick  | `run_batch.py` → Orchestrate Grant Finder | HTTPS POST: community + economics |
| 6   | dashed | `funding_programs/*.md` → Grant Finder    | RAG retrieval                     |
| 7   | solid  | Grant Finder → Granite                    | LLM inference                     |
| 8   | thick  | Grant Finder → `run_batch.py`             | returns FundingMatch JSON         |
| 9   | thick  | `run_batch.py` → Brief Writer             | HTTPS POST with all prior outputs |
| 10  | solid  | Brief Writer → Granite                    | LLM inference                     |
| 11  | thick  | Brief Writer → `run_batch.py`             | returns 7-section markdown        |
| 12  | dashed | `run_batch.py` → `briefs.json`            | append assembled record           |

**Loop arrow** from #12 back to #1 with label _"next community ×20"_.

The Coordinator agent is **deliberately not used** in this flow — the batch calls specialists directly via the API to avoid 20 sequential LLM-routing calls.

---

## Flow 3 — Layer 1 chat demo (live, NL Hydro planner)

Trigger: planner types _"Build a plan for Nain"_ in the Orchestrate Chat UI. This is **the** demo moment — every numbered arrow corresponds to a visible card or status update in the chat.

| #   | Arrow  | From → To                                                        | Label                                                                  |
| --- | ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | solid  | Planner → Chat UI                                                | "Build a plan for Nain"                                                |
| 2   | solid  | Chat UI → Coordinator                                            | route to Coordinator                                                   |
| 3   | solid  | Coordinator → Resource Scout                                     | "what's the resource at Nain?"                                         |
| 4   | thick  | Resource Scout → FastAPI `/resource/nain`                        | HTTPS GET                                                              |
| 5   | dashed | FastAPI → `community_data.json`                                  | read                                                                   |
| 6   | solid  | Resource Scout → Granite                                         | characterize qualitatively                                             |
| 7   | solid  | Resource Scout → Coordinator                                     | ResourceData                                                           |
| 8   | solid  | Coordinator → System Designer → `/design` → returns SystemSizing | (repeat 4–7 pattern)                                                   |
| 9   | solid  | Coordinator → Number Cruncher → `/economics` → returns Economics | (repeat)                                                               |
| 10  | solid  | Coordinator → Grant Finder                                       | + `/funding/programs` + RAG over funding markdowns + Granite reasoning |
| 11  | solid  | Coordinator → Brief Writer                                       | no tool — Granite only                                                 |
| 12  | solid  | Brief Writer → Granite                                           | generate 7-section markdown                                            |
| 13  | solid  | Brief Writer → Coordinator → Chat UI → Planner                   | brief renders in chat                                                  |

Visual win for the demo: each specialist's reply card pops into the chat in order. Five handoffs in under 30 seconds.

---

## Flow 4 — Layer 2 dashboard (live, federal officer)

Trigger: officer opens the Streamlit URL, or drags any slider. **No HTTP, no LLM, all in-process.**

| #   | Arrow  | From → To                                      | Label                                    |
| --- | ------ | ---------------------------------------------- | ---------------------------------------- |
| 1   | solid  | Officer → Browser → Streamlit                  | open page                                |
| 2   | dashed | Streamlit → `briefs.json`                      | read once, store in `st.session_state`   |
| 3   | solid  | Streamlit → pydeck                             | render 20 community pins                 |
| 4   | solid  | Officer → Streamlit                            | drag budget slider OR weight slider      |
| 5   | solid  | Streamlit → `tools.portfolio.rank_portfolio()` | in-process call                          |
| 6   | dashed | `tools.portfolio` → `briefs.json`              | already in memory                        |
| 7   | solid  | `tools.portfolio` → Streamlit                  | PortfolioRanking                         |
| 8   | solid  | Streamlit → pydeck + table                     | re-render with `fundable` flags          |
| 9   | solid  | Officer → Streamlit                            | click a pin or row                       |
| 10  | solid  | Streamlit → markdown render                    | shows that community's `brief_markdown`  |
| 11  | solid  | Officer → Streamlit                            | click "Download PDF"                     |
| 12  | solid  | Streamlit → `dashboard/pdf.py`                 | markdown → HTML → WeasyPrint → PDF bytes |
| 13  | solid  | Streamlit → Browser                            | `st.download_button` triggers download   |

Annotate "no HTTPS arrows crossed the local↔cloud boundary in this flow" — that's the reason the slider feels live.

---

## Flow 5 — Portfolio chat (alternate Layer 2 surface)

Trigger: officer types _"Rank under $40M with high CO2 weight"_ in the chat. Same data as the dashboard, different interface.

| #   | Arrow  | From → To                                     | Label                                 |
| --- | ------ | --------------------------------------------- | ------------------------------------- |
| 1   | solid  | Officer → Chat UI                             | "Rank under $40M, CO2 priority"       |
| 2   | solid  | Chat UI → Portfolio Planner                   | route to Portfolio Planner            |
| 3   | thick  | Portfolio Planner → FastAPI `/portfolio/rank` | HTTPS POST: budget + weights          |
| 4   | solid  | FastAPI → `tools.portfolio.rank_portfolio()`  | in-process call                       |
| 5   | dashed | `tools.portfolio` → `briefs.json`             | read                                  |
| 6   | thick  | Portfolio Planner → Granite                   | narrate the ranking                   |
| 7   | solid  | Portfolio Planner → Chat UI → Officer         | ranked list + 1-paragraph explanation |

---

## Two pivot points worth labelling

1. **⭐ `briefs.json`** — the contract between Flow 2 (producer) and Flows 4 + 5 (consumers). Draw a star on the cylinder. Annotation: _"single source of truth for Layer 2; regenerable from `community_data.json` and agent prompts."_

2. **🔵 FastAPI tools service** — the contract between the local Python tools and the agents. Flows 2, 3, and 5 all cross it. Annotation: _"five tool endpoints + OpenAPI exposed at `:8000/openapi.json`; this is what Orchestrate imports."_

---

## Trust and deployment boundaries (worth a dashed box each)

- **Local laptop** (blue dashed box): `scripts/`, `tools/`, `dashboard/`, FastAPI, `data/`, `.env`. Nothing here is exposed to the public internet.
- **IBM Cloud — Dallas region** (purple dashed box): watsonx Orchestrate (with all 7 agent hexagons inside), watsonx.ai Granite. Everything crossing this boundary is HTTPS over the team's IBM Cloud account.
- **User devices** (green frames at the top): browsers running the Orchestrate Chat UI and the Streamlit dashboard. Speak to the boundaries above, not to each other.

---

## What's deliberately not drawn

- Inter-tool calls within `tools/` — they're a single module group, no internal arrows needed.
- Watsonx.ai authentication round-trips — owned by Orchestrate.
- The PDF font / CSS pipeline — internal to `dashboard/pdf.py`.
- Telemetry, logging, auth — none of these exist in scope. If a teammate asks "where does logging go?" the answer is "stdout, this is a hackathon."
