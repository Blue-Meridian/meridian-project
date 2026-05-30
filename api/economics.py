"""
Number Cruncher's backing tool — capital cost, annual fuel & dollar
savings, CO2 avoided, simple payback.

Cost benchmarks (CAD installed), from NL Hydro 2020 Hatch study:
    wind     $3,200 / kW    (low $2,500, high $4,000)
    solar    $3,000 / kW    (low $2,500, high $3,500)
    battery  $900 / kWh     (low $700,   high $1,200)

Operational values:
    diesel delivered cost  $1.80 / litre  (NL Hydro PUB filings, conservative)
    CO2 emission factor    2.68 kg / litre diesel

Wind displacement fraction (share of annual diesel a hybrid system displaces):
    strong   65 %
    moderate 50 %
    weak     35 %

Solar (when moderate or better) adds a +5 % displacement bump, capped at 80 %.

/* USAGE:
    from tools.design import size_system
    from tools.economics import compute_economics

    sizing = size_system("nain")
    econ = compute_economics("nain", sizing.model_dump())
    print(econ.capital_cost_cad.point)
    print(econ.payback_years)
*/
"""

from __future__ import annotations

from typing import Any, Dict

from .resource import get_resource_data
from .schemas import Economics, EconomicsRange

WIND_COST_PER_KW = 3200
SOLAR_COST_PER_KW = 3000
BATTERY_COST_PER_KWH = 900

CAPITAL_LOW_FACTOR = 0.70
CAPITAL_HIGH_FACTOR = 1.40

DIESEL_PRICE_CAD_PER_L = 1.80
CO2_KG_PER_L = 2.68

DISPLACEMENT_BY_WIND = {"strong": 0.65, "moderate": 0.50, "weak": 0.35}
SOLAR_DISPLACEMENT_BOOST = 0.05
MAX_DISPLACEMENT = 0.80


def _wind_quality(wind_mps: float) -> str:
    if wind_mps >= 7:
        return "strong"
    if wind_mps >= 5:
        return "moderate"
    return "weak"


def _solar_quality(solar_ghi: float) -> str:
    if solar_ghi >= 4:
        return "strong"
    if solar_ghi >= 3:
        return "moderate"
    return "weak"


def _point(range_dict: Dict[str, Any]) -> int:
    """Midpoint of a {'low','high'} dict from a Pydantic Range."""
    return (int(range_dict["low"]) + int(range_dict["high"])) // 2


def compute_economics(community_id: str, sizing: Dict[str, Any]) -> Economics:
    rd = get_resource_data(community_id)

    wind_kw = _point(sizing["wind_kw"])
    solar_kw = _point(sizing["solar_kw"])
    battery_kwh = _point(sizing["battery_kwh"])

    capital_point = (
        wind_kw * WIND_COST_PER_KW
        + solar_kw * SOLAR_COST_PER_KW
        + battery_kwh * BATTERY_COST_PER_KWH
    )
    capital_low = int(capital_point * CAPITAL_LOW_FACTOR)
    capital_high = int(capital_point * CAPITAL_HIGH_FACTOR)

    wind_q = _wind_quality(rd.wind_speed_80m_mps)
    fraction = DISPLACEMENT_BY_WIND[wind_q]
    if _solar_quality(rd.solar_ghi_kwh_m2_day) in ("moderate", "strong"):
        fraction = min(fraction + SOLAR_DISPLACEMENT_BOOST, MAX_DISPLACEMENT)

    fuel_saved = int(rd.annual_diesel_litres * fraction)
    cost_saved = int(fuel_saved * DIESEL_PRICE_CAD_PER_L)
    co2_avoided_tonnes = int(round(fuel_saved * CO2_KG_PER_L / 1000))
    payback = round(capital_point / max(cost_saved, 1), 1)

    return Economics(
        capital_cost_cad=EconomicsRange(low=capital_low, point=capital_point, high=capital_high),
        annual_fuel_saved_litres=fuel_saved,
        annual_cost_saved_cad=cost_saved,
        annual_co2_avoided_tonnes=co2_avoided_tonnes,
        payback_years=payback,
    )


if __name__ == "__main__":
    from .design import size_system
    from .resource import list_community_ids

    print(f"{'community':20s}  {'capex $M':>10s}  {'fuel saved (L)':>16s}  "
          f"{'CO2 (t/yr)':>11s}  {'payback':>9s}")
    print("-" * 80)
    for cid in list_community_ids():
        sizing = size_system(cid)
        econ = compute_economics(cid, sizing.model_dump())
        print(f"{cid:20s}  "
              f"{econ.capital_cost_cad.point / 1e6:10.1f}  "
              f"{econ.annual_fuel_saved_litres:16,d}  "
              f"{econ.annual_co2_avoided_tonnes:11,d}  "
              f"{econ.payback_years:8.1f}y")
