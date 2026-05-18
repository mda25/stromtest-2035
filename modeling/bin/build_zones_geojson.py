#!/usr/bin/env python3
"""Merge the 16 Bundesländer into 4 ÜNB Regelzonen polygons.

Reads modeling/busmap/data/bundeslaender.geojson, groups Bundesländer
by the BL_TO_REGELZONE mapping (matches modeling/busmap/generate_busmap.py),
unions the polygons per zone via shapely, simplifies to keep the bundle
small, and writes the result to web/src/data/zones.geojson.

Run with the busmap-gen dependency group:
    uv sync --group busmap-gen
    uv run python modeling/bin/build_zones_geojson.py

Output: web/src/data/zones.geojson  (~80-200 KB committed)

The output GeoJSON has one Feature per zone with properties
``{name, full_name, bundeslaender}``. Coordinates are in EPSG:4326
(lon, lat) — d3-geo handles the projection on the frontend.
"""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "modeling" / "busmap" / "data" / "bundeslaender.geojson"
# .json extension (GeoJSON content) so Next.js TypeScript can import it
# directly via ``import zones from "@/data/zones.json"``.
OUT = REPO_ROOT / "web" / "src" / "data" / "zones.json"

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

ZONE_FULL_NAME: dict[str, str] = {
    "50hertz": "50Hertz Transmission",
    "tennet": "TenneT TSO",
    "amprion": "Amprion",
    "transnetbw": "TransnetBW",
}

# Simplification tolerance in degrees. ~0.005 keeps the regions recognizably
# detailed at a country-scale map but trims the file size by ~70%.
SIMPLIFY_TOLERANCE = 0.005


def main() -> None:
    with SRC.open("r", encoding="utf-8") as f:
        bundeslaender = json.load(f)

    by_zone: dict[str, list] = {z: [] for z in set(BL_TO_REGELZONE.values())}
    members: dict[str, list[str]] = {z: [] for z in set(BL_TO_REGELZONE.values())}
    for feature in bundeslaender["features"]:
        bl_name = feature["properties"]["name"]
        zone = BL_TO_REGELZONE.get(bl_name)
        if zone is None:
            raise ValueError(f"unmapped Bundesland: {bl_name}")
        by_zone[zone].append(shape(feature["geometry"]))
        members[zone].append(bl_name)

    out_features = []
    for zone in ["50hertz", "tennet", "amprion", "transnetbw"]:
        merged = unary_union(by_zone[zone])
        # Topology-preserving simplification keeps the shared borders aligned
        # so two adjacent zones don't develop gaps or overlaps.
        simplified = merged.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        out_features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": zone,
                    "full_name": ZONE_FULL_NAME[zone],
                    "bundeslaender": sorted(members[zone]),
                },
                "geometry": mapping(simplified),
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"type": "FeatureCollection", "features": out_features}
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({size_kb:.1f} KB)")
    for f in out_features:
        bbox = shape(f["geometry"]).bounds
        print(
            f"  {f['properties']['name']:12s} "
            f"members={len(f['properties']['bundeslaender'])} "
            f"bbox=({bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f})"
        )


if __name__ == "__main__":
    main()
