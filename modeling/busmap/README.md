# 4-zone ÜNB busmap

This directory contains the hand-curated mapping from PyPSA-Eur's
entsoegridkit buses to the four German ÜNB Regelzonen.

## Files

- **`unb_busmap.csv`** — the committed busmap. 474 rows, one per German
  entsoegridkit bus. Columns: `bus_id, zone, voltage, lon, lat, bundesland,
  border_warning`. This is the deliverable consumed by PyPSA-Eur's
  `custom_busmap` mechanism (after our pipeline copies/symlinks it to
  `pypsa_eur/data/busmaps/base_s_4_entsoegridkit.csv` at run time).
- **`generate_busmap.py`** — generator script. Reads
  `pypsa_eur/data/entsoegridkit/buses.csv` + `data/bundeslaender.geojson`,
  spatial-joins via shapely, applies the Bundesland → Regelzone mapping, and
  writes `unb_busmap.csv`. Re-run when the upstream entsoegridkit data
  changes:
  ```
  uv sync --group busmap-gen
  uv run python busmap/generate_busmap.py
  ```
- **`data/bundeslaender.geojson`** — committed copy of the German Bundesländer
  polygons at "hoch" precision, ~1.3 MB. Source:
  https://github.com/isellsoap/deutschlandGeoJSON (MIT-licensed). 16 features,
  one per Bundesland.

## V0 zone distribution

| Zone        | Buses | Notes |
|-------------|------:|-------|
| tennet      |   183 | Bayern + Niedersachsen + Hessen + Bremen + most of Schleswig-Holstein |
| amprion     |   132 | NRW + Rheinland-Pfalz + Saarland |
| 50hertz     |    98 | Berlin + Brandenburg + MV + Sachsen + Sachsen-Anhalt + Thüringen + Hamburg |
| transnetbw  |    61 | Baden-Württemberg |
| **total**   | **474** | |

## Methodology

For each German bus in entsoegridkit, the generator does a point-in-polygon
test against the 16 Bundesländer. When no polygon contains the point
(offshore wind connection in the Baltic or North Sea; one bus at the
trinational Switzerland-France-Germany corner), the bus is assigned to the
nearest Bundesland by polygon distance and flagged with
`border_warning=offshore_or_outside_polygon`. The Bundesland is then mapped
to its predominant Regelzone via the lookup in `generate_busmap.py`
(`BL_TO_REGELZONE`).

Buses in known Bundesland-vs-Regelzone overlap regions get an additional
warning tag for human review:

- `emsland_amprion_overlap` — Western Niedersachsen (Emsland, Osnabrück
  area) is part of the Amprion Regelzone in reality. Our Bundesland-as-proxy
  assigns them to TenneT (Niedersachsen's predominant zone). 12 buses
  affected in V0.
- `nw_schleswig_amprion_overlap` — Small western strip of Schleswig-Holstein
  near the Dutch border. 3 buses affected in V0.

## Known V0 limitations

1. **Bundesland-as-proxy mapping**. Refining border buses (Emsland,
   western SH, parts of Hessen/Niedersachsen) requires finer ÜNB-published
   polygons. Tagged for V1.
2. **entsoegridkit, not OSM**. PyPSA-Eur's default base_network mode is now
   `osm`. Our V0 uses `entsoegridkit` because the data ships in the repo and
   gives us a deterministic bus list without external downloads. Switching
   to OSM later requires re-authoring this busmap against OSM bus IDs.
3. **Pre-simplification IDs**. The busmap is keyed on raw entsoegridkit
   bus_id, not the IDs that survive PyPSA-Eur's `simplify_network` step.
   The pipeline-side consumer filters this CSV to whatever lives in
   `base_s.nc` at clustering time. Documented in `docs/methodology.md § 4`.

## Inter-zone NTC values — not in V0

The design doc originally planned `ntc_values.yml` with BNetzA-cited NTC
matrix here. After reading PyPSA-Eur's clustering code, the V0 decision is
to use PyPSA-Eur's computed line-sum NTC (the sum of physical lines crossing
each cluster boundary). Reasoning and tradeoffs are in
`docs/methodology.md § 4`. A BNetzA-cited NTC override remains a V1 option.
