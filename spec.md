# Spec — Project Meridian

**IBM × Memorial University watsonx Hackathon · Team Blue Meridian · May 29–31, 2026**

This is the developer-facing spec. Read `problem_statement.md` first for context, users, and rubric framing. This document covers architecture, agent definitions, tools, schemas, dashboard, demo, and the build sequence.

---

## 1. Architecture at a glance

```
                              ┌─────────────────────────────┐
                              │   Streamlit Dashboard       │
                              │   (pydeck map + sliders)    │
                              │   dashboard/app.py          │
                              └──────────────┬──────────────┘
                                             │ reads
                                  ┌──────────▼───────────┐
                                  │   data/briefs.json   │
                                  │   20 community       │
                                  │   pre-computed briefs│
                                  └──────────▲───────────┘
                                             │ written by
                       ┌─────────────────────┴───────────────────────┐
                       │      scripts/run_batch.py                    │
                       │      Calls the 5 specialist agents in order  │
                       │      for each of 20 communities via the      │
                       │      Orchestrate API                         │
                       └─────────────────────┬───────────────────────┘
                                             │
              ┌──────────────────────────────┴────────────────────────────┐
              │       watsonx Orchestrate (chat-side demo path)            │
              │                                                            │
              │   Coordinator Agent                                        │
              │      ↓ collaborators                                       │
              │   Resource Scout → System Designer → Number Cruncher       │
              │       → Grant Finder → Brief Writer                        │
              │                                                            │
              │   Portfolio Planner (standalone, Layer 2 chat queries)     │
              └────────────────────┬───────────────────────────────────────┘
                                   │
                                   │ each agent calls
                          ┌────────▼──────────┐
                          │  Python tools     │
                          │  (HTTP endpoints) │
                          │  tools/           │
                          └────────┬──────────┘
                                   │
                                   │ reads
                          ┌────────▼──────────────────┐
                          │ data/community_data.json   │
                          │ 20 records: lat/lon/load/  │
                          │ wind/solar/diesel/Indigenous│
                          └────────────────────────────┘
```

**Two demo paths share one source of truth.** The Streamlit dashboard reads `briefs.json`. The Orchestrate chat demo re-runs the same agents live, end-to-end, for whichever community the user names. Both paths use the same Python tools and the same cached `community_data.json`.

---

## 2. Project structure

```
meridian/
├── README.md
├── requirements.txt
├── .env                              # IBM Cloud API key, project ID, region
├── data/
│   ├── community_data.json           # 20 communities, cached inputs
│   ├── briefs.json                   # output of batch pre-compute
│   └── funding_programs/
│       ├── reducing_diesel.md        # cheat sheet + source URL
│       ├── iodi.md
│       ├── cerrc.md
│       └── srep.md
├── agents/                           # one markdown file per agent
│   ├── coordinator.md                # profile, instructions, model
│   ├── resource_scout.md
│   ├── system_designer.md
│   ├── number_cruncher.md
│   ├── grant_finder.md
│   ├── brief_writer.md
│   └── portfolio_planner.md
├── tools/                            # Python tools exposed to agents
│   ├── __init__.py
│   ├── resource.py                   # get_resource_data
│   ├── design.py                     # size_system
│   ├── economics.py                  # compute_economics
│   ├── funding.py                    # get_funding_programs
│   └── portfolio.py                  # rank_portfolio
├── scripts/
│   ├── prep_community_data.py        # one-time API pull → community_data.json
│   └── run_batch.py                  # 5 specialists × 20 communities → briefs.json
└── dashboard/
    ├── app.py                        # Streamlit app
    └── pdf.py                        # markdown → PDF via WeasyPrint
```

---

## 3. Data pipeline

### 3.1 community_data.json (input, 20 records, manually curated)

One record per community. Deep records (Nain, Natuashish) have every field filled from authoritative sources. The other 18 use light estimates from the Pembina "Restoring the Flow" report and the Canada Energy Regulator NL profile. The team writes this file by hand on Day 2 — it's the single source of input data and must be stable before any pre-compute runs.

Schema:

