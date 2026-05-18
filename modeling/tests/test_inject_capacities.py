"""Tests for the capacity injection step.

Gated on the ``modeling`` group (pypsa) so CI's default install still runs
the rest of the suite cleanly. Constructs a tiny synthetic prepared PyPSA
network in-memory and verifies the injector mutates it as expected.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pypsa = pytest.importorskip("pypsa")
pd = pytest.importorskip("pandas")

from stromtest.inject_capacities import inject_capacities  # noqa: E402


def _build_tiny_prepared_network(nc_path: Path) -> pypsa.Network:
    """Tiny prepared-like network with 2 zones (DE0_50hertz, DE0_tennet)."""
    n = pypsa.Network()
    snapshots = pd.date_range("2010-01-15 00:00", periods=6, freq="h")
    n.set_snapshots(snapshots)

    n.add("Bus", "DE0_50hertz", v_nom=380, x=12.0, y=52.0)
    n.add("Bus", "DE0_tennet", v_nom=380, x=10.0, y=51.0)
    n.add("Bus", "DE0_50hertz H2", v_nom=380, x=12.0, y=52.0, carrier="H2")
    n.add("Bus", "DE0_tennet H2", v_nom=380, x=10.0, y=51.0, carrier="H2")

    for c in [
        "onwind",
        "solar",
        "solar-hsat",
        "offwind-ac",
        "offwind-dc",
        "OCGT",
        "CCGT",
        "coal",
        "lignite",
        "nuclear",
        "biomass",
        "battery",
        "PHS",
        "H2",
        "H2 Electrolysis",
    ]:
        n.add("Carrier", c)

    # Generators per zone: pre-populated with starting capacities to mimic
    # PyPSA-Eur's `add_electricity` + `prepare_network` output.
    for bus in ("DE0_50hertz", "DE0_tennet"):
        for carrier in ("onwind", "solar", "solar-hsat", "offwind-ac", "OCGT", "CCGT"):
            n.add(
                "Generator",
                f"{bus} 0 {carrier}",
                bus=bus,
                carrier=carrier,
                p_nom=1.0,
                p_nom_extendable=True,
                p_nom_max=1000.0,
            )
        # Conventional carriers we expect to be zeroed.
        for carrier in ("coal", "lignite", "nuclear"):
            n.add(
                "Generator",
                f"{bus} 0 {carrier}",
                bus=bus,
                carrier=carrier,
                p_nom=500.0,
                p_nom_extendable=False,
            )

    # Pre-populated battery + H2 + electrolysis components per zone.
    for bus in ("DE0_50hertz", "DE0_tennet"):
        n.add(
            "StorageUnit",
            f"{bus} battery",
            bus=bus,
            carrier="battery",
            p_nom=0.0,
            p_nom_extendable=True,
            max_hours=4,
        )
        n.add(
            "Store",
            f"{bus} H2",
            bus=f"{bus} H2",
            carrier="H2",
            e_nom=0.0,
            e_nom_extendable=True,
        )
        n.add(
            "Link",
            f"{bus} H2 Electrolysis",
            bus0=bus,
            bus1=f"{bus} H2",
            carrier="H2 Electrolysis",
            p_nom=0.0,
            p_nom_extendable=True,
        )

    n.export_to_netcdf(nc_path)
    return n


def _build_capacities_json() -> dict:
    """Minimal scenario shape mirroring `stromtest translate` output."""
    return {
        "scenario_id": "test",
        "scenario_version": "2026-05-17.0",
        "capacities_2035_gw": {
            "wind_onshore": {
                "50hertz": 40.0,
                "tennet": 56.0,
                "amprion": 28.0,
                "transnetbw": 14.0,
            },
            "wind_offshore": {
                "50hertz": 6.0,
                "tennet": 34.0,
                "amprion": 0.0,
                "transnetbw": 0.0,
            },
            "solar_pv": {
                "50hertz": 60.0,
                "tennet": 130.0,
                "amprion": 60.0,
                "transnetbw": 42.0,
            },
            "gas_backup": {
                "50hertz": 3.0,
                "tennet": 7.0,
                "amprion": 6.0,
                "transnetbw": 4.0,
            },
            "hydrogen_electrolyzer": {
                "50hertz": 4.0,
                "tennet": 6.0,
                "amprion": 3.0,
                "transnetbw": 2.0,
            },
            "pumped_hydro": {
                "50hertz": 2.1,
                "tennet": 1.0,
                "amprion": 0.3,
                "transnetbw": 1.9,
            },
            "battery_storage_gwh": 52.0,
            "hydrogen_storage_twh": 40.0,
        },
    }


@pytest.fixture
def network_path(tmp_path: Path) -> Path:
    nc = tmp_path / "prepared.nc"
    _build_tiny_prepared_network(nc)
    return nc


@pytest.fixture
def capacities_path(tmp_path: Path) -> Path:
    p = tmp_path / "capacities.json"
    p.write_text(json.dumps(_build_capacities_json()), encoding="utf-8")
    return p


class TestRenewableCapacityInjection:
    def test_onwind_set_to_scenario_value(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        gens = n.generators
        # 50hertz onwind target = 40 GW = 40000 MW
        match = gens[(gens.bus == "DE0_50hertz") & (gens.carrier == "onwind")]
        assert (match.p_nom == 40000.0).all()
        assert not match.p_nom_extendable.any()

    def test_solar_primary_takes_full_capacity_hsat_zeroed(
        self, network_path: Path, capacities_path: Path
    ) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        gens = n.generators
        # 50hertz solar_pv target = 60 GW. Goes to 'solar', NOT solar-hsat.
        solar = gens[(gens.bus == "DE0_50hertz") & (gens.carrier == "solar")]
        hsat = gens[(gens.bus == "DE0_50hertz") & (gens.carrier == "solar-hsat")]
        assert (solar.p_nom == 60000.0).all()
        assert (hsat.p_nom == 0.0).all()

    def test_wind_offshore_primary_takes_full_capacity(
        self, network_path: Path, capacities_path: Path
    ) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        # tennet wind_offshore = 34 GW; primary is offwind-ac
        gens = n.generators
        ac = gens[(gens.bus == "DE0_tennet") & (gens.carrier == "offwind-ac")]
        assert (ac.p_nom == 34000.0).all()

    def test_gas_backup_set_on_OCGT(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        gens = n.generators
        # tennet gas_backup = 7 GW -> OCGT (first in carriers list)
        ocgt = gens[(gens.bus == "DE0_tennet") & (gens.carrier == "OCGT")]
        ccgt = gens[(gens.bus == "DE0_tennet") & (gens.carrier == "CCGT")]
        assert (ocgt.p_nom == 7000.0).all()
        assert (ccgt.p_nom == 0.0).all()


class TestZeroedCarriers:
    def test_coal_zeroed_everywhere(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        assert (n.generators[n.generators.carrier == "coal"].p_nom == 0.0).all()
        assert (~n.generators[n.generators.carrier == "coal"].p_nom_extendable).all()

    def test_lignite_zeroed(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        assert (n.generators[n.generators.carrier == "lignite"].p_nom == 0.0).all()

    def test_nuclear_zeroed(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        assert (n.generators[n.generators.carrier == "nuclear"].p_nom == 0.0).all()


class TestStorageInjection:
    def test_battery_per_zone_p_nom_set(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        # 52 GWh / 4 zones / 4-hour duration = 3.25 GW per zone
        battery = n.storage_units[n.storage_units.carrier == "battery"]
        expected_mw = 52.0 / 4 * 1000.0 / 4.0
        assert list(battery.p_nom) == pytest.approx([expected_mw] * len(battery), rel=1e-9)
        assert not battery.p_nom_extendable.any()

    def test_h2_stores_get_e_nom(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        # 40 TWh / 4 zones = 10 TWh = 10_000_000 MWh per zone
        h2 = n.stores
        expected_mwh = 40.0 * 1_000_000.0 / 4.0
        assert list(h2.e_nom) == pytest.approx([expected_mwh] * len(h2), rel=1e-9)


class TestLinkInjection:
    def test_h2_electrolyzer_link_p_nom(self, network_path: Path, capacities_path: Path) -> None:
        inject_capacities(network_path, capacities_path)
        n = pypsa.Network()
        n.import_from_netcdf(network_path)
        # 50hertz electrolyzer = 4 GW = 4000 MW
        l50 = n.links[n.links.index.str.startswith("DE0_50hertz H2 Electrolysis")]
        assert (l50.p_nom == 4000.0).all()
        assert not l50.p_nom_extendable.any()


class TestReturnedSummary:
    def test_summary_includes_present_zones(
        self, network_path: Path, capacities_path: Path
    ) -> None:
        """Synthetic fixture has only 50hertz + tennet; missing zones skipped."""
        result = inject_capacities(network_path, capacities_path)
        assert set(result.summary_by_zone_gw.keys()) == {"50hertz", "tennet"}

    def test_summary_includes_capacity_breakdown(
        self, network_path: Path, capacities_path: Path
    ) -> None:
        result = inject_capacities(network_path, capacities_path)
        keys = set(result.summary_by_zone_gw["50hertz"].keys())
        # Must include every per-zone scenario carrier
        for required in (
            "wind_onshore",
            "wind_offshore",
            "solar_pv",
            "gas_backup",
            "hydrogen_electrolyzer",
        ):
            assert required in keys

    def test_idempotent(self, network_path: Path, capacities_path: Path) -> None:
        """Re-running on the same inputs leaves the network identical."""
        inject_capacities(network_path, capacities_path)
        n1 = pypsa.Network()
        n1.import_from_netcdf(network_path)
        snapshot1 = n1.generators[["p_nom", "p_nom_extendable", "carrier"]].copy()

        inject_capacities(network_path, capacities_path)
        n2 = pypsa.Network()
        n2.import_from_netcdf(network_path)
        snapshot2 = n2.generators[["p_nom", "p_nom_extendable", "carrier"]].copy()

        pd.testing.assert_frame_equal(snapshot1, snapshot2)


class TestErrorHandling:
    def test_missing_network_raises(self, tmp_path: Path, capacities_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            inject_capacities(tmp_path / "nope.nc", capacities_path)

    def test_missing_capacities_raises(self, network_path: Path, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            inject_capacities(network_path, tmp_path / "nope.json")
