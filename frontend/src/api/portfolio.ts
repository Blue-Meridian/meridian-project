import { apiPost } from './client';
import type { PortfolioRanking } from '../lib/types';
import { rankPortfolioLocal } from '../data/local';

export interface PortfolioRequest {
  budget_cad: number;
  weight_dollar: number;
  weight_co2: number;
  weight_equity: number;
}

/**
 * Ranking is pure deterministic math over the bundled briefs (see
 * rankPortfolioLocal — a 1:1 port of api/portfolio.py). We compute it locally so
 * the budget/weight sliders respond instantly and keep working when the backend
 * is unreachable. We still try the live API first for parity; on any failure we
 * fall back to the identical local computation.
 */
export const rankPortfolio = async (
  req: PortfolioRequest,
): Promise<PortfolioRanking> => {
  try {
    return await apiPost<PortfolioRanking>('/portfolio/rank', req);
  } catch {
    return rankPortfolioLocal(
      req.budget_cad,
      req.weight_dollar,
      req.weight_co2,
      req.weight_equity,
    );
  }
};
