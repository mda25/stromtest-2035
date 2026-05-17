/**
 * stromtest-2035 data loader.
 *
 * Reads the pre-computed scenario results (hourly + daily + weekly Parquet
 * pre-aggregated to JSON) from a manifest published alongside the modeling
 * pipeline. V0 scaffolding: types and stubs only. Real fetching logic lands
 * in build step 9 once the modeling pipeline produces its first run.
 */

export type Resolution = "hourly" | "daily" | "weekly";
export type UNBZone = "50hertz" | "tennet" | "amprion" | "transnetbw";

export interface ScenarioManifestEntry {
  scenario_family: string;
  version: string;
  weather_year: number;
  resolution: Resolution;
  url: string;
  bytes: number;
  generated_at: string;
}

export interface ScenarioManifest {
  generated_at: string;
  entries: ScenarioManifestEntry[];
}

export class DataUnavailableError extends Error {
  constructor(public readonly scenarioKey: string) {
    super(`Data not available for ${scenarioKey}`);
    this.name = "DataUnavailableError";
  }
}

/**
 * Look up a manifest entry. Returns null when not found rather than throwing,
 * so the UI can render an explicit "unavailable" state.
 */
export function findEntry(
  manifest: ScenarioManifest,
  scenario_family: string,
  version: string,
  weather_year: number,
  resolution: Resolution,
): ScenarioManifestEntry | null {
  return (
    manifest.entries.find(
      (e) =>
        e.scenario_family === scenario_family &&
        e.version === version &&
        e.weather_year === weather_year &&
        e.resolution === resolution,
    ) ?? null
  );
}

/**
 * Stub for fetching the pre-aggregated JSON for a specific run. Real
 * implementation lands in build step 9 (see docs/design.md).
 */
export async function fetchRun(
  manifest: ScenarioManifest,
  scenario_family: string,
  version: string,
  weather_year: number,
  resolution: Resolution,
): Promise<unknown> {
  const entry = findEntry(
    manifest,
    scenario_family,
    version,
    weather_year,
    resolution,
  );
  if (!entry) {
    throw new DataUnavailableError(
      `${scenario_family}@${version} / ${weather_year} / ${resolution}`,
    );
  }
  // V0 stub. Real implementation: fetch(entry.url), validate schema, return typed data.
  throw new Error("fetchRun not implemented in V0 scaffolding");
}
