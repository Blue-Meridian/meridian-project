# Problem Statement — Project Meridian

**IBM × Memorial University watsonx Hackathon · Team Blue Meridian · May 29–31, 2026**

## The problem

Newfoundland and Labrador's main grid is about 97% hydroelectric. Twenty communities aren't on it — concentrated along the Labrador coast, plus a handful of island outports — and they make their electricity by burning diesel hauled or shipped in. That power is expensive, subsidized, dirty, and fragile. Five of those communities are in Nunatsiavut and ten in NunatuKavut, which makes the fix a reconciliation obligation as well as an energy one. A $220M federal program is already pointed at the problem, with a 2030 clean-power deadline.

The unmet question isn't *can it be done?* — the technology mix is known, and NL Hydro's 2020 Hatch study already identified wind + battery + reduced diesel as the lowest-cost option. The unmet question is **which communities first, and with how much of what?** Per-community pre-feasibility studies are slow and done one at a time. With twenty communities and a finite budget, a province-wide planner has to choose without all the studies in hand.

## What Meridian is

A two-layer agentic AI planner.

**Layer 1 — per community.** Pick a community, get a credible first-draft pre-feasibility brief: site resource assessment, system sizing (wind / solar / battery / retained diesel), capital cost estimate, diesel litres and CO2 avoided, payback period, and the federal/provincial programs the project would likely qualify for.

**Layer 2 — province-wide portfolio.** Run all twenty communities. Under a user-set budget and user-set priority weights (cost savings, CO2 avoided, equity), output a ranked rollout list — "with $X and these priorities, do these five first."

## Primary users

| User | What they use Meridian for | Layer |
|---|---|---|
| **NL Hydro resource planner** | First-draft engineering pre-feasibility for a specific community; faster than a months-long consultant cycle. | Layer 1 |
| **Federal program officer** (Natural Resources Canada / Indigenous Services Canada) | Allocate the $220M Reducing Diesel program across communities; defend the funding-round selection. | Layer 2 |

Both personas read the same per-community brief. The federal officer additionally sees the portfolio dashboard.

## Deliverables (locked)

1. **Layer 1 — Orchestrate chat flow.** The six agents run in the watsonx Orchestrate UI. The demo shows agents passing work. Output: a Markdown brief rendered in chat.
2. **Layer 1 — PDF export.** Each brief downloadable as a PDF. This is what an NL Hydro planner would actually hand off.
3. **Layer 2 — Custom dashboard.** NL map with 20 community pins. Click a pin → opens that community's brief. Budget slider re-runs the portfolio under the cap. Weight sliders for $ saved, CO2, and equity re-rank live.

## The six agents (locked)

| Agent | Role | Implementation |
|---|---|---|
| **Resource Scout** | Pulls wind and solar potential for the community's coordinates; characterizes the site qualitatively. | Python tool fetches Global Wind Atlas / NASA POWER. Granite interprets for the brief. |
| **System Designer** | Sizes wind + solar + battery + retained diesel using public sizing rules. | Python (deterministic). |
| **Number Cruncher** | Capital cost, diesel litres avoided, CO2 tonnes avoided, simple payback. | Python (deterministic), using NL Hydro Hatch study cost benchmarks. |
| **Grant Finder** | Reads federal/provincial program documents, matches eligibility, drafts a funding recommendation. | Granite + RAG over program pages. |
| **Brief Writer** | Assembles the project brief in plain language. | Granite, using computed numbers verbatim. |
| **Portfolio Planner** | Ranks 20 communities under the budget cap and weight settings. | Python optimizer. |

**Architectural rule:** numbers come from Python. Granite writes the prose around the numbers, reads program docs to match eligibility, and interprets resource data. No agent invents a number.

## Validation target

Meridian's recommendation for **Nain** matches the qualitative mix of the real diesel-reduction project already under construction: **wind + battery + reduced diesel**. Capacities are presented as ranges. The Nain slide says "Meridian recommends what's actually being built." That's the credibility anchor — no false precision, no surprise gotchas.

## Deep-build community scope

Two of the twenty communities get the full per-community brief with real cached data and the seven-section structure: **Nain** (Nunatsiavut, validation case) and **Natuashish** (Mushuau Innu First Nation, Indigenous-governance contrast). The remaining eighteen are populated with light estimates from cached resource data and a minimal sizing pass — enough to populate the portfolio dashboard, not enough to stand alone as full proposals.

## Funding programs in scope (Grant Finder RAG)

Four programs, each represented by their official program page plus a one-page distilled eligibility cheat sheet written from the source:

1. **Reducing Diesel Dependency in Isolated Labrador Communities** — $220M federal, Labrador-only, Indigenous-priority.
2. **Indigenous Off-Diesel Initiative (IODI)** — ISC/NRCan, national.
3. **Clean Energy for Rural and Remote Communities (CERRC)** — NRCan, off-grid clean energy.
4. **Smart Renewables and Electrification Pathways (SREPs)** — NRCan, larger clean energy projects.