```json
{
  "communities": [
    {
      "id": "nain",
      "name": "Nain",
      "region": "Nunatsiavut",
      "governance": "Nunatsiavut Government",
      "indigenous": true,
      "indigenous_nation": "Inuit",
      "lat": 56.5419,
      "lon": -61.6864,
      "population": 1206,
      "current_diesel_kw_avg": 1200,
      "current_diesel_kw_peak": 2500,
      "annual_diesel_litres": 2800000,
      "wind_speed_80m_mps": 7.8,
      "solar_ghi_kwh_m2_day": 3.1,
      "fuel_delivery": "shipped",
      "real_project_status": "Under construction — NL Hydro Nain microgrid",
      "depth": "deep"
    }
    // ... 19 more
  ]
}
```

### 3.2 The pre-compute step (scripts/run_batch.py)

For each community in `community_data.json`:

1. Call `tools.resource.get_resource_data(community_id)` — returns the wind/solar fields.
2. Call `tools.design.size_system(community_id, resource)` — returns the wind/solar/battery/diesel ranges.
3. Call `tools.economics.compute_economics(community_id, sizing)` — returns capital cost / savings / CO2 / payback.
4. Call the **Grant Finder** Orchestrate agent over the four program docs — returns eligible programs and indicative coverage.
5. Call the **Brief Writer** Orchestrate agent with all prior outputs — returns the seven-section brief markdown.

Steps 1–3 are pure Python (no LLM). Steps 4–5 are Granite. The Coordinator agent is not used in batch — its job is the chat-side demo. Each community's combined output is appended to `data/briefs.json`.

Pre-compute runs once after `community_data.json` stabilizes, then re-runs whenever the brief template or any tool changes.

### 3.3 briefs.json (output, what the dashboard reads)

```json
{
  "communities": [
    {
      "id": "nain",
      "name": "Nain",
      "lat": 56.5419,
      "lon": -61.6864,
      "depth": "deep",
      "region": "Nunatsiavut",
      "indigenous": true,
      "resource": {
        "wind_speed_80m_mps": 7.8,
        "solar_ghi_kwh_m2_day": 3.1,
        "wind_quality": "strong",
        "solar_quality": "moderate"
      },
      "system": {
        "wind_kw": { "low": 600, "high": 1500 },
        "solar_kw": { "low": 200, "high": 500 },
        "battery_kwh": { "low": 400, "high": 1200 },
        "retained_diesel_kw": 800,
        "mix_label": "wind + battery + reduced diesel"
      },
      "economics": {
        "capital_cost_cad": {
          "low": 22000000,
          "point": 32000000,
          "high": 45000000
        },
        "annual_fuel_saved_litres": 1900000,
        "annual_cost_saved_cad": 4200000,
        "annual_co2_avoided_tonnes": 5100,
        "payback_years": 7.6
      },
      "funding": {
        "eligible_programs": [
          {
            "name": "Reducing Diesel Dependency in Isolated Labrador Communities",
            "max_cad": 18000000,
            "eligibility_reasoning": "Indigenous community in Labrador; pre-feasibility complete."
          }
        ],
        "potential_coverage_cad": 22000000
      },
      "validation": {
        "real_project_exists": true,
        "qualitative_match": true,
        "real_project_summary": "Nain microgrid under construction by NL Hydro; mix is wind + battery + reduced diesel."
      },
      "ranking_inputs": {
        "dollar_per_dollar": 0.131,
        "co2_per_dollar_kg": 0.159,
        "equity_multiplier": 1.5
      },
      "brief_markdown": "## Nain — Off-Diesel Pre-Feasibility Brief\n\n**Community:** Nain  \n**Governance:** Nunatsiavut Government (Inuit)  \n**Current diesel:** ~1,200 kW average, ~2.8M litres/year\n\n## Executive summary\n..."
    }
  ]
}
```

---

## 4. Agent specifications

All Granite-backed agents use **`granite-3-8b-instruct`** by default (fast, sufficient for this scope). Temperature: 0.2 for deterministic numeric work, 0.5 for Brief Writer prose. Max tokens: 1500 for specialists, 3000 for Brief Writer.

Each agent below lists: role, model, tools, knowledge, profile description, and instructions. The instructions are the literal system-prompt strings to paste into the Orchestrate agent's "Behavior → Instructions" field.

### 4.1 Coordinator

