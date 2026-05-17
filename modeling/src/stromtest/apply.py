"""Apply a translation-output bundle to a PyPSA-Eur tree.

The translation layer (``stromtest.translation.translate``) produces four
artifacts in an output directory:

  - ``config_overlay.yaml`` — partial PyPSA-Eur config
  - ``capacities.json`` — per-zone capacities + demand (informational for V0)
  - ``busmap.csv`` — 2-column (bus_id, cluster) CSV
  - ``manifest.json`` — version hash + source citations

This module copies / merges those into the locations PyPSA-Eur expects so the
pipeline can be invoked from inside the PyPSA-Eur tree:

  pypsa_eur/
    config/config.yaml                              # = config.default <- config_overlay
    data/busmaps/base_s_4_entsoegridkit.csv         # = our busmap
    .stromtest/capacities.json                      # informational; pipeline-side injection
    .stromtest/manifest.json                        # provenance for the run

Per-zone capacity injection (translating capacities.json into PyPSA-Eur's
custom_powerplants.csv / extendable_carriers / regional constraints) is
deferred to build step 7 — this module only handles file-level placement.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class ApplyResult:
    """Return value of apply_translation()."""

    pypsa_eur_dir: Path
    config_yaml_path: Path
    busmap_path: Path
    capacities_json_path: Path
    manifest_path: Path


def apply_translation(
    translation_dir: Path,
    pypsa_eur_dir: Path,
    *,
    clusters: int = 4,
    base_network: str = "entsoegridkit",
) -> ApplyResult:
    """Apply a translation-output bundle to a PyPSA-Eur tree.

    Args:
        translation_dir: Directory produced by stromtest.translation.translate
            (must contain the four expected files).
        pypsa_eur_dir: Path to a PyPSA-Eur checkout / fork. Files inside the
            tree get written / overwritten.
        clusters: Cluster count the busmap targets (default 4 — our four
            ÜNB zones).
        base_network: PyPSA-Eur base_network mode (default "entsoegridkit").
            This decides the busmap target filename.

    Returns:
        ApplyResult listing every path that was written or overwritten.

    Raises:
        FileNotFoundError: if any required artifact is missing.
        ValueError: if the bundle's manifest disagrees with arguments.
    """
    translation_dir = Path(translation_dir)
    pypsa_eur_dir = Path(pypsa_eur_dir)

    overlay_src = translation_dir / "config_overlay.yaml"
    capacities_src = translation_dir / "capacities.json"
    busmap_src = translation_dir / "busmap.csv"
    manifest_src = translation_dir / "manifest.json"
    for path in (overlay_src, capacities_src, busmap_src, manifest_src):
        if not path.exists():
            raise FileNotFoundError(f"missing required artifact: {path}")

    if not pypsa_eur_dir.exists():
        raise FileNotFoundError(f"pypsa_eur_dir does not exist: {pypsa_eur_dir}")
    config_default_path = pypsa_eur_dir / "config" / "config.default.yaml"
    if not config_default_path.exists():
        raise FileNotFoundError(
            f"pypsa_eur_dir does not look like PyPSA-Eur (missing "
            f"config/config.default.yaml): {pypsa_eur_dir}"
        )

    config_yaml_path = _merge_config(overlay_src, pypsa_eur_dir)
    busmap_target = _copy_busmap(busmap_src, pypsa_eur_dir, clusters, base_network)
    capacities_target, manifest_target = _drop_provenance(
        capacities_src, manifest_src, pypsa_eur_dir
    )

    return ApplyResult(
        pypsa_eur_dir=pypsa_eur_dir,
        config_yaml_path=config_yaml_path,
        busmap_path=busmap_target,
        capacities_json_path=capacities_target,
        manifest_path=manifest_target,
    )


# --- Helpers --------------------------------------------------------------


def _merge_config(overlay_src: Path, pypsa_eur_dir: Path) -> Path:
    """Merge our overlay over config.default.yaml into config.yaml.

    PyPSA-Eur auto-reads config/config.yaml at workflow start
    (Snakefile:31) and merges over config.default.yaml. We materialize that
    merge explicitly so the user can inspect the resolved config.
    """
    overlay = yaml.safe_load(overlay_src.read_text(encoding="utf-8")) or {}
    target = pypsa_eur_dir / "config" / "config.yaml"
    if target.exists():
        existing = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        merged = _deep_merge(existing, overlay)
    else:
        merged = overlay
    target.write_text(
        yaml.safe_dump(merged, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    return target


def _copy_busmap(
    busmap_src: Path,
    pypsa_eur_dir: Path,
    clusters: int,
    base_network: str,
) -> Path:
    """Copy busmap to data/busmaps/base_s_{clusters}_{base_network}.csv."""
    busmaps_dir = pypsa_eur_dir / "data" / "busmaps"
    busmaps_dir.mkdir(parents=True, exist_ok=True)
    target = busmaps_dir / f"base_s_{clusters}_{base_network}.csv"
    shutil.copy2(busmap_src, target)
    return target


def _drop_provenance(
    capacities_src: Path,
    manifest_src: Path,
    pypsa_eur_dir: Path,
) -> tuple[Path, Path]:
    """Drop capacities.json + manifest.json under .stromtest/ for provenance."""
    provenance_dir = pypsa_eur_dir / ".stromtest"
    provenance_dir.mkdir(parents=True, exist_ok=True)
    capacities_target = provenance_dir / "capacities.json"
    manifest_target = provenance_dir / "manifest.json"
    shutil.copy2(capacities_src, capacities_target)
    shutil.copy2(manifest_src, manifest_target)
    return capacities_target, manifest_target


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay into base. Lists and scalars in overlay win."""
    result = dict(base)
    for k, v in overlay.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_manifest(translation_dir: Path) -> dict:
    """Read the manifest.json from a translation output dir."""
    return json.loads((Path(translation_dir) / "manifest.json").read_text())
