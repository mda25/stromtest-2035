# Reiche scenario family — substantive change log

Authoritative record of substantive movements in the Reiche-Bundesregierung
scenarios. Patch bumps (citation fixes, typos) live in git history, not
here. ISO-date version bumps (capacity, demand, NTC changes) get an entry
below with the underlying source.

<!-- Format: ## YYYY-MM-DD.PATCH — short title -->
<!--   Source: <citation_ref + URL> -->
<!--   Change: <substantive fields that moved + why> -->

## 2026-05-17.0 — Initial Reiche scenario

Source basis: Koalitionsvertrag CDU/CSU-SPD 2025 (signed 2025-04-09;
energy chapter), BMWE Kraftwerksstrategie Grundsatzeinigung mit der
EU-Kommission (2026-01-15), NEP 2037/2045 V2025 1. Entwurf (2025-12-10),
NWS Fortschreibung 2023, EEG-2023, WindSeeG-2023.

Key positions encoded vs. legal floors and prior Habeck-era pathway:

- **Gas backup** scaled UP to 20 GW per Kraftwerksstrategie (vs. ~10 GW
  in Habeck-era Eckpunkte 2023). Allocated south-heavy reflecting demand-
  vs-supply gap and KWSG netzdienliche Standorte criterion. Citation:
  BMWE-Kraftwerksstrategie-2026-01.
- **Hydrogen electrolyzer** scaled DOWN to ~15 GW by 2035 (vs. ~28 GW
  in T45-Strom pathway) reflecting Koalitionsvertrag positioning of
  "Wasserstoffhochlauf beschleunigen, alle Farben". Slower domestic
  electrolyzer build means more import reliance. Citation: NWS-
  Fortschreibung-2023 + KoaV-2025.
- **Hydrogen storage** at 40 TWh — low end of LFS T45 70-100 TWh long-term
  range, consistent with slower hydrogen pathway.
- **Wind onshore** ~138 GW national — interpolated between EEG 115 GW
  (2030) and 160 GW (2040), unchanged by Reiche-era (statutory).
- **Wind offshore** 40 GW national — statutory floor under WindSeeG § 1,
  unchanged.
- **Solar PV** ~292 GW national — interpolated EEG 215 (2030) → 400 (2040),
  tightened to ~290 reflecting Reiche-era tempering of mid-decade incentives.
- **Battery storage** 52 GWh national — interpolated from NEP 2037 V2025
  Scenario B (24 GW / 61 GWh by 2037).
- **Demand baseline** 700 TWh — middle of NEP V2025 A/B range, reflecting
  slowed heat pump and EV uptake under Reiche.
- **Heat pump share** 0.35, **EV share** 0.50 — slower than Habeck-era
  T45 (0.55 / 0.70).

Per-zone allocations:
- Onshore wind allocated proportionally to current Fraunhofer Windmonitor
  2025 per-Bundesland production, scaled to national 2035 target with
  modest catch-up adjustment for southern Bundesländer under the WindBG 2%
  land-area mandate.
- Offshore wind allocated to coastal landing zones only (Nds + SH = TenneT
  for North Sea; MV = 50Hertz for Baltic).
- Solar allocated by current per-zone share with small rebalancing toward
  Bayern + BW (rooftop dominance, population).
- Gas backup allocated by demand-vs-supply gap heuristic (no published
  per-zone breakdown exists in KWSG documents).
- Electrolyzer allocated to wind-rich zones + NRW industrial demand.

Open items for review:
- Per-zone gas backup allocation is [LOW] confidence — KWSG criteria are
  qualitative ("netzdienlich"), not quantitative per zone.
- Per-zone electrolyzer allocation likewise [LOW] — no public 2035 NWS
  regional plan exists.
- Solar 2035 national figure of 292 GW interpolated from EEG; could
  reasonably be 270-310 GW depending on read of Reiche pace assumptions.
- Demand 700 TWh sits at the low end of NEP V2025 B (which spans
  ~700-1000 TWh depending on electrification assumptions).

Patch updates (non-substantive — citation fix, typo) will appear in git
history without a new entry here.