- **Model:** granite-3-8b-instruct
- **Tools:** none directly
- **Collaborators:** Resource Scout, System Designer, Number Cruncher, Grant Finder, Brief Writer
- **Profile:** _Project planner that builds off-diesel pre-feasibility briefs for Newfoundland and Labrador communities. Coordinates a five-agent team and returns a finished brief._
- **Instructions:**

```
You are the Coordinator for Project Meridian, a planner that produces
clean-energy pre-feasibility briefs for diesel-dependent communities in
Newfoundland and Labrador.

When the user names a community (e.g. "Nain", "Natuashish"), follow these
five steps in this exact order. Do not skip steps. Do not change the order.

  1. Ask Resource Scout for the community's wind and solar resource.
  2. Pass that result to System Designer for system sizing.
  3. Pass that result to Number Cruncher for economics.
  4. Pass community details and the cost estimate to Grant Finder for
     eligible funding programs.
  5. Pass all four prior results to Brief Writer to assemble the final
     seven-section brief.

Return the final brief to the user verbatim. Do not summarise it. Do not
modify any numbers from the specialist agents.

If the user asks about ranking communities under a budget, or "which
communities should we fund first", do not handle it yourself. Tell them
to ask Portfolio Planner.

If the user asks about a community not in scope, say so plainly and list
the 20 communities Meridian covers.
```

### 4.2 Resource Scout

- **Model:** granite-3-8b-instruct
- **Tools:** `get_resource_data(community_id) -> dict`
- **Profile:** _Site surveyor. Reports wind and solar potential at a community's coordinates._
- **Instructions:**

```
You characterize the renewable resource at a Newfoundland and Labrador
community. When asked about a community, call get_resource_data with the
community's id and return a structured JSON object with these fields
exactly:

  wind_speed_80m_mps      (float, from the tool)
  solar_ghi_kwh_m2_day    (float, from the tool)
  wind_quality            (one of: "strong", "moderate", "weak")
  solar_quality           (one of: "strong", "moderate", "weak")
  characterization        (one sentence describing the site)

Quality thresholds (Global Wind Atlas convention):
  wind: strong ≥ 7 m/s, moderate 5–7, weak < 5
  solar: strong ≥ 4 kWh/m²/day, moderate 3.5–4, weak < 3.5

Do not invent numbers. If the tool returns nothing, say so.
```

### 4.3 System Designer

- **Model:** granite-3-8b-instruct
- **Tools:** `size_system(community_id, wind_quality, solar_quality) -> dict`
- **Profile:** _Engineer. Sizes the wind, solar, battery, and retained-diesel mix using public sizing rules._
- **Instructions:**

```
You size off-diesel hybrid systems for NL communities. When given resource
data, call size_system and return the result as a structured JSON object
with these fields:

  wind_kw            ({"low": int, "high": int})
  solar_kw           ({"low": int, "high": int})
  battery_kwh        ({"low": int, "high": int})
  retained_diesel_kw (int)
  mix_label          (string, e.g. "wind + battery + reduced diesel")
  sizing_rationale   (1–2 sentences citing NL Hydro Hatch 2020 study)

Do not invent numbers. All values come from the size_system tool. The
sizing rationale should reference the Hatch study finding that wind +
battery + diesel is the lowest-cost off-diesel architecture for NL
isolated systems.
```

### 4.4 Number Cruncher

- **Model:** granite-3-8b-instruct
- **Tools:** `compute_economics(community_id, sizing) -> dict`
- **Profile:** _Accountant. Computes capital cost, fuel saved, CO2 avoided, and payback._
- **Instructions:**

```
You compute the economics of an off-diesel project. When given a system
sizing, call compute_economics and return the result as a structured JSON
object with these fields:

  capital_cost_cad         ({"low": int, "point": int, "high": int})
  annual_fuel_saved_litres (int)
  annual_cost_saved_cad    (int)
  annual_co2_avoided_tonnes (int)
  payback_years            (float, one decimal place)

Do not invent or round numbers. Return what the tool gives you verbatim.
```

### 4.5 Grant Finder

- **Model:** granite-3-8b-instruct
- **Tools:** `get_funding_programs() -> list`
- **Knowledge base:** the four funding-program markdown files in
  `data/funding_programs/` (each loaded as a knowledge document in
  Orchestrate)
