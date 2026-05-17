/**
 * Build-time scenario loader.
 *
 * Reads the committed scenario YAMLs from ../modeling/scenarios/ via
 * Node fs (server-only). Next.js Server Components call this from page
 * files; the parsed scenarios are serialized into the rendered HTML.
 * Nothing here ships to the client bundle.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

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

const SCENARIOS_DIR = path.resolve(
  process.cwd(),
  "..",
  "modeling",
  "scenarios",
);

/**
 * Lists every (family, version) YAML committed in modeling/scenarios/.
 * Skips _template.yml, index.yml, and CHANGELOG.md files.
 */
export function loadAllScenarios(): ScenarioFile[] {
  const result: ScenarioFile[] = [];
  const families = fs
    .readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  for (const fam of families) {
    const famDir = path.join(SCENARIOS_DIR, fam.name);
    const versionFiles = fs
      .readdirSync(famDir)
      .filter((f) => f.endsWith(".yml") && !f.startsWith("_"));
    let changelog: string | null = null;
    const changelogPath = path.join(famDir, "CHANGELOG.md");
    if (fs.existsSync(changelogPath)) {
      changelog = fs.readFileSync(changelogPath, "utf-8");
    }
    for (const vf of versionFiles) {
      const filepath = path.join(famDir, vf);
      const raw = fs.readFileSync(filepath, "utf-8");
      const scenario = yaml.load(raw) as Scenario;
      result.push({
        family: fam.name,
        version: scenario.version,
        filename: vf,
        scenario,
        changelog_md: changelog,
      });
    }
  }
  // Stable ordering: family alphabetical, then version desc.
  result.sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      b.version.localeCompare(a.version),
  );
  return result;
}

export function loadScenarioByFamily(family: string): ScenarioFile | null {
  const all = loadAllScenarios();
  const match = all.find((s) => s.family === family);
  return match ?? null;
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
