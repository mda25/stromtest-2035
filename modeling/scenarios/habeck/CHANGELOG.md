# Habeck scenario family — substantive change log

Authoritative record of substantive movements in the Habeck-era Klimaneutralität
2045 scenarios. Patch bumps (citation fixes, typos) live in git history, not
here. ISO-date version bumps get an entry below with the underlying source.

<!-- Format: ## YYYY-MM-DD.PATCH — short title -->
<!--   Source: <citation_ref + URL> -->
<!--   Change: <substantive fields that moved + why> -->

## 2024-09-30.0 — Initial Habeck-era reference scenario

Source basis: BMWK Langfristszenarien 3 T45-Strom (2023), Klimaschutzgesetz
2021, EEG-2023, WindSeeG-2023, NWS Fortschreibung 2023, NEP 2037 V2023,
Agora Klimaneutrales Stromsystem 2035 (2021).

Versioned 2024-09-30 to anchor the snapshot of policy commitments just
before the Ampel coalition collapsed (November 2024). This is the
trajectory that would have continued absent the change of government;
provided in stromtest-2035 as a comparison anchor for the Reiche scenario.

Key positions encoded:

- **Gas backup** ~10 GW national — pre-KWSG-3.0 Habeck-era stance from the
  2023 Eckpunkte Kraftwerksstrategie; smaller than the Reiche 20 GW
  expansion. Citation: LFS3-T45-Strom.
- **Hydrogen electrolyzer** ~28 GW by 2035 — fast ramp consistent with
  NWS Fortschreibung 10 GW by 2030 and NEP 2037 V2023 trajectory to
  ~80 GW by 2045. Allocated to wind-rich zones plus NRW co-location.
  Citation: NWS-Fortschreibung-2023.
- **Hydrogen storage** 60 TWh — middle of LFS T45 70-100 TWh long-term
  range, scaled back to reflect partial cavern build-out by 2035.
- **Wind onshore** ~145 GW national — sits above EEG 2030 floor (115) and
  below 2040 (160), with LFS3 T45 accelerated WindBG implementation.
- **Wind offshore** 40 GW national — statutory floor under WindSeeG § 1.
- **Solar PV** ~325 GW national — LFS3 T45 implies 215 + 30/year × 5 =
  365 GW by 2035; tightened to ~325 reflecting conservative read of LFS3
  build-rate assumptions.
- **Battery storage** 80 GWh — scaled up from NEP 2037 V2023 B baseline
  to reflect T45's higher flex need given smaller gas backup.
- **Demand baseline** 780 TWh — sits between NEP B (~700) and
  high-electrification variants (~800-1000) reflecting full
  electrification under T45.
- **Heat pump share** 0.55 — LFS3 T45 trajectory of 10-11 M heat pumps
  by 2035.
- **EV share** 0.70 — Ampel target of 15 M BEVs by 2030 implies ~70%
  share by 2035.

Per-zone allocations:
- Same spatial methodology as Reiche scenario (current Bundesland-level
  shares scaled to national 2035 totals, with WindBG-driven southern
  catch-up for wind onshore).
- Pumped hydro identical to Reiche (geography-limited, near-zero
  difference between scenarios).

Open items for review:
- Solar 2035 national figure of 325 GW could reasonably be 300-365 GW.
  The chosen value is at the conservative end of the LFS3 trajectory.
- Gas backup 10 GW could reasonably be 8-12 GW — the Habeck-era Eckpunkte
  oscillated through 2023-2024 before the Ampel collapse.

Patch updates (non-substantive — citation fix, typo) will appear in git
history without a new entry here.