- **Profile:** _Grant writer. Matches a project profile against active federal funding programs._
- **Instructions:**

```
You identify federal funding programs an off-diesel project would likely
qualify for. The four programs in your knowledge base are:

  1. Reducing Diesel Dependency in Isolated Labrador Communities ($220M federal, Labrador-only, Indigenous priority)
  2. Indigenous Off-Diesel Initiative (IODI)
  3. Clean Energy for Rural and Remote Communities (CERRC)
  4. Smart Renewables and Electrification Pathways (SREPs)

Given a community's Indigenous governance status, region (Labrador vs
island), and capital cost estimate, decide which programs apply. Read
the eligibility criteria in your knowledge base — do not guess.

Return a structured JSON object:

  eligible_programs (list of {name, max_cad, eligibility_reasoning})
  potential_coverage_cad (sum of max_cad across eligible programs,
                          capped at the project's capital cost)
  notes (one sentence on any caveats, e.g. competitive vs guaranteed)

If a community is not in Labrador, do not list the Reducing Diesel
program. If a community is not Indigenous, do not list IODI.
```

### 4.6 Brief Writer

- **Model:** granite-3-8b-instruct (temperature 0.5)
- **Tools:** none
- **Profile:** _Report writer. Turns the analysis into a seven-section project brief._
- **Instructions:**

```
You assemble a project brief from the outputs of Resource Scout, System
Designer, Number Cruncher, and Grant Finder. The brief is read by NL
Hydro resource planners and federal program officers. Tone is
professional, plain English, no jargon.

Write seven sections in markdown, in this order, with these H2 headings:

  ## Header
    Community name, governance, current diesel kW average, annual litres.

  ## Executive Summary
    One paragraph. Proposed mix, headline savings (annual $ saved, tonnes
    CO2 avoided, litres diesel displaced), payback years.

  ## Resource Snapshot
    Wind speed at 80m, solar GHI, qualitative characterization, data source.

  ## Proposed System
    Wind kW range, solar kW range, battery kWh range, retained diesel kW.
    Cite the NL Hydro Hatch 2020 study for the architecture choice.

  ## Economics
    Capital cost (low / point / high), annual fuel and dollar savings,
    annual CO2 avoided, simple payback.

  ## Funding Match
    Each eligible program: name, indicative coverage, one-sentence
    eligibility reasoning.

  ## Validation / Next Steps
    For Nain: "Meridian's recommendation matches the real Nain microgrid
    project currently under construction." For other deep-build
    communities: "Preliminary; requires confirmation against the
    community load profile."

Hard rules:

  - Use the numbers given to you verbatim. Do not round, restate, or
    estimate.
  - Total length: 500–700 words.
  - Use Canadian spelling.
  - Refer to Indigenous communities by their governance (Nunatsiavut
    Government, Mushuau Innu First Nation, NunatuKavut Community
    Council), not as "stakeholders".
```

### 4.7 Portfolio Planner

- **Model:** granite-3-8b-instruct
- **Tools:** `rank_portfolio(budget_cad, weight_dollar, weight_co2, weight_equity) -> dict`
- **Profile:** _Managing partner. Ranks the 20 communities under a budget and weights, sequences the rollout._
- **Instructions:**

```
You rank the 20 NL diesel-dependent communities for a given funding
round. When asked, call rank_portfolio with the user's budget cap and
three weight values (dollar savings, CO2 avoided, equity).

Default weights if the user does not specify: 0.4 / 0.4 / 0.2.

Return the ranked list as a structured JSON object and a one-paragraph
plain-English explanation: which communities the budget covers, the
total CO2 avoided and dollar savings, and one sentence on why those
communities ranked highest under the current weights.

Do not modify the tool's output. If the budget is below the lowest
project cost, say so plainly.
```

---

## 5. Tool inventory

All tools live in `tools/` as Python modules. Each exposes a single top-level function. Tools are registered in Orchestrate via OpenAPI specs (auto-generated from FastAPI, see §10).

### 5.1 `tools.resource.get_resource_data(community_id: str) -> dict`

Reads `data/community_data.json`, returns:

