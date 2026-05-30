"""
Resource Scout's backing tool — looks up cached wind, solar, load and
governance data for a community.

Reads data/community_data.json. The 20 records there are pre-fetched, so
nothing here ever hits a live API at runtime.

/* USAGE:
    from tools.resource import get_resource_data

    rd = get_resource_data("nain")
    print(rd.wind_speed_80m_mps)    # 7.8
    print(rd.region)                 # "Nunatsiavut"
    print(rd.annual_diesel_litres)   # 2_800_000

    # Raises ValueError if the community id is unknown.
*/
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

from .schemas import ResourceData

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "community_data.json"


@lru_cache(maxsize=1)
def _load_communities() -> Dict[str, dict]:
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return {c["id"]: c for c in data["communities"]}


def list_community_ids() -> List[str]:
    """Return the ids of all 20 communities, in file order."""
    return list(_load_communities().keys())


def get_community_record(community_id: str) -> dict:
    """Return the full raw record (including depth, indigenous flags)."""
    communities = _load_communities()
    if community_id not in communities:
        raise ValueError(
            f"Unknown community '{community_id}'. "
            f"Known ids: {sorted(communities)}"
        )
    return communities[community_id]


def get_resource_data(community_id: str) -> ResourceData:
    """Return the fields Resource Scout reports on."""
    c = get_community_record(community_id)
    return ResourceData(
        wind_speed_80m_mps=c["wind_speed_80m_mps"],
        solar_ghi_kwh_m2_day=c["solar_ghi_kwh_m2_day"],
        lat=c["lat"],
        lon=c["lon"],
        current_diesel_kw_avg=c["current_diesel_kw_avg"],
        annual_diesel_litres=c["annual_diesel_litres"],
        population=c["population"],
        region=c["region"],
        governance=c["governance"],
    )


if __name__ == "__main__":
    # Quick sanity check.
    for cid in list_community_ids():
        rd = get_resource_data(cid)
        print(f"{cid:20s}  wind {rd.wind_speed_80m_mps:.1f} m/s  "
              f"solar {rd.solar_ghi_kwh_m2_day:.1f} kWh/m2/day  "
              f"load {rd.current_diesel_kw_avg} kW")
