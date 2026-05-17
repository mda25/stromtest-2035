# stromtest-2035

> Public stress-test of Germany's energy transition plans under bad-weather years.

`stromtest-2035` translates published energy-transition plans (Reiche-Bundesregierung, Habeck-era, Agora, NEP) into runnable scenarios, then stress-tests each plan against historical weather years using [PyPSA-Eur](https://github.com/PyPSA/pypsa-eur). The result is a public, citable case-study tool that shows what each plan delivers when the wind stops in February.

**Status:** scaffolding + first real scenarios committed. PyPSA-Eur pipeline validated on a Belgium tutorial; per-zone capacity injection (build step 7) is the next piece. See [docs/design.md](docs/design.md) for the full design and [docs/methodology.md](docs/methodology.md) for the modeling approach (in progress).

## Frontend (local)

```bash
cd web
npm install
npm run dev
# open http://localhost:3000/scenarios
```

Three pages render the committed scenarios from the source YAMLs:

- `/scenarios` — list of all families
- `/scenarios/[family]` — per-zone capacities, demand, cited sources, changelog
- `/scenarios/compare` — side-by-side numerical comparison

## Why

Germany's energy plans are evolving in real time under the current Bundesregierung. Federal Minister Katharina Reiche has signaled material departures from the Klimaneutral-2045 trajectory: expanded gas backup, delayed hydrogen ramp, slowed renewables pace. There is currently no public, methodologically rigorous tool that translates the evolving plan into runnable numbers and stress-tests it against historical weather years. This project is the first.

## What it does (V0)

- Translates four scenarios — **Reiche 2026-05**, **Habeck Klimaneutral 2045**, **Agora Klimaneutral 2035**, **NEP 2037-B** — into PyPSA-Eur configurations with full citation discipline.
- Runs each scenario against three weather years — **2010** (Dunkelflaute reference), **2018** (heatwave + drought), **2020** (median).
- Computes hourly optimal dispatch across **four ÜNB control zones** (TenneT, 50Hertz, Amprion, TransnetBW), with hydrogen seasonal storage modeled at full 8760-hour resolution.
- Surfaces stress hours, regional bottlenecks, storage demand, and curtailment per scenario × weather year.
- Publishes a public web frontend on Vercel; raw Parquet results downloadable from a public Cloudflare R2 bucket.

## Repository layout

```
.
├── modeling/                 # Python modeling backend
│   ├── translation/          # Scenario YAML → PyPSA-Eur config
│   ├── hydrogen/             # BSc-grade electrolyzer efficiency overrides
│   ├── busmap/               # Hand-curated 4-zone ÜNB busmap + NTC values
│   ├── scenarios/            # Versioned scenario definitions (YAML)
│   ├── weather_years/        # ERA5 reanalysis configs
│   └── Snakefile             # Snakemake pipeline
├── web/                      # Next.js frontend (Vercel)
└── docs/
    ├── design.md             # Design doc (approved 2026-05-17)
    ├── methodology.md        # Modeling approach (in progress)
    └── citations.md          # Every assumption sourced
```

## Quick start

```bash
# Modeling backend (Python, fast tests, no PyPSA-Eur deps)
cd modeling
uv sync                          # core + dev install
uv run pytest                    # 91 tests pass; 1 skipped (modeling-only)
uv run stromtest validate scenarios/reiche/2026-05-17.0.yml

# Translate a scenario into PyPSA-Eur artifacts
uv run stromtest translate scenarios/reiche/2026-05-17.0.yml /tmp/reiche-bundle --weather-year 2010

# Apply that bundle to a PyPSA-Eur clone (see modeling/RUNBOOK.md for the full
# pixi-based pipeline run)
uv run stromtest apply /tmp/reiche-bundle pypsa_eur/

# Frontend (Next.js, reads scenarios at build time)
cd ../web
npm install
npm run dev
# http://localhost:3000/scenarios
```

## Methodology

Every substantive assumption in every scenario traces to a dated, citable source. The translation layer refuses to compile a scenario that has substantive fields without a `citation_ref`. The methodology page (`docs/methodology.md`) documents how each scenario family was constructed, which sources were used for which numbers, and where interpretations were necessary.

The signature technical contribution is hydrogen storage modeling with realistic electrolyzer part-load efficiency curves (BSc-thesis-grade values overriding PyPSA-Eur's defaults) and explicit 8760-hour seasonal state-of-charge. A benchmark test in `modeling/hydrogen/tests/` verifies the override binds correctly.

## License

[MIT](LICENSE) — fork freely, cite when you publish.

## Contact

Issues, suggestions, and scenario submissions welcome via GitHub. Methodology questions are best filed as issues so the discussion is public and citable.
