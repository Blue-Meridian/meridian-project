# Project Meridian — Model Card

A summary of what Meridian is, what it decides, what it explicitly does not decide, and the responsible-AI guard-rails behind the design. Maps directly to the hackathon's "responsible, secure, and transparent AI" framing.

---

## What Meridian is

A two-layer agentic AI planner that produces pre-feasibility briefs and a province-wide portfolio ranking for Newfoundland and Labrador's 20 diesel-dependent communities. Layer 1 is per-community engineering and economics; Layer 2 is a portfolio optimiser under a budget and three priority weights.

Read `problem_statement.md` for the full framing.

---

## Models used

| Surface | Model | Hosted on |
|---|---|---|
| Per-agent reasoning + Brief Writer prose | `ibm/granite-3-8b-instruct` | **watsonx.ai Runtime** |
| In-dashboard chat tab | `ibm/granite-3-8b-instruct` | **watsonx.ai Runtime** (`/ml/v1/text/chat_stream`) |
| Multi-agent orchestration | n/a (no model directly — Granite-backed agents call each other) | **watsonx Orchestrate** |
| Prompt development & iteration | n/a (development environment) | **watsonx.ai Studio** (Prompt Lab) |

Temperature is held at 0.2 for the deterministic specialists (Resource Scout, System Designer, Number Cruncher, Grant Finder) and at 0.5 for Brief Writer (the only agent generating prose). The in-dashboard chat runs at 0.3.

---

## Data the model sees

- The 20-community summary table (load, wind, solar, governance, economics) — see `data_sources.md` for provenance.
- The four federal funding programs (cheat sheets in `data/funding_programs/*.md`) — as RAG knowledge documents in Grant Finder's agent.
- The current dashboard state (budget, weights, computed ranking) — passed to the chat tab's system prompt so the conversation is aware of what the user is looking at.
- User chat messages within a session — session-scoped only; nothing persisted across sessions.

The model does **not** see:

- Any community-specific data beyond the public sources in `data_sources.md`.
- Any personal information about residents, billing data, or operational telemetry.
- Any internal NL Hydro documents, IBA terms, or consultation records.
- Any traditional knowledge.

---

## What the model decides

| Decision | Surface | Why model-driven |
|---|---|---|
| Qualitative characterisation of the wind/solar resource ("strong wind, moderate solar") | Resource Scout | Natural-language summarisation |
| Brief prose (executive summary, narrative around computed numbers) | Brief Writer | Natural-language generation |
| Eligibility reasoning per funding program | Grant Finder | RAG over policy documents |
| Plain-English explanation of portfolio rankings | Portfolio Planner | Narration of computed output |
| Free-form responses in the chat tab | dashboard/chat.py | Conversational reasoning over grounded data |

---

## What the model explicitly does NOT decide

These are computed deterministically in Python and passed to the model verbatim:

