"""Tests for the scenario schema (test plan item 1)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from stromtest.translation.schema import (
    Capacities2035,
    CitedValue,
    Demand2035,
    Scenario,
    Source,
    ZoneCapacities,
)


def _valid_zone_caps(ref: str = "TEST-REF") -> ZoneCapacities:
    return ZoneCapacities.model_validate(
        {
            "50hertz": 10.0,
            "tennet": 20.0,
            "amprion": 15.0,
            "transnetbw": 5.0,
            "citation_ref": ref,
        }
    )


def _valid_scenario_data(version: str = "2026-05-17.0") -> dict:
    return {
        "id": "reiche",
        "version": version,
        "display_name": "Reiche Plan (test fixture)",
        "description": "A scenario used only in tests, do not cite.",
        "authors": ["test-author"],
        "sources": [
            {
                "ref": "TEST-REF",
                "title": "Test source",
                "url": "https://example.invalid/",
            }
        ],
        "capacities_2035_gw": {
            "wind_onshore": _valid_zone_caps().model_dump(by_alias=True),
            "wind_offshore": _valid_zone_caps().model_dump(by_alias=True),
            "solar_pv": _valid_zone_caps().model_dump(by_alias=True),
            "gas_backup": _valid_zone_caps().model_dump(by_alias=True),
            "hydrogen_electrolyzer": _valid_zone_caps().model_dump(by_alias=True),
            "hydrogen_storage_twh": {"value": 50.0, "citation_ref": "TEST-REF"},
            "battery_storage_gwh": {"value": 60.0, "citation_ref": "TEST-REF"},
            "pumped_hydro": _valid_zone_caps().model_dump(by_alias=True),
        },
        "demand_2035": {
            "baseline_twh": 540.0,
            "heat_pump_share": 0.42,
            "ev_share_passenger": 0.55,
            "electrolyzer_demand_twh": 30.0,
            "citation_refs": ["TEST-REF"],
        },
        "transmission_ntc_gw": {"50hertz_to_tennet": 12.5, "tennet_to_amprion": 8.7},
    }


class TestVersionFormat:
    """Version field must follow YYYY-MM-DD.PATCH pattern."""

    def test_valid_version_accepted(self) -> None:
        Scenario.model_validate(_valid_scenario_data("2026-05-17.0"))

    def test_valid_patch_bump_accepted(self) -> None:
        Scenario.model_validate(_valid_scenario_data("2026-05-17.3"))

    @pytest.mark.parametrize(
        "bad_version",
        [
            "2026-05-17",  # missing patch
            "2026-5-17.0",  # missing zero-pad
            "26-05-17.0",  # 2-digit year
            "v1.0.0",  # semver, not date-based
            "2026-05-17.0.1",  # too many components
            "",
        ],
    )
    def test_bad_version_rejected(self, bad_version: str) -> None:
        with pytest.raises(ValidationError):
            Scenario.model_validate(_valid_scenario_data(bad_version))


class TestCitationRefs:
    """Every substantive citation_ref must resolve to a source entry."""

    def test_valid_scenario_passes(self) -> None:
        Scenario.model_validate(_valid_scenario_data())

    def test_undefined_citation_ref_rejected(self) -> None:
        data = _valid_scenario_data()
        data["capacities_2035_gw"]["wind_onshore"]["citation_ref"] = "NOT-IN-SOURCES"
        with pytest.raises(ValidationError, match="citation_ref"):
            Scenario.model_validate(data)

    def test_demand_undefined_citation_ref_rejected(self) -> None:
        data = _valid_scenario_data()
        data["demand_2035"]["citation_refs"] = ["NOT-IN-SOURCES"]
        with pytest.raises(ValidationError, match="citation_ref"):
            Scenario.model_validate(data)


class TestZoneCapacities:
    """ZoneCapacities must use the ÜNB zone names and reject typos."""

    def test_typo_in_zone_name_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ZoneCapacities.model_validate(
                {
                    "50hertz": 10.0,
                    "tennett": 20.0,  # typo: 'tennett' instead of 'tennet'
                    "amprion": 15.0,
                    "transnetbw": 5.0,
                    "citation_ref": "TEST-REF",
                }
            )

    def test_negative_capacity_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ZoneCapacities.model_validate(
                {
                    "50hertz": -1.0,
                    "tennet": 20.0,
                    "amprion": 15.0,
                    "transnetbw": 5.0,
                    "citation_ref": "TEST-REF",
                }
            )

    def test_missing_citation_ref_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ZoneCapacities.model_validate(
                {
                    "50hertz": 10.0,
                    "tennet": 20.0,
                    "amprion": 15.0,
                    "transnetbw": 5.0,
                }
            )


class TestDemandConstraints:
    """Demand shares are bounded to [0, 1]."""

    def test_share_above_one_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Demand2035.model_validate(
                {
                    "baseline_twh": 540.0,
                    "heat_pump_share": 1.5,  # > 1.0
                    "ev_share_passenger": 0.55,
                    "electrolyzer_demand_twh": 30.0,
                    "citation_refs": ["TEST-REF"],
                }
            )

    def test_zero_baseline_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Demand2035.model_validate(
                {
                    "baseline_twh": 0.0,
                    "heat_pump_share": 0.42,
                    "ev_share_passenger": 0.55,
                    "electrolyzer_demand_twh": 30.0,
                    "citation_refs": ["TEST-REF"],
                }
            )


class TestCitedValue:
    def test_requires_citation_ref(self) -> None:
        with pytest.raises(ValidationError):
            CitedValue.model_validate({"value": 50.0})

    def test_extra_fields_rejected(self) -> None:
        with pytest.raises(ValidationError):
            CitedValue.model_validate({"value": 50.0, "citation_ref": "TEST-REF", "extra": "nope"})


class TestSourceFields:
    def test_source_round_trip(self) -> None:
        s = Source.model_validate({"ref": "X", "title": "T", "url": "https://example.invalid/"})
        assert s.ref == "X"
        assert s.date is None

    def test_extra_fields_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Source.model_validate({"ref": "X", "title": "T", "url": "u", "totally_made_up": 1})


def test_capacities_block_round_trips() -> None:
    """Sanity: a fully-specified Capacities2035 block round-trips."""
    data = _valid_scenario_data()
    caps = Capacities2035.model_validate(data["capacities_2035_gw"])
    assert caps.wind_onshore.tennet == 20.0
    assert caps.hydrogen_storage_twh.value == 50.0
