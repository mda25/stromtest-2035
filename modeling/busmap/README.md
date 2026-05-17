# 4-zone ÜNB busmap

This directory contains the hand-curated mapping from PyPSA-Eur's ~180 native
network nodes to the four German ÜNB Regelzonen, plus the inter-zone NTC
values used as transmission constraints.

## Files

- `unb_busmap.csv` — one row per PyPSA-Eur node: `node_id, unb_zone`. Authored
  manually using the BNetzA Regelzonen map as ground truth. Lands in build
  step 3 of `docs/design.md`.
- `ntc_values.yml` — net transfer capacities between zones, per direction,
  with source citations to BNetzA Monitoring reports.

## Why hand-curated?

PyPSA-Eur supports k-means clustering of nodes, which produces electrically
coherent clusters. But k-means does not respect the political/operational
ÜNB Regelzonen boundaries. The stromtest-2035 case study is specifically
about Reiche's plan applied to the German grid as it is administered — so
the spatial resolution has to map 1:1 to the four real Regelzonen.

The cost is a one-time mapping exercise. The payoff is that every chart in
the published tool can say "TenneT" or "50Hertz" instead of "cluster 1".
