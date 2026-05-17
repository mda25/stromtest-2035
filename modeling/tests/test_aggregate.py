"""Tests for the PyPSA-solved-network → Parquet aggregator (build step 6).

Requires the ``modeling`` dependency group (pypsa + pyarrow + pandas).
Tests skip automatically when those are not installed, so CI's default
dev install continues to pass.

Run locally with the modeling group active:
    cd modeling && uv sync --group modeling --group dev
    uv run pytest tests/test_aggregate.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

pypsa = pytest.importorskip("pypsa")
pd = pytest.importorskip("pandas")
pa = pytest.importorskip("pyarrow")

from stromtest.aggregate import aggregate  # noqa: E402  (import after skip gate)


def _build_tiny_network() -> pypsa.Network:
    """Construct a minimal solved-like PyPSA network for testing.

    Two zones (z_north + z_south), one onwind in each, one solar in each,
    one gas in z_south, one battery in z_south, one transmission link
    z_north → z_south. Snapshots span 6 hours.
    """
    n = pypsa.Network()
    snapshots = pd.date_range("2010-02-15 00:00", periods=6, freq="h")
    n.set_snapshots(snapshots)

    n.add("Bus", "z_north", v_nom=380, x=10.0, y=53.0)
    n.add("Bus", "z_south", v_nom=380, x=10.0, y=48.0)

    n.add("Carrier", "onwind")
    n.add("Carrier", "solar")
    n.add("Carrier", "OCGT")
    n.add("Carrier", "battery")
    n.add("Carrier", "AC")

    n.add(
        "Generator",
        "wn",
        bus="z_north",
        carrier="onwind",
        p_nom=10.0,
    )
    n.add(
        "Generator",
        "ws",
        bus="z_south",
        carrier="onwind",
        p_nom=5.0,
    )
    n.add(
        "Generator",
        "pv_n",
        bus="z_north",
        carrier="solar",
        p_nom=20.0,
    )
    n.add(
        "Generator",
        "pv_s",
        bus="z_south",
        carrier="solar",
        p_nom=30.0,
    )
    n.add(
        "Generator",
        "gas_s",
        bus="z_south",
        carrier="OCGT",
        p_nom=8.0,
    )
    n.add("Load", "ld_n", bus="z_north", p_set=10.0)
    n.add("Load", "ld_s", bus="z_south", p_set=20.0)

    n.add(
        "StorageUnit",
        "bat_s",
        bus="z_south",
        carrier="battery",
        p_nom=5.0,
        max_hours=4,
    )

    # Inject synthetic dispatch time series directly (bypass solver).
    n.generators_t.p = pd.DataFrame(
        {
            "wn": [3.0, 5.0, 7.0, 5.0, 4.0, 2.0],
            "ws": [1.5, 2.5, 3.0, 2.0, 1.5, 1.0],
            "pv_n": [0.0, 0.0, 10.0, 15.0, 10.0, 0.0],
            "pv_s": [0.0, 0.0, 18.0, 25.0, 18.0, 0.0],
            "gas_s": [5.0, 4.0, 0.0, 0.0, 0.0, 6.0],
        },
        index=snapshots,
    )
    n.loads_t.p_set = pd.DataFrame(
        {
            "ld_n": [10.0] * 6,
            "ld_s": [20.0] * 6,
        },
        index=snapshots,
    )
    n.storage_units_t.p = pd.DataFrame(
        {"bat_s": [-2.0, -1.0, 3.0, 5.0, 3.0, -2.0]}, index=snapshots
    )
    n.storage_units_t.state_of_charge = pd.DataFrame(
        {"bat_s": [12.0, 13.0, 10.0, 5.0, 2.0, 4.0]}, index=snapshots
    )
    return n


@pytest.fixture
def tiny_network(tmp_path: Path) -> Path:
    """Write the tiny synthetic network to NetCDF and return its path."""
    nc_path = tmp_path / "tiny.nc"
    n = _build_tiny_network()
    n.export_to_netcdf(nc_path)
    return nc_path


@pytest.fixture
def busmap_csv(tmp_path: Path) -> Path:
    p = tmp_path / "busmap.csv"
    p.write_text(
        "bus_id,zone\nz_north,tennet\nz_south,transnetbw\n",
        encoding="utf-8",
    )
    return p


# --- Tests ----------------------------------------------------------------


class TestAggregateProducesParquet:
    def test_writes_three_parquets_plus_metadata(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        out = tmp_path / "out"
        result = aggregate(tiny_network, out, busmap_csv)
        for path in (
            result.hourly_path,
            result.daily_path,
            result.weekly_path,
            result.metadata_path,
        ):
            assert path.exists(), f"missing {path}"

    def test_row_counts_make_sense(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        out = tmp_path / "out"
        result = aggregate(tiny_network, out, busmap_csv)
        # 6 hours x (5 generators + 2 loads + 1 storage_charge + 1 storage_discharge + 1 SoC)
        # but storage charge/discharge are halves of the same signal, both nonzero
        assert result.row_counts["hourly"] > 0
        assert result.row_counts["daily"] > 0
        assert result.row_counts["weekly"] > 0
        # weekly <= daily <= hourly
        assert result.row_counts["weekly"] <= result.row_counts["daily"]
        assert result.row_counts["daily"] <= result.row_counts["hourly"]


class TestZoneMapping:
    def test_bus_to_zone_mapping_applied(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        out = tmp_path / "out"
        aggregate(tiny_network, out, busmap_csv)
        df = pd.read_parquet(out / "hourly.parquet")
        zones = set(df["zone"].unique())
        # Both zones must appear; no buses should fall through to 'unknown'.
        assert "tennet" in zones
        assert "transnetbw" in zones
        assert "unknown" not in zones

    def test_missing_zone_falls_back_to_unknown(self, tiny_network: Path, tmp_path: Path) -> None:
        # Busmap that omits one bus: aggregator should label it 'unknown'.
        bm = tmp_path / "partial_busmap.csv"
        bm.write_text("bus_id,zone\nz_north,tennet\n", encoding="utf-8")
        out = tmp_path / "out2"
        aggregate(tiny_network, out, bm)
        df = pd.read_parquet(out / "hourly.parquet")
        assert "unknown" in df["zone"].unique()


class TestMetrics:
    def test_expected_metrics_present(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        out = tmp_path / "out"
        aggregate(tiny_network, out, busmap_csv)
        df = pd.read_parquet(out / "hourly.parquet")
        metrics = set(df["metric"].unique())
        assert "generation_mwh" in metrics
        assert "load_mwh" in metrics
        assert "storage_charge_mwh" in metrics
        assert "storage_discharge_mwh" in metrics
        assert "storage_soc_mwh" in metrics

    def test_generation_totals_preserved_under_aggregation(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        """Sum of hourly generation per (zone, tech) must match sum of daily."""
        out = tmp_path / "out"
        aggregate(tiny_network, out, busmap_csv)
        hourly = pd.read_parquet(out / "hourly.parquet")
        daily = pd.read_parquet(out / "daily.parquet")
        gen_hourly = hourly[hourly["metric"] == "generation_mwh"]
        gen_daily = daily[daily["metric"] == "generation_mwh"]
        h_totals = gen_hourly.groupby(["zone", "technology"])["value"].sum().sort_index()
        d_totals = gen_daily.groupby(["zone", "technology"])["value"].sum().sort_index()
        # Index alignment + value equality (energy sums conserve under daily roll-up).
        pd.testing.assert_series_equal(h_totals, d_totals, check_exact=False, rtol=1e-9)

    def test_soc_uses_mean_not_sum(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        """State-of-charge should mean-aggregate (not sum) on roll-up."""
        out = tmp_path / "out"
        aggregate(tiny_network, out, busmap_csv)
        daily = pd.read_parquet(out / "daily.parquet")
        soc = daily[daily["metric"] == "storage_soc_mwh"]
        # Synthetic SoC values: [12, 13, 10, 5, 2, 4]; mean across all 6 = 7.666..
        # All snapshots are within one day (Feb 15 2010), so daily SoC mean = 46/6.
        assert len(soc) == 1
        expected_mean = (12.0 + 13.0 + 10.0 + 5.0 + 2.0 + 4.0) / 6
        assert soc["value"].iloc[0] == pytest.approx(expected_mean, rel=1e-9)


class TestMetadata:
    def test_metadata_round_trips(
        self, tiny_network: Path, busmap_csv: Path, tmp_path: Path
    ) -> None:
        import json

        out = tmp_path / "out"
        run_meta = {
            "scenario_id": "test",
            "scenario_version": "2026-05-17.0",
            "weather_year": 2010,
            "version_hash": "abc123",
        }
        result = aggregate(tiny_network, out, busmap_csv, run_metadata=run_meta)
        meta = json.loads(result.metadata_path.read_text())
        assert meta["scenario_id"] == "test"
        assert meta["weather_year"] == 2010
        assert meta["version_hash"] == "abc123"
        # Auto-populated fields:
        assert meta["n_snapshots"] == 6
        assert meta["n_buses"] == 2
        assert meta["row_counts"]["hourly"] == result.row_counts["hourly"]
