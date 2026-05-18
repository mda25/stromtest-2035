# Running PyPSA-Eur locally

This is the operator runbook for executing the modeling pipeline on a developer
machine. CI does NOT run PyPSA-Eur — these steps run on your laptop.

## Prerequisites

- macOS (Apple Silicon supported) or Linux. Windows untested.
- [pixi](https://pixi.sh) installed (one-time):
  ```
  curl -fsSL https://pixi.sh/install.sh | bash
  source ~/.zshrc  # or open a new terminal
  ```
- Copernicus CDS API credentials at `~/.cdsapirc` (only needed for weather
  years not pre-cached on data.pypsa.org). See `docs/methodology.md` § 5.

## One-time setup

```bash
# 1. Install the PyPSA-Eur conda env (~5-10 min on first run; ~1-2 GB).
cd modeling/pypsa_eur
pixi install

# 2. Apply our patches + copy test configs into pypsa_eur/.
cd ..
bash bin/setup_pypsa_eur.sh
```

Patches applied (see [patches/](patches/)):
- `pypsa_eur-build-cutout.patch` — fix for `TypeError` when building cutouts via CDS.

Configs copied (see [configs/](configs/)):
- `de-tutorial.yaml` — small DE-only smoke-test config used below.

Verify the environment:

```bash
pixi run python -c "import pypsa; import atlite; import linopy; print(pypsa.__version__, atlite.__version__, linopy.__version__)"
```

Expected: PyPSA 1.2.0, atlite 0.6.1, linopy 0.6.6 (pinned via pixi.lock).

## Smoke test 1 — Belgium tutorial (no CDS)

PyPSA-Eur's own minimal config. ~4 min total. Pre-built BE cutout is on
data.pypsa.org so no CDS needed.

```bash
cd modeling/pypsa_eur
pixi run snakemake --configfile config/test/config.electricity.yaml -j2 solve_elec_networks
```

Success criterion: `results/test-elec/networks/base_s_5_elec_.nc` exists and
opens with `pypsa.Network.import_from_netcdf(...)`. 39 of 39 jobs reported done.

## Smoke test 2 — DE tutorial (exercises CDS + entsoegridkit)

The first validated **German** end-to-end run. ~7 min total. Builds a small
DE-only cutout via CDS for the test snapshot range, uses the entsoegridkit
base network (no OSM download), 4 default k-means clusters.

```bash
cd modeling/pypsa_eur
pixi run snakemake --configfile config/config.de-tutorial.yaml -j2 solve_elec_networks
```

Success criterion: `results/de-tutorial/networks/base_s_4_elec_.nc` exists,
7 daily snapshots (2013-03-01..2013-03-07), 4 buses (`DE0 0..3`), generation
mix dominated by coal + onwind + biomass + solar.

**Verified one-week dispatch (March 2013, baseline 2020 fleet from
powerplantmatching):**

| Carrier   | GWh    |
|-----------|-------:|
| coal      | 116.7  |
| onwind    | 107.6  |
| biomass   |  55.1  |
| solar     |  53.1  |
| lignite   |  41.6  |
| offwind   |  39.0  |
| total load|  413.3 |

## Aggregating a solved network to Parquet

Once you have a solved `.nc` file:

```bash
PYTHONPATH=../src pixi run python -c "
from pathlib import Path
from stromtest.aggregate import aggregate
result = aggregate(
    Path('results/test-elec/networks/base_s_5_elec_.nc'),
    Path('/tmp/out'),
    Path('../busmap/unb_busmap.csv'),  # the committed busmap or a synthetic one
    run_metadata={'scenario_id': 'be-tutorial', 'weather_year': 2013},
)
print(result)
"
```

Outputs at `/tmp/out/`:
- `hourly.parquet` — long format, one row per (snapshot, zone, technology, metric)
- `daily.parquet` / `weekly.parquet` — same shape, period sums / SoC means
- `metadata.json` — scenario + runtime metadata

## Applying a stromtest scenario to PyPSA-Eur

Once you have a translated scenario bundle (output of `stromtest translate`),
the `stromtest apply` CLI wires it into a PyPSA-Eur tree:

```bash
cd modeling
uv run stromtest translate scenarios/reiche/2026-05-17.0.yml /tmp/reiche-bundle --weather-year 2010
uv run stromtest apply /tmp/reiche-bundle pypsa_eur/
```

This writes:
- `pypsa_eur/config/config.yaml` — our overlay merged over the default
- `pypsa_eur/data/busmaps/base_s_4_entsoegridkit.csv` — our busmap, ready for
  PyPSA-Eur's `custom_busmap` clustering mode
- `pypsa_eur/.stromtest/capacities.json` + `manifest.json` — provenance

After applying, run snakemake against the merged config (no `--configfile`
flag needed — PyPSA-Eur picks up `config/config.yaml` automatically):

```bash
cd pypsa_eur
pixi run snakemake -j2 base_network        # ~1 min, validates busmap loading
pixi run snakemake -j2 cluster_network     # ~2 min, applies our 4-zone busmap
pixi run snakemake -j2 solve_elec_networks # full pipeline through LP solve
```

## What's pending (build step 7+ remaining)

The translation -> apply -> pipeline glue is in place. What's NOT yet wired:

1. **Per-zone capacity injection.** `apply_translation` drops capacities.json
   in `pypsa_eur/.stromtest/` for provenance but does NOT inject those
   numbers into PyPSA-Eur's network. PyPSA-Eur defaults to `extendable_carriers`
   optimization (build capacity to meet demand) — for our 2035 case study
   we need fixed capacities. Options for V0:
   - Pre-installed capacity via `custom_powerplants.csv` rows for conventional
   - `electricity.estimate_renewable_capacities` for renewables with target year
   - Regional capacity constraints in `solving.constraints`
2. **Decide how to inject per-zone capacity targets.** PyPSA-Eur expects
   either `custom_powerplants.csv` rows (one per plant, with lat/lon to a
   bus), or extendable_carriers with regional constraints. Both options are
   tractable but require code; pending step 7.
3. **Build a DE-2010/2018/2020 cutout.** PyPSA-Eur's pre-built cutouts on
   data.pypsa.org cover Europe 2013. For our weather years we either build
   from CDS (the first DE+full-year build is ~20-40 min compute + a few GB
   of ERA5 download) or find a published cutout.
4. **Hydrogen part-load efficiency override.** Step 7 in the design doc.
   Requires modifying `pypsa_eur/scripts/prepare_sector_network.py`.
5. **Golden regression test.** Step 10. Lock the V0 baseline output
   checksums for one (scenario, weather_year, busmap) tuple.

## Common gotchas

- The first run downloads ~2-5 GB of public data from data.pypsa.org. Cached
  to `~/Library/Caches/snakemake-pypsa-eur` (macOS) or platform equivalent;
  subsequent runs reuse.
- pixi prints a one-line warning about `lock file format v6 vs v7` — safe to
  ignore; PyPSA-Eur authors will bump it eventually.
- HiGHS solver is bundled with linopy (no separate install). Gurobi is
  optional and unused in V0 per docs/design.md.

## Cleanup

After a successful run, intermediate files live in:
- `pypsa_eur/.snakemake/` — Snakemake's state (gitignored)
- `pypsa_eur/resources/{run_name}/` — pre-solve artifacts
- `pypsa_eur/results/{run_name}/` — solved networks

All of these are inside `pypsa_eur/`, which the root `.gitignore` excludes.
Use `pixi run reset` (defined in pixi.toml) to clear intermediates without
removing the pinned cutouts.
