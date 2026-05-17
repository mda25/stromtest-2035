"""Translate a stromtest scenario into PyPSA-Eur input artifacts.

V0 contract:

    translate(scenario, output_dir) writes four files into output_dir/:

      config_overlay.yaml   Partial PyPSA-Eur config (countries, snapshots,
                            clustering, solver, base_network). Merged over
                            pypsa_eur/config/config.default.yaml at run time.
      capacities.json       Per-zone, per-technology installed capacity in
                            GW + demand parameters + storage values. Pipeline-
                            side (build step 6) decides how to inject these
                            into the PyPSA-Eur network (custom_powerplants.csv
                            for conventional, renewable_potentials override
                            for wind/solar, store/link config for H2/battery).
      busmap.csv            Copy of modeling/busmap/unb_busmap.csv filtered to
                            (bus_id, zone) columns, ready to drop into
                            pypsa_eur/data/busmaps/base_s_4_entsoegridkit.csv.
      manifest.json         version_hash + per-output-file SHA-256, source
                            citations summary, weather year (if specified).

Substantive-content hash semantics:

    The hash covers capacities, demand, and transmission_ntc values plus the
    scenario id and version's date part. It excludes:
      - patch component of the version (e.g. ``2026-05-17.0`` vs ``.1``)
      - citation_ref strings  (the ref keys can be renamed, that's not
        substantive; what they point to may be, but only when a substantive
        field's value changes)
      - source list (a different citation pointing at the same number is
        still the same number)
      - description, display_name, authors
      - supersedes / superseded_by

    Two scenarios with the same substantive hash will produce identical
    PyPSA-Eur runs; Snakemake should treat them as cache hits.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from stromtest.translation.schema import Scenario, ZoneCapacities

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_BUSMAP_PATH = REPO_ROOT / "modeling" / "busmap" / "unb_busmap.csv"


@dataclass(frozen=True)
class TranslationResult:
    """Return value of translate().

    Fields:
        output_dir: Where artifacts were written.
        version_hash: SHA-256 (first 16 hex chars) of substantive content.
        file_hashes: Mapping of output filename -> SHA-256 (full).
    """

    output_dir: Path
    version_hash: str
    file_hashes: dict[str, str]


def translate(
    scenario: Scenario,
    output_dir: Path,
    busmap_path: Path | None = None,
    weather_year: int | None = None,
) -> TranslationResult:
    """Translate a validated scenario into PyPSA-Eur input artifacts.

    Args:
        scenario: A validated Scenario (already loaded and Pydantic-checked).
        output_dir: Directory to write artifacts into. Created if missing.
        busmap_path: Path to the source busmap CSV. Defaults to the repo's
            committed modeling/busmap/unb_busmap.csv.
        weather_year: Optional historical weather year to embed in the
            config overlay (e.g., 2010, 2018, 2020). When supplied, snapshots
            and atlite cutout are set accordingly. When None, the overlay
            leaves snapshots unset (PyPSA-Eur default 2013 will apply).

    Returns:
        A TranslationResult with the version hash and per-file SHA-256s.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    busmap_path = busmap_path or DEFAULT_BUSMAP_PATH

    # Build artifacts.
    config_overlay = _build_config_overlay(scenario, weather_year)
    capacities = _build_capacities_json(scenario)
    busmap_csv = _build_busmap_for_pypsa(busmap_path)
    version_hash = substantive_content_hash(scenario)

    # Write artifacts.
    files: dict[str, str] = {}
    files["config_overlay.yaml"] = _write_yaml(output_dir / "config_overlay.yaml", config_overlay)
    files["capacities.json"] = _write_json(output_dir / "capacities.json", capacities)
    files["busmap.csv"] = _write_text(output_dir / "busmap.csv", busmap_csv)

    manifest = {
        "scenario_id": scenario.id,
        "scenario_version": scenario.version,
        "version_hash": version_hash,
        "weather_year": weather_year,
        "sources": [
            {"ref": s.ref, "title": s.title, "url": s.url, "date": s.date} for s in scenario.sources
        ],
        "file_hashes": files,
        "generator": "stromtest.translation.translate",
    }
    files["manifest.json"] = _write_json(output_dir / "manifest.json", manifest)

    return TranslationResult(
        output_dir=output_dir,
        version_hash=version_hash,
        file_hashes=files,
    )


# --- Helpers --------------------------------------------------------------


def _build_config_overlay(scenario: Scenario, weather_year: int | None) -> dict[str, object]:
    """Build the partial PyPSA-Eur config overlay for this scenario.

    Only the fields that differ from the PyPSA-Eur defaults are populated.
    Snakemake's update_config merges this over config.default.yaml.

    Reference: docs/methodology.md § 3 for the field semantics.
    """
    overlay: dict[str, object] = {
        "countries": ["DE"],
        "electricity": {
            "base_network": "entsoegridkit",
        },
        "clustering": {
            "mode": "custom_busmap",
        },
        "scenario": {
            "clusters": [4],
            "planning_horizons": [2035],
        },
        "foresight": "overnight",
        "solving": {
            "solver": {
                "name": "highs",
                "options": "highs-default",
            },
        },
        "stromtest": {
            "scenario_id": scenario.id,
            "scenario_version": scenario.version,
            "scenario_display_name": scenario.display_name,
        },
    }

    if weather_year is not None:
        overlay["snapshots"] = {
            "start": f"{weather_year}-01-01",
            "end": f"{weather_year + 1}-01-01",
            "inclusive": "left",
        }
        # The default cutout name follows PyPSA-Eur's europe-{year}-sarah3-era5
        # convention; we surface it here so the pipeline rule can build it.
        overlay["atlite"] = {
            "default_cutout": f"europe-{weather_year}-sarah3-era5",
        }

    return overlay


