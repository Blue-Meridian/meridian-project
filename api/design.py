"""
System Designer's backing tool — sizes wind + solar + battery + retained
diesel for a community using NL Hydro Hatch 2020 study heuristics.

Quality thresholds (Global Wind Atlas / standard solar conventions):
    wind:  strong >= 7 m/s, moderate 5–7, weak < 5
    solar: strong >= 4 kWh/m2/day, moderate 3–4, weak < 3

Wind sizing multipliers (× average load kW):
    strong   2.0 – 3.5
    moderate 1.5 – 2.5
    weak     1.0 – 1.0

Solar sizing multipliers:
    strong   0.5 – 1.0
    moderate 0.3 – 0.6
    weak     0.0 – 0.0    (NL solar is rarely worth installing alone)

Battery: average load × 4 hours, ±25 %.
Retained diesel: 70 % of current peak diesel capacity (storm/long-calm backup).

/* USAGE:
    from tools.design import size_system

    sizing = size_system("nain")
    print(sizing.mix_label)
    print(sizing.wind_kw.low, sizing.wind_kw.high)

    # Override the quality classification (agents may pass their own labels):
    sizing = size_system("nain", wind_quality="strong", solar_quality="moderate")
*/
"""

from __future__ import annotations

from typing import Optional, Tuple

from .resource import get_community_record, get_resource_data
from .schemas import Range, SystemSizing

WIND_MULTIPLIERS = {
    "strong": (2.0, 3.5),
    "moderate": (1.5, 2.5),
    "weak": (1.0, 1.0),
}

SOLAR_MULTIPLIERS = {
    "strong": (0.5, 1.0),
    "moderate": (0.3, 0.6),
    "weak": (0.0, 0.0),
}

BATTERY_HOURS = 4
BATTERY_TOLERANCE = 0.25
RETAINED_DIESEL_FRACTION = 0.70


def _classify(wind_mps: float, solar_ghi: float) -> Tuple[str, str]:
    wq = "strong" if wind_mps >= 7 else "moderate" if wind_mps >= 5 else "weak"
    sq = "strong" if solar_ghi >= 4 else "moderate" if solar_ghi >= 3 else "weak"
    return wq, sq


def size_system(
    community_id: str,
    wind_quality: Optional[str] = None,
    solar_quality: Optional[str] = None,
) -> SystemSizing:
    rd = get_resource_data(community_id)
    record = get_community_record(community_id)

    if wind_quality is None or solar_quality is None:
        wq, sq = _classify(rd.wind_speed_80m_mps, rd.solar_ghi_kwh_m2_day)
        wind_quality = wind_quality or wq
        solar_quality = solar_quality or sq

    if wind_quality not in WIND_MULTIPLIERS:
        raise ValueError(f"wind_quality must be strong/moderate/weak, got {wind_quality!r}")
    if solar_quality not in SOLAR_MULTIPLIERS:
        raise ValueError(f"solar_quality must be strong/moderate/weak, got {solar_quality!r}")

    avg_load = rd.current_diesel_kw_avg
    w_lo, w_hi = WIND_MULTIPLIERS[wind_quality]
    s_lo, s_hi = SOLAR_MULTIPLIERS[solar_quality]

    wind = Range(low=int(avg_load * w_lo), high=int(avg_load * w_hi))
    solar = Range(low=int(avg_load * s_lo), high=int(avg_load * s_hi))

    battery_point = avg_load * BATTERY_HOURS
    battery = Range(
        low=int(battery_point * (1 - BATTERY_TOLERANCE)),
        high=int(battery_point * (1 + BATTERY_TOLERANCE)),
    )

    peak = record["current_diesel_kw_peak"]
    retained = int(peak * RETAINED_DIESEL_FRACTION)

    if solar_quality in ("moderate", "strong"):
        mix_label = "wind + solar + battery + reduced diesel"
    else:
        mix_label = "wind + battery + reduced diesel"

    rationale = (
        f"Sized per NL Hydro 2020 Hatch study, which identified "
        f"wind + battery + reduced diesel as the lowest-cost off-diesel "
        f"architecture for NL isolated systems. "
        f"Wind resource at this site is {wind_quality} "
        f"({rd.wind_speed_80m_mps:.1f} m/s at 80 m); "
        f"solar is {solar_quality} ({rd.solar_ghi_kwh_m2_day:.1f} kWh/m²/day)."
    )

    return SystemSizing(
        wind_kw=wind,
        solar_kw=solar,
        battery_kwh=battery,
        retained_diesel_kw=retained,
        mix_label=mix_label,
        sizing_rationale=rationale,
    )


if __name__ == "__main__":
    from .resource import list_community_ids

    for cid in list_community_ids():
        s = size_system(cid)
        print(f"{cid:20s}  {s.mix_label:45s}  "
              f"wind {s.wind_kw.low}-{s.wind_kw.high} kW  "
              f"battery {s.battery_kwh.low}-{s.battery_kwh.high} kWh")
