"""Tests for the committed real scenarios (Reiche + Habeck).

These tests do three things beyond schema validation:
  1. Load every committed scenario YAML and validate against the Pydantic
     schema (citation_ref discipline, version pattern, etc.).
  2. Cross-check aggregate national totals against the cited statutory
     and policy targets.
  3. Cross-check that the Reiche and Habeck scenarios differ in the expected
     direction on the dimensions that should differ (gas backup, hydrogen
     ramp, heat pump share, EV share, demand).

If a future scenario edit shifts these aggregates outside reasonable
bounds, the offending test points the author at the specific assumption
to revisit. Bounds are intentionally wide (±15-25%) so the tests are not
brittle under modest interpretation refinements.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from stromtest.translation.schema import Scenario, ZoneCapacities

SCENARIOS_DIR = Path(__file__).resolve().parents[1] / "scenarios"

REICHE_PATH = SCENARIOS_DIR / "reiche" / "2026-05-17.0.yml"
HABECK_PATH = SCENARIOS_DIR / "habeck" / "2024-klima45.0.yml"


@pytest.fixture(scope="module")
def reiche() -> Scenario:
    return Scenario.from_yaml(REICHE_PATH)


@pytest.fixture(scope="module")
def habeck() -> Scenario:
    return Scenario.from_yaml(HABECK_PATH)


def _zone_sum(zc: ZoneCapacities) -> float:
    return zc.zone_50hertz + zc.tennet + zc.amprion + zc.transnetbw


class TestReicheLoads:
    """The Reiche scenario must load and validate."""

    def test_id_and_version(self, reiche: Scenario) -> None:
        assert reiche.id == "reiche"
        assert reiche.version == "2026-05-17.0"

    def test_has_required_sources(self, reiche: Scenario) -> None:
        refs = {s.ref for s in reiche.sources}
        # The Reiche-era amendments require these specific citations.
        required = {
            "EEG-2023",
            "WindSeeG-2023",
            "KoaV-2025",
            "BMWE-Kraftwerksstrategie-2026-01",
            "NEP-2037-V2025",
            "NWS-Fortschreibung-2023",
        }
        missing = required - refs
        assert not missing, f"missing required sources in Reiche scenario: {missing}"


class TestHabeckLoads:
    """The Habeck scenario must load and validate."""

    def test_id_and_version(self, habeck: Scenario) -> None:
        assert habeck.id == "habeck"
        assert habeck.version == "2024-09-30.0"

    def test_has_required_sources(self, habeck: Scenario) -> None:
        refs = {s.ref for s in habeck.sources}
        required = {
            "KSG-2021",
            "EEG-2023",
            "WindSeeG-2023",
            "LFS3-T45-Strom",
            "NWS-Fortschreibung-2023",
        }
        missing = required - refs
        assert not missing, f"missing required sources in Habeck scenario: {missing}"


class TestNationalTotalsAgainstStatutoryFloors:
    """Both scenarios must respect statutory floors (EEG, WindSeeG, etc.)."""

    def test_wind_offshore_matches_windseeg_2035(self, reiche: Scenario, habeck: Scenario) -> None:
        # WindSeeG § 1: 40 GW by 2035. This is statutory; both scenarios
        # must hit it exactly (or above).
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            total = _zone_sum(sc.capacities_2035_gw.wind_offshore)
            assert 38.0 <= total <= 42.0, (
                f"{label} wind_offshore total {total} GW must be ~40 GW (WindSeeG § 1)"
            )

    def test_wind_onshore_above_eeg_2030_below_eeg_2040(
        self, reiche: Scenario, habeck: Scenario
    ) -> None:
        # 2035 must sit between EEG 2030 (115 GW) and 2040 (160 GW).
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            total = _zone_sum(sc.capacities_2035_gw.wind_onshore)
            assert 115.0 <= total <= 160.0, (
                f"{label} wind_onshore total {total} GW must sit between "
                "EEG 2030 (115) and 2040 (160) floors"
            )

    def test_solar_pv_above_eeg_2030(self, reiche: Scenario, habeck: Scenario) -> None:
        # 2035 must sit above EEG 2030 (215 GW) and below 2040 (400 GW).
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            total = _zone_sum(sc.capacities_2035_gw.solar_pv)
            assert 215.0 <= total <= 400.0, (
                f"{label} solar_pv total {total} GW must sit between "
                "EEG 2030 (215) and 2040 (400) floors"
            )


class TestReicheVsHabeckDirectionalDifferences:
    """The Reiche scenario must differ from Habeck in expected directions.

    These tests guard against accidental copy-paste errors when authoring
    new scenario versions.
    """

    def test_reiche_has_more_gas_than_habeck(self, reiche: Scenario, habeck: Scenario) -> None:
        r = _zone_sum(reiche.capacities_2035_gw.gas_backup)
        h = _zone_sum(habeck.capacities_2035_gw.gas_backup)
        assert r > h + 5.0, (
            f"Reiche gas_backup ({r} GW) should be >5 GW above Habeck ({h} GW) "
            "reflecting Kraftwerksstrategie expansion"
        )

    def test_reiche_has_less_electrolyzer_than_habeck(
        self, reiche: Scenario, habeck: Scenario
    ) -> None:
        r = _zone_sum(reiche.capacities_2035_gw.hydrogen_electrolyzer)
        h = _zone_sum(habeck.capacities_2035_gw.hydrogen_electrolyzer)
        assert r < h - 5.0, (
            f"Reiche electrolyzer ({r} GW) should be >5 GW below Habeck ({h} GW) "
            "reflecting slowed Wasserstoffhochlauf"
        )

    def test_reiche_has_lower_heat_pump_share(self, reiche: Scenario, habeck: Scenario) -> None:
        assert reiche.demand_2035.heat_pump_share < habeck.demand_2035.heat_pump_share, (
            "Reiche slowed GEG mandate → HP share should be below Habeck-era T45"
        )

    def test_reiche_has_lower_ev_share(self, reiche: Scenario, habeck: Scenario) -> None:
        assert reiche.demand_2035.ev_share_passenger < habeck.demand_2035.ev_share_passenger, (
            "Reiche slowed EV pace → EV share should be below Habeck-era T45"
        )

    def test_reiche_has_lower_baseline_demand(self, reiche: Scenario, habeck: Scenario) -> None:
        assert reiche.demand_2035.baseline_twh < habeck.demand_2035.baseline_twh, (
            "Reiche slower electrification → baseline demand should be lower"
        )

    def test_reiche_has_smaller_hydrogen_storage(self, reiche: Scenario, habeck: Scenario) -> None:
        r = reiche.capacities_2035_gw.hydrogen_storage_twh.value
        h = habeck.capacities_2035_gw.hydrogen_storage_twh.value
        assert r < h, (
            f"Reiche H2 storage ({r} TWh) should be below Habeck ({h} TWh) "
            "reflecting slower hydrogen pathway"
        )


class TestSpatialAllocationPlausibility:
    """Per-zone allocations should roughly match Germany's wind/solar map."""

    def test_offshore_only_lands_in_coastal_zones(self, reiche: Scenario, habeck: Scenario) -> None:
        """Wind offshore landings only in 50Hertz (Baltic) + TenneT (North Sea)."""
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            assert sc.capacities_2035_gw.wind_offshore.amprion == 0.0, (
                f"{label} has nonzero offshore in Amprion zone (impossible)"
            )
            assert sc.capacities_2035_gw.wind_offshore.transnetbw == 0.0, (
                f"{label} has nonzero offshore in TransnetBW zone (BW is landlocked)"
            )

    def test_tennet_dominates_onshore_wind(self, reiche: Scenario, habeck: Scenario) -> None:
        """TenneT zone (Niedersachsen + SH + Bayern + Hessen) is the biggest
        onshore wind zone in current production and projections."""
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            caps = sc.capacities_2035_gw.wind_onshore
            assert caps.tennet > caps.zone_50hertz, (
                f"{label} TenneT onshore wind ({caps.tennet}) should exceed "
                f"50Hertz ({caps.zone_50hertz})"
            )
            assert caps.tennet > caps.amprion, (
                f"{label} TenneT onshore wind ({caps.tennet}) should exceed "
                f"Amprion ({caps.amprion})"
            )

    def test_transnetbw_is_smallest_onshore_wind_zone(
        self, reiche: Scenario, habeck: Scenario
    ) -> None:
        """Baden-Württemberg has the smallest wind onshore footprint of the
        four zones (single Bundesland, mountainous, late starter)."""
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            caps = sc.capacities_2035_gw.wind_onshore
            others = [caps.zone_50hertz, caps.tennet, caps.amprion]
            assert caps.transnetbw == min([*others, caps.transnetbw]), (
                f"{label} TransnetBW onshore wind ({caps.transnetbw}) should be "
                f"the smallest among zones: {[caps.zone_50hertz, caps.tennet, caps.amprion, caps.transnetbw]}"
            )

    def test_pumped_hydro_distribution_matches_geography(
        self, reiche: Scenario, habeck: Scenario
    ) -> None:
        """Major German pumped hydro is in 50Hertz (Goldisthal, Markersbach)
        and TransnetBW (Schluchsee complex); minor in TenneT and Amprion."""
        for label, sc in [("reiche", reiche), ("habeck", habeck)]:
            caps = sc.capacities_2035_gw.pumped_hydro
            assert caps.zone_50hertz >= 1.5, (
                f"{label} 50Hertz pumped hydro {caps.zone_50hertz} too low "
                "(Goldisthal + Markersbach alone are ~2.1 GW)"
            )
            assert caps.transnetbw >= 1.5, (
                f"{label} TransnetBW pumped hydro {caps.transnetbw} too low "
                "(Schluchsee complex alone is ~1.8 GW)"
            )
            assert caps.amprion < 1.0, (
                f"{label} Amprion pumped hydro {caps.amprion} too high "
                "(only minor plants exist there)"
            )


