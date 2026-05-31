# Data Sources — Project Meridian

Every number, every community fact, and every funding criterion in Meridian comes from publicly available data. The hackathon requires it, and it's also the right thing — these are Indigenous-governed communities and a public energy system, and using anything but openly attributable sources would weaken both the credibility of the recommendations and the trust of the people the work is meant to serve.

This document is the canonical list. Each entry covers **who publishes it**, **what it tells us**, **how we use it in Meridian**, and **where to find it** in the codebase. If you add a source during the build, add it here too.

---

## 1. Community baseline data

The 20 NL diesel-dependent communities, their populations, governance, and current diesel load.

### 1.1 Pembina Institute — *Restoring the Flow: Newfoundland and Labrador*

- **Publisher:** Pembina Institute (Canadian non-profit energy policy think tank).
- **What it provides:** The authoritative breakdown of NL's diesel-dependent communities: 5 in Nunatsiavut (Inuit), ~10 in NunatuKavut (south Labrador), the central Labrador Innu community of Natuashish, and a handful of non-Indigenous south-coast outports.
- **Use in Meridian:** Source of truth for which 20 communities to include, their Indigenous governance affiliation, and the framing language we use for federal-program eligibility.
- **Where in code:** `data/community_data.json` (community list, governance fields).
- **Find it:** [pembina.org](https://www.pembina.org) — search "Restoring the Flow Newfoundland and Labrador".

### 1.2 Canada Energy Regulator (CER) — Renewable Power and Energy Profiles, NL

- **Publisher:** Canada Energy Regulator (federal Crown corporation).
- **What it provides:** Province-level energy profile. Establishes the headline numbers we use everywhere: NL's main grid is ~97% hydroelectric, and 20 communities run on isolated diesel systems totalling ~34 MW.
- **Use in Meridian:** Province-wide framing throughout the brief; the "97% hydro / 20 isolated" line used in every demo opener.
- **Where in code:** `data/community_data.json` metadata, every brief's executive summary via the Brief Writer agent.
- **Find it:** [cer-rec.gc.ca](https://www.cer-rec.gc.ca) — search "Newfoundland and Labrador profile".

### 1.3 Natural Resources Canada — NL Regional Energy and Resource Table

- **Publisher:** Natural Resources Canada (NRCan).
- **What it provides:** The federal-provincial planning table for NL's clean-energy transition. Documents the ~34 MW of isolated diesel load and confirms wind + battery + diesel as the lowest-cost architecture (citing the Hatch study, §3.1 below).
- **Use in Meridian:** Independent confirmation of the Hatch study's architecture finding, used in `agents/system_designer.md`'s sizing rationale.
- **Where in code:** `agents/system_designer.md` (cited in instructions); `data/funding_programs/iodi.md` (administering body).
- **Find it:** [natural-resources.canada.ca](https://natural-resources.canada.ca) — search "NL Regional Energy and Resource Table".

### 1.4 Newfoundland and Labrador Hydro — PUB Filings and Isolated Systems Reports

- **Publisher:** Newfoundland and Labrador Hydro (provincial utility) via the Board of Commissioners of Public Utilities (PUB).
- **What it provides:** Per-community average and peak diesel loads, annual fuel consumption, generator capacity, and delivered fuel costs. This is the only source for several of the small-community load figures used in `community_data.json`.
- **Use in Meridian:** Populates `current_diesel_kw_avg`, `current_diesel_kw_peak`, and `annual_diesel_litres` fields for each community. The delivered-diesel price of **CA $1.80/L** used in `tools/economics.py` is calibrated from NL Hydro PUB filings (conservative; actual delivered prices in remote Labrador have been higher in recent years).
- **Where in code:** `data/community_data.json`; `tools/economics.py` (`DIESEL_PRICE_CAD_PER_L`).
- **Find it:** [nlhydro.com](https://nlhydro.com) — Reports & Disclosures section. PUB filings: [pub.nl.ca](http://pub.nl.ca).

### 1.5 Statistics Canada — 2021 Census of Population

- **Publisher:** Statistics Canada (federal statistical agency).
- **What it provides:** Population counts for each NL community.
- **Use in Meridian:** Populates the `population` field in `community_data.json`. Indirectly feeds the Portfolio Planner's equity reasoning (smaller communities have less negotiating capacity, larger ones have more electoral weight).
- **Where in code:** `data/community_data.json` (`population` field per record).
- **Find it:** [www12.statcan.gc.ca](https://www12.statcan.gc.ca) — 2021 Census community profiles.

---

## 2. Renewable resource data

Wind and solar potential at each community's coordinates.

### 2.1 Global Wind Atlas

- **Publisher:** Technical University of Denmark (DTU) Wind Energy Department, in partnership with the World Bank.
- **What it provides:** Mean wind speed at 50 m, 80 m, 100 m, and 150 m above ground level for any latitude/longitude in the world. Free and CC-BY licensed.
- **Use in Meridian:** Source for `wind_speed_80m_mps` per community. The Resource Scout agent's "strong / moderate / weak" classification follows Global Wind Atlas's conventional thresholds (≥7 m/s strong, 5–7 moderate, <5 weak).
- **Where in code:** `data/community_data.json` (wind values), `tools/resource.py` (read path), `tools/design.py` (classification thresholds), `agents/resource_scout.md` (instructions cite the convention).
- **Find it:** [globalwindatlas.info](https://globalwindatlas.info).

### 2.2 NASA POWER

- **Publisher:** NASA Langley Research Center / NASA Earth Science Division.
- **What it provides:** Global Horizontal Irradiance (GHI), Direct Normal Irradiance (DNI), and other solar/meteorological data at ~0.5° resolution, from satellite + reanalysis. Free public API.
- **Use in Meridian:** Source for `solar_ghi_kwh_m2_day` per community. Confirms that all 20 NL communities have moderate-to-weak solar resource — typically 3.0–3.3 kWh/m²/day, well below the 4+ threshold for "strong" solar projects — which is why our sizing leans heavily on wind.
- **Where in code:** `data/community_data.json` (solar values), `tools/resource.py`, `agents/resource_scout.md`.
- **Find it:** [power.larc.nasa.gov](https://power.larc.nasa.gov).

### 2.3 Natural Resources Canada — Solar Resource Maps (alternate)

- **Publisher:** Natural Resources Canada.
- **What it provides:** Canada-specific solar resource maps and downloadable PV potential datasets, useful as a cross-check on NASA POWER values.
- **Use in Meridian:** Optional cross-reference; we use NASA POWER as the primary because it has a queryable API.
- **Find it:** [natural-resources.canada.ca](https://natural-resources.canada.ca) — search "photovoltaic potential and solar resource maps Canada".

---

## 3. Engineering and cost benchmarks

The actual numbers that turn community data into capital costs and payback figures.

### 3.1 NL Hydro 2020 Hatch Study — *Renewables in Isolated Systems*

- **Publisher:** Newfoundland and Labrador Hydro; study by Hatch (engineering consultancy).
- **What it provides:** The single most-cited document in Meridian. It analyses the cost and operational implications of integrating wind, solar, and battery storage into NL's 20 isolated diesel systems. Its headline finding — **wind + battery + reduced diesel is the lowest-cost off-diesel architecture for NL isolated communities** — is the architecture-level decision Meridian's System Designer agent encodes.
- **Use in Meridian:** Provides cost benchmarks for `tools/economics.py`:
  - Wind: **$3,200 / kW installed** (range $2,500–$4,000)
  - Solar: **$3,000 / kW installed** (range $2,500–$3,500)
  - Battery: **$900 / kWh installed** (range $700–$1,200)

  Also informs System Designer's sizing multipliers (wind kW = 1.5–3.5× average load depending on wind quality; battery kWh = ~4 hours of average load).
- **Where in code:** `tools/economics.py` (`WIND_COST_PER_KW`, `SOLAR_COST_PER_KW`, `BATTERY_COST_PER_KWH`); `tools/design.py` (sizing multipliers); `agents/system_designer.md` and `agents/brief_writer.md` (rationale prose).
- **Caveats:** These benchmarks are **baseline** installed costs; the real "Arctic logistics premium" for shipping equipment to Nain or Natuashish is typically 1.5–2×. We disclose this as a known understatement in `tools/economics.py`'s docstring.
- **Find it:** Search NL Hydro's site for "Renewables in Isolated Systems Hatch" — typically filed with the PUB.

### 3.2 Operational constants

These are not single sources but consensus values from environmental and economic reporting standards:

| Constant | Value | Source |
|---|---|---|
| Delivered diesel cost in remote NL | **CA $1.80/L** | NL Hydro PUB filings (conservative average) |
| CO₂ emission factor for diesel combustion | **2.68 kg CO₂/L** | IPCC Guidelines for National Greenhouse Gas Inventories; Canada's National Inventory Report (NIR) |
| Battery storage duration assumed | **4 hours** at average load | NREL hybrid-system reference architectures |
| Wind displacement fraction by quality | strong 65%, moderate 50%, weak 35% | NL Hydro Hatch 2020 study + NREL remote-microgrid case studies |

- **Where in code:** `tools/economics.py` (`DIESEL_PRICE_CAD_PER_L`, `CO2_KG_PER_L`, `DISPLACEMENT_BY_WIND`).

---

## 4. Federal funding programs

The four programs Grant Finder matches eligibility against. Each is documented in detail in `data/funding_programs/*.md`.

### 4.1 Reducing Diesel Dependency in Isolated Labrador Communities

- **Publisher:** Natural Resources Canada, with Indigenous Services Canada and Government of Newfoundland and Labrador.
- **Program size:** **$220 million** federal, announced Budget 2022.
- **Scope:** **Labrador only.** Indigenous-priority. Operates through partnership tables with the Innu Nation, Nunatsiavut Government, and NunatuKavut Community Council.
- **Use in Meridian:** Eligible for any Labrador-coast community with Indigenous governance. The headline program in the Layer 2 demo pitch.
- **Where in code:** `data/funding_programs/reducing_diesel.md`; `tools/funding.py` (`PROGRAMS[0]`); `scripts/run_batch.py` (`fallback_grant_finder`).
- **Find it:** [canada.ca](https://www.canada.ca) — search "Reducing Diesel Dependency Labrador".

### 4.2 Indigenous Off-Diesel Initiative (IODI)

- **Publisher:** Natural Resources Canada and Indigenous Services Canada.
- **Program size:** ~**$300 million** over 8 years across capacity and deployment streams.
- **Scope:** National. Indigenous-led projects in remote (off-grid) communities anywhere in Canada.
- **Use in Meridian:** Eligible for any Indigenous-governed community in scope. The "national reach" complement to Reducing Diesel.
- **Where in code:** `data/funding_programs/iodi.md`; `tools/funding.py` (`PROGRAMS[1]`).
- **Find it:** [natural-resources.canada.ca](https://natural-resources.canada.ca) — search "Indigenous Off-Diesel Initiative".

### 4.3 Clean Energy for Rural and Remote Communities (CERRC)

- **Publisher:** Natural Resources Canada.
- **Program size:** **~$453 million** across multiple intakes.
- **Scope:** National. Rural and remote communities — Indigenous **and** non-Indigenous. This is the only one of the four programs the south-coast island outports (Francois, McCallum, La Poile) are eligible for.
- **Use in Meridian:** Universal eligibility across the 20 communities by geographic scope; the broadest of the four programs.
- **Where in code:** `data/funding_programs/cerrc.md`; `tools/funding.py` (`PROGRAMS[2]`).
- **Find it:** [natural-resources.canada.ca](https://natural-resources.canada.ca) — search "CERRC".

### 4.4 Smart Renewables and Electrification Pathways (SREPs)

- **Publisher:** Natural Resources Canada.
- **Program size:** **~$2.2 billion** (expanded under Budget 2023).
- **Scope:** National. Utility-scale renewable energy, grid modernisation, and electrification. Relevant to Meridian only when project capital cost ≥ $5M or when proposals bundle multiple communities.
- **Use in Meridian:** Eligibility for larger projects (Nain class) and regional bundles. The "stretch" funding option.
- **Where in code:** `data/funding_programs/srep.md`; `tools/funding.py` (`PROGRAMS[3]`); `scripts/run_batch.py` `fallback_grant_finder` (capex ≥ $5M check).
- **Find it:** [natural-resources.canada.ca](https://natural-resources.canada.ca) — search "Smart Renewables Electrification Pathways".

---

## 5. Reference projects and validation cases

The real-world projects we use to ground Meridian's recommendations in observable fact.

### 5.1 Nain Microgrid Project

- **Publisher / project lead:** Newfoundland and Labrador Hydro, in partnership with the Nunatsiavut Government.
- **What it provides:** A currently-under-construction off-diesel project in Nain combining wind, battery storage, and reduced diesel backup. This is Meridian's validation anchor — the dashboard and demo can honestly say "Meridian's recommendation matches the project actually being built."
- **Use in Meridian:** Validation block in `data/community_data.json` (`real_project_status` for Nain), and the demo's "credibility moment" per `spec.md` §11.
- **Where in code:** `data/community_data.json` Nain record, `agents/brief_writer.md` validation instruction.
- **Find it:** Canada's National Observer coverage at [nationalobserver.com](https://www.nationalobserver.com) — search "Nain microgrid".

### 5.2 NL Hydro Solar Pilots — Hopedale and others

- **Publisher / project lead:** Newfoundland and Labrador Hydro.
- **What it provides:** Active solar installations in several Nunatsiavut communities (Hopedale and others), demonstrating that modest solar contributions are operationally viable in Labrador despite the weak solar resource.
- **Use in Meridian:** Real-project status note for Hopedale. The System Designer only adds solar to the mix for sites with moderate (≥3.5 kWh/m²/day) solar; NL's communities (3.0–3.3) sit below that, so the recommended mix is wind + battery + reduced diesel. The Hopedale pilot is a modest demonstration, not a sizing driver.
- **Where in code:** `data/community_data.json` Hopedale record (`real_project_status`).
- **Find it:** NL Hydro site, "Renewables in Isolated Systems" press releases.

---

## 6. Indigenous governance references

For terminology and formal governance structure. Meridian refers to Indigenous Nations as governments, not "stakeholders."

### 6.1 Nunatsiavut Government

- **Authority:** Constitutional Inuit self-government of Nunatsiavut (northern Labrador coast), established by the Labrador Inuit Land Claims Agreement (2005).
- **Communities in Meridian:** Nain, Hopedale, Makkovik, Postville, Rigolet.
- **Where referenced:** Every Indigenous-tagged record in `data/community_data.json` (`governance` field); `agents/brief_writer.md` instructions; `agents/portfolio_planner.md` equity-multiplier note.
- **Find it:** [nunatsiavut.com](https://www.nunatsiavut.com).

### 6.2 NunatuKavut Community Council

- **Authority:** Representative body for the NunatuKavut people (Inuit-descendant communities of south and central Labrador).
- **Communities in Meridian:** Black Tickle, Cartwright, Charlottetown, Norman Bay, Mary's Harbour, Port Hope Simpson, Lodge Bay, Pinsent's Arm, St. Lewis, Williams Harbour, Paradise River.
- **Where referenced:** South Labrador records in `data/community_data.json`; `agents/grant_finder.md` (eligibility logic uses governance field).
- **Find it:** [nunatukavut.ca](https://nunatukavut.ca).

### 6.3 Mushuau Innu First Nation

- **Authority:** Innu government of Natuashish, central Labrador coast.
- **Communities in Meridian:** Natuashish.
- **Where referenced:** Natuashish record in `data/community_data.json`; one of the two deep-build communities in Meridian, providing the Inuit/Innu governance contrast called out in `problem_statement.md`.
- **Find it:** [innu.ca](https://www.innu.ca) (Innu Nation umbrella site).

---

## 7. Platform and AI

Meridian uses **all four** IBM watsonx products available in the hackathon environment. Each does a distinct job.

### 7.1 IBM watsonx.ai Runtime

- **Publisher:** IBM Corporation.
- **What it provides:** The inference endpoint. Hosts foundation models — Meridian uses **`ibm/granite-3-8b-instruct`** as the default model for both the in-dashboard chat (via `/ml/v1/text/chat_stream`) and every Orchestrate-hosted specialist agent.
- **Where in code:** `dashboard/chat.py` (chat-side direct calls), `agents/*.md` (model id specified per agent profile), `.env` / `.env.example` (`WATSONX_URL`, `WATSONX_PROJECT_ID`, `WATSONX_MODEL_ID`).
- **Authentication:** IBM Cloud API key exchanged for short-lived IAM token at runtime (`dashboard/chat.py:_get_iam_token_cached`).

### 7.2 IBM watsonx.ai Studio

- **Publisher:** IBM Corporation.
- **What it provides:** The development environment for foundation models — Prompt Lab, project workspaces, RAG index builders. Meridian uses Studio's **Prompt Lab** to author and iterate every agent's system prompt before pasting the finalised version into Orchestrate.
- **Where in code:** `agents/*.md` — each agent's Instructions block is the artefact developed in Prompt Lab. The project workspace also hosts the Granite endpoint that Runtime serves.
- **Authentication:** Same IBM Cloud API key + project ID as Runtime.

### 7.3 IBM watsonx Orchestrate

- **Publisher:** IBM Corporation.
- **What it provides:** Multi-agent orchestration platform. Hosts the seven Meridian agents (Coordinator + 5 specialists + Portfolio Planner), the Layer 1 chat UI used in the demo, the Coordinator's collaborator graph, and Grant Finder's RAG knowledge documents.
- **Where in code:** `agents/*.md` (paste-ready definitions), `scripts/run_batch.py` (`llm_grant_finder` and `llm_brief_writer` REST stubs), `tools/api.py` (OpenAPI spec imported into the Orchestrate catalog).
- **Note:** Tools are exposed to Orchestrate via FastAPI's auto-generated OpenAPI; the LLM-mode batch script's REST stubs need to be wired to the team's specific Orchestrate REST URL pattern before LLM-backed batch generation works.

### 7.4 IBM watsonx.governance

- **Publisher:** IBM Corporation.
- **What it provides:** Model evaluation, monitoring, model cards, and audit trails for AI use cases. Meridian uses governance to guard against hallucinated numbers in Brief Writer outputs.
- **Where in code:**
  - `scripts/evaluate_briefs.py` — drift evaluation. Loops every brief and verifies that headline numbers in the rendered markdown match the structured fields verbatim. Outputs `governance/eval_briefs_report.json`.
  - `governance/model_card.md` — model card covering what the model decides, what it explicitly does not decide, known limitations, bias considerations, and the equity-multiplier framing.
  - `governance/eval_briefs_report.json` — generated audit report (created on first run of the eval script).
- **Thresholds:** 100% match required in fallback mode (Python templating); ≥ 95% in LLM-backed mode. Below threshold, the script exits non-zero and lists the drifted fields per community.
- **Why this matters:** maps directly to the hackathon rubric's "responsible, secure, and transparent AI" language and to the federal-program-officer persona's need for auditable recommendations.

---

## 8. Where each source is used (index)

Quick reference cross-walk for code review.

| Code path | Sources it depends on |
|---|---|
| `data/community_data.json` | Pembina, CER, NRCan, NL Hydro PUB, Statistics Canada, Global Wind Atlas, NASA POWER |
| `tools/resource.py` | Reads `community_data.json` (no live API calls) |
| `tools/design.py` | NL Hydro Hatch 2020 study (sizing multipliers + thresholds) |
| `tools/economics.py` | NL Hydro Hatch 2020 study (capex), NL Hydro PUB ($1.80/L), IPCC/NIR (2.68 kg/L) |
| `tools/funding.py` | Reducing Diesel, IODI, CERRC, SREPs program pages |
| `tools/portfolio.py` | Federal Reducing Diesel program (equity multiplier framing) |
| `data/funding_programs/*.md` | The four federal program pages, distilled into RAG cheat sheets |
| `agents/resource_scout.md` | Global Wind Atlas convention thresholds |
| `agents/system_designer.md` | NL Hydro Hatch 2020 study |
| `agents/brief_writer.md` | All upstream sources (cites Hatch, identifies Nain validation case) |
| `agents/grant_finder.md` | The four funding program cheat sheets (RAG knowledge documents) |
| `agents/portfolio_planner.md` | Federal program reconciliation framing (equity multiplier) |
| `dashboard/chat.py` | All grounded sources via the system prompt (the 20-community summary); watsonx.ai Runtime for inference |
| `dashboard/app.py` | `data/briefs.json` (regenerated from all of the above) |
| `scripts/evaluate_briefs.py` | `data/briefs.json` (per-field drift evaluation); writes `governance/eval_briefs_report.json` |
| `governance/model_card.md` | All upstream sources, model decisions, equity multiplier framing |

---

## 9. What's deliberately not a data source

The hackathon's data rules — and our own ethics — exclude:

- **Confidential or proprietary data.** No NL Hydro internal documents, no Vale operations data, no commercial energy-modelling outputs we didn't pay for or aren't licensed to redistribute.
- **Client or customer data.** None of the 20 communities' billing data, individual ratepayer records, or per-household energy use.
- **Personal information.** No names, no contact details, no household identifiers. Aggregate population only.
- **Indigenous traditional knowledge.** Meridian deliberately does **not** model or claim to represent community knowledge, land-use values, consultation outcomes, or community preferences. It surfaces options and dollars; the actual planning and consent process lives entirely with the Nunatsiavut Government, NunatuKavut Community Council, and Mushuau Innu First Nation. The tool flags the obligation; it does not simulate the conversation.
- **Social media or scraped non-licensed content.** Per the hackathon rules and as a basic practice.
- **Live API calls during the demo.** All external API data is pre-fetched into `data/community_data.json`; the runtime path is fully offline so demo reliability never depends on a third party.

---

## 10. Adding a new source

When the team adds a source during the build (or post-hackathon), it goes here. Pattern to follow:

1. Add the source under the right section (1–7).
2. Note the publisher, what it provides, and the URL.
3. Cross-reference the code path under §8.
4. If the source replaces or refines an existing one, note the change in `data/community_data.json`'s `metadata.source` field too.

The goal: anyone reviewing Meridian — judge, IBM mentor, prospective pilot — should be able to verify any number on screen against a source in this list within 30 seconds.
