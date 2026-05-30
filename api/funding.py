"""
Grant Finder's backing tool — the canonical metadata for the four funding
programs in scope.

This tool returns structured program data. The eligibility-matching
reasoning happens in the Grant Finder agent itself, via RAG over the
per-program markdown cheat sheets in data/funding_programs/.

/* USAGE:
    from tools.funding import get_funding_programs

    for p in get_funding_programs():
        print(p.name, p.scope, p.url)
*/
"""

from __future__ import annotations

from typing import List

from .schemas import FundingProgram

PROGRAMS: List[FundingProgram] = [
    FundingProgram(
        name="Reducing Diesel Dependency in Isolated Labrador Communities",
        max_cad=220_000_000,
        url="https://www.canada.ca/en/natural-resources-canada.html",
        summary=(
            "$220M federal program supporting diesel reduction in isolated "
            "Labrador communities. Priority for projects led by or in partnership "
            "with Indigenous Nations and governments."
        ),
        scope="labrador_indigenous",
    ),
    FundingProgram(
        name="Indigenous Off-Diesel Initiative",
        max_cad=300_000_000,
        url="https://natural-resources.canada.ca/our-natural-resources/energy-sources-distribution/clean-energy/funding-clean-energy-projects/indigenous-off-diesel-initiative/22156",
        summary=(
            "ISC and NRCan joint program supporting Indigenous-led clean energy "
            "and demand-side management projects in remote off-grid communities."
        ),
        scope="indigenous",
    ),
    FundingProgram(
        name="Clean Energy for Rural and Remote Communities",
        max_cad=453_000_000,
        url="https://natural-resources.canada.ca/our-natural-resources/energy-sources-distribution/clean-energy/funding-clean-energy-projects/clean-energy-rural-and-remote-communities-program/20239",
        summary=(
            "NRCan program for renewable energy, capacity building, and biomass "
            "heating in rural and remote off-grid communities across Canada."
        ),
        scope="remote",
    ),
    FundingProgram(
        name="Smart Renewables and Electrification Pathways",
        max_cad=2_200_000_000,
        url="https://natural-resources.canada.ca/our-natural-resources/energy-sources-distribution/clean-energy/funding-clean-energy-projects/smart-renewables-and-electrification-pathways-program",
        summary=(
            "Larger NRCan program funding utility-scale renewables, grid "
            "modernisation, and electrification — applies to larger isolated "
            "system projects with grid-like architectures."
        ),
        scope="utility_scale",
    ),
]


def get_funding_programs() -> List[FundingProgram]:
    return list(PROGRAMS)


if __name__ == "__main__":
    for p in get_funding_programs():
        print(f"{p.name}")
        print(f"  scope:   {p.scope}")
        print(f"  max:     ${p.max_cad:,}")
        print(f"  url:     {p.url}")
        print(f"  summary: {p.summary}")
        print()
