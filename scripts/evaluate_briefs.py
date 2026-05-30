"""
Governance evaluation — verify every headline number in each brief's rendered
markdown matches the structured field it came from. Catches LLM drift before
it reaches a judge or a federal program officer.

This is the audit script behind the watsonx.governance integration: run before
any demo recording, before any LLM-mode batch ships, and as part of CI if the
project continues post-hackathon.

Pass thresholds:
  * Fallback mode (Python templating): expect 100% match. Anything < 100% is
    a template bug.
  * LLM mode (Orchestrate-backed Brief Writer): expect ≥ 95% match. Below
    that, tighten Brief Writer's instructions or fall back to template mode
    for the demo.

/* USAGE:
    python scripts/evaluate_briefs.py
    python scripts/evaluate_briefs.py --briefs data/briefs.json
    python scripts/evaluate_briefs.py --report governance/eval_report.json
    python scripts/evaluate_briefs.py --quiet           # suppress per-community detail
    python scripts/evaluate_briefs.py --threshold 0.95  # fail at < 95% (default 1.0)

    Exits with status 0 on pass, 1 on fail, 2 on missing inputs.
*/
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, List

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BRIEFS = ROOT / "data" / "briefs.json"
DEFAULT_REPORT = ROOT / "governance" / "eval_briefs_report.json"


@dataclass
class FieldCheck:
    field: str
    expected: str
    found: bool
    note: str = ""


@dataclass
class BriefResult:
    community_id: str
    community_name: str
    checks: List[FieldCheck] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(1 for c in self.checks if c.found)

    @property
    def total(self) -> int:
        return len(self.checks)

    @property
    def rate(self) -> float:
        return self.passed / self.total if self.total else 1.0

    @property
    def failures(self) -> List[FieldCheck]:
        return [c for c in self.checks if not c.found]


# ── Checks ──────────────────────────────────────────────────────────────────


def _contains(haystack: str, needle: str) -> bool:
    """Whitespace-tolerant substring check."""
    return needle in haystack or needle.replace(" ", "") in haystack.replace(" ", "")


def evaluate_brief(brief: dict) -> BriefResult:
    """Run the headline-number checks for a single community brief."""
    md = brief.get("brief_markdown", "")
    name = brief.get("name", brief.get("id", "unknown"))
    result = BriefResult(community_id=brief.get("id", ""), community_name=name)

    # Community name
    result.checks.append(
        FieldCheck(
            field="community_name",
            expected=name,
            found=name in md,
        )
    )

    # Governance (a brief about an Indigenous community must say so by name)
    governance = brief.get("region", "")
    if governance:
        result.checks.append(
            FieldCheck(
                field="region",
                expected=governance,
                found=governance in md,
            )
        )

    # Mix label (architecture decision)
    mix = brief.get("system", {}).get("mix_label", "")
    if mix:
        result.checks.append(
            FieldCheck(field="mix_label", expected=mix, found=mix in md)
        )

    econ = brief.get("economics", {})

    # Capital cost (point estimate, displayed as $X.X M)
    if "capital_cost_cad" in econ:
        cap_point_m = econ["capital_cost_cad"]["point"] / 1e6
        expected = f"${cap_point_m:.1f} M"
        result.checks.append(
            FieldCheck(
                field="capital_cost.point",
                expected=expected,
                found=_contains(md, expected),
            )
        )

    # Annual fuel saved (with thousands separator)
    fuel = econ.get("annual_fuel_saved_litres")
    if fuel:
        expected_fuel = f"{fuel:,}"
        result.checks.append(
            FieldCheck(
                field="annual_fuel_saved_litres",
                expected=expected_fuel,
                found=_contains(md, expected_fuel),
            )
        )

    # Annual cost saved ($X.X M)
    cost = econ.get("annual_cost_saved_cad")
    if cost:
        cost_m = cost / 1e6
        expected_cost = f"${cost_m:.1f} M"
        result.checks.append(
            FieldCheck(
                field="annual_cost_saved",
                expected=expected_cost,
                found=_contains(md, expected_cost),
            )
        )

    # CO2 avoided (with thousands separator)
    co2 = econ.get("annual_co2_avoided_tonnes")
    if co2:
        expected_co2 = f"{co2:,}"
        result.checks.append(
            FieldCheck(
                field="annual_co2_avoided_tonnes",
                expected=expected_co2,
                found=_contains(md, expected_co2),
            )
        )

    # Payback (X.X years)
    pb = econ.get("payback_years")
    if pb is not None:
        expected_pb = f"{pb} years"
        result.checks.append(
            FieldCheck(
                field="payback_years",
                expected=expected_pb,
                found=_contains(md, expected_pb),
            )
        )

    # Resource fields (wind / solar)
    res = brief.get("resource", {})
    wind = res.get("wind_speed_80m_mps")
    if wind is not None:
        expected_wind = f"{wind} m/s"
        result.checks.append(
            FieldCheck(
                field="wind_speed_80m_mps",
                expected=expected_wind,
                found=_contains(md, expected_wind),
            )
        )
    solar = res.get("solar_ghi_kwh_m2_day")
    if solar is not None:
        expected_solar = f"{solar} kWh/m"
        result.checks.append(
            FieldCheck(
                field="solar_ghi_kwh_m2_day",
                expected=expected_solar,
                found=_contains(md, expected_solar),
            )
        )

    # Funding programs — each named eligible program should appear
    funding = brief.get("funding", {})
    for prog in funding.get("eligible_programs", []):
        prog_name = prog.get("name", "")
        if prog_name:
            short = prog_name.split(" ")[0]  # tolerate slight phrasing
            result.checks.append(
                FieldCheck(
                    field=f"funding.{short}",
                    expected=prog_name,
                    found=(prog_name in md) or (short in md),
                    note="matched on full name or first-word fragment",
                )
            )

    return result


# ── Report ──────────────────────────────────────────────────────────────────


@dataclass
class Report:
    briefs_path: str
    generation_mode: str
    threshold: float
    per_community: List[BriefResult]

    @property
    def total_checks(self) -> int:
        return sum(r.total for r in self.per_community)

    @property
    def total_passed(self) -> int:
        return sum(r.passed for r in self.per_community)

    @property
    def overall_rate(self) -> float:
        return self.total_passed / self.total_checks if self.total_checks else 1.0

    @property
    def passes(self) -> bool:
        return self.overall_rate >= self.threshold

    def as_dict(self) -> dict:
        return {
            "briefs_path": self.briefs_path,
            "generation_mode": self.generation_mode,
            "threshold": self.threshold,
            "overall_match_rate": round(self.overall_rate, 4),
            "total_checks": self.total_checks,
            "total_passed": self.total_passed,
            "total_failed": self.total_checks - self.total_passed,
            "communities_total": len(self.per_community),
            "communities_with_failures": sum(
                1 for r in self.per_community if r.failures
            ),
            "verdict": "PASS" if self.passes else "FAIL",
            "per_community": [
                {
                    "id": r.community_id,
                    "name": r.community_name,
                    "passed": r.passed,
                    "total": r.total,
                    "rate": round(r.rate, 4),
                    "failures": [asdict(f) for f in r.failures],
                }
                for r in self.per_community
            ],
        }


# ── CLI ─────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate every brief in briefs.json: verify that headline numbers "
            "in the rendered markdown match the structured fields they came from. "
            "Catches LLM hallucinations and template drift."
        )
    )
    parser.add_argument("--briefs", default=str(DEFAULT_BRIEFS), help=f"Briefs JSON path (default: {DEFAULT_BRIEFS.relative_to(ROOT)})")
    parser.add_argument("--report", default=str(DEFAULT_REPORT), help=f"Where to write the JSON report (default: {DEFAULT_REPORT.relative_to(ROOT)})")
    parser.add_argument("--threshold", type=float, default=1.0, help="Minimum overall match rate to pass (default: 1.0 — strict).")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-community output.")
    args = parser.parse_args()

    briefs_path = Path(args.briefs)
    if not briefs_path.exists():
        print(f"✗ briefs.json not found at {briefs_path}", file=sys.stderr)
        print(f"  Generate with: python scripts/run_batch.py --no-llm", file=sys.stderr)
        return 2

    with open(briefs_path, encoding="utf-8") as f:
        data = json.load(f)

    communities = data.get("communities", [])
    generation_mode = data.get("metadata", {}).get("generation_mode", "unknown")

    results = [evaluate_brief(c) for c in communities]
    report = Report(
        briefs_path=str(briefs_path.relative_to(ROOT)),
        generation_mode=generation_mode,
        threshold=args.threshold,
        per_community=results,
    )

    # Write JSON report
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report.as_dict(), indent=2))

    # Console summary
    verdict = "PASS" if report.passes else "FAIL"
    rate_pct = report.overall_rate * 100
    threshold_pct = args.threshold * 100

    print(f"\nMeridian governance evaluation — briefs.json")
    print(f"  mode:        {generation_mode}")
    print(f"  threshold:   ≥ {threshold_pct:.1f}%")
    print(f"  match rate:  {rate_pct:.2f}%  ({report.total_passed}/{report.total_checks} checks)")
    print(f"  verdict:     {verdict}\n")

    if not args.quiet:
        for r in results:
            status = "✓" if not r.failures else "✗"
            print(f"  {status} {r.community_name:30s}  {r.passed:3d}/{r.total} checks ({r.rate*100:5.1f}%)")
            for fail in r.failures:
                print(f"      ✗ {fail.field}: expected '{fail.expected}' not in rendered brief")

    print(f"\nReport written → {report_path.relative_to(ROOT)}")
    return 0 if report.passes else 1


if __name__ == "__main__":
    raise SystemExit(main())
