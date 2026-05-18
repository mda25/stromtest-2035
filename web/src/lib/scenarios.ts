/**
 * Build-time scenario loader.
 *
 * Reads from a baked-at-build-time JSON file at src/data/scenarios.json,
 * synced from ../modeling/scenarios/ by web/scripts/sync-scenarios.mjs.
 * The sync runs as a `prebuild` step (so Vercel deploys always get fresh
 * data) and the resulting JSON is committed (so `npm run dev` works
 * without running the sync first, and Vercel builds succeed even when
 * modeling/ is not visible to the web/ build context).
 *
 * This module is import-safe in both Server and Client Components.
 */

import scenariosData from "@/data/scenarios.json";

export type UNBZone = "50hertz" | "tennet" | "amprion" | "transnetbw";

export interface ZoneCapacities {
  "50hertz": number;
  tennet: number;
  amprion: number;
  transnetbw: number;
  citation_ref: string;
}

export interface CitedValue {
  value: number;
  citation_ref: string;
}

export interface Capacities2035 {
  wind_onshore: ZoneCapacities;
  wind_offshore: ZoneCapacities;
  solar_pv: ZoneCapacities;
  gas_backup: ZoneCapacities;
  hydrogen_electrolyzer: ZoneCapacities;
  hydrogen_storage_twh: CitedValue;
  battery_storage_gwh: CitedValue;
  pumped_hydro: ZoneCapacities;
}

export interface Demand2035 {
  baseline_twh: number;
  heat_pump_share: number;
  ev_share_passenger: number;
  electrolyzer_demand_twh: number;
  citation_refs: string[];
}

export interface Source {
  ref: string;
  title: string;
  url: string;
  date?: string | null;
}

export interface Scenario {
  id: string;
  version: string;
  display_name: string;
  description: string;
  authors: string[];
  sources: Source[];
  capacities_2035_gw: Capacities2035;
  demand_2035: Demand2035;
  transmission_ntc_gw: Record<string, number>;
  supersedes?: string | null;
  superseded_by?: string | null;
}

export interface ScenarioFile {
  family: string;
  version: string;
  filename: string;
  scenario: Scenario;
  changelog_md: string | null;
}

/**
 * Returns every (family, version) scenario baked into src/data/scenarios.json.
 *
 * Already sorted (family alphabetical, version desc) by the sync script;
 * we just hand it back typed.
 */
export function loadAllScenarios(): ScenarioFile[] {
  return scenariosData as ScenarioFile[];
}

export function loadScenarioByFamily(family: string): ScenarioFile | null {
  return loadAllScenarios().find((s) => s.family === family) ?? null;
}

/**
 * Helpers for the comparison page: aggregate a per-zone block to a national total.
 */
export function zoneSum(zc: ZoneCapacities): number {
  return zc["50hertz"] + zc.tennet + zc.amprion + zc.transnetbw;
}

export function formatGW(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)} GW`;
}

export function formatTWh(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)} TWh`;
}

export function formatGWh(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)} GWh`;
}

export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