def _zone_caps_to_dict(zc: ZoneCapacities) -> dict[str, float]:
    return {
        "50hertz": zc.zone_50hertz,
        "tennet": zc.tennet,
        "amprion": zc.amprion,
        "transnetbw": zc.transnetbw,
    }


def _build_capacities_json(scenario: Scenario) -> dict[str, object]:
    """Build the structured capacities/demand JSON for pipeline-side injection.

    This is the contract between the translation layer and build step 6
    (single-run pipeline). It contains the per-zone capacities, demand
    parameters, and transmission NTC values flattened into machine-friendly
    keys.
    """
    caps = scenario.capacities_2035_gw
    return {
        "scenario_id": scenario.id,
        "scenario_version": scenario.version,
        "capacities_2035_gw": {
            "wind_onshore": _zone_caps_to_dict(caps.wind_onshore),
            "wind_offshore": _zone_caps_to_dict(caps.wind_offshore),
            "solar_pv": _zone_caps_to_dict(caps.solar_pv),
            "gas_backup": _zone_caps_to_dict(caps.gas_backup),
            "hydrogen_electrolyzer": _zone_caps_to_dict(caps.hydrogen_electrolyzer),
            "hydrogen_storage_twh": caps.hydrogen_storage_twh.value,
            "battery_storage_gwh": caps.battery_storage_gwh.value,
            "pumped_hydro": _zone_caps_to_dict(caps.pumped_hydro),
        },
        "demand_2035": {
            "baseline_twh": scenario.demand_2035.baseline_twh,
            "heat_pump_share": scenario.demand_2035.heat_pump_share,
            "ev_share_passenger": scenario.demand_2035.ev_share_passenger,
            "electrolyzer_demand_twh": scenario.demand_2035.electrolyzer_demand_twh,
        },
        "transmission_ntc_gw": dict(scenario.transmission_ntc_gw),
    }


def _build_busmap_for_pypsa(source_csv: Path) -> str:
    """Reduce the committed busmap CSV to PyPSA-Eur's expected 2-column format.

    PyPSA-Eur's cluster_network.py reads a CSV indexed by bus_id with the
    cluster name as the value column. Our committed unb_busmap.csv has extra
    columns (lon, lat, bundesland, voltage, border_warning) which we strip.
    """
    if not source_csv.exists():
        raise FileNotFoundError(f"busmap source CSV not found: {source_csv}")
    import csv
    from io import StringIO

    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(["bus_id", "cluster"])
    with source_csv.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            writer.writerow([row["bus_id"], row["zone"]])
    return out.getvalue()


def substantive_content_hash(scenario: Scenario) -> str:
    """Deterministic hash of the substantive content of a scenario.

    Excludes metadata that can change without changing the model outputs:
    patch component of version, citation_ref values, description, etc.
    Returns the first 16 hex chars of SHA-256 over a canonical JSON
    serialization.
    """
    # Strip the patch component from the version.
    date_part = re.sub(r"\.\d+$", "", scenario.version)

    payload = {
        "id": scenario.id,
        "version_date": date_part,
        "capacities_2035_gw": {
            "wind_onshore": _zone_caps_to_dict(scenario.capacities_2035_gw.wind_onshore),
            "wind_offshore": _zone_caps_to_dict(scenario.capacities_2035_gw.wind_offshore),
            "solar_pv": _zone_caps_to_dict(scenario.capacities_2035_gw.solar_pv),
            "gas_backup": _zone_caps_to_dict(scenario.capacities_2035_gw.gas_backup),
            "hydrogen_electrolyzer": _zone_caps_to_dict(
                scenario.capacities_2035_gw.hydrogen_electrolyzer
            ),
            "hydrogen_storage_twh": scenario.capacities_2035_gw.hydrogen_storage_twh.value,
            "battery_storage_gwh": scenario.capacities_2035_gw.battery_storage_gwh.value,
            "pumped_hydro": _zone_caps_to_dict(scenario.capacities_2035_gw.pumped_hydro),
        },
        "demand_2035": {
            "baseline_twh": scenario.demand_2035.baseline_twh,
            "heat_pump_share": scenario.demand_2035.heat_pump_share,
            "ev_share_passenger": scenario.demand_2035.ev_share_passenger,
            "electrolyzer_demand_twh": scenario.demand_2035.electrolyzer_demand_twh,
        },
        "transmission_ntc_gw": dict(scenario.transmission_ntc_gw),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _write_yaml(path: Path, data: object) -> str:
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    path.write_text(text, encoding="utf-8")
    return _sha256(text)


def _write_json(path: Path, data: object) -> str:
    text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")
    return _sha256(text + "\n")


def _write_text(path: Path, text: str) -> str:
    path.write_text(text, encoding="utf-8")
    return _sha256(text)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