class TestDemandConsistency:
    """Electrolyzer electricity demand should be plausible given capacity."""

    def test_reiche_electrolyzer_demand_matches_capacity(self, reiche: Scenario) -> None:
        # 15 GW * 4500 FLH ~= 67 TWh; allow a wide band [40, 100]
        cap = _zone_sum(reiche.capacities_2035_gw.hydrogen_electrolyzer)
        demand = reiche.demand_2035.electrolyzer_demand_twh
        # FLH = demand_TWh / capacity_GW * 1000
        flh = demand / cap * 1000
        assert 3000 <= flh <= 6000, (
            f"Reiche implied electrolyzer FLH {flh:.0f}h outside plausible "
            f"[3000, 6000] range (capacity {cap} GW, demand {demand} TWh)"
        )

    def test_habeck_electrolyzer_demand_matches_capacity(self, habeck: Scenario) -> None:
        cap = _zone_sum(habeck.capacities_2035_gw.hydrogen_electrolyzer)
        demand = habeck.demand_2035.electrolyzer_demand_twh
        flh = demand / cap * 1000
        assert 3000 <= flh <= 6000, (
            f"Habeck implied electrolyzer FLH {flh:.0f}h outside plausible "
            f"[3000, 6000] range (capacity {cap} GW, demand {demand} TWh)"
        )
