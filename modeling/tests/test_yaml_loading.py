"""Tests for loading scenarios from YAML on disk."""

from __future__ import annotations

from pathlib import Path

import pytest

from stromtest.translation.schema import Scenario

FIXTURES = Path(__file__).parent / "fixtures"


def test_example_fixture_loads() -> None:
    """The test fixture validates round-trip through Scenario.from_yaml."""
    scenario = Scenario.from_yaml(FIXTURES / "example_scenario.yml")
    assert scenario.id == "test_fixture"
    assert scenario.version == "2026-05-17.0"
    assert scenario.capacities_2035_gw.wind_onshore.tennet == 22.0
    assert scenario.demand_2035.baseline_twh == 540.0
    assert {s.ref for s in scenario.sources} == {"TEST-REF-1", "TEST-REF-2"}


def test_template_validates_as_schema() -> None:
    """The repo-level _template.yml at scenarios/_template.yml must validate.

    The template documents the schema for new scenarios; if it stops validating
    we either broke the schema or broke the template.
    """
    template = Path(__file__).resolve().parents[1] / "scenarios" / "_template.yml"
    Scenario.from_yaml(template)


def test_missing_file_raises_clear_error() -> None:
    with pytest.raises(FileNotFoundError):
        Scenario.from_yaml(FIXTURES / "does_not_exist.yml")
