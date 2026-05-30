"""
Smoke tests for the five Meridian tools. Run with `pytest`.

These are golden-style sanity checks against Nain (the validation case).
If they fail after a benchmark change, update the assertions deliberately
— don't paper over a regression.
"""

from __future__ import annotations

import pytest

from api import (
    compute_economics,
    get_funding_programs,
    get_resource_data,
    rank_portfolio,
    size_system,
)
from api.resource import list_community_ids


def test_twenty_communities_loaded():
    ids = list_community_ids()
    assert len(ids) == 20
    assert "nain" in ids
    assert "natuashish" in ids


def test_nain_resource_data():
    rd = get_resource_data("nain")
    assert rd.region == "Nunatsiavut"
    assert rd.wind_speed_80m_mps >= 7  # strong-wind site
    assert rd.annual_diesel_litres > 0
    assert rd.population > 0


def test_unknown_community_raises():
    with pytest.raises(ValueError):
        get_resource_data("not-a-real-place")


def test_nain_system_sizing_is_wind_battery_diesel():
    sizing = size_system("nain")
    assert sizing.mix_label.startswith("wind +")
    assert "battery" in sizing.mix_label
    assert "diesel" in sizing.mix_label
    assert sizing.wind_kw.low < sizing.wind_kw.high
    assert sizing.battery_kwh.low < sizing.battery_kwh.high
    assert sizing.retained_diesel_kw > 0


def test_strong_wind_sizes_larger_than_load():
    sizing = size_system("nain")  # 7.8 m/s, strong
    rd = get_resource_data("nain")
    assert sizing.wind_kw.low > rd.current_diesel_kw_avg


def test_nain_economics_are_positive():
    sizing = size_system("nain")
    econ = compute_economics("nain", sizing.model_dump())
    assert econ.capital_cost_cad.point > 0
    assert econ.annual_fuel_saved_litres > 0
    assert econ.annual_cost_saved_cad > 0
    assert econ.annual_co2_avoided_tonnes > 0
    assert 0 < econ.payback_years < 30


def test_capital_range_brackets_point():
    sizing = size_system("nain")
    econ = compute_economics("nain", sizing.model_dump())
    assert econ.capital_cost_cad.low < econ.capital_cost_cad.point
    assert econ.capital_cost_cad.point < econ.capital_cost_cad.high


def test_funding_catalog_has_four_programs():
    programs = get_funding_programs()
    assert len(programs) == 4
    names = {p.name for p in programs}
    assert any("Reducing Diesel" in n for n in names)
    assert any("Indigenous Off-Diesel" in n for n in names)
    assert any("Clean Energy for Rural" in n for n in names)
    assert any("Smart Renewables" in n for n in names)


def test_portfolio_without_briefs_returns_error():
    """Before run_batch.py runs, briefs.json does not exist; ranker handles it."""
    result = rank_portfolio(budget_cad=50_000_000)
    # Either briefs.json exists (then ranked has entries) or we get a graceful error.
    if not result.ranked:
        assert result.error is not None and "briefs.json" in result.error


def test_portfolio_weight_normalisation():
    result = rank_portfolio(budget_cad=1, weight_dollar=2.0, weight_co2=2.0, weight_equity=2.0)
    total = sum(result.weights_used.values())
    # Returned weights are rounded to 3 decimals for display, so allow
    # rounding tolerance rather than exact normalisation.
    assert abs(total - 1.0) < 5e-3
