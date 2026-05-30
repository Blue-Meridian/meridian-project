"""
Portfolio Planner's backing tool — ranks the 20 communities under a budget
and three weight sliders.

Score per community:

    score = w_$  · (annual_cost_saved_cad / capital_cost_point)
          + w_CO2 · (annual_co2_tonnes * 1000 / capital_cost_point)
          + w_eq · equity_multiplier

Equity multiplier is 1.5 for Indigenous-governed communities, 1.0 otherwise.

Weights are normalised to sum to 1 before scoring. After scoring, the 20
communities are sorted descending. Walking down the sorted list, capital
costs accumulate. A community is marked `fundable` as long as adding its
capital cost would not exceed the budget cap; otherwise its `fundable` is
false and it stays in the ranking for visibility.

Reads data/briefs.json (the output of scripts/run_batch.py). If briefs.json
is missing — typical pre-batch state — returns an empty ranking with an
error message rather than crashing.

/* USAGE:
    from tools.portfolio import rank_portfolio

    ranking = rank_portfolio(
        budget_cad=50_000_000,
        weight_dollar=0.4,
        weight_co2=0.4,
        weight_equity=0.2,
    )
    for row in ranking.ranked:
        flag = "✓" if row.fundable else " "
        print(f"{flag} {row.name:30s} score {row.score:.4f}")
*/
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from .schemas import PortfolioRanking, RankedCommunity

BRIEFS_PATH = Path(__file__).resolve().parent.parent / "data" / "briefs.json"


def _load_briefs() -> Dict:
    with open(BRIEFS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _normalise_weights(w_dollar: float, w_co2: float, w_equity: float) -> Dict[str, float]:
    total = w_dollar + w_co2 + w_equity
    if total <= 0:
        return {"dollar": 1 / 3, "co2": 1 / 3, "equity": 1 / 3}
    return {
        "dollar": w_dollar / total,
        "co2": w_co2 / total,
        "equity": w_equity / total,
    }


def rank_portfolio(
    budget_cad: int,
    weight_dollar: float = 0.4,
    weight_co2: float = 0.4,
    weight_equity: float = 0.2,
) -> PortfolioRanking:
    weights = _normalise_weights(weight_dollar, weight_co2, weight_equity)

    if not BRIEFS_PATH.exists():
        return PortfolioRanking(
            ranked=[],
            total_fundable_capital_cad=0,
            total_co2_avoided_tonnes=0,
            total_annual_cost_saved_cad=0,
            weights_used={k: round(v, 3) for k, v in weights.items()},
            error=(
                "data/briefs.json not found — run scripts/run_batch.py to "
                "pre-compute the 20 community briefs first."
            ),
        )

    data = _load_briefs()
    rows: List[Dict] = []
    for c in data["communities"]:
        ri = c.get("ranking_inputs", {})
        capital = int(c["economics"]["capital_cost_cad"]["point"])
        score = (
            weights["dollar"] * float(ri.get("dollar_per_dollar", 0.0))
            + weights["co2"] * float(ri.get("co2_per_dollar_kg", 0.0))
            + weights["equity"] * float(ri.get("equity_multiplier", 1.0))
        )
        rows.append(
            {
                "id": c["id"],
                "name": c["name"],
                "score": round(score, 4),
                "capital_cost": capital,
                "co2_avoided": int(c["economics"]["annual_co2_avoided_tonnes"]),
                "cost_saved": int(c["economics"]["annual_cost_saved_cad"]),
            }
        )

    rows.sort(key=lambda r: r["score"], reverse=True)

    cumulative = 0
    total_co2 = 0
    total_saved = 0
    ranked: List[RankedCommunity] = []

    for row in rows:
        prospective = cumulative + row["capital_cost"]
        fundable = prospective <= budget_cad
        if fundable:
            cumulative = prospective
            total_co2 += row["co2_avoided"]
            total_saved += row["cost_saved"]
        ranked.append(
            RankedCommunity(
                id=row["id"],
                name=row["name"],
                score=row["score"],
                fundable=fundable,
                cumulative_cost_cad=cumulative,
                capital_cost_cad=row["capital_cost"],
                annual_co2_avoided_tonnes=row["co2_avoided"],
                annual_cost_saved_cad=row["cost_saved"],
            )
        )

    return PortfolioRanking(
        ranked=ranked,
        total_fundable_capital_cad=cumulative,
        total_co2_avoided_tonnes=total_co2,
        total_annual_cost_saved_cad=total_saved,
        weights_used={k: round(v, 3) for k, v in weights.items()},
    )


if __name__ == "__main__":
    r = rank_portfolio(budget_cad=50_000_000)
    if r.error:
        print(r.error)
    else:
        print(f"Budget $50M, weights {r.weights_used}")
        print(f"Total fundable capital: ${r.total_fundable_capital_cad/1e6:,.1f}M")
        print(f"Total CO2 avoided/yr: {r.total_co2_avoided_tonnes:,} t")
        print(f"Total $ saved/yr: ${r.total_annual_cost_saved_cad/1e6:,.1f}M")
        print()
        for row in r.ranked:
            flag = "✓" if row.fundable else " "
            print(f"{flag} {row.name:30s} score {row.score:7.4f}  "
                  f"capex ${row.capital_cost_cad/1e6:6.1f}M")
