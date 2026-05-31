import { apiGet } from './client';
import type { BriefsResponse, GovernanceReport } from '../lib/types';
import { LOCAL_BRIEFS, LOCAL_GOVERNANCE } from '../data/local';

/**
 * Briefs + governance are static, deterministic artifacts bundled into the app
 * (see src/data/local.ts). We serve the local copy first so the dashboard always
 * renders instantly — even when the backend VM is cold or unreachable — then try
 * the live API and prefer it only if it actually responds. The live copy is the
 * same data, so a failure is a no-op, not a broken UI.
 */
export const fetchBriefs = async (): Promise<BriefsResponse> => {
  try {
    return await apiGet<BriefsResponse>('/briefs');
  } catch {
    return LOCAL_BRIEFS;
  }
};

export const fetchGovernanceReport = async (): Promise<GovernanceReport> => {
  try {
    return await apiGet<GovernanceReport>('/governance/report');
  } catch {
    return LOCAL_GOVERNANCE;
  }
};