```python
{
  "wind_speed_80m_mps": float,
  "solar_ghi_kwh_m2_day": float,
  "lat": float,
  "lon": float,
  "current_diesel_kw_avg": int,
  "annual_diesel_litres": int,
  "population": int,
  "region": str,
  "governance": str
}
```

### 5.2 `tools.design.size_system(community_id: str, wind_quality: str, solar_quality: str) -> dict`

Applies sizing rules from the NL Hydro Hatch 2020 study:

- **Wind kW:** average load × {1.0 (weak), 1.5–2.5 (moderate), 2.0–3.5 (strong)}.
- **Solar kW:** average load × {0 (weak), 0.3–0.6 (moderate), 0.5–1.0 (strong)}. NL's solar resource (3.0–3.3 kWh/m²/day) is weak across the board, so the engine sizes no solar.
- **Battery kWh:** average load × 4 hours of storage, low/high ranges = ±25%.
- **Retained diesel kW:** 60–80% of current peak diesel capacity (backup for storm/long-calm events).
- **Mix label:** always "wind + battery + reduced diesel" unless solar is moderate, in which case "wind + solar + battery + reduced diesel". With NL's weak solar (< 3.5 kWh/m²/day everywhere), all 20 communities resolve to "wind + battery + reduced diesel" — matching the Hatch study and the real Nain project.

Returns the JSON shape described in §4.3.

### 5.3 `tools.economics.compute_economics(community_id: str, sizing: dict) -> dict`

Cost benchmarks from the Hatch study:

- Wind: $3,200/kW installed (range $2,500–$4,000).
- Solar: $3,000/kW installed (range $2,500–$3,500).
- Battery: $900/kWh installed (range $700–$1,200).
- Diesel cost delivered: $1.80/L (NL Hydro PUB filings, conservative).
- Diesel emission factor: 2.68 kg CO2 per litre.

Algorithm:

1. Capital cost = wind*kw_point × wind*$/kW + solar_kw_point × solar_$/kW + battery*kwh_point × battery*$/kWh.
2. Annual fuel saved (litres) = current_annual_litres × estimated displacement fraction (0.65 for strong wind, 0.50 for moderate, 0.35 for weak).
3. Annual $ saved = fuel saved × $1.80.
4. Annual CO2 avoided (tonnes) = fuel saved × 2.68 / 1000.
5. Payback years = capital*cost_point / annual*$\_saved.

Return JSON shape from §4.4.

### 5.4 `tools.funding.get_funding_programs() -> list`

Returns the four programs as structured metadata. Grant Finder's RAG handles the eligibility text — this tool just provides the canonical name, URL, max award, and a 1-line summary for each.

### 5.5 `tools.portfolio.rank_portfolio(budget_cad: int, weight_dollar: float, weight_co2: float, weight_equity: float) -> dict`

Reads `data/briefs.json`. Normalises the three weights to sum to 1. For each community computes:

```python
score = (
    weight_dollar * (annual_cost_saved_cad / capital_cost_point) +
    weight_co2 * (annual_co2_avoided_tonnes * 1000 / capital_cost_point) +
    weight_equity * equity_multiplier
)
```

(The CO2 normalisation puts dollar and CO2 contributions on roughly comparable scales — both end up around 0.1–0.2 typically. Tune in build if needed.)

Sort all 20 by score descending. Walk down the list, accumulating capital_cost_point. Communities are marked `fundable: true` until cumulative cost would exceed the budget. Returns:

```python
{
  "ranked": [{"id": str, "name": str, "score": float, "fundable": bool,
              "cumulative_cost_cad": int}, ...],
  "total_fundable_capital_cad": int,
  "total_co2_avoided_tonnes": int,
  "total_annual_cost_saved_cad": int,
  "weights_used": {"dollar": float, "co2": float, "equity": float}
}
```

The Streamlit dashboard imports this function directly (no HTTP hop) for sub-200ms slider response. The Orchestrate Portfolio Planner agent calls the same function via the HTTP wrapper.

---

## 6. Knowledge bases (Grant Finder RAG)

Each of the four programs gets its own markdown file in `data/funding_programs/`. The file structure is fixed:

