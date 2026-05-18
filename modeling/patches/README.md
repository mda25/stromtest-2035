# PyPSA-Eur patches

Small, well-scoped patches we apply to the vendored PyPSA-Eur clone
(`modeling/pypsa_eur/`, gitignored) to work around upstream bugs or to add
hooks our pipeline needs. Each patch is the smallest possible diff and
should land upstream eventually.

## Current patches

### `pypsa_eur-build-cutout.patch`

Fixes a `TypeError` when `data.cutout.source: build` is configured (i.e. we
build the cutout via the CDS API instead of fetching it from data.pypsa.org).

The rule wrote `CUTOUT_DATASET["folder"] / "{cutout}.nc"` but `folder` is a
string (from `dataset_version()` calling `.as_posix()`), not a `pathlib.Path`,
so `string / string` raises `TypeError: unsupported operand type(s) for /:
'str' and 'str'`. Replacing `/` with `+ "/"` matches what the parallel
`retrieve_cutout` rule does (`rules/retrieve.smk:404`).

Confirmed against PyPSA-Eur commit `666fdf1` (the version pinned by our
`pypsa_eur/pixi.lock`). Upstream fix should be a one-line PR; we ship it
locally until that lands.

## Applying

```bash
cd modeling/pypsa_eur
for p in ../patches/*.patch; do
    patch -p1 < "$p"
done
```

This is idempotent only on the first apply — re-running after the patch has
landed will fail. `bin/apply_patches.sh` (see RUNBOOK) handles the "already
applied" check.
