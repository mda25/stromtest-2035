"""stromtest CLI entry point.

V0 scope: scenario validation and translation. Pipeline orchestration
runs via Snakemake, not this CLI.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from stromtest.apply import apply_translation
from stromtest.inject_capacities import inject_capacities
from stromtest.translation.schema import Scenario
from stromtest.translation.translate import translate as do_translate


@click.group()
def main() -> None:
    """stromtest-2035 command-line interface."""


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
def validate(scenario_path: Path) -> None:
    """Validate a scenario YAML file against the schema.

    Exits non-zero with a useful message if validation fails.
    """
    try:
        scenario = Scenario.from_yaml(scenario_path)
    except Exception as exc:
        click.echo(f"INVALID: {scenario_path}\n  {exc}", err=True)
        sys.exit(1)
    click.echo(f"OK: {scenario.id} version {scenario.version}")


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.argument("output_dir", type=click.Path(path_type=Path))
@click.option(
    "--weather-year",
    type=int,
    default=None,
    help="Historical weather year to embed in the config overlay (e.g. 2010, 2018, 2020).",
)
def translate(scenario_path: Path, output_dir: Path, weather_year: int | None) -> None:
    """Translate a scenario into PyPSA-Eur input artifacts.

    Writes config_overlay.yaml, capacities.json, busmap.csv, and manifest.json
    into OUTPUT_DIR. The manifest carries the substantive-content version hash
    used by Snakemake for cache invalidation.
    """
    try:
        scenario = Scenario.from_yaml(scenario_path)
    except Exception as exc:
        click.echo(f"INVALID: {scenario_path}\n  {exc}", err=True)
        sys.exit(1)
    result = do_translate(scenario, output_dir, weather_year=weather_year)
    click.echo(
        f"OK: {scenario.id} {scenario.version} -> {result.output_dir} (hash {result.version_hash})"
    )


@main.command()
@click.argument("translation_dir", type=click.Path(exists=True, path_type=Path))
@click.argument("pypsa_eur_dir", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--clusters",
    type=int,
    default=4,
    show_default=True,
    help="Cluster count the busmap targets. Default 4 (our four ÜNB zones).",
)
@click.option(
    "--base-network",
    default="entsoegridkit",
    show_default=True,
    help="PyPSA-Eur base_network mode. Sets the busmap target filename.",
)
def apply(
    translation_dir: Path,
    pypsa_eur_dir: Path,
    clusters: int,
    base_network: str,
) -> None:
    """Apply a translation-output bundle to a PyPSA-Eur tree.

    Writes config.yaml, base_s_{clusters}_{base_network}.csv busmap, and
    drops capacities.json + manifest.json under .stromtest/ for provenance.
    """
    result = apply_translation(
        translation_dir,
        pypsa_eur_dir,
        clusters=clusters,
        base_network=base_network,
    )
    click.echo(f"OK: applied {translation_dir} to {result.pypsa_eur_dir}")
    click.echo(f"  config:    {result.config_yaml_path}")
    click.echo(f"  busmap:    {result.busmap_path}")
    click.echo(f"  capacities: {result.capacities_json_path}")
    click.echo(f"  manifest:  {result.manifest_path}")


@main.command()
@click.argument("network_path", type=click.Path(exists=True, path_type=Path))
@click.argument("capacities_path", type=click.Path(exists=True, path_type=Path))
def inject(network_path: Path, capacities_path: Path) -> None:
    """Inject a scenario's per-zone capacities into a prepared PyPSA network.

    NETWORK_PATH is typically ``resources/{run}/networks/base_s_4_elec_.nc``
    after PyPSA-Eur's ``prepare_network`` rule. The network is mutated in
    place; ``solve_network`` is what comes next.

    CAPACITIES_PATH is the ``capacities.json`` produced by ``stromtest translate``.

    Requires the ``modeling`` dependency group (pypsa). Run via pixi:

        pixi run python -m stromtest.cli inject base_s_4_elec_.nc capacities.json
    """
    result = inject_capacities(network_path, capacities_path)
    click.echo(f"OK: injected {capacities_path} into {result.network_path}")
    click.echo(
        f"  generators set:    {result.generators_set}"
        f"  generators zeroed: {result.generators_zeroed}"
    )
    click.echo(f"  storage units set: {result.storage_units_set}")
    click.echo(f"  stores set:        {result.stores_set}")
    click.echo(f"  links set:         {result.links_set}")
    click.echo("Per-zone summary (GW):")
    for zone, block in result.summary_by_zone_gw.items():
        click.echo(f"  {zone}:")
        for k, v in block.items():
            click.echo(f"    {k:30s} {v}")


if __name__ == "__main__":
    main()