```markdown
# <Program Name>

**Administering body:** <e.g. Natural Resources Canada>
**Source URL:** <official program page>
**Total fund:** <if known>
**Per-project max:** <if known>
**Geographic scope:** <e.g. Labrador only, all of Canada>

## Who is eligible

<bullet list of eligibility criteria, distilled from the source page>

## What's funded

<what costs the program covers — capital, feasibility studies, etc.>

## Application timing

<deadlines, rolling intake, etc.>

## Key caveats

<anything Grant Finder needs to know to avoid false matches>
```

These files are uploaded as knowledge documents to the Grant Finder agent in Orchestrate. The source URL is also captured so the brief can cite it.

---

## 7. Streamlit dashboard

`dashboard/app.py`. Single-page Streamlit app reading `data/briefs.json` on startup.

### 7.1 Layout

- **Title bar:** "Project Meridian — NL Off-Diesel Portfolio Planner".
- **Sidebar:**
  - Budget slider: $0 – $300M, step $5M, default $50M.
  - "Priority weights" section:
    - `$ savings per dollar` slider: 0–1, default 0.4.
    - `CO2 avoided per dollar` slider: 0–1, default 0.4.
    - `Equity (Indigenous-governed)` slider: 0–1, default 0.2.
    - A small caption: "Weights are normalised to sum to 1."
- **Main column, top:** pydeck `ScatterplotLayer` over an NL basemap. 20 community pins.
  - Pin colour: green if `fundable`, gray if not.
  - Pin radius: scaled by score.
  - Tooltip on hover: name, region, score, capital cost, fundable status.
- **Main column, middle:** summary tiles — total fundable capital, total CO2 avoided, total annual $ saved.
- **Main column, lower:** ranked list (st.dataframe) — community, region, score, capital cost, annual $ saved, CO2 avoided, payback, fundable.
- **Detail panel:** clicking a row (or pin) sets `st.session_state.selected_id`. Below the table, render the selected community's full `brief_markdown` and a **Download PDF** button.

### 7.2 State and re-render

Each slider change triggers Streamlit's re-run. The dashboard calls `tools.portfolio.rank_portfolio(...)` with the current slider values and re-renders the map + table. The brief detail re-renders only when `selected_id` changes. Sub-200ms total for 20 records.

### 7.3 pydeck specifics

Use `pydeck.Deck` with `map_style="mapbox://styles/mapbox/light-v10"` if Mapbox token available, otherwise `pydeck.map.Carto` light style (no token needed — safer for the demo). View state centered on Labrador (`lat=54.0, lon=-60.5, zoom=4.5`).

---

## 8. PDF generation

`dashboard/pdf.py` exports a single function:

```python
def brief_to_pdf(brief_markdown: str, community_name: str) -> bytes:
    ...
```

Implementation: `markdown` library converts the markdown to HTML, `WeasyPrint` renders the HTML to PDF bytes. A minimal embedded stylesheet (max ~30 lines of CSS) styles H2 headings, applies a header band with the community name, and sets margins. No fancy typography — readable and recognizable as a project brief.

Returned bytes are passed to `st.download_button(data=pdf_bytes, file_name=f"{community_name}_Meridian_Brief.pdf", mime="application/pdf")`.

Fallback if WeasyPrint won't install: return the markdown itself as `.md` for download. Don't sink the dashboard over a print-library install.

---

## 9. The 20 communities

Authoritative list to seed `community_data.json`. Confirm exact spelling against the CER NL profile in build phase. Indigenous governance per Pembina "Restoring the Flow":

