# Weather year configurations

Each YAML file in this directory selects one historical weather year for use as
ERA5 reanalysis input to `atlite`. The pipeline produces per-(scenario × weather
year) Parquet results.

V0 ships with three:

- **2010** — Dunkelflaute reference. Long cold dark period in late January / early
  February with simultaneous low wind and low solar across most of Central Europe.
- **2018** — Heatwave + summer drought. Stresses thermal generation cooling
  constraints and produces low hydropower output.
- **2020** — Median year. Representative "normal" weather; used as the baseline
  against which stress years are compared.

These configurations are authored in build step 2 (PyPSA-Eur reading week) once
the exact ERA5 selection format the pipeline needs is locked in. See
`docs/design.md` Next Steps.
