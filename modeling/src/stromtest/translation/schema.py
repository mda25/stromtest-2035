"""Pydantic schema for stromtest scenario YAML files.

A scenario is a versioned, source-cited translation of a published energy plan
(Reiche, Habeck, Agora, NEP, ...) into runnable inputs for the PyPSA-Eur
pipeline. Every substantive numeric field MUST carry a `citation_ref` pointing
to an entry in the scenario's `sources` list. The translation layer refuses to
compile any scenario that violates this rule.

V0 schema is intentionally narrow; fields will grow as scenarios get authored.
The contract is: schema changes are additive within a major version; breaking
changes bump the schema major version and trigger a re-run for all scenarios.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

UNBZone = Literal["50hertz", "tennet", "amprion", "transnetbw"]

VERSION_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}\.\d+$")


class Source(BaseModel):
    """A citable source for one or more scenario assumptions."""

    model_config = ConfigDict(extra="forbid")

    ref: str = Field(
        min_length=1, description="Short citation key, referenced by citation_ref fields"
    )
    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    date: str | None = None


class CitedValue(BaseModel):
    """A numeric value with a mandatory citation reference."""

    model_config = ConfigDict(extra="forbid")

    value: float
    citation_ref: str = Field(min_length=1)


class ZoneCapacities(BaseModel):
    """Per-zone installed capacity (GW) with shared citation."""

    model_config = ConfigDict(extra="forbid")

    zone_50hertz: float = Field(ge=0, alias="50hertz")
    tennet: float = Field(ge=0)
    amprion: float = Field(ge=0)
    transnetbw: float = Field(ge=0)
    citation_ref: str = Field(min_length=1)


class Demand2035(BaseModel):
    """Projected 2035 demand parameters."""

    model_config = ConfigDict(extra="forbid")

    baseline_twh: float = Field(gt=0)
    heat_pump_share: float = Field(ge=0, le=1)
    ev_share_passenger: float = Field(ge=0, le=1)
    electrolyzer_demand_twh: float = Field(ge=0)
    citation_refs: list[str] = Field(min_length=1)


class Capacities2035(BaseModel):
    """Per-technology, per-zone installed capacities in 2035 (GW)."""

    model_config = ConfigDict(extra="forbid")

    wind_onshore: ZoneCapacities
    wind_offshore: ZoneCapacities
    solar_pv: ZoneCapacities
    gas_backup: ZoneCapacities
    hydrogen_electrolyzer: ZoneCapacities
    hydrogen_storage_twh: CitedValue
    battery_storage_gwh: CitedValue
    pumped_hydro: ZoneCapacities


class Scenario(BaseModel):
    """A versioned, citation-disciplined energy-plan scenario."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, description="Scenario family id, e.g. 'reiche'")
    version: str = Field(description="ISO-date with patch component, e.g. '2026-05-17.0'")
    display_name: str = Field(min_length=1)
    description: str = Field(min_length=10)
    authors: list[str] = Field(min_length=1)
    sources: list[Source] = Field(min_length=1)
    capacities_2035_gw: Capacities2035
    demand_2035: Demand2035
    transmission_ntc_gw: dict[str, float] = Field(
        description="Inter-zone NTC values keyed by '<from>_to_<to>'"
    )
    supersedes: str | None = None
    superseded_by: str | None = None

    @model_validator(mode="after")
    def validate_version_format(self) -> Scenario:
        if not VERSION_PATTERN.match(self.version):
            raise ValueError(f"version must match YYYY-MM-DD.PATCH, got {self.version!r}")
        return self

    @model_validator(mode="after")
    def validate_citation_refs_resolve(self) -> Scenario:
        known_refs = {s.ref for s in self.sources}
        missing: list[str] = []

        def check(ref: str, where: str) -> None:
            if ref not in known_refs:
                missing.append(f"{where}: {ref!r}")

        for tech_name, caps in self._iter_zone_caps():
            check(caps.citation_ref, f"capacities_2035_gw.{tech_name}.citation_ref")

        check(
            self.capacities_2035_gw.hydrogen_storage_twh.citation_ref,
            "capacities_2035_gw.hydrogen_storage_twh.citation_ref",
        )
        check(
            self.capacities_2035_gw.battery_storage_gwh.citation_ref,
            "capacities_2035_gw.battery_storage_gwh.citation_ref",
        )
        for ref in self.demand_2035.citation_refs:
            check(ref, "demand_2035.citation_refs")

        if missing:
            raise ValueError(
                "citation_ref(s) not present in sources list:\n  " + "\n  ".join(missing)
            )
        return self

    def _iter_zone_caps(self) -> list[tuple[str, ZoneCapacities]]:
        c = self.capacities_2035_gw
        return [
            ("wind_onshore", c.wind_onshore),
            ("wind_offshore", c.wind_offshore),
            ("solar_pv", c.solar_pv),
            ("gas_backup", c.gas_backup),
            ("hydrogen_electrolyzer", c.hydrogen_electrolyzer),
            ("pumped_hydro", c.pumped_hydro),
        ]

    @classmethod
    def from_yaml(cls, path: Path | str) -> Scenario:
        """Load and validate a scenario from a YAML file."""
        path = Path(path)
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls.model_validate(data)
