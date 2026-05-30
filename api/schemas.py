"""
Pydantic schemas — the contracts between agents, tools, batch, and dashboard.

These models are the single source of truth for the JSON shapes documented in
spec.md §3 and §4. The FastAPI service uses them as request/response models;
the dashboard imports them to validate `briefs.json` at load time.

/* USAGE:
    from tools.schemas import (
        ResourceData, SystemSizing, Economics, FundingProgram,
        PortfolioRanking, Range, EconomicsRange,
    )

    # Parse a dict (e.g. from JSON) into a typed model
    sizing = SystemSizing.model_validate(some_dict)
    print(sizing.wind_kw.low, sizing.wind_kw.high)

    # Serialise back to a dict for the next agent
    payload = sizing.model_dump()
*/
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Range(BaseModel):
    """Low/high range for sizing fields (kW, kWh)."""

    low: int
    high: int


class EconomicsRange(BaseModel):
    """Low/point/high range for capital cost."""

    low: int
    point: int
    high: int


class ResourceData(BaseModel):
    """What Resource Scout returns for a community."""

    wind_speed_80m_mps: float
    solar_ghi_kwh_m2_day: float
    lat: float
    lon: float
    current_diesel_kw_avg: int
    annual_diesel_litres: int
    population: int
    region: str
    governance: str


class SystemSizing(BaseModel):
    """What System Designer returns."""

    wind_kw: Range
    solar_kw: Range
    battery_kwh: Range
    retained_diesel_kw: int
    mix_label: str
    sizing_rationale: str


class Economics(BaseModel):
    """What Number Cruncher returns."""

    capital_cost_cad: EconomicsRange
    annual_fuel_saved_litres: int
    annual_cost_saved_cad: int
    annual_co2_avoided_tonnes: int
    payback_years: float


class FundingProgram(BaseModel):
    """A federal/provincial program in Grant Finder's catalog."""

    name: str
    max_cad: int = Field(description="Headline fund size or per-project cap, in CAD")
    url: str
    summary: str
    scope: str = Field(description="One of: labrador_indigenous, indigenous, remote, utility_scale")


class EligibleProgram(BaseModel):
    """A funding program Grant Finder considers a match for a community."""

    name: str
    max_cad: int
    eligibility_reasoning: str


class FundingMatch(BaseModel):
    """What Grant Finder returns."""

    eligible_programs: List[EligibleProgram]
    potential_coverage_cad: int
    notes: str = ""


class ValidationInfo(BaseModel):
    """Validation block in a community brief."""

    real_project_exists: bool
    qualitative_match: bool
    real_project_summary: str


class RankingInputs(BaseModel):
    """Pre-computed inputs to the Portfolio Planner's scoring function."""

    dollar_per_dollar: float
    co2_per_dollar_kg: float
    equity_multiplier: float


class CommunityBrief(BaseModel):
    """A full pre-computed record in briefs.json — one per community."""

    id: str
    name: str
    lat: float
    lon: float
    depth: str
    region: str
    indigenous: bool
    resource: Dict
    system: Dict
    economics: Dict
    funding: Dict
    validation: ValidationInfo
    ranking_inputs: RankingInputs
    brief_markdown: str


class RankedCommunity(BaseModel):
    """One row in the Portfolio Planner's ranked output."""

    id: str
    name: str
    score: float
    fundable: bool
    cumulative_cost_cad: int
    capital_cost_cad: int
    annual_co2_avoided_tonnes: int
    annual_cost_saved_cad: int


class PortfolioRanking(BaseModel):
    """What Portfolio Planner returns."""

    ranked: List[RankedCommunity]
    total_fundable_capital_cad: int
    total_co2_avoided_tonnes: int
    total_annual_cost_saved_cad: int
    weights_used: Dict[str, float]
    error: Optional[str] = None
