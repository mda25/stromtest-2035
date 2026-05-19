/**
 * Client-safe dispatch types + transforms.
 *
 * Pure data manipulation, zero Node deps. Safe to import from both
 * Server and Client Components. The fs-based loader lives in
 * `dispatch.ts` and stays server-only.
 */

export interface DispatchRow {
  snapshot: string;
  zone: string;
  technology: string;
  metric: string;
  value: number;
}

export interface StackedRow {
  snapshot: string;
  technology: string;
  value: number;
}

export interface TotalRow {
  metric: string;
  technology: string;
  value: number;
}

export interface ZoneTotalRow {
  zone: string;
  metric: string;
  value: number;
}

/** Per-(zone, metric) value at a single hourly snapshot. */
export interface PerZoneHourlyRow {
  snapshot: string;
  zone: string;
  metric: string;
  value: number;
}

export interface DispatchBundle {
  scenario_id: string;
  scenario_version: string;
  weather_year: number;
  label: string;
  metadata: {
    n_snapshots?: number;
    n_buses?: number;
    n_hourly_snapshots?: number;
    row_counts?: Record<string, number>;
  };
  daily: DispatchRow[];
  stacked_generation_daily: StackedRow[];
  stacked_generation_hourly?: StackedRow[];
  per_zone_hourly?: PerZoneHourlyRow[];
  hourly_snapshots?: string[];
  national_totals: TotalRow[];
  per_zone_totals: ZoneTotalRow[];
}

/**
 * Reshape stacked rows into a wide form ready for Recharts.
 * Carriers contributing < 0.1 MWh across the whole horizon are dropped.
 */
export function toRechartsStacked(rows: StackedRow[]): {
  data: Record<string, number | string>[];
  carriers: string[];
} {
  const carrierTotals = new Map<string, number>();
  for (const r of rows) {
    carrierTotals.set(r.technology, (carrierTotals.get(r.technology) ?? 0) + r.value);
  }
  const carriers = Array.from(carrierTotals.entries())
    .filter(([, total]) => Math.abs(total) >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  const bySnapshot = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    if (!carriers.includes(r.technology)) continue;
    const row = bySnapshot.get(r.snapshot) ?? { snapshot: r.snapshot };
    row[r.technology] = (row[r.technology] as number | undefined) ?? 0;
    row[r.technology] = (row[r.technology] as number) + r.value;
    bySnapshot.set(r.snapshot, row);
  }
  const data = Array.from(bySnapshot.values()).sort((a, b) =>
    (a.snapshot as string).localeCompare(b.snapshot as string),
  );
  return { data, carriers };
}

export const CARRIER_COLORS: Record<string, string> = {
  solar: "#facc15",
  "solar-hsat": "#fbbf24",
  onwind: "#22c55e",
  "offwind-ac": "#0ea5e9",
  "offwind-dc": "#0284c7",
  "offwind-float": "#0369a1",
  biomass: "#65a30d",
  geothermal: "#7c2d12",
  waste: "#a3a3a3",
  CCGT: "#dc2626",
  OCGT: "#ef4444",
  coal: "#1f2937",
  lignite: "#374151",
  oil: "#7c2d12",
  nuclear: "#9333ea",
  H2: "#06b6d4",
  battery: "#a855f7",
  PHS: "#3b82f6",
};

export function colorFor(carrier: string): string {
  return CARRIER_COLORS[carrier] ?? "#9ca3af";
}

export function formatMWh(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)} GWh`;
  }
  return `${value.toFixed(0)} MWh`;
}
