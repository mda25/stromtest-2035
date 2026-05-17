"""stromtest CLI entry point.

V0 scope: scenario validation and translation. Pipeline orchestration
runs via Snakemake, not this CLI.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from stromtest.translation.schema import Scenario


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


if __name__ == "__main__":
    main()