- **Capital costs** (`tools/economics.py`, NL Hydro Hatch benchmarks).
- **System sizing** (`tools/design.py`, sizing multipliers).
- **Annual fuel saved, dollar savings, CO₂ avoided, simple payback** (`tools/economics.py`).
- **Portfolio ranking score, fundable-subset selection** (`tools/portfolio.py`, weighted-score + cumulative budget walk).
- **Equity multiplier** (1.5× for Indigenous-governed communities — fixed value, mirrors the federal Reducing Diesel program's framing).
- **Whether a community is in Labrador, Indigenous, or has trucked-vs-shipped fuel delivery** (`data/community_data.json`).

The model is also explicitly forbidden in its instructions from:

- Inventing or estimating capacities, costs, savings, or programs.
- Modifying numbers it receives from upstream agents.
- Calling Indigenous Nations or governments "stakeholders".

---

## Known limitations

- **Simple payback excludes operations and maintenance.** Real-world payback typically extends 2–4 years longer than the figures Meridian shows. The brief discloses this in every Economics section.
- **Capital benchmarks are baseline.** The NL Hydro Hatch study values used in `tools/economics.py` do not include the "Arctic logistics premium" for shipping equipment to Nain or Natuashish (typically 1.5–2× baseline).
- **18 of 20 communities use estimated load data.** Only Nain and Natuashish are deep-build with fully-sourced figures. The other 18 are regional defaults pending verification against the CER NL profile.
- **No live API calls at runtime.** Wind/solar values are pre-cached. If a community's resource data is wrong in `community_data.json`, the model can't correct it.
- **Granite knowledge cutoff.** The model does not know about events or programs published after its training cutoff. The four federal programs are provided via RAG, but adjacent provincial programs (e.g., NL Hydro rebates) are out of scope unless added to the RAG corpus.

---

## Bias and fairness considerations

- **Equity multiplier is deliberate.** Indigenous-governed communities receive a 1.5× score multiplier in the Portfolio Planner. This is not the model's invention — it mirrors the federal Reducing Diesel program's explicit Indigenous-priority language. The multiplier value is user-adjustable via the dashboard's equity weight slider; setting it to zero removes the effect entirely.
- **Community-size bias.** With dollar-savings weighted, smaller communities can score lower per absolute return. The dashboard exposes the weights so the federal officer can rebalance toward absolute CO₂, equity, or cost as the conversation requires.
- **Geographic bias.** Two of the four funding programs (Reducing Diesel, IODI) require Indigenous governance, and one (Reducing Diesel) requires Labrador location. The three south-coast non-Indigenous outports (Francois, McCallum, La Poile) qualify only for CERRC. This is policy-level, not a model artefact.
- **The tool is not a substitute for consultation.** Meridian surfaces options and dollars. Actual project selection requires consent from the Nunatsiavut Government, NunatuKavut Community Council, or Mushuau Innu First Nation as appropriate. The tool flags this obligation; it does not simulate the conversation.

---

## Transparency and auditability

- **Every brief is regenerable from inputs.** Run `python scripts/run_batch.py --no-llm` and `briefs.json` rebuilds deterministically from `community_data.json` plus the Python templates. No hidden state.
- **Every number traces to a source.** See `data_sources.md` §8 for the cross-walk between code paths and authoritative sources.
- **LLM outputs are evaluated for drift.** `scripts/evaluate_briefs.py` checks every brief in `briefs.json` to confirm headline numbers in the rendered markdown match the structured fields verbatim. Run this before any demo recording.
- **Generation mode is recorded.** `briefs.json` includes `metadata.generation_mode` (`"fallback"` for the Python template path, `"llm"` for the Orchestrate-backed path). Reviewers can tell which path produced any given brief.
- **Agent profiles are version-controlled.** Each of the seven agents has its profile, instructions, model, and tools defined in `agents/*.md` — diff-able alongside code.

---

## Number-integrity self-check

> Meridian does **not** use IBM watsonx.governance. This check is the team's own deterministic
> Python — the mechanism behind the "numbers can't drift" guarantee.

The evaluation script `scripts/evaluate_briefs.py`:

- Output format: structured JSON in `governance/eval_briefs_report.json`.
- Metric: number_match_rate — fraction of headline numbers that appear verbatim in the rendered brief.
- Pass threshold: 100% in deterministic-fallback mode (Python templating); 95% suggested when wired to LLM-backed Brief Writer.
- Failure mode: any drift logs the field, the expected value, and the brief excerpt for review.

---

## Contact and review

- **Project repo:** this directory.
- **Reviewers:** the team's Brief Writer and Portfolio Planner outputs should be sanity-checked against the Nain validation case (`data/community_data.json` Nain record) before any external demo.
- **Updates:** this card should be re-issued whenever benchmarks in `tools/economics.py`, sizing rules in `tools/design.py`, or the equity multiplier in `tools/portfolio.py` change.
