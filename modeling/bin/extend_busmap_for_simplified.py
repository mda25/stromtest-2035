#!/usr/bin/env python3
"""Extend the committed busmap to cover buses created by PyPSA-Eur's simplify_network.

PyPSA-Eur's `simplify_network` step rewrites the bus list — most entsoegridkit
buses survive with their original IDs, but the step also creates new buses
(typically with IDs in the 7000-9000 range) for offshore wind landing points,
voltage-level splits, and other topology fixes. Our committed
`modeling/busmap/unb_busmap.csv` is keyed on raw entsoegridkit IDs, so those
new buses appear as NaN after the busmap join and `cluster_network` crashes
with `KeyError: '[nan] not in index'`.

This script loads the simplified network produced by `base_network` +
`simplify_network`, finds any DE buses NOT in the 2-column busmap that
`stromtest apply` dropped at
`pypsa_eur/data/busmaps/base_s_{clusters}_{base_network}.csv`, runs the
same shapely point-in-polygon Bundesland → Regelzone spatial join the
generator uses, and appends the resulting (bus_id, cluster) rows to the
target CSV in place.

Run AFTER `base_network` + `simplify_network` for a given run, BEFORE
`cluster_network`. Idempotent — re-running is a no-op once the bus list
stabilizes.

Usage:
    cd modeling/pypsa_eur
    pixi run python ../bin/extend_busmap_for_simplified.py \\
        resources/de-tutorial-cbm/networks/base_s.nc \\
        data/busmaps/base_s_4_entsoegridkit.csv
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pypsa
from shapely.geometry import Point, shape
from shapely.prepared import prep

REPO_MODELING = Path(__file__).resolve().parents[1]
BUNDESLAENDER_GEOJSON = REPO_MODELING / "busmap" / "data" / "bundeslaender.geojson"

# Must match modeling/busmap/generate_busmap.py:BL_TO_REGELZONE exactly.
BL_TO_REGELZONE: dict[str, str] = {
    "Berlin": "50hertz",
    "Brandenburg": "50hertz",
    "Mecklenburg-Vorpommern": "50hertz",
    "Sachsen": "50hertz",
    "Sachsen-Anhalt": "50hertz",
    "Thüringen": "50hertz",
    "Hamburg": "50hertz",
    "Schleswig-Holstein": "tennet",
    "Niedersachsen": "tennet",
    "Bremen": "tennet",
    "Hessen": "tennet",
    "Bayern": "tennet",
    "Nordrhein-Westfalen": "amprion",
    "Rheinland-Pfalz": "amprion",
    "Saarland": "amprion",
    "Baden-Württemberg": "transnetbw",
}


def load_bundeslaender() -> list[tuple[str, object, object]]:
    with BUNDESLAENDER_GEOJSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    result: list[tuple[str, object, object]] = []
    for feature in data["features"]:
        geom = shape(feature["geometry"])
        result.append((feature["properties"]["name"], prep(geom), geom))
    return result


def assign_zone(lon: float, lat: float, bundeslaender) -> tuple[str, bool]:
    """Return (cluster, is_offshore_fallback). Cluster name is prefixed
    ``DE0_<zone>`` to satisfy PyPSA-Eur's country-prefix convention."""
    pt = Point(lon, lat)
    for name, prepared, _ in bundeslaender:
        if prepared.contains(pt):
            return f"DE0_{BL_TO_REGELZONE[name]}", False
    # Offshore / outside-polygon fallback: nearest Bundesland by polygon distance.
    best_name = min(bundeslaender, key=lambda t: pt.distance(t[2]))[0]
    return f"DE0_{BL_TO_REGELZONE[best_name]}", True


def main(network_path: Path, busmap_csv: Path) -> int:
    if not network_path.exists():
        print(f"ERROR: network not found: {network_path}", file=sys.stderr)
        return 1
    if not busmap_csv.exists():
        print(f"ERROR: busmap CSV not found: {busmap_csv}", file=sys.stderr)
        return 1

    n = pypsa.Network()
    n.import_from_netcdf(network_path)
    de_buses = n.buses[n.buses.country == "DE"]
    print(f"simplified DE buses: {len(de_buses)} (of {len(n.buses)} total)")

    with busmap_csv.open("r", encoding="utf-8") as f:
        existing = list(csv.DictReader(f))
    # The bus-id column may be named "name" (PyPSA 1.x, current) or "bus_id"
    # (legacy). Detect from the header.
    bus_col = "name" if existing and "name" in existing[0] else "bus_id"
    existing_ids = {r[bus_col] for r in existing}
    print(f"busmap entries already present: {len(existing_ids)} (bus column: {bus_col!r})")

    missing_ids = [bid for bid in de_buses.index if bid not in existing_ids]
    print(f"missing from busmap: {len(missing_ids)}")
    if not missing_ids:
        print("nothing to do — busmap already covers simplified network")
        return 0

    bundeslaender = load_bundeslaender()
    new_rows: list[dict[str, str]] = []
    offshore = 0
    for bid in missing_ids:
        row = de_buses.loc[bid]
        zone, used_fallback = assign_zone(float(row.x), float(row.y), bundeslaender)
        offshore += int(used_fallback)
        new_rows.append({bus_col: str(bid), "cluster": zone})

    # Append. Match the existing CSV's column ordering.
    fieldnames = list(existing[0].keys())
    with busmap_csv.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        for r in new_rows:
            writer.writerow({c: r.get(c, "") for c in fieldnames})

    by_zone: dict[str, int] = {}
    for r in new_rows:
        by_zone[r["cluster"]] = by_zone.get(r["cluster"], 0) + 1
    print(f"appended {len(new_rows)} rows ({offshore} via nearest-Bundesland fallback)")
    for z, c in sorted(by_zone.items()):
        print(f"  {z:12}  {c:4d}")
    print(f"new busmap total: {len(existing) + len(new_rows)} rows")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]), Path(sys.argv[2])))
