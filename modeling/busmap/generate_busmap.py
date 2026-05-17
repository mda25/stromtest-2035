"""Generate the 4-zone ÜNB busmap for stromtest-2035.

For each German bus in PyPSA-Eur's entsoegridkit dataset, determine its
Bundesland by point-in-polygon test against a public Bundesländer GeoJSON,
then map Bundesland to one of the four ÜNB Regelzonen
(50hertz | tennet | amprion | transnetbw).

This is a one-off generator. The output CSV (unb_busmap.csv) is committed.
Re-run only when PyPSA-Eur's entsoegridkit bus list changes or when the
Bundesland → Regelzone mapping is refined for border regions.

Usage:
    uv sync --group busmap-gen
    uv run python modeling/busmap/generate_busmap.py

Inputs:
    modeling/pypsa_eur/data/entsoegridkit/buses.csv  (vendored, ~8800 rows)
    modeling/busmap/data/bundeslaender.geojson       (committed, 16 features)

Output:
    modeling/busmap/unb_busmap.csv

Caveats (documented honestly):
    1. We use Bundesland as a proxy for Regelzone. This is correct for ~95%
       of buses but wrong for a handful in known border regions:
         - Western Niedersachsen (Emsland, Osnabrück area) is actually
           Amprion, not TenneT.
         - Small western strips of Schleswig-Holstein near the Dutch border
           may be Amprion.
       For V0 we accept this imprecision and flag affected buses with a
       `border_warning` column. V1 may refine via finer ÜNB polygons.
    2. Bus IDs are entsoegridkit IDs (matching `base_network: entsoegridkit`
       in the PyPSA-Eur config). When base_network is switched to OSM later,
       this busmap must be re-authored against OSM bus IDs.
    3. The CSV intentionally over-covers: it includes one row per raw
       entsoegridkit bus (so multi-voltage substations appear twice). The
       pipeline-side consumer filters to whatever lives in the simplified
       base_s.nc.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.prepared import prep

# --- Configuration --------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
BUSES_CSV = REPO_ROOT / "modeling/pypsa_eur/data/entsoegridkit/buses.csv"
BUNDESLAENDER_GEOJSON = REPO_ROOT / "modeling/busmap/data/bundeslaender.geojson"
OUTPUT_CSV = REPO_ROOT / "modeling/busmap/unb_busmap.csv"

# Bundesland → Regelzone mapping. Each Bundesland is assigned to its
# predominant Regelzone. See module docstring for known imperfections.
# Sources:
#   - 50Hertz: https://www.50hertz.com/de/Unternehmen/UeberunsundunsereBranche/Netzgebiet
#   - TenneT: https://www.tennet.eu/de/das-unternehmen/unser-netz
#   - Amprion: https://www.amprion.net/Netz/
#   - TransnetBW: https://www.transnetbw.de/de/unternehmen/profil
BL_TO_REGELZONE: dict[str, str] = {
    "Berlin": "50hertz",
    "Brandenburg": "50hertz",
    "Mecklenburg-Vorpommern": "50hertz",
    "Sachsen": "50hertz",
    "Sachsen-Anhalt": "50hertz",
    "Thüringen": "50hertz",
    "Hamburg": "50hertz",
    "Schleswig-Holstein": "tennet",  # most; some western strip is Amprion
    "Niedersachsen": "tennet",  # most; Emsland area is Amprion (border_warning)
    "Bremen": "tennet",
    "Hessen": "tennet",
    "Bayern": "tennet",
    "Nordrhein-Westfalen": "amprion",
    "Rheinland-Pfalz": "amprion",
    "Saarland": "amprion",
    "Baden-Württemberg": "transnetbw",
}

# Buses inside one of these (lon, lat) bounding boxes get a `border_warning`
# flag in the output so a human reviewer can refine later. Approximate boxes
# covering the known Bundesland-doesn't-equal-Regelzone areas.
BORDER_WARNING_BOXES: list[tuple[str, float, float, float, float]] = [
    # (reason, min_lon, max_lon, min_lat, max_lat)
    ("emsland_amprion_overlap", 6.6, 7.7, 52.0, 53.4),
    ("nw_schleswig_amprion_overlap", 8.3, 9.2, 53.5, 54.5),
]

DE_COUNTRY_TAG_RE = re.compile(r'"country"=>"DE"')


# --- Pipeline -------------------------------------------------------------


def load_bundeslaender() -> list[tuple[str, object, object]]:
    """Return (name, prepared geometry, raw geometry) for each Bundesland.

    The prepared geometry is used for fast contains() tests; the raw geometry
    is used for distance() fallback when no polygon contains the point
    (e.g., offshore wind connection points in the Baltic).
    """
    with BUNDESLAENDER_GEOJSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    result: list[tuple[str, object, object]] = []
    for feature in data["features"]:
        name = feature["properties"]["name"]
        geom = shape(feature["geometry"])
        result.append((name, prep(geom), geom))
    return result


def iter_german_buses() -> list[dict[str, str]]:
    """Yield German buses from the entsoegridkit CSV.

    The `tags` column is wrapped in single quotes (not double) and contains
    commas. CSV must be parsed with ``quotechar="'"`` to keep tags intact.
    Country membership is detected via regex on ``"country"=>"DE"``.
    """
    rows: list[dict[str, str]] = []
    with BUSES_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f, quotechar="'")
        for row in reader:
            tags = row.get("tags") or ""
            if DE_COUNTRY_TAG_RE.search(tags) is None:
                continue
            rows.append(row)
    return rows


def assign_bundesland(
    lon: float,
    lat: float,
    bundeslaender: list[tuple[str, object, object]],
) -> tuple[str | None, bool]:
    """Return (Bundesland name, is_offshore_fallback).

    First tries point-in-polygon. If no polygon contains the point (offshore
    or just outside the simplified polygon), falls back to the Bundesland
    whose polygon is closest. The second return value is True when fallback
    was used so the caller can flag the row for review.
    """
    pt = Point(lon, lat)
    for name, prepared_geom, _ in bundeslaender:
        if prepared_geom.contains(pt):
            return name, False

    # Fallback: nearest Bundesland by polygon distance. Suitable for offshore
    # buses (Baltic / North Sea) and points marginally outside a polygon edge.
    best_name: str | None = None
    best_dist = float("inf")
    for name, _, raw_geom in bundeslaender:
        d = pt.distance(raw_geom)
        if d < best_dist:
            best_dist = d
            best_name = name
    return best_name, True


def border_warning(lon: float, lat: float) -> str | None:
    """Return a short reason string if (lon, lat) falls in a known border box."""
    for reason, lo_lon, hi_lon, lo_lat, hi_lat in BORDER_WARNING_BOXES:
        if lo_lon <= lon <= hi_lon and lo_lat <= lat <= hi_lat:
            return reason
    return None


def main() -> None:
    print(f"Loading Bundesländer from {BUNDESLAENDER_GEOJSON}")
    bundeslaender = load_bundeslaender()
    assert len(bundeslaender) == 16, f"expected 16 Bundesländer, got {len(bundeslaender)}"

    print(f"Loading German buses from {BUSES_CSV}")
    buses = iter_german_buses()
    print(f"  found {len(buses)} German buses")

    rows_out: list[dict[str, str]] = []
    unmatched: list[dict[str, str]] = []
    zone_counts: dict[str, int] = dict.fromkeys(set(BL_TO_REGELZONE.values()), 0)
    offshore_count = 0

    for bus in buses:
        bus_id = bus["bus_id"]
        try:
            lon = float(bus["x"])
            lat = float(bus["y"])
        except (KeyError, ValueError):
            unmatched.append({"bus_id": bus_id, "reason": "missing or invalid coords"})
            continue
        bl, used_fallback = assign_bundesland(lon, lat, bundeslaender)
        if bl is None:
            unmatched.append(
                {"bus_id": bus_id, "reason": f"no nearest Bundesland for ({lon}, {lat})"}
            )
            continue
        zone = BL_TO_REGELZONE[bl]
        zone_counts[zone] = zone_counts.get(zone, 0) + 1
        warnings_list: list[str] = []
        if used_fallback:
            warnings_list.append("offshore_or_outside_polygon")
            offshore_count += 1
        bw = border_warning(lon, lat)
        if bw:
            warnings_list.append(bw)
        rows_out.append(
            {
                "bus_id": bus_id,
                "zone": zone,
                "voltage": bus["voltage"],
                "lon": f"{lon:.6f}",
                "lat": f"{lat:.6f}",
                "bundesland": bl,
                "border_warning": ";".join(warnings_list),
            }
        )

    print()
    print("Zone distribution:")
    for zone, count in sorted(zone_counts.items()):
        print(f"  {zone:12}  {count:4d}")
    print()
    print(f"Total matched:   {len(rows_out)}")
    print(f"Total unmatched: {len(unmatched)}")
    if unmatched:
        print("Unmatched buses (first 5):")
        for u in unmatched[:5]:
            print(f"  {u}")

    border_count = sum(1 for r in rows_out if r["border_warning"])
    print(f"Border-warning buses: {border_count}")
    print(f"Offshore/nearest-fallback buses: {offshore_count}")

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["bus_id", "zone", "voltage", "lon", "lat", "bundesland", "border_warning"]
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_out)
    print()
    print(f"Wrote {OUTPUT_CSV} ({len(rows_out)} rows)")


if __name__ == "__main__":
    main()
