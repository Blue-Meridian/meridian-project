"""Project Meridian — FastAPI backend.

The five tools the watsonx Orchestrate agents call (resource, design,
economics, funding, portfolio), plus the chat proxy that streams to
watsonx.ai Granite, plus the frontend-supporting routes (/briefs,
/governance/report). All exposed via api/main.py as a single FastAPI app.

/* USAGE:
    from api import (
        get_resource_data,
        size_system,
        compute_economics,
        get_funding_programs,
        rank_portfolio,
    )

    rd = get_resource_data("nain")
    sizing = size_system("nain")
*/
"""

from .resource import get_resource_data
from .design import size_system
from .economics import compute_economics
from .funding import get_funding_programs
from .portfolio import rank_portfolio

__all__ = [
    "get_resource_data",
    "size_system",
    "compute_economics",
    "get_funding_programs",
    "rank_portfolio",
]
