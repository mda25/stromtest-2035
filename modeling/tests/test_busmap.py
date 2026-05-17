"""Tests for the committed 4-zone ÜNB busmap CSV.

These tests run against the committed `modeling/busmap/unb_busmap.csv` and
do NOT require the busmap-gen dependency group (shapely, etc.). They
guard against accidental edits and act as a regression check when the
busmap is re-generated.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

BUSMAP_CSV = Path(__file__).resolve().parents[1] / "busmap" / "unb_busmap.csv"

VALID_ZONES = {"50hertz", "tennet", "amprion", "transnetbw"}

# Bounding box that loosely contains all of Germany plus offshore EEZ.
# Used to catch obviously-wrong coordinate columns.
DE_LON_MIN, DE_LON_MAX = 5.0, 16.0
DE_LAT_MIN, DE_LAT_MAX = 46.5, 55.5


@pytest.fixture(scope="module")
def rows() -> list[dict[str, str]]:
    with BUSMAP_CSV.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_csv_exists() -> None:
    assert BUSMAP_CSV.exists(), f"missing {BUSMAP_CSV}"


def test_expected_schema(rows: list[dict[str, str]]) -> None:
    """Column order is part of the contract with downstream pipeline code."""
    expected = [
        "bus_id",
        "zone",
        "voltage",
        "lon",
        "lat",
        "bundesland",
        "border_warning",
    ]
    assert list(rows[0].keys()) == expected


def test_row_count(rows: list[dict[str, str]]) -> None:
    """V0 baseline: 474 German buses from entsoegridkit. Re-run generator
    on any upstream change."""
    assert len(rows) == 474, (
        f"expected 474 rows, got {len(rows)}. Re-run busmap/generate_busmap.py "
        "if the upstream entsoegridkit data changed."
    )


def test_all_zones_valid(rows: list[dict[str, str]]) -> None:
    bad = [r for r in rows if r["zone"] not in VALID_ZONES]
    assert not bad, f"rows with invalid zone: {bad[:5]}"


def test_all_four_zones_present(rows: list[dict[str, str]]) -> None:
    zones_seen = {r["zone"] for r in rows}
    assert zones_seen == VALID_ZONES, (
        f"missing or unexpected zones. expected {VALID_ZONES}, got {zones_seen}"
    )


def test_bus_ids_unique(rows: list[dict[str, str]]) -> None:
    ids = [r["bus_id"] for r in rows]
    duplicates = {x for x in ids if ids.count(x) > 1}
    assert not duplicates, f"duplicate bus_ids: {sorted(duplicates)[:5]}"


def test_coords_in_germany_bbox(rows: list[dict[str, str]]) -> None:
    out_of_bbox: list[tuple[str, float, float]] = []
    for r in rows:
        lon, lat = float(r["lon"]), float(r["lat"])
        if not (DE_LON_MIN <= lon <= DE_LON_MAX and DE_LAT_MIN <= lat <= DE_LAT_MAX):
            out_of_bbox.append((r["bus_id"], lon, lat))
    assert not out_of_bbox, f"coords outside DE bbox: {out_of_bbox[:5]}"


def test_zone_distribution_within_reasonable_bounds(rows: list[dict[str, str]]) -> None:
    """Sanity check on aggregate zone shares.

    Bounds chosen to catch a busmap that got accidentally re-generated against
    a different country / a typo in BL_TO_REGELZONE / etc. They are wide
    enough not to be brittle under reasonable upstream data updates.
    """
    counts = {z: sum(1 for r in rows if r["zone"] == z) for z in VALID_ZONES}
    total = sum(counts.values())
    shares = {z: c / total for z, c in counts.items()}
    # TenneT is the biggest zone (Bayern + Niedersachsen + Hessen).
    assert 0.30 <= shares["tennet"] <= 0.50, shares
    # Amprion is the second-biggest (NRW + RLP + Saarland).
    assert 0.20 <= shares["amprion"] <= 0.40, shares
    # 50Hertz covers the east (smaller in node count).
    assert 0.10 <= shares["50hertz"] <= 0.30, shares
    # TransnetBW covers only BW.
    assert 0.05 <= shares["transnetbw"] <= 0.25, shares


def test_known_landmark_buses_have_expected_zone(rows: list[dict[str, str]]) -> None:
    """Cross-check that buses near known cities map to the right zone.

    If any of these fail, the busmap regenerator probably has a bug in
    BL_TO_REGELZONE or in the polygon assignment. The check is approximate:
    we pick the bus closest to each landmark and verify its zone.
    """
    landmarks = [
        ("Berlin", 13.40, 52.52, "50hertz"),
        ("Stuttgart", 9.18, 48.78, "transnetbw"),
        ("Munich", 11.58, 48.14, "tennet"),
        ("Cologne", 6.96, 50.94, "amprion"),
        ("Hamburg city", 10.00, 53.55, "50hertz"),
        ("Bremen", 8.81, 53.08, "tennet"),
        ("Nuremberg", 11.07, 49.45, "tennet"),
        ("Essen NRW", 7.10, 51.45, "amprion"),
    ]
    failures: list[str] = []
    for name, lon_l, lat_l, expected_zone in landmarks:
        closest = min(
            rows,
            key=lambda r: (float(r["lon"]) - lon_l) ** 2 + (float(r["lat"]) - lat_l) ** 2,
        )
        if closest["zone"] != expected_zone:
            failures.append(
                f"{name}: closest bus {closest['bus_id']} expected {expected_zone}, "
                f"got {closest['zone']} ({closest['bundesland']})"
            )
    assert not failures, "\n".join(failures)


def test_border_warning_is_minority(rows: list[dict[str, str]]) -> None:
    """border_warning rows are expected (offshore + known overlap zones)
    but should not be the majority of the busmap. If they explode in count,
    something likely regressed in the warning-box definitions."""
    warned = sum(1 for r in rows if r["border_warning"])
    assert warned < len(rows) // 4, (
        f"{warned} rows flagged border_warning out of {len(rows)} "
        "— check generator's warning boxes."
    )
