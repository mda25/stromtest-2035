"""Aggregate a PyPSA solved network into per-zone, per-technology Parquet.

This module is the bridge between PyPSA-Eur's solved-network output (a NetCDF
``.nc`` file representing the full optimized power system, lines 250-310 of
PyPSA-Eur's ``postprocess.smk``) and the frontend-ready Parquet bundles that
stromtest-2035 publishes per (scenario x weather year) run.

V0 emits three resolutions per run:

  - ``hourly.parquet`` — 8760 rows x (zone, technology, metric) columns
  - ``daily.parquet`` — 365 rows, sums for energy quantities, means for SoC
  - ``weekly.parquet`` — 52 rows, same aggregation rules

Long format is used throughout (one row per (snapshot, zone, technology,
metric, value)) because the frontend's data-loader is shape-agnostic and
long format compresses better in Parquet for sparse zone x tech matrices.

The aggregator depends on ``pypsa`` and ``pyarrow``, which live in the
``modeling`` dependency group. CI's default ``dev`` install does NOT include
them; tests that exercise this module are gated on ``pytest.importorskip``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd
    import pypsa


@dataclass(frozen=True)
class AggregationResult:
    """Return value of aggregate()."""

    hourly_path: Path
    daily_path: Path
    weekly_path: Path
    metadata_path: Path
    row_counts: dict[str, int]


# Metric → aggregation function for daily / weekly rollups.
# Energy quantities sum, state quantities mean, prices mean.
_AGG_FUNCS: dict[str, str] = {
    "generation_mwh": "sum",
    "load_mwh": "sum",
    "curtailment_mwh": "sum",
    "storage_charge_mwh": "sum",
    "storage_discharge_mwh": "sum",
    "storage_soc_mwh": "mean",
    "flow_mwh": "sum",
    "price_eur_mwh": "mean",
}


def aggregate(
    network_path: Path,
    output_dir: Path,
    busmap_path: Path,
    run_metadata: dict[str, object] | None = None,
) -> AggregationResult:
    """Aggregate a solved PyPSA network into hourly / daily / weekly Parquet.

    Args:
        network_path: Path to the PyPSA NetCDF file (``base_s_{clusters}_*.nc``).
        output_dir: Where Parquet files get written. Created if missing.
        busmap_path: Path to ``unb_busmap.csv`` so we can map PyPSA bus IDs
            to ÜNB zones (50hertz/tennet/amprion/transnetbw).
        run_metadata: Optional dict embedded into ``metadata.json`` next to
            the Parquet outputs. Typically contains scenario_id,
            scenario_version, weather_year, version_hash, solver, runtime
            statistics.

    Returns:
        AggregationResult with paths and row counts per resolution.
    """
    import pypsa

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    network = pypsa.Network()
    network.import_from_netcdf(network_path)
    bus_to_zone = _load_busmap_zone_lookup(busmap_path)

    long_df = _extract_long_format(network, bus_to_zone)

    hourly_path = output_dir / "hourly.parquet"
    daily_path = output_dir / "daily.parquet"
    weekly_path = output_dir / "weekly.parquet"

    long_df.to_parquet(hourly_path, compression="zstd", index=False)
    daily_df = _resample(long_df, "D")
    daily_df.to_parquet(daily_path, compression="zstd", index=False)
    weekly_df = _resample(long_df, "W-MON")
    weekly_df.to_parquet(weekly_path, compression="zstd", index=False)

    metadata = dict(run_metadata or {})
    metadata.update(
        {
            "network_path": str(network_path),
            "n_snapshots": len(network.snapshots),
            "n_buses": len(network.buses),
            "row_counts": {
                "hourly": len(long_df),
                "daily": len(daily_df),
                "weekly": len(weekly_df),
            },
        }
    )
    metadata_path = output_dir / "metadata.json"
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True, default=str), encoding="utf-8"
    )

    return AggregationResult(
        hourly_path=hourly_path,
        daily_path=daily_path,
        weekly_path=weekly_path,
        metadata_path=metadata_path,
        row_counts={
            "hourly": len(long_df),
            "daily": len(daily_df),
            "weekly": len(weekly_df),
        },
    )


# --- Helpers --------------------------------------------------------------


def _load_busmap_zone_lookup(busmap_path: Path) -> dict[str, str]:
    """Read the busmap CSV and return {bus_id: zone}.

    Both raw (7-column) and reduced (2-column) busmap CSVs are accepted —
    the reduced form is produced by translate.py and uses ``cluster`` as the
    zone column instead of ``zone``.
    """
    import csv

    lookup: dict[str, str] = {}
    with busmap_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            zone = row.get("zone") or row.get("cluster")
            if zone is None:
                raise ValueError(f"busmap row {row} has neither 'zone' nor 'cluster' column")
            lookup[row["bus_id"]] = zone
    return lookup


def _extract_long_format(
    network: pypsa.Network,
    bus_to_zone: dict[str, str],
) -> pd.DataFrame:
    """Pull every relevant time series out of the network into long format.

    Returns columns: snapshot, zone, technology, metric, value (MWh or MW).
    """
    import pandas as pd

    pieces: list[pd.DataFrame] = []

    if not network.generators.empty:
        gen = _gen_per_bus_carrier(network)
        pieces.append(_to_long(gen, bus_to_zone, metric="generation_mwh"))

    if not network.loads.empty:
        load = _load_per_bus(network)
        pieces.append(_to_long(load, bus_to_zone, metric="load_mwh"))

    if not network.storage_units.empty:
        su = network.storage_units
        if not network.storage_units_t.p.empty:
            charge = -network.storage_units_t.p.clip(upper=0)
            discharge = network.storage_units_t.p.clip(lower=0)
            charge = charge.T.groupby([su.bus, su.carrier]).sum().T
            discharge = discharge.T.groupby([su.bus, su.carrier]).sum().T
            pieces.append(_to_long_two_level(charge, bus_to_zone, metric="storage_charge_mwh"))
            pieces.append(
                _to_long_two_level(discharge, bus_to_zone, metric="storage_discharge_mwh")
            )
        if not network.storage_units_t.state_of_charge.empty:
            soc = network.storage_units_t.state_of_charge
            soc = soc.T.groupby([su.bus, su.carrier]).sum().T
            pieces.append(_to_long_two_level(soc, bus_to_zone, metric="storage_soc_mwh"))

    if not network.stores.empty and not network.stores_t.e.empty:
        st = network.stores
        e = network.stores_t.e.T.groupby([st.bus, st.carrier]).sum().T
        pieces.append(_to_long_two_level(e, bus_to_zone, metric="storage_soc_mwh"))

    if not pieces:
        # No content extracted — return empty long frame with expected columns.
        return pd.DataFrame(columns=["snapshot", "zone", "technology", "metric", "value"])
    return pd.concat(pieces, ignore_index=True)


def _gen_per_bus_carrier(network: pypsa.Network) -> pd.DataFrame:
    """Return generation_t.p aggregated to (bus, carrier) MultiIndex columns."""
    p = network.generators_t.p
    if p.empty:
        return p
    gen = network.generators
    grouped = p.T.groupby([gen.bus, gen.carrier]).sum().T
    return grouped


def _load_per_bus(network: pypsa.Network) -> pd.DataFrame:
    """Return loads_t.p_set indexed by bus only (no carrier dimension)."""
    p_set = network.loads_t.p_set
    if p_set.empty:
        return p_set
    loads = network.loads
    grouped = p_set.T.groupby([loads.bus]).sum().T
    return grouped


def _to_long(
    df: pd.DataFrame,
    bus_to_zone: dict[str, str],
    metric: str,
) -> pd.DataFrame:
    """Convert a (snapshot x bus) or (snapshot x (bus, carrier)) DF to long.

    Handles both single-level and two-level column indices.
    """
    import pandas as pd

    if isinstance(df.columns, pd.MultiIndex):
        return _to_long_two_level(df, bus_to_zone, metric)
    long = df.stack().reset_index().rename(columns={"level_1": "bus", 0: "value"})
    long.columns = ["snapshot", "bus", "value"]
    long["zone"] = long["bus"].map(bus_to_zone).fillna("unknown")
    long["technology"] = "load"  # caller can re-label via metric
    long["metric"] = metric
    return long[["snapshot", "zone", "technology", "metric", "value"]]


def _to_long_two_level(
    df: pd.DataFrame,
    bus_to_zone: dict[str, str],
    metric: str,
) -> pd.DataFrame:
    """Convert a (snapshot x (bus, carrier)) MultiIndex DF to long format."""
    import pandas as pd

    if df.empty:
        return pd.DataFrame(columns=["snapshot", "zone", "technology", "metric", "value"])
    long = (
        df.stack(level=[0, 1], future_stack=True)
        .reset_index()
        .rename(columns={"level_0": "snapshot", "level_1": "bus", "level_2": "carrier"})
    )
    long.columns = ["snapshot", "bus", "carrier", "value"]
    long = long.dropna(subset=["value"])
    long["zone"] = long["bus"].map(bus_to_zone).fillna("unknown")
    long["technology"] = long["carrier"]
    long["metric"] = metric
    return long[["snapshot", "zone", "technology", "metric", "value"]]


def _resample(long_df: pd.DataFrame, freq: str) -> pd.DataFrame:
    """Resample long-format hourly data to daily or weekly.

    Energy quantities sum, state-of-charge means, prices mean.
    Output keeps the same long shape with the snapshot column floored to the
    resample period start.
    """
    import pandas as pd

    if long_df.empty:
        return long_df.copy()
    df = long_df.copy()
    df["snapshot"] = pd.to_datetime(df["snapshot"])

    pieces: list[pd.DataFrame] = []
    for metric, sub in df.groupby("metric", sort=False):
        func = _AGG_FUNCS.get(metric, "sum")
        grouped = sub.groupby(
            [
                pd.Grouper(key="snapshot", freq=freq),
                "zone",
                "technology",
            ]
        )["value"]
        if func == "sum":
            agg = grouped.sum()
        elif func == "mean":
            agg = grouped.mean()
        else:
            raise ValueError(f"unknown aggregation function {func!r} for metric {metric!r}")
        out = agg.reset_index()
        out["metric"] = metric
        pieces.append(out)
    return pd.concat(pieces, ignore_index=True)[
        ["snapshot", "zone", "technology", "metric", "value"]
    ]
