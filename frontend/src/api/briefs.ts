import { apiGet } from './client';
import type { BriefsResponse, GovernanceReport } from '../lib/types';

export const fetchBriefs = () => apiGet<BriefsResponse>('/briefs');

export const fetchGovernanceReport = () =>
  apiGet<GovernanceReport>('/governance/report');