## Public data sources

- **Wind and solar:** Global Wind Atlas (wind at 80m and 100m), NASA POWER or NRCan (solar irradiance).
- **Communities and diesel use:** Canada Energy Regulator NL profile; Natural Resources Canada NL Regional Energy and Resource Table; NL Hydro public filings to the Public Utilities Board.
- **Costs and sizing:** NL Hydro 2020 Hatch study (wind + battery + diesel benchmark costs).
- **Funding:** Government of Canada "Reducing Diesel Dependency in Isolated Labrador Communities" program page; Indigenous Off-Diesel Initiative; Smart Renewables and Electrification Pathways.
- **Reference cases:** Canada's National Observer coverage of the Nain microgrid; Pembina Institute's "Restoring the Flow" (Nunatsiavut 5 / NunatuKavut 10 breakdown).

## The 90-second demo (locked narrative)

**Problem (10 s).** 20 NL communities still burn diesel for electricity. Slow per-community studies, fragmented funding decisions.

**Solution (15 s).** Project Meridian — a six-agent planner that produces a first-draft pre-feasibility brief in under a minute, and ranks the whole province under a budget.

**Demo Layer 1 (25 s).** Pick Nain. Watch the six agents run in Orchestrate. The brief appears. "What Meridian recommends for Nain matches the real project being built there."

**Demo Layer 2 (25 s).** Switch to the dashboard. NL map with 20 pins. Slide the budget to $50M, watch the top five communities highlight. Pull the CO2 weight slider up — the ranking re-orders.

**Impact (15 s).** Collapses months of per-community consulting into minutes. Points real federal money at the highest-impact communities first.

## Out of scope (so the team does not drift)

- Detailed engineering design — we produce pre-feasibility, not bid-ready specs.
- Indigenous consultation modelling — we flag the obligation, we don't simulate the process.
- Storage technology selection beyond lithium-ion — the Hatch study assumed Li-ion; we follow.
- Tariff redesign and cost-of-service ratemaking.
- Live grid telemetry.
- Anything beyond the 20 named diesel-dependent communities.

## Pre-code decisions locked in this session

1. **Two users, two layers.** NL Hydro planner owns Layer 1. Federal program officer owns Layer 2. Both share the per-community brief.
2. **Three outputs.** Orchestrate chat, custom dashboard, PDF export per community.
3. **Split by agent.** Python owns the math (System Designer, Number Cruncher, Portfolio Planner). Granite owns the text (Resource Scout interpretation, Grant Finder RAG, Brief Writer prose). No agent invents a number.
4. **Qualitative Nain validation.** Same mix as the real project, capacities as ranges.
5. **User-adjustable portfolio weights.** Budget slider plus $ saved / CO2 / equity weight sliders on the dashboard. Ranking re-orders live.

## Open decisions for the build phase

- **Team allocation.** Who builds the dashboard, who builds the agents, who handles data, who owns the demo video. Decide tonight before any code is written.
- **Demo safety net.** If the dashboard isn't stable Sunday morning, what's the fallback — pre-recorded dashboard segment, or chat-only demo with map screenshots?
- **Brief Writer template.** Section structure for the per-community brief (executive summary, resource, system, economics, funding, risks).
- **Funding programs in scope.** Confirm secondary programs alongside the $220M Reducing Diesel program.
- **Pre-fetched vs live data.** Global Wind Atlas and NASA POWER calls at demo time vs cached values per community. Pre-cache recommended.

## Risks and protective moves

- **Dashboard scope.** It's the single biggest build item and the most demo-visible thing. Start it tonight. If it slips, fall back to a static map with a slider mockup that re-ranks from a precomputed table.
- **Hallucinated numbers on stage.** Mitigated by the "Python computes, Granite narrates" rule. Brief Writer prompts should inject computed numbers as verbatim values, never as instructions to estimate.
- **Public data API flakiness.** Cache every API call into a local JSON the agents read. Live calls aren't the demo's value proposition.
- **Indigenous framing.** Treat Nunatsiavut and NunatuKavut as governments, not "stakeholders." The federal-officer persona depends on this being right.

## How this maps to the judging rubric

| Category | Where Meridian earns the points |
|---|---|
| **Problem & Relevance (10)** | Specific, recognized NL problem. Named programs, named communities, named stakeholders. |
| **Innovation (10)** | Reframes slow one-off pre-feasibility as instant province-wide portfolio planning. User-adjustable weight sliders are the live "innovation moment." |
| **Technical Execution (10)** | Six-agent Orchestrate flow with watsonx.ai (Granite) reasoning and Python tools over real public data. Architectural split is defensible. |
| **Video & Communication (10)** | Problem → solution → demo → impact narrative built into the 90-second script. Nain credibility anchor and budget-slider moment are designed for the camera. |
| **Impact & Value (10)** | Quantified in litres of diesel, dollars, and CO2 tonnes. Believable pilot path through NL Hydro and the federal program officer. |
