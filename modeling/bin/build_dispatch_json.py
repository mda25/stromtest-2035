#!/usr/bin/env python3
"""Convert a solved PyPSA NetCDF into a frontend-friendly dispatch JSON.

Reads a solved network, runs ``stromtest.aggregate`` to produce
hourly/daily/weekly Parquet, then emits a single JSON file
co-located with the frontend at
``web/src/data/dispatch/<scenario_id>.json``.

Usage:
    pixi run python ../bin/build_dispatch_json.py \\
        --scenario-id reiche \\
        --scenario-version 2026-05-17.0 \\
        --weather-year 2013 \\
        --label "Reiche 2035 fleet under March 2013 weather (smoke test)" \\
        --network resources/de-tutorial-cbm/networks/base_s_4_elec_.nc \\
        --busmap  data/busmaps/base_s_4_entsoegridkit.csv

The JSON shape is intentionally narrow: snapshot strings, per-row
{zone, technology, metric, value} entries, plus pre-aggregated
nationals + per-zone summaries for the dashboard. Frontend can read
this directly via ``import dispatchData from "@/data/dispatch/foo.json"``.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DISPATCH_DIR = REPO_ROOT / "web" / "src" / "data" / "dispatch"

sys.path.insert(0, str(REPO_ROOT / "modeling" / "src"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario-id", required=True)
    parser.add_argument("--scenario-version", required=True)
    parser.add_argument("--weather-year", type=int, required=True)
    parser.add_argument("--label", required=True, help="Human-readable run label")
    parser.add_argument("--network", required=True, type=Path)
    parser.add_argument("--busmap", required=True, type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Override output JSON path. Defaults to web/src/data/dispatch/<scenario_id>.json",
    )
    args = parser.parse_args()

    from stromtest.aggregate import aggregate

    out_path = args.out or DISPATCH_DIR / f"{args.scenario_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        result = aggregate(
            network_path=args.network,
            output_dir=tmp_path,
            busmap_path=args.busmap,
            run_metadata={
                "scenario_id": args.scenario_id,
                "scenario_version": args.scenario_version,
                "weather_year": args.weather_year,
                "label": args.label,
            },
        )
        payload = _build_payload(result, args)
        out_path.write_text(json.dumps(payload, indent=2, default=_json_default), encoding="utf-8")
        print(f"wrote {out_path} ({out_path.stat().st_size:,} bytes)")

        # Copy the raw daily.parquet alongside the JSON so it stays
        # downloadable from the repo for researchers who want the raw data.
        parquet_target = out_path.with_suffix(".daily.parquet")
        shutil.copy2(result.daily_path, parquet_target)
        print(f"copied raw daily parquet to {parquet_target}")
    return 0


def _build_payload(result, args) -> dict:
    import pandas as pd

    daily = pd.read_parquet(result.daily_path)
    metadata = json.loads(result.metadata_path.read_text())

    # Daily rows ready for the frontend (string dates, sorted).
    daily = daily.sort_values(["snapshot", "zone", "technology", "metric"]).copy()
    daily["snapshot"] = pd.to_datetime(daily["snapshot"]).dt.strftime("%Y-%m-%d")
    daily_rows = daily.to_dict(orient="records")

    # National totals per (metric, technology) — for headline tables.
    nat = (
        daily.groupby(["metric", "technology"], sort=False)["value"]
        .sum()
        .reset_index()
        .sort_values("value", ascending=False)
        .to_dict(orient="records")
    )

    # Per-zone totals.
    per_zone_totals = (
        daily.groupby(["zone", "metric"], sort=False)["value"]
        .sum()
        .reset_index()
        .to_dict(orient="records")
    )

    # Daily aggregated to (snapshot, technology) — national stacked-area shape.
    stacked = (
        daily[daily["metric"] == "generation_mwh"]
        .groupby(["snapshot", "technology"], sort=False)["value"]
        .sum()
        .reset_index()
        .to_dict(orient="records")
    )

    return {
        "scenario_id": args.scenario_id,
        "scenario_version": args.scenario_version,
        "weather_year": args.weather_year,
        "label": args.label,
        "metadata": {
            "n_snapshots": metadata.get("n_snapshots"),
            "n_buses": metadata.get("n_buses"),
            "row_counts": metadata.get("row_counts"),
        },
        "daily": daily_rows,
        "stacked_generation_daily": stacked,
        "national_totals": nat,
        "per_zone_totals": per_zone_totals,
    }


def _json_default(obj):
    """JSON encoder fallback for numpy/pandas scalars."""
    if hasattr(obj, "item"):
        return obj.item()
    return str(obj)


if __name__ == "__main__":
    sys.exit(main())