| #   | Community         | Region                       | Governance                     | Depth |
| --- | ----------------- | ---------------------------- | ------------------------------ | ----- |
| 1   | Nain              | Nunatsiavut (north Labrador) | Nunatsiavut Government (Inuit) | deep  |
| 2   | Hopedale          | Nunatsiavut                  | Nunatsiavut Government (Inuit) | light |
| 3   | Makkovik          | Nunatsiavut                  | Nunatsiavut Government (Inuit) | light |
| 4   | Postville         | Nunatsiavut                  | Nunatsiavut Government (Inuit) | light |
| 5   | Rigolet           | Nunatsiavut                  | Nunatsiavut Government (Inuit) | light |
| 6   | Natuashish        | Central Labrador             | Mushuau Innu First Nation      | deep  |
| 7   | Black Tickle      | South Labrador               | NunatuKavut Community Council  | light |
| 8   | Cartwright        | South Labrador               | NunatuKavut Community Council  | light |
| 9   | Charlottetown     | South Labrador               | NunatuKavut Community Council  | light |
| 10  | Norman Bay        | South Labrador               | NunatuKavut Community Council  | light |
| 11  | Mary's Harbour    | South Labrador               | NunatuKavut Community Council  | light |
| 12  | Port Hope Simpson | South Labrador               | NunatuKavut Community Council  | light |
| 13  | Lodge Bay         | South Labrador               | NunatuKavut Community Council  | light |
| 14  | Pinsent's Arm     | South Labrador               | NunatuKavut Community Council  | light |
| 15  | St. Lewis         | South Labrador               | NunatuKavut Community Council  | light |
| 16  | Williams Harbour  | South Labrador               | NunatuKavut Community Council  | light |
| 17  | Paradise River    | South Labrador               | NunatuKavut Community Council  | light |
| 18  | Francois          | South coast NL (island)      | non-Indigenous outport         | light |
| 19  | McCallum          | South coast NL (island)      | non-Indigenous outport         | light |
| 20  | La Poile          | South coast NL (island)      | non-Indigenous outport         | light |

If the CER profile shows different communities or counts, the team adjusts the table during the prep step. The exact mix of NunatuKavut and outport communities can vary by source.

---

## 10. Orchestrate registration

Each Python tool is exposed via a small FastAPI server (`tools/api.py`) that wraps the underlying functions. FastAPI auto-generates an OpenAPI spec at `/openapi.json`. The team imports each tool into Orchestrate via the Catalog → Tools → Import → OpenAPI URL flow.

For the batch script, the same Python functions are called directly (no HTTP hop). Only the chat-side agents go through the FastAPI layer.

Agent definitions are imported into Orchestrate via the agent builder UI. Each agent's profile description, instructions, model, and tools are configured per §4.

---

## 11. Demo storyboard (90 seconds)

| t    | Visual                                                                                                                                               | Voiceover                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0:00 | Title card — Project Meridian, Team Blue Meridian                                                                                                    | —                                                                                                          |
| 0:05 | Pembina-style map of NL with 20 diesel-only communities highlighted                                                                                  | "Twenty communities in Newfoundland and Labrador still burn diesel for electricity."                       |
| 0:15 | Same map zooms into Labrador coast                                                                                                                   | "Most are Indigenous. All are on a federal commitment to be clean-powered by 2030."                        |
| 0:25 | Cut to watsonx Orchestrate chat. User types "Build a clean energy plan for Nain."                                                                    | "Today, planning each community takes months. Meridian does it in under a minute."                         |
| 0:35 | Coordinator agent's reply card appears; then Resource Scout's card, then System Designer, then Number Cruncher, then Grant Finder, then Brief Writer | "Six agents collaborate live. Resource. Sizing. Economics. Funding. The brief."                            |
| 0:55 | Final brief renders. Highlight the recommendation line                                                                                               | "Recommendation: wind, battery, reduced diesel — the exact mix being built at Nain right now by NL Hydro." |
| 1:05 | Cut to Streamlit dashboard, full NL map with 20 pins                                                                                                 | "Layer two: the whole province. Set a budget. Set your priorities."                                        |
| 1:15 | Hand drags the budget slider from $100M to $30M; some pins turn gray                                                                                 | "At thirty million, three communities can be funded this round."                                           |
| 1:25 | Hand drags the CO2 weight up; ranking shifts; map updates                                                                                            | "Re-weight toward climate impact. Different communities come to the front."                                |
| 1:30 | End card with team name + IBM × MUN logos                                                                                                            | "Meridian. Months of consulting, in minutes. Federal money, where it matters most."                        |

Record the chat demo and the dashboard demo as separate screen captures, edit in post. Both demos can be re-run live for judges' Q&A.

---

## 12. Build sequence (order of operations, no team assignments)

