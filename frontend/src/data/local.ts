// Local-first data layer.
//
// The 20 community briefs and the portfolio ranking are STATIC, deterministic
// artifacts (the backend itself bakes briefs.json into its Docker image at build
// time). Bundling the same JSON into the frontend means the map, briefs, and
// budget/weight sliders ALWAYS render — instantly, offline, even if the backend
// VM is asleep or unreachable. Only the live AI chat genuinely needs the backend.
//
// briefs.data.ts is copied from /data/briefs.json — the same single source of
// truth the backend serves.

import briefsJson from './briefs.data';
import type { BriefsResponse, PortfolioRanking, RankedCommunity } from '../lib/types';

export const LOCAL_BRIEFS = briefsJson as unknown as BriefsResponse;

/**
 * Port of api/portfolio.py `rank_portfolio` — identical scoring and greedy
 * budget walk, so the dashboard sliders produce the same ranking the backend
 * would, without a network round-trip.
 *
 *   score = w$·dollar_per_dollar + wCO2·co2_per_dollar_kg + wEq·equity_multiplier
 *
 * Weights are normalised to sum to 1; communities are sorted desc; walking the
 * sorted list, a community is `fundable` while cumulative capex ≤ budget.
 */
// Round to 4 dp, half-up. Avoids JS Math.round half-up vs Python banker's
// rounding diverging on exact 0.00005 boundaries (which would silently reorder
// tied communities at the budget margin). Inert on current data; correct for all.
const round4 = (n: number) => Math.floor(n * 1e4 + 0.5) / 1e4;

export function rankPortfolioLocal(
  budgetCad: number,
  wDollar = 0.4,
  wCo2 = 0.4,
  wEquity = 0.2,
): PortfolioRanking {
  const total = wDollar + wCo2 + wEquity;
  const weights =
    total <= 0
      ? { dollar: 1 / 3, co2: 1 / 3, equity: 1 / 3 }
      : { dollar: wDollar / total, co2: wCo2 / total, equity: wEquity / total };

  const rows = LOCAL_BRIEFS.communities.map((c) => {
    const ri = c.ranking_inputs ?? {
      dollar_per_dollar: 0,
      co2_per_dollar_kg: 0,
      equity_multiplier: 1,
    };
    // Match Python exactly: int() truncates toward zero; round(x, 4) below.
    const capital = Math.trunc(c.economics.capital_cost_cad.point);
    const score =
      weights.dollar * Number(ri.dollar_per_dollar ?? 0) +
      weights.co2 * Number(ri.co2_per_dollar_kg ?? 0) +
      weights.equity * Number(ri.equity_multiplier ?? 1);
    return {
      id: c.id,
      name: c.name,
      score: round4(score),
      capital_cost: capital,
      co2_avoided: Math.round(c.economics.annual_co2_avoided_tonnes),
      cost_saved: Math.round(c.economics.annual_cost_saved_cad),
    };
  });

  rows.sort((a, b) => b.score - a.score);

  let cumulative = 0;
  let totalCo2 = 0;
  let totalSaved = 0;
  const ranked: RankedCommunity[] = rows.map((row) => {
    const prospective = cumulative + row.capital_cost;
    const fundable = prospective <= budgetCad;
    if (fundable) {
      cumulative = prospective;
      totalCo2 += row.co2_avoided;
      totalSaved += row.cost_saved;
    }
    return {
      id: row.id,
      name: row.name,
      score: row.score,
      fundable,
      cumulative_cost_cad: cumulative,
      capital_cost_cad: row.capital_cost,
      annual_co2_avoided_tonnes: row.co2_avoided,
      annual_cost_saved_cad: row.cost_saved,
    };
  });

  return {
    ranked,
    total_fundable_capital_cad: cumulative,
    total_co2_avoided_tonnes: totalCo2,
    total_annual_cost_saved_cad: totalSaved,
    weights_used: {
      dollar: Math.round(weights.dollar * 1e3) / 1e3,
      co2: Math.round(weights.co2 * 1e3) / 1e3,
      equity: Math.round(weights.equity * 1e3) / 1e3,
    },
  };
}
