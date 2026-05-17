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
cd modeling/pypsa_eur
pixi install   # ~5-10 min on first run; ~1-2 GB env
```

Verify the environment:

```bash
pixi run python -c "import pypsa; import atlite; import linopy; print(pypsa.__version__, atlite.__version__, linopy.__version__)"
```

Expected: PyPSA 1.2.0, atlite 0.6.1, linopy 0.6.6 (pinned via pixi.lock).

## Smoke test — Belgium tutorial

The smallest validated end-to-end run. ~4 min total including all data
downloads from data.pypsa.org. No CDS needed.

```bash
cd modeling/pypsa_eur
pixi run snakemake --configfile config/test/config.electricity.yaml -j2 solve_elec_networks
```

Success criterion: `results/test-elec/networks/base_s_5_elec_.nc` exists and
opens with `pypsa.Network.import_from_netcdf(...)`. 39 of 39 jobs reported done.

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

## What's pending (build steps 7+)

The BE tutorial works. The DE-4-zone-Reiche-scenario pipeline does NOT yet:

1. **Apply our translate.py artifacts to PyPSA-Eur paths.** A wrapper script
   should copy `busmap.csv` to `pypsa_eur/data/busmaps/base_s_4_entsoegridkit.csv`,
   merge `config_overlay.yaml` over `config/config.yaml`, and inject
   `capacities.json` into a custom_powerplants.csv equivalent.
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