1. **community_data.json.** Hand-write all 20 records. Nain and Natuashish get every field from authoritative sources (Pembina + CER + NL Hydro). The other 18 get plausible values based on regional defaults. Nothing else can start until this file is stable.
2. **Python tools.** Implement and unit-test `resource.py`, `design.py`, `economics.py`, `funding.py`. Run each on Nain inputs; verify outputs feel right against the published Nain project profile.
3. **FastAPI wrapper + OpenAPI export.** Spin up the local FastAPI server for the four runtime tools (resource, design, economics, funding). Confirm the OpenAPI spec loads.
4. **Funding cheat sheets.** Write the four markdown files in `data/funding_programs/`. Pull eligibility text verbatim from each program page.
5. **Orchestrate agents.** Create the seven agents in the Orchestrate UI per §4. Wire collaborators. Import tools via OpenAPI URLs. Upload Grant Finder's knowledge documents.
6. **End-to-end chat test.** In Orchestrate chat, ask the Coordinator about Nain. Walk through the agent handoffs. Iterate on instructions until the brief renders correctly.
7. **Batch pre-compute.** Write `scripts/run_batch.py`. Run it. Inspect `briefs.json`. Confirm 20 valid records.
8. **Portfolio tool.** Implement `tools.portfolio.rank_portfolio`. Test against `briefs.json` with several budgets and weight combos.
9. **Streamlit dashboard.** Build `dashboard/app.py`. Wire map, sliders, table, detail panel. Confirm slider response time.
10. **PDF export.** Implement `dashboard/pdf.py`. Wire the download button.
11. **Demo recording.** Record both demo paths per §11.
12. **Submission.** Final cuts, sources slide, IBMid sign-off.

Steps 1, 4 unblock 2, 5. Step 9 only needs step 7 done. Several streams can run in parallel.

---

## 13. Risks and fallbacks

- **Orchestrate Coordinator skips or reorders steps.** Tighten the instructions to repeat the ordering rule. If still flaky, fall back to a Python script invocation pattern: Coordinator's tool is a single `run_pipeline(community_id)` call that returns the assembled brief. Less visibly agentic, but reliable for the demo.
- **Granite invents a number in the brief.** Brief Writer's instructions forbid this and the values are passed verbatim from prior agents. If a hallucination appears in testing, switch Brief Writer to a template-substitution mode: Python builds the markdown from a Jinja-like template, Granite only writes the executive summary paragraph.
- **WeasyPrint won't install.** Fall back to markdown-only download. Skip the PDF.
- **pydeck map fails to render in the demo environment.** Fall back to `st.map` (basic Streamlit map). Lose the visual polish, keep the data.
- **Public data API flakes during prep.** Cache every fetched value into `community_data.json` as soon as it's retrieved. Live API calls are not part of the runtime path.
- **Dashboard isn't visually polished by Sunday morning.** Lock the demo to chat-only with a precomputed map screenshot showing the budget effect. Layer 2 narrated over the screenshot, not interactive on stage.
- **Brief generation slower than expected during batch.** Pre-compute can run overnight or before the demo. It's not on the critical path of the live chat demo.

---

## 14. Out-of-scope reminders (from problem_statement.md)

- Detailed engineering design (pre-feasibility only).
- Indigenous consultation modelling (we flag the obligation, not simulate the process).
- Storage technology beyond lithium-ion.
- Tariff redesign and cost-of-service.
- Live grid telemetry.
- Communities outside the 20.

If any of these creep in during build, push back hard. Scope discipline is the protective decision the team made on day two.

---

## 15. References

**Data and modelling sources**

- Canada Energy Regulator — Renewable Power and Energy Profiles, NL.
- Natural Resources Canada — NL Regional Energy and Resource Table.
- Newfoundland and Labrador Hydro — Renewables in Isolated Systems (Hatch 2020 study).
- Government of Canada — Reducing Diesel Dependency in Isolated Labrador Communities.
- Pembina Institute — Restoring the Flow: NL.
- Canada's National Observer — Nain microgrid coverage.
- Global Wind Atlas — wind speed at 80m and 100m.
- NASA POWER — solar GHI.

**Library and platform documentation**

- IBM watsonx Orchestrate — agents, tools, knowledge bases, Coordinator pattern.
- IBM watsonx.ai — Granite 3 model family, Prompt Lab, API reference.
- Streamlit — Sidebar widgets, st.dataframe, st.download_button.
- pydeck — ScatterplotLayer, Deck, view state.
- WeasyPrint — markdown → HTML → PDF rendering.
- FastAPI — auto-generated OpenAPI specs for tool registration.
