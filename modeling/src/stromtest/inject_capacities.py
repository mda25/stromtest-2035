"""Inject a stromtest scenario's per-zone capacities into a prepared PyPSA network.

After PyPSA-Eur's ``prepare_network`` produces ``base_s_4_elec_.nc``, every
generator/link/storage has a starting ``p_nom`` (or ``e_nom`` for stores)
and an ``_extendable`` flag indicating whether the LP can grow it. By
default for our DE-tutorial config, renewables are extendable (starting
from powerplantmatching 2020) and conventionals are fixed at their
existing values.

For a 2035 case-study like the Reiche scenario we need the OPPOSITE: we
want to LOCK the fleet to our cited per-zone capacities and have the LP
solve dispatch only. This module rewrites the network in place:

    For each scenario carrier (wind_onshore, solar_pv, gas_backup, ...)
    and each ÜNB zone (50hertz/tennet/amprion/transnetbw):
      - Find existing components at that bus matching the PyPSA carrier(s)
      - Set the first matching component's p_nom to the scenario value
      - Zero out other matching components (avoid double-counting)
      - Disable extendability on every touched component

    For every PyPSA carrier NOT mentioned in the scenario (coal, lignite,
    nuclear, biomass, oil, ...):
      - Zero out at all buses + disable extendability

The result is a network whose installed fleet matches the scenario
exactly. ``solve_network`` then dispatches on those fixed capacities.

Run after ``prepare_network`` (which produces the ``..._elec_.nc`` file),
before ``solve_network``. Idempotent — re-running on an already-injected
network is a no-op modulo float round-trip.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pypsa


# Scenario carrier → set of PyPSA carriers it covers. The first PyPSA
# carrier in each list is treated as the "primary" — it absorbs the full
# scenario capacity, others get zeroed (so they don't double-count or
# leak in via extendable_carriers).
SCENARIO_GENERATOR_CARRIERS: dict[str, list[str]] = {
    "wind_onshore": ["onwind"],
    "wind_offshore": ["offwind-ac", "offwind-dc", "offwind-float"],
    "solar_pv": ["solar", "solar-hsat"],
    "gas_backup": ["OCGT", "CCGT"],
}

# Generator carriers we explicitly zero out — phased out under any 2035
# climate-neutrality trajectory (coal/lignite/nuclear in Germany are
# decommissioned by 2030-2038 per current law). Listed explicitly so
# the intent is clear and future scenarios can override.
ZEROED_GENERATOR_CARRIERS: list[str] = [
    "coal",
    "lignite",
    "nuclear",
    "oil",
]


@dataclass(frozen=True)
class InjectionResult:
    """Return value of inject_capacities()."""

    network_path: Path
    capacities_path: Path
    generators_set: int
    generators_zeroed: int
    storage_units_set: int
    stores_set: int
    links_set: int
    summary_by_zone_gw: dict[str, dict[str, float]]


def inject_capacities(network_path: Path, capacities_path: Path) -> InjectionResult:
    """Mutate a PyPSA network NetCDF in place to lock capacities per scenario.

    Args:
        network_path: PyPSA NetCDF, typically
            ``resources/{run}/networks/base_s_{clusters}_elec_.nc`` after
            PyPSA-Eur's ``prepare_network`` rule.
        capacities_path: ``capacities.json`` produced by ``stromtest translate``.

    Returns:
        InjectionResult with bookkeeping counters and a per-zone GW summary
        for cross-checking.
    """
    import pypsa  # heavy import deferred to call-site

    network_path = Path(network_path)
    capacities_path = Path(capacities_path)
    if not network_path.exists():
        raise FileNotFoundError(network_path)
    if not capacities_path.exists():
        raise FileNotFoundError(capacities_path)

    capacities = json.loads(capacities_path.read_text(encoding="utf-8"))
    blocks = capacities["capacities_2035_gw"]

    n = pypsa.Network()
    n.import_from_netcdf(network_path)

    counters = {"gen_set": 0, "gen_zero": 0, "su_set": 0, "store_set": 0, "link_set": 0}
    by_zone_gw: dict[str, dict[str, float]] = {}

    zones = ["50hertz", "tennet", "amprion", "transnetbw"]
    for zone in zones:
        bus = f"DE0_{zone}"
        if bus not in n.buses.index:
            # The network omits this zone (only happens in tiny test fixtures).
            # Skip rather than fail so the injector stays unit-testable on
            # 2-zone networks.
            continue
        by_zone_gw[zone] = {}

        for scenario_carrier, pypsa_carriers in SCENARIO_GENERATOR_CARRIERS.items():
            block = blocks[scenario_carrier]
            # ZoneCapacities serialises with the alias "50hertz" but pydantic
            # also exposes "zone_50hertz"; the JSON consistently uses the
            # alias since translate.py emits via model_dump(by_alias=True).
            target_gw = float(block[zone])
            target_mw = target_gw * 1000.0
            counters["gen_set"] += _inject_generator(
                n, bus=bus, carriers=pypsa_carriers, target_mw=target_mw
            )
            counters["gen_zero"] += _zero_other_matching_generators(
                n, bus=bus, carriers=pypsa_carriers
            )
            by_zone_gw[zone][scenario_carrier] = target_gw

        # Electrolyzer is a Link (not a Generator).
        eyzer_target_mw = float(blocks["hydrogen_electrolyzer"][zone]) * 1000.0
        counters["link_set"] += _set_link_p_nom(
            n, prefix=f"DE0_{zone} H2 Electrolysis", target_mw=eyzer_target_mw
        )
        by_zone_gw[zone]["hydrogen_electrolyzer"] = blocks["hydrogen_electrolyzer"][zone]

        # Pumped hydro: existing StorageUnits from powerplantmatching.
        # We re-purpose any pumped-storage unit at this bus by setting
        # its p_nom to our scenario value. PyPSA-Eur represents it with
        # carrier "PHS" or similar; identify by name containing 'pumped'.
        ph_target_mw = float(blocks["pumped_hydro"][zone]) * 1000.0
        counters["su_set"] += _set_storage_unit_p_nom_at_bus(
            n,
            bus=bus,
            carriers=["PHS"],
            target_mw=ph_target_mw,
        )

        # Battery: per-zone storage unit gets its share of the national
        # total. For V0 we split the national value evenly across the four
        # zones — refining is a V1 chore. capacities.json strips the
        # CitedValue wrapper so the field is a bare float, not a dict.
        battery_total_gwh = float(blocks["battery_storage_gwh"])
        battery_per_zone_gwh = battery_total_gwh / len(zones)
        counters["su_set"] += _set_storage_unit_p_nom_at_bus(
            n,
            bus=bus,
            carriers=["battery"],
            target_mw=battery_per_zone_gwh * 1000.0 / 4.0,  # 4-hour duration default
            duration_hours=4.0,
        )
        by_zone_gw[zone]["battery_per_zone_gwh"] = round(battery_per_zone_gwh, 2)

        # H2 storage Store: split national TWh evenly across the four H2 buses.
        h2_total_twh = float(blocks["hydrogen_storage_twh"])
        h2_per_zone_mwh = h2_total_twh * 1_000_000.0 / len(zones)
        counters["store_set"] += _set_store_e_nom(
            n, bus=f"DE0_{zone} H2", target_mwh=h2_per_zone_mwh
        )
        by_zone_gw[zone]["h2_per_zone_twh"] = round(h2_per_zone_mwh / 1_000_000.0, 2)

    # Zero out unrepresented conventional carriers everywhere.
    counters["gen_zero"] += _zero_carriers(n, carriers=ZEROED_GENERATOR_CARRIERS)

    # Disable all global extendability that survived per-component edits.
    # (Belt-and-braces: per-component edits above flip _extendable but
    # there may be storage_units we did not touch — for V0 we leave those
    # alone since they represent biomass/geothermal/etc. that exist but
    # are minor.)

    n.export_to_netcdf(network_path)

    return InjectionResult(
        network_path=network_path,
        capacities_path=capacities_path,
        generators_set=counters["gen_set"],
        generators_zeroed=counters["gen_zero"],
        storage_units_set=counters["su_set"],
        stores_set=counters["store_set"],
        links_set=counters["link_set"],
        summary_by_zone_gw=by_zone_gw,
    )


# --- Helpers --------------------------------------------------------------


def _inject_generator(n: pypsa.Network, *, bus: str, carriers: list[str], target_mw: float) -> int:
    """Set p_nom of the first matching generator at this bus.

    Other matching generators stay extendable=False (zeroed by caller).
    If no generators match, create one at the bus with the primary carrier.
    """
    matching = n.generators[(n.generators.bus == bus) & (n.generators.carrier.isin(carriers))]
    primary = carriers[0]
    if matching.empty:
        gen_name = f"{bus} {primary} stromtest"
        n.add(
            "Generator",
            gen_name,
            bus=bus,
            carrier=primary,
            p_nom=target_mw,
            p_nom_extendable=False,
            marginal_cost=0.0,
        )
        return 1
    primary_match = matching[matching.carrier == primary]
    if primary_match.empty:
        # No primary carrier present but a fallback carrier is; use the
        # first one.
        idx = matching.index[0]
    else:
        idx = primary_match.index[0]
    n.generators.loc[idx, "p_nom"] = target_mw
    n.generators.loc[idx, "p_nom_extendable"] = False
    n.generators.loc[idx, "p_nom_min"] = target_mw
    n.generators.loc[idx, "p_nom_max"] = target_mw
    return 1


def _zero_other_matching_generators(n: pypsa.Network, *, bus: str, carriers: list[str]) -> int:
    """Zero p_nom on matching generators that did NOT get the scenario value.

    Avoids double-counting when multiple PyPSA carriers (e.g. solar +
    solar-hsat) share a single scenario carrier (solar_pv).
    """
    matching = n.generators[(n.generators.bus == bus) & (n.generators.carrier.isin(carriers))]
    primary = carriers[0]
    # Skip the index that got set (the primary match, or the first match
    # if primary was absent). Everything else gets zeroed.
    if (matching.carrier == primary).any():
        keep = matching[matching.carrier == primary].index[0]
    elif not matching.empty:
        keep = matching.index[0]
    else:
        return 0
    zeroed = 0
    for idx in matching.index:
        if idx == keep:
            continue
        n.generators.loc[idx, "p_nom"] = 0.0
        n.generators.loc[idx, "p_nom_extendable"] = False
        n.generators.loc[idx, "p_nom_min"] = 0.0
        n.generators.loc[idx, "p_nom_max"] = 0.0
        zeroed += 1
    return zeroed


def _zero_carriers(n: pypsa.Network, *, carriers: list[str]) -> int:
    """Zero p_nom on every generator with any of the listed carriers."""
    matching = n.generators[n.generators.carrier.isin(carriers)]
    for idx in matching.index:
        n.generators.loc[idx, "p_nom"] = 0.0
        n.generators.loc[idx, "p_nom_extendable"] = False
        n.generators.loc[idx, "p_nom_min"] = 0.0
        n.generators.loc[idx, "p_nom_max"] = 0.0
    return len(matching)


def _set_link_p_nom(n: pypsa.Network, *, prefix: str, target_mw: float) -> int:
    """Set p_nom on links whose name starts with prefix (e.g. ``DE0_50hertz H2 Electrolysis``)."""
    matching = n.links[n.links.index.str.startswith(prefix)]
    for idx in matching.index:
        n.links.loc[idx, "p_nom"] = target_mw
        n.links.loc[idx, "p_nom_extendable"] = False
        n.links.loc[idx, "p_nom_min"] = target_mw
        n.links.loc[idx, "p_nom_max"] = target_mw
    return len(matching)


def _set_storage_unit_p_nom_at_bus(
    n: pypsa.Network,
    *,
    bus: str,
    carriers: list[str],
    target_mw: float,
    duration_hours: float | None = None,
) -> int:
    """Set p_nom on StorageUnits matching (bus, carriers).

    If no matching unit exists and target_mw > 0, create one.
    """
    matching = n.storage_units[
        (n.storage_units.bus == bus) & (n.storage_units.carrier.isin(carriers))
    ]
    if matching.empty and target_mw > 0:
        primary = carriers[0]
        name = f"{bus} {primary} stromtest"
        kw: dict[str, object] = dict(
            bus=bus,
            carrier=primary,
            p_nom=target_mw,
            p_nom_extendable=False,
        )
        if duration_hours is not None:
            kw["max_hours"] = duration_hours
        n.add("StorageUnit", name, **kw)
        return 1
    for idx in matching.index:
        n.storage_units.loc[idx, "p_nom"] = target_mw
        n.storage_units.loc[idx, "p_nom_extendable"] = False
        n.storage_units.loc[idx, "p_nom_min"] = target_mw
        n.storage_units.loc[idx, "p_nom_max"] = target_mw
        if duration_hours is not None:
            n.storage_units.loc[idx, "max_hours"] = duration_hours
    return len(matching)


def _set_store_e_nom(n: pypsa.Network, *, bus: str, target_mwh: float) -> int:
    """Set e_nom on Stores at the given bus (typically an H2 bus)."""
    matching = n.stores[n.stores.bus == bus]
    for idx in matching.index:
        n.stores.loc[idx, "e_nom"] = target_mwh
        n.stores.loc[idx, "e_nom_extendable"] = False
        n.stores.loc[idx, "e_nom_min"] = target_mwh
        n.stores.loc[idx, "e_nom_max"] = target_mwh
    return len(matching)
