"""Tests for the scenario → PyPSA-Eur translation layer (build step 5).

Covers test-plan items 2 (translation layer) and 3 (version-hash semantics)
from docs/design.md § Test Plan (V0).
"""

from __future__ import annotations

import copy
import csv
import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from stromtest.translation.schema import Scenario
from stromtest.translation.translate import (
    DEFAULT_BUSMAP_PATH,
    TranslationResult,
    substantive_content_hash,
    translate,
)

REPO_MODELING = Path(__file__).resolve().parents[1]
REICHE_PATH = REPO_MODELING / "scenarios" / "reiche" / "2026-05-17.0.yml"
HABECK_PATH = REPO_MODELING / "scenarios" / "habeck" / "2024-klima45.0.yml"
FIXTURE_PATH = REPO_MODELING / "tests" / "fixtures" / "example_scenario.yml"


@pytest.fixture
def reiche() -> Scenario:
    return Scenario.from_yaml(REICHE_PATH)


@pytest.fixture
def habeck() -> Scenario:
    return Scenario.from_yaml(HABECK_PATH)


@pytest.fixture
def fixture_scenario() -> Scenario:
    return Scenario.from_yaml(FIXTURE_PATH)


# --- File-output tests ----------------------------------------------------


class TestTranslateProducesArtifacts:
    """Translation must emit all four expected files."""

    def test_returns_translation_result(self, reiche: Scenario, tmp_path: Path) -> None:
        result = translate(reiche, tmp_path)
        assert isinstance(result, TranslationResult)
        assert result.output_dir == tmp_path
        assert len(result.version_hash) == 16
        assert all(c in "0123456789abcdef" for c in result.version_hash)

    def test_writes_all_four_files(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        for filename in (
            "config_overlay.yaml",
            "capacities.json",
            "busmap.csv",
            "manifest.json",
        ):
            assert (tmp_path / filename).exists(), f"missing {filename}"

    def test_records_file_hashes(self, reiche: Scenario, tmp_path: Path) -> None:
        result = translate(reiche, tmp_path)
        assert set(result.file_hashes.keys()) == {
            "config_overlay.yaml",
            "capacities.json",
            "busmap.csv",
            "manifest.json",
        }
        # SHA-256 is 64 hex chars.
        for fname, fhash in result.file_hashes.items():
            assert len(fhash) == 64, f"{fname} hash has wrong length: {fhash}"

    def test_creates_output_dir_if_missing(self, reiche: Scenario, tmp_path: Path) -> None:
        nested = tmp_path / "deeper" / "still_deeper"
        result = translate(reiche, nested)
        assert nested.exists()
        assert result.output_dir == nested


# --- Config overlay tests -------------------------------------------------


class TestConfigOverlayShape:
    """The config_overlay.yaml must contain the keys the pipeline expects."""

    def test_overlay_has_required_keys(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        overlay = yaml.safe_load((tmp_path / "config_overlay.yaml").read_text())
        assert overlay["countries"] == ["DE"]
        assert overlay["electricity"]["base_network"] == "entsoegridkit"
        assert overlay["clustering"]["mode"] == "custom_busmap"
        assert overlay["scenario"]["clusters"] == [4]
        assert overlay["scenario"]["planning_horizons"] == [2035]
        assert overlay["solving"]["solver"]["name"] == "highs"

    def test_overlay_embeds_scenario_metadata(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        overlay = yaml.safe_load((tmp_path / "config_overlay.yaml").read_text())
        assert overlay["stromtest"]["scenario_id"] == "reiche"
        assert overlay["stromtest"]["scenario_version"] == "2026-05-17.0"

    def test_no_weather_year_means_no_snapshots(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        overlay = yaml.safe_load((tmp_path / "config_overlay.yaml").read_text())
        assert "snapshots" not in overlay
        assert "atlite" not in overlay

    def test_weather_year_sets_snapshots_and_cutout(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path, weather_year=2010)
        overlay = yaml.safe_load((tmp_path / "config_overlay.yaml").read_text())
        assert overlay["snapshots"]["start"] == "2010-01-01"
        assert overlay["snapshots"]["end"] == "2011-01-01"
        assert overlay["snapshots"]["inclusive"] == "left"
        assert overlay["atlite"]["default_cutout"] == "europe-2010-sarah3-era5"


# --- Capacities JSON tests ------------------------------------------------


class TestCapacitiesJsonShape:
    """The capacities.json must capture every substantive number."""

    def test_capacities_round_trip(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        caps = json.loads((tmp_path / "capacities.json").read_text())
        # Check a couple of representative values match the source scenario.
        assert (
            caps["capacities_2035_gw"]["wind_onshore"]["tennet"]
            == reiche.capacities_2035_gw.wind_onshore.tennet
        )
        assert (
            caps["capacities_2035_gw"]["hydrogen_storage_twh"]
            == reiche.capacities_2035_gw.hydrogen_storage_twh.value
        )
        assert caps["demand_2035"]["baseline_twh"] == reiche.demand_2035.baseline_twh

    def test_all_four_zones_present_for_every_zone_tech(
        self, habeck: Scenario, tmp_path: Path
    ) -> None:
        translate(habeck, tmp_path)
        caps = json.loads((tmp_path / "capacities.json").read_text())
        zone_techs = [
            "wind_onshore",
            "wind_offshore",
            "solar_pv",
            "gas_backup",
            "hydrogen_electrolyzer",
            "pumped_hydro",
        ]
        for tech in zone_techs:
            zones = caps["capacities_2035_gw"][tech]
            assert set(zones.keys()) == {"50hertz", "tennet", "amprion", "transnetbw"}, (
                f"{tech} missing zones: {zones.keys()}"
            )


# --- Busmap CSV tests -----------------------------------------------------


class TestBusmapCopy:
    """The pipeline-side busmap CSV must contain bus_id + cluster only."""

    def test_busmap_columns(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        with (tmp_path / "busmap.csv").open() as f:
            reader = csv.reader(f)
            header = next(reader)
            assert header == ["bus_id", "cluster"]

    def test_busmap_row_count_matches_source(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        with (tmp_path / "busmap.csv").open() as f:
            rows = list(csv.DictReader(f))
        # Source busmap has 474 rows; copy must match.
        assert len(rows) == 474

    def test_busmap_clusters_only_valid_zones(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        with (tmp_path / "busmap.csv").open() as f:
            rows = list(csv.DictReader(f))
        clusters = {r["cluster"] for r in rows}
        assert clusters == {"50hertz", "tennet", "amprion", "transnetbw"}

    def test_busmap_missing_source_raises(self, reiche: Scenario, tmp_path: Path) -> None:
        nonexistent = tmp_path / "does_not_exist.csv"
        with pytest.raises(FileNotFoundError):
            translate(reiche, tmp_path / "output", busmap_path=nonexistent)


# --- Manifest tests -------------------------------------------------------


class TestManifest:
    """The manifest must carry version hash + source citations."""

    def test_manifest_has_version_hash(self, reiche: Scenario, tmp_path: Path) -> None:
        result = translate(reiche, tmp_path)
        manifest = json.loads((tmp_path / "manifest.json").read_text())
        assert manifest["version_hash"] == result.version_hash
        assert manifest["scenario_id"] == "reiche"
        assert manifest["scenario_version"] == "2026-05-17.0"

    def test_manifest_includes_all_sources(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path)
        manifest = json.loads((tmp_path / "manifest.json").read_text())
        manifest_refs = {s["ref"] for s in manifest["sources"]}
        scenario_refs = {s.ref for s in reiche.sources}
        assert manifest_refs == scenario_refs

    def test_manifest_records_weather_year(self, reiche: Scenario, tmp_path: Path) -> None:
        translate(reiche, tmp_path, weather_year=2018)
        manifest = json.loads((tmp_path / "manifest.json").read_text())
        assert manifest["weather_year"] == 2018


# --- Version-hash semantics tests -----------------------------------------


class TestVersionHash:
    """Substantive-content hash must reflect substantive changes, not metadata."""

    def test_same_scenario_same_hash(self, reiche: Scenario) -> None:
        assert substantive_content_hash(reiche) == substantive_content_hash(reiche)

    def test_different_scenarios_different_hash(self, reiche: Scenario, habeck: Scenario) -> None:
        assert substantive_content_hash(reiche) != substantive_content_hash(habeck)

    def test_patch_version_bump_same_hash(self, reiche: Scenario) -> None:
        """Patch component (.0 vs .1) must NOT change the hash."""
        h_before = substantive_content_hash(reiche)
        # Construct an equivalent scenario with a bumped patch component.
        bumped = reiche.model_copy(update={"version": "2026-05-17.1"})
        h_after = substantive_content_hash(bumped)
        assert h_before == h_after

    def test_iso_date_version_bump_different_hash(self, reiche: Scenario) -> None:
        """ISO-date bump (substantive new release) MUST change the hash."""
        h_before = substantive_content_hash(reiche)
        new_date = reiche.model_copy(update={"version": "2026-09-15.0"})
        h_after = substantive_content_hash(new_date)
        assert h_before != h_after

    def test_description_edit_same_hash(self, reiche: Scenario) -> None:
        """Editing the human-readable description does not change the hash."""
        h_before = substantive_content_hash(reiche)
        edited = reiche.model_copy(update={"description": reiche.description + " (typo fixed)"})
        h_after = substantive_content_hash(edited)
        assert h_before == h_after

    def test_source_url_edit_same_hash(self, reiche: Scenario) -> None:
        """Editing a citation URL but keeping the numbers unchanged does not
        bump the hash."""
        h_before = substantive_content_hash(reiche)
        new_sources = list(reiche.sources)
        new_sources[0] = new_sources[0].model_copy(update={"url": "https://updated.invalid/path"})
        edited = reiche.model_copy(update={"sources": new_sources})
        h_after = substantive_content_hash(edited)
        assert h_before == h_after

    def test_capacity_edit_changes_hash(self, fixture_scenario: Scenario, tmp_path: Path) -> None:
        """Changing a substantive capacity number MUST change the hash.

        Built on the test fixture (not Reiche) so we can construct an
        otherwise-identical scenario with one number tweaked.
        """
        h_before = substantive_content_hash(fixture_scenario)
        original = fixture_scenario.capacities_2035_gw.wind_onshore
        bumped_wind = original.model_copy(update={"tennet": original.tennet + 10.0})
        new_caps = fixture_scenario.capacities_2035_gw.model_copy(
            update={"wind_onshore": bumped_wind}
        )
        edited = fixture_scenario.model_copy(update={"capacities_2035_gw": new_caps})
        h_after = substantive_content_hash(edited)
        assert h_before != h_after

    def test_demand_edit_changes_hash(self, fixture_scenario: Scenario) -> None:
        """Changing demand_2035 must change the hash."""
        h_before = substantive_content_hash(fixture_scenario)
        new_demand = fixture_scenario.demand_2035.model_copy(
            update={"baseline_twh": fixture_scenario.demand_2035.baseline_twh + 50.0}
        )
        edited = fixture_scenario.model_copy(update={"demand_2035": new_demand})
        h_after = substantive_content_hash(edited)
        assert h_before != h_after

    def test_ntc_edit_changes_hash(self, fixture_scenario: Scenario) -> None:
        """Changing transmission_ntc_gw must change the hash."""
        h_before = substantive_content_hash(fixture_scenario)
        new_ntc: dict[str, Any] = dict(fixture_scenario.transmission_ntc_gw)
        first_key = next(iter(new_ntc.keys()))
        new_ntc[first_key] = new_ntc[first_key] + 1.0
        edited = fixture_scenario.model_copy(update={"transmission_ntc_gw": new_ntc})
        h_after = substantive_content_hash(edited)
        assert h_before != h_after


# --- End-to-end test ------------------------------------------------------


def test_default_busmap_path_resolves() -> None:
    """The translate module's default busmap path must point at a real file."""
    assert DEFAULT_BUSMAP_PATH.exists(), (
        f"default busmap path does not exist: {DEFAULT_BUSMAP_PATH}"
    )


def test_translate_both_real_scenarios(reiche: Scenario, habeck: Scenario, tmp_path: Path) -> None:
    """Smoke test: both committed scenarios translate end-to-end."""
    r_dir = tmp_path / "reiche"
    h_dir = tmp_path / "habeck"
    r = translate(reiche, r_dir, weather_year=2010)
    h = translate(habeck, h_dir, weather_year=2010)
    assert r.version_hash != h.version_hash
    # All artifacts must exist.
    for d in (r_dir, h_dir):
        for fname in (
            "config_overlay.yaml",
            "capacities.json",
            "busmap.csv",
            "manifest.json",
        ):
            assert (d / fname).exists()


def _deep_copy_scenario_dict(path: Path) -> dict[str, Any]:
    """Helper: load scenario YAML as plain dict (for hash-edit tests)."""
    return copy.deepcopy(yaml.safe_load(path.read_text(encoding="utf-8")))
