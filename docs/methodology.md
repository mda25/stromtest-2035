# Methodology

This document is the build-time reference for how `stromtest-2035` integrates
with [PyPSA-Eur](https://github.com/PyPSA/pypsa-eur). It is the output of
build step 2 (PyPSA-Eur reading week) from [design.md](design.md). Every claim
below cites a file path and line range in our vendored copy at
`modeling/pypsa_eur/`. Lines refer to the upstream commit pinned at clone time
(`666fdf1`); revisit when we bump the pin.

Status: living document. Updated as build steps land.

---

## 1. Pinned PyPSA-Eur version

We track PyPSA-Eur at commit `666fdf1` (clone date 2026-05-17). Lines below
match this revision. Upgrading PyPSA-Eur requires re-running the golden-output
regression test (see [design.md § Test Plan](design.md#test-plan-v0)) and
re-validating the line references in this document.

## 2. Integration architecture (one-paragraph version)

PyPSA-Eur is consumed as a Snakemake workflow plus Python helpers, not as a
library imported into our code. Our pipeline drives PyPSA-Eur's rules with a
custom `config/config.yaml` overlay that selects `clustering.mode:
custom_busmap` (4 ÜNB zones), the weather year via `atlite.default_cutout`,
HiGHS as the solver, and the planning horizon. We override the hydrogen-system
prepare step with a fork-patched `prepare_sector_network.py` (V0 stub) to
inject BSc-grade electrolyzer behavior. Outputs are NetCDF solved networks;
our `aggregate` step converts time-series into hourly + daily + weekly Parquet
that the frontend consumes from R2.

## 3. Configuration overlay

PyPSA-Eur reads `config/config.default.yaml` (`pypsa_eur/config/config.default.yaml:1-1470`)
and merges any `config/config.yaml` over it (auto-detected at
`pypsa_eur/Snakefile:31`). Our translation layer (`stromtest.translation`)
produces the overlay per scenario; PyPSA-Eur's defaults supply everything
else.

Top-level sections that matter to us:

| Section | Default line | What we set |
|---|---|---|
| `countries` | 49 | `[DE]` only |
| `snapshots` | 86 | start/end aligned to the chosen weather year |
| `electricity` | 106 | capacities per technology per zone (translated from our scenario YAML) |
| `renewable` | 219 | cutout reference (must match snapshot range) |
| `sector` | 623 | enabled with H2 components |
| `clustering` | 1093 | `mode: custom_busmap`, `clusters: 4` |
| `costs` | 1069 | year set to scenario planning horizon (2035) |
| `solving.solver` | 1189 | `name: highs`, `options: highs-default` |

The translation layer never produces a full config from scratch. It produces
the *overlay* containing only the fields that differ from defaults; merging is
PyPSA-Eur's responsibility.

## 4. 4-zone ÜNB aggregation via `custom_busmap`

This is the single most important integration point for the
political-relevance pitch of stromtest-2035: spatial resolution must map 1:1
to the four ÜNB Regelzonen, not to k-means clusters.

### Mechanism

PyPSA-Eur supports `clustering.mode: custom_busmap`
(`pypsa_eur/config/config.default.yaml:1094`). When enabled, the
`cluster_network` rule (`pypsa_eur/rules/build_electricity.smk:710`) reads a
CSV at:

```
data/busmaps/base_s_{clusters}_{base_network}.csv
```

For us with `clusters: 4` and the default OSM base network, that path is:

```
data/busmaps/base_s_4_osm.csv
```

### CSV format

The CSV is consumed in `pypsa_eur/scripts/cluster_network.py:369`. Format:

- Index column: bus IDs from `resources/networks/base_s.nc` (the unclustered
  network produced by `base_network.py:80`).
- Value column: the cluster name each bus is assigned to. For us, the cluster
  names are exactly `50hertz`, `tennet`, `amprion`, `transnetbw`.

Example:

```csv
bus,
"304",50hertz
"305",50hertz
"306",tennet
...
```

### Inter-zone transmission

We do NOT supply NTC values in a separate file. PyPSA-Eur computes inter-zone
line capacities by summing the parallel underlying lines that cross cluster
boundaries (`pypsa.clustering.spatial.Clustering`, invoked at
`pypsa_eur/scripts/cluster_network.py:628`). The natural consequence: our
4-zone transmission capacities will match the sum of physical lines crossing
each ÜNB boundary, not the politically-quoted NTC numbers from BNetzA
Monitoring reports.

**Open decision**: do we accept PyPSA-Eur's line-sum NTC, or post-process the
clustered network to override `n.lines["s_nom"]` with BNetzA-cited values? The
honest scientific answer is the former (physics > politics). The
political-narrative answer is the latter (the public will compare against
BNetzA numbers). We will document whichever choice we make in
`scenarios/*/CHANGELOG.md`. Tentative V0 decision: accept PyPSA-Eur's
line-sum NTC, document the discrepancy on the methodology page, and treat
BNetzA-cited NTC as a V1 override option.

### Why hand-curated, not k-means

`clustering.mode: busmap` (the default) uses k-means on the underlying
network's electrical topology. The resulting clusters are
electrically-coherent but do NOT respect the ÜNB Regelzonen. Every chart
caption in our frontend needs to say "TenneT" / "50Hertz" — not "cluster 1".

The work to land in build step 3:

1. Obtain the bus IDs and coordinates from
   `pypsa_eur/resources/networks/base_s.nc` (we will run PyPSA-Eur's
   `base_network` rule once to produce this file, then read it).
2. Overlay each bus's coordinates against a Bundesland or Regelzone polygon
   (Regelzonen-Karte from BNetzA or the four ÜNB; available as KML/Shapefile).
3. Write `data/busmaps/base_s_4_osm.csv` with one row per bus.
4. Spot-check edge cases manually (border buses, offshore connection points).

## 5. Snapshots and weather years

Snapshot range is set via `config.snapshots`
(`pypsa_eur/config/config.default.yaml:86-89`):

```yaml
snapshots:
  start: "2010-01-01"
  end: "2011-01-01"
  inclusive: left
```

For a full 8760-hour year, this yields a left-inclusive hourly DatetimeIndex
(`get_snapshots` in `pypsa_eur/scripts/_helpers.py:875`).

Weather data is pulled from an `atlite` cutout selected via
`config.atlite.default_cutout` (`pypsa_eur/config/config.default.yaml:189`).
Cutout definitions include their own `time:` range
(`pypsa_eur/config/config.default.yaml:205`); the snapshot range must lie
within the cutout's time window.

For V0 we plan three weather years (2010, 2018, 2020). PyPSA-Eur's stock
cutouts may not cover all three; we will need to either:

- Build our own cutouts via PyPSA-Eur's `build_cutout` rule for the missing
  years (requires Copernicus CDS API credentials, ~5-20 GB of ERA5 download
  per year), or
- Use existing public cutouts from data.pypsa.org if available for our years.

This is the single biggest external-credential dependency in V0. The CI mini
E2E test (build step 8) ships with a tiny fixture cutout to avoid the CDS
dependency in CI.

## 6. Solver

PyPSA-Eur pre-wires several solvers
(`pypsa_eur/config/config.default.yaml:1192-1269`). The `name` is selected at
line 1190; per-solver option profiles are dicts under `solver_options`. We
configure:

```yaml
solving:
  solver:
    name: highs
    options: highs-default
```

`solve_network.py` (`pypsa_eur/rules/solve_electricity.smk:6`) invokes the
named solver via linopy. Gurobi upgrade is a one-line `name` change once a
free academic license is available.

## 7. Hydrogen system — the honest version

The design doc treated BSc-grade electrolyzer efficiency overrides as
"plug-in PyPSA-Eur extension points." Reading the code shows this is **harder
than that framing**, and the methodology must be honest about it.

### What PyPSA-Eur natively supports

The hydrogen system is configured in
`pypsa_eur/scripts/prepare_sector_network.py` around lines 1800-1900.
Components used:

- **Electrolyzer**: a PyPSA `Link` with `bus0 = AC bus`, `bus1 = H2 bus`,
  `efficiency = constant from costs CSV`
  (`prepare_sector_network.py:1830-1835`). Supports `p_min_pu` (minimum
  part-load constraint at line 1835), but `p_min_pu` clips the operating
  range, it does NOT model efficiency as a function of load.
- **Fuel cell** (H2-to-power): a PyPSA `Link`,
  `efficiency = costs.at["fuel cell", "efficiency"]`
  (`prepare_sector_network.py:1849`). Same scalar pattern.
- **H2 storage**: a PyPSA `Store` with `carrier="H2"`
  (`prepare_sector_network.py:1857` for underground, line 1881 for tanks).
- **H2 pipelines**: PyPSA `Link` with `carrier="H2 pipeline"`.

Cost data lives at `pypsa_eur/data/costs_{year}.csv` (produced by
`retrieve_cost_data` in `pypsa_eur/rules/retrieve.smk:451`, processed by
`process_costs` in `pypsa_eur/rules/collect.smk:15`). The relevant row is
`electrolysis` with columns `efficiency`, `capital_cost`, `lifetime`, `FOM`,
`VOM`.

### What PyPSA-Eur does NOT natively support

**Part-load efficiency curves are not first-class.** Real electrolyzers
(PEM and especially alkaline) have efficiency curves that vary materially
with load — peak efficiency around 30-70% of nameplate, dropping at very low
and very high load. PyPSA-Eur's current model uses a single constant
efficiency at all load points.

This matters for stromtest-2035 because:

- Renewable-rich scenarios depend heavily on opportunistic electrolyzer
  operation when surplus PV/wind is available — meaning the electrolyzers run
  at variable load profiles, not steady-state.
- Constant-efficiency models systematically overestimate H2 production from
  intermittent inputs (because they ignore the efficiency hit at off-design
  load points).
- This is the exact effect the BSc-grade override aims to correct.

### Extension strategy (build step 7)

Three options for adding part-load efficiency. Decision deferred to step 7,
but the shape of the options is clear:

1. **Piecewise-linear efficiency via multiple Links**: model the electrolyzer
   as N parallel Links with different `efficiency` and `p_nom` segmenting the
   load curve. Standard MILP trick. Adds ~3-5 Links per electrolyzer
   instance, so ~16 extra Links across 4 zones. Tractable. Loses convexity
   only if we make Link availability binary; if we let them be continuous
   the LP stays linear with mild oversolve.
2. **Snapshot-dependent efficiency via `efficiency_t` (linopy expression)**:
   PyPSA supports time-varying parameters. We could compute an effective
   efficiency per snapshot based on the *expected* dispatch (a fixed-point
   iteration: solve, recompute efficiency from realized load, re-solve).
   Iterative, slower, more "correct" feel.
3. **Post-hoc correction**: solve with constant efficiency, then scale the
   reported H2 production by an off-line efficiency-vs-load curve to produce
   the displayed numbers. Cleanest pipeline integration, weakest scientific
   defensibility (the dispatch itself was solved with the wrong efficiency).

V0 tentative recommendation: option 1 (piecewise-linear). It's the standard
energy-system-modeling approach and the one whose math the academic audience
will recognize. The benchmark test (test plan item 4 in design.md) compares
the piecewise model's output against the published or analytical curve.

### Update to design doc

The design doc's "Override electrolyzer efficiency curves with author's
BSc-thesis values" is correct as intent but understated as work. It's a real
modeling extension, not a config knob. We will update design.md's Risks
section to reflect this.

## 8. Output conversion (NetCDF → Parquet)

PyPSA-Eur produces solved networks as NetCDF (`.nc`) files at:

```
results/{RDIR}/networks/base_s_{clusters}_{opts}_{sector_opts}_{planning_horizons}.nc
```

Time-series live as attributes on the PyPSA `Network` object:

- `n.generators_t.p` — generator dispatch (MW per snapshot per generator)
- `n.loads_t.p_set` — load
- `n.links_t.p0` / `p1` — Link input/output flows (electrolyzers, fuel cells)
- `n.storage_units_t.p` / `n.stores_t.e` — storage dispatch and state
- `n.lines_t.p0` / `p1` — transmission flows

Our `aggregate` Snakemake rule will:

1. Load the NetCDF via `pypsa.Network()`.
2. Reshape time-series to long-format per (snapshot, zone, technology).
3. Write hourly Parquet via pyarrow.
4. Compute daily and weekly summaries (sums for energy quantities, means for
   storage state-of-charge, max for peak load).
5. Upload all three resolutions to R2.

PyPSA-Eur also has an `export` rule (`pypsa_eur/rules/postprocess.smk:251`)
that writes CSVs for nodal_costs, nodal_capacities, capacity_factors,
and costs. We may use these for sanity checks but they do not replace the
per-snapshot Parquet we need for the frontend.

## 9. Snakemake rule chain (what we drive)

```
[our translation step]
    scenarios/reiche/2026-05-17.0.yml
        |
        v
    [our translate.py emits]
    pypsa_eur/config/config.yaml      data/busmaps/base_s_4_osm.csv
        |                                       |
        v                                       v
    PyPSA-Eur rules (driven by `snakemake all`):
        base_network        (build_electricity.smk:80)
            |
            v
        cluster_network     (build_electricity.smk:710)  <- consumes our busmap
            |
            v
        add_electricity     (build_electricity.smk:790)
            |
            v
        prepare_network     (build_electricity.smk:841)
            |
            v
        prepare_sector_network (build_sector.smk)         <- patched for H2 part-load
            |
            v
        solve_network       (solve_electricity.smk:6)
            |
            v
        results/.../base_s_4_*.nc
            |
            v
    [our aggregate.py]
        |
        +--> hourly.parquet
        +--> daily.parquet
        +--> weekly.parquet
            |
            v
    R2 bucket + manifest update
```

## 10. Open questions discovered during reading

1. **CDS API credentials in CI**: building a cutout requires Copernicus
   credentials. The mini E2E test must use a pre-built fixture cutout
   committed to the repo or pulled from a release-attached blob. Decide in
   step 8.
2. **NTC override vs. physical line sums**: documented in §4. Tentative V0
   decision: accept PyPSA-Eur's line sums; treat BNetzA-cited NTC as a V1
   option.
3. **Hydrogen efficiency modeling**: documented in §7. V0 plan is
   piecewise-linear Links; final decision lands in step 7 with the benchmark
   test.
4. **Costs CSV — fetched at runtime, not in repo**: PyPSA-Eur downloads
   `costs_{planning_horizons}.csv` at pipeline runtime via the
   `retrieve_cost_data` rule (`pypsa_eur/rules/retrieve.smk:449-457`). The
   URL/folder is resolved through `dataset_version("costs")` at line 444.
   For our 2035 horizon, PyPSA-Eur will request `costs_2035.csv` from
   the configured dataset source. **Implication**: our CI mini E2E run
   must either (a) be online and download the file, (b) bundle a frozen
   copy of `costs_2035.csv` as a test fixture, or (c) use a different
   planning horizon for which a cached copy exists. Recommendation:
   option (b) — commit a single frozen `costs_2035.csv` under
   `modeling/tests/fixtures/` and point the CI run at it explicitly.
5. **Bundling PyPSA-Eur**: vendored as a regular directory under
   `modeling/pypsa_eur/` (committed via `.gitignore` allowlist or not?).
   Current `.gitignore` excludes it — we may want to switch to git submodule
   pinned at `666fdf1` so version pinning is explicit and the upstream code
   is not in our repo. Decide before public launch.
