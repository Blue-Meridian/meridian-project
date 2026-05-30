import { apiPost } from './client';
import type { PortfolioRanking } from '../lib/types';

export interface PortfolioRequest {
  budget_cad: number;
  weight_dollar: number;
  weight_co2: number;
  weight_equity: number;
}

export const rankPortfolio = (req: PortfolioRequest) =>
  apiPost<PortfolioRanking>('/portfolio/rank', req);
