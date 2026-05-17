"""Tests for the translation -> PyPSA-Eur tree application step."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from stromtest.apply import (
    apply_translation,
    load_manifest,
)
from stromtest.translation.schema import Scenario
from stromtest.translation.translate import translate

REPO_MODELING = Path(__file__).resolve().parents[1]
REICHE_PATH = REPO_MODELING / "scenarios" / "reiche" / "2026-05-17.0.yml"


@pytest.fixture
def fake_pypsa_eur(tmp_path: Path) -> Path:
    """Construct a minimal directory structure that looks like a PyPSA-Eur tree.

    Includes a stub config/config.default.yaml so apply_translation thinks it
    found a real PyPSA-Eur clone.
    """
    root = tmp_path / "pypsa_eur"
    (root / "config").mkdir(parents=True)
    (root / "data" / "busmaps").mkdir(parents=True)
    (root / "config" / "config.default.yaml").write_text(
        yaml.safe_dump(
            {
                "countries": ["DE", "FR", "BE"],
                "clustering": {"mode": "busmap"},
                "solving": {"solver": {"name": "highs"}},
                "scenario": {"clusters": [10], "planning_horizons": [2030]},
            }
        ),
        encoding="utf-8",
    )
    return root


@pytest.fixture
def translation_bundle(tmp_path: Path) -> Path:
    """Run translate() on the committed Reiche scenario to produce a real bundle."""
    out = tmp_path / "translation"
    scenario = Scenario.from_yaml(REICHE_PATH)
    translate(scenario, out, weather_year=2010)
    return out


class TestApplyHappyPath:
    def test_returns_apply_result(self, translation_bundle: Path, fake_pypsa_eur: Path) -> None:
        result = apply_translation(translation_bundle, fake_pypsa_eur)
        assert result.pypsa_eur_dir == fake_pypsa_eur
        assert result.config_yaml_path.exists()
        assert result.busmap_path.exists()
        assert result.capacities_json_path.exists()
        assert result.manifest_path.exists()

    def test_busmap_lands_at_expected_path(
        self, translation_bundle: Path, fake_pypsa_eur: Path
    ) -> None:
        """Default args target data/busmaps/base_s_4_entsoegridkit.csv."""
        result = apply_translation(translation_bundle, fake_pypsa_eur)
        assert result.busmap_path == (
            fake_pypsa_eur / "data" / "busmaps" / "base_s_4_entsoegridkit.csv"
        )

    def test_busmap_custom_args(self, translation_bundle: Path, fake_pypsa_eur: Path) -> None:
        result = apply_translation(
            translation_bundle, fake_pypsa_eur, clusters=10, base_network="osm"
        )
        assert result.busmap_path == (fake_pypsa_eur / "data" / "busmaps" / "base_s_10_osm.csv")

    def test_config_overlay_merged_over_default(
        self, translation_bundle: Path, fake_pypsa_eur: Path
    ) -> None:
        """Resulting config.yaml must contain BOTH our overrides and defaults."""
        result = apply_translation(translation_bundle, fake_pypsa_eur)
        merged = yaml.safe_load(result.config_yaml_path.read_text())
        # From our overlay:
        assert merged["countries"] == ["DE"]
        assert merged["clustering"]["mode"] == "custom_busmap"
        assert merged["scenario"]["clusters"] == [4]
        # Solver section was already in default; our overlay extends it.
        assert merged["solving"]["solver"]["name"] == "highs"

    def test_provenance_dir_created(self, translation_bundle: Path, fake_pypsa_eur: Path) -> None:
        result = apply_translation(translation_bundle, fake_pypsa_eur)
        assert result.capacities_json_path.parent.name == ".stromtest"
        # capacities.json content survives the copy.
        caps = json.loads(result.capacities_json_path.read_text())
        assert caps["scenario_id"] == "reiche"
        assert caps["scenario_version"] == "2026-05-17.0"


class TestApplyRejectsBadInputs:
    def test_missing_translation_artifact_fails(self, tmp_path: Path, fake_pypsa_eur: Path) -> None:
        empty = tmp_path / "empty"
        empty.mkdir()
        with pytest.raises(FileNotFoundError, match="missing required artifact"):
            apply_translation(empty, fake_pypsa_eur)

    def test_missing_pypsa_eur_dir_fails(self, translation_bundle: Path, tmp_path: Path) -> None:
        bad = tmp_path / "does_not_exist"
        with pytest.raises(FileNotFoundError, match="pypsa_eur_dir does not exist"):
            apply_translation(translation_bundle, bad)

    def test_pypsa_eur_dir_without_default_config_fails(
        self, translation_bundle: Path, tmp_path: Path
    ) -> None:
        empty_root = tmp_path / "empty_root"
        empty_root.mkdir()
        with pytest.raises(FileNotFoundError, match="does not look like PyPSA-Eur"):
            apply_translation(translation_bundle, empty_root)


class TestIdempotenceAndReapply:
    def test_apply_twice_overwrites_cleanly(
        self, translation_bundle: Path, fake_pypsa_eur: Path
    ) -> None:
        """Re-applying the same bundle should be a no-op (idempotent)."""
        r1 = apply_translation(translation_bundle, fake_pypsa_eur)
        config_first = r1.config_yaml_path.read_text()
        busmap_first = r1.busmap_path.read_text()

        r2 = apply_translation(translation_bundle, fake_pypsa_eur)
        config_second = r2.config_yaml_path.read_text()
        busmap_second = r2.busmap_path.read_text()

        assert config_first == config_second
        assert busmap_first == busmap_second


def test_load_manifest_reads_translation_dir(translation_bundle: Path) -> None:
    manifest = load_manifest(translation_bundle)
    assert manifest["scenario_id"] == "reiche"
    assert "version_hash" in manifest
    assert len(manifest["version_hash"]) == 16
