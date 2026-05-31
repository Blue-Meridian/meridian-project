// Mirrors the Pydantic shapes in tools/schemas.py — keep in sync.

export interface Range {
  low: number;
  high: number;
}

export interface EconomicsRange {
  low: number;
  point: number;
  high: number;
}

export interface CommunityBrief {
  id: string;
  name: string;
  lat: number;
  lon: number;
  depth: 'deep' | 'light';
  region: string;
  indigenous: boolean;
  resource: {
    wind_speed_80m_mps: number;
    solar_ghi_kwh_m2_day: number;
    wind_quality?: string;
    solar_quality?: string;
  };
  system: {
    wind_kw: Range;
    solar_kw: Range;
    battery_kwh: Range;
    retained_diesel_kw: number;
    mix_label: string;
  };
  economics: {
    capital_cost_cad: EconomicsRange;
    annual_fuel_saved_litres: number;
    annual_cost_saved_cad: number;
    annual_co2_avoided_tonnes: number;
    payback_years: number;
  };
  funding: {
    eligible_programs: Array<{
      name: string;
      max_cad: number;
      eligibility_reasoning: string;
    }>;
    potential_coverage_cad: number;
    notes?: string;
  };
  validation: {
    real_project_exists: boolean;
    qualitative_match: boolean;
    real_project_summary: string;
  };
  ranking_inputs: {
    dollar_per_dollar: number;
    co2_per_dollar_kg: number;
    equity_multiplier: number;
  };
  brief_markdown: string;
}

export interface BriefsResponse {
  metadata: {
    schema_version: string;
    generation_mode: string;
    communities_total: number;
  };
  communities: CommunityBrief[];
}

export interface RankedCommunity {
  id: string;
  name: string;
  score: number;
  fundable: boolean;
  cumulative_cost_cad: number;
  capital_cost_cad: number;
  annual_co2_avoided_tonnes: number;
  annual_cost_saved_cad: number;
}

export interface PortfolioRanking {
  ranked: RankedCommunity[];
  total_fundable_capital_cad: number;
  total_co2_avoided_tonnes: number;
  total_annual_cost_saved_cad: number;
  weights_used: Record<string, number>;
  error?: string | null;
}
