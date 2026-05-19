"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type DispatchBundle,
  colorFor,
  formatMWh,
  toRechartsStacked,
} from "@/lib/dispatch-utils";
import type { ZonePathBundle } from "@/lib/zone-paths";
import { WEATHER_YEAR_CATALOG, type WeatherYearMeta } from "@/lib/weather-years";
import { StackedAreaChart } from "./stacked-area-chart";
import { TimeMachine } from "./time-machine";
import { WeatherYearSelector } from "./weather-year-selector";
import { ZoneMap } from "./zone-map";

export interface DispatchYearBundle {
  family: string;
  year: number;
  bundle: DispatchBundle;
}

interface Props {
  /** All committed (family, year) dispatch bundles for this scenario. */
  bundles: DispatchYearBundle[];
  /** Server-projected SVG paths for the four ÜNB Regelzonen. */
  paths: ZonePathBundle;
  /** Optional catalog override; defaults to WEATHER_YEAR_CATALOG. */
  catalog?: WeatherYearMeta[];
}

/**
 * Top-level dispatch panel.
 *
 * Holds the active weather-year state. The page passes in every
 * committed (family, year) bundle plus the full year catalog; the user
 * picks a year from the segmented control, the panel re-renders with
 * that year's bundle.
 *
 * The fleet (capacities, demand, network topology) is fixed to 2035 —
 * only the WEATHER input changes across years, because PyPSA-Eur drives
 * renewables from ERA5 historical reanalysis. The header copy makes
 * this distinction explicit so viewers don't mistake the year stamps
 * on the slider for the simulation year.
 */
export function DispatchPanel({
  bundles,
  paths,
  catalog = WEATHER_YEAR_CATALOG,
}: Props) {
  const availableYears = useMemo(
    () => bundles.map((b) => b.year).sort((a, b) => a - b),
    [bundles],
  );
  const [activeYear, setActiveYear] = useState<number>(() => {
    if (availableYears.length === 0) return 0;
    return availableYears[availableYears.length - 1];
  });
  const active = bundles.find((b) => b.year === activeYear) ?? bundles[0];
  if (!active) return null;
  const bundle = active.bundle;
  const activeMeta = catalog.find((c) => c.year === active.year);

  const hasHourly =
    (bundle.hourly_snapshots?.length ?? 0) > 0 &&
    (bundle.per_zone_hourly?.length ?? 0) > 0 &&
    (bundle.stacked_generation_hourly?.length ?? 0) > 0;
  const stackedSource =
    hasHourly && bundle.stacked_generation_hourly
      ? bundle.stacked_generation_hourly
      : bundle.stacked_generation_daily;
  const { data, carriers } = toRechartsStacked(stackedSource);
  const totalsByMetric = groupByMetric(bundle.national_totals);
  const perZoneMatrix = perZoneMatrixFor(bundle.per_zone_totals);
  const totalLoad =
    totalsByMetric.load_mwh?.reduce((acc, r) => acc + r.value, 0) ?? 0;
  const totalGen =
    totalsByMetric.generation_mwh?.reduce((acc, r) => acc + r.value, 0) ?? 0;
  const chartResolution = hasHourly ? "hour" : "day";

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Dispatch</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                2035 fleet · weather sampled from {active.year}
              </span>
              {activeMeta ? ` — ${activeMeta.label}.` : "."} Capacities and
              demand are pinned to the scenario above. Wind / solar / hydro
              traces come from ERA5 reanalysis, which only covers historical
              years — that&apos;s why the slider stamps a {active.year} date.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              {bundle.scenario_id}@{bundle.scenario_version}
            </Badge>
            <Badge variant="outline">weather year {bundle.weather_year}</Badge>
            <Badge variant="outline">
              {bundle.metadata.n_snapshots ?? "?"} snapshots
            </Badge>
          </div>
        </div>

        <WeatherYearSelector
          availableYears={availableYears}
          catalog={catalog}
          activeYear={active.year}
          onSelect={setActiveYear}
        />
      </header>

      {hasHourly && (
        <Card>
          <CardHeader>
            <CardTitle>Time machine</CardTitle>
            <CardDescription>
              Scrub through every hour of the week. The map recolors with
              each zone&apos;s net balance at that moment; the bars show
              what&apos;s actually generating. Slider steps every 15
              minutes (model resolves hourly); keyboard ← / → / Space
              works once you click the card.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimeMachine bundle={bundle} paths={paths} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Zone map — net balance over the week</CardTitle>
          <CardDescription>
            The same four ÜNB Regelzonen colored by the WEEK&apos;S net
            balance (generation minus load summed over all 168 hours).
            Green = exporter, red = importer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ZoneMap bundle={bundle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {chartResolution === "hour"
              ? "Hourly generation by carrier"
              : "Daily generation by carrier"}
          </CardTitle>
          <CardDescription>
            Stacked {chartResolution === "hour" ? "hourly" : "daily"} totals
            across all four ÜNB zones. Carriers contributing less than 0.1
            MWh over the horizon are hidden to keep the legend readable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length > 0 && carriers.length > 0 ? (
            <StackedAreaChart data={data} carriers={carriers} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No generation rows in the dispatch bundle. The run may have
              completed before any generators dispatched.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>National totals</CardTitle>
            <CardDescription>
              Sum of generation per carrier across all zones and snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {(totalsByMetric.generation_mwh ?? [])
                .filter((r) => r.value > 1)
                .slice(0, 12)
                .map((r) => (
                  <div
                    key={r.technology}
                    className="flex items-center justify-between gap-3 border-b py-1 last:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: colorFor(r.technology) }}
                      />
                      {r.technology}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatMWh(r.value)}
                    </span>
                  </div>
                ))}
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-muted-foreground">
                <span>Total generation</span>
                <span className="font-mono tabular-nums">
                  {formatMWh(totalGen)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Total load</span>
                <span className="font-mono tabular-nums">
                  {formatMWh(totalLoad)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-zone balance</CardTitle>
            <CardDescription>
              Generation vs. load per ÜNB zone. Positive net = exporter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-3">Zone</th>
                    <th className="py-1 pr-3 text-right">Gen</th>
                    <th className="py-1 pr-3 text-right">Load</th>
                    <th className="py-1 pr-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {perZoneMatrix.map((r) => (
                    <tr key={r.zone} className="border-b last:border-0">
                      <td className="py-1 pr-3">{r.zone}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {formatMWh(r.gen)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {formatMWh(r.load)}
                      </td>
                      <td
                        className={`py-1 pr-3 text-right font-mono tabular-nums ${
                          r.gen - r.load >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        {formatMWh(r.gen - r.load)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Raw daily Parquet committed alongside the JSON at{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">
          web/src/data/dispatch/{bundle.scenario_id}.{bundle.weather_year}.daily.parquet
        </code>{" "}
        for downstream analysis. Bundled into the build output but not
        served as a static asset — clone the repo to access it.
      </p>
    </section>
  );
}

function groupByMetric(rows: { metric: string; technology: string; value: number }[]) {
  const out: Record<string, { metric: string; technology: string; value: number }[]> =
    {};
  for (const r of rows) {
    out[r.metric] = out[r.metric] ?? [];
    out[r.metric].push(r);
  }
  return out;
}

interface ZoneMatrixRow {
  zone: string;
  gen: number;
  load: number;
}

function perZoneMatrixFor(
  rows: { zone: string; metric: string; value: number }[],
): ZoneMatrixRow[] {
  const map = new Map<string, ZoneMatrixRow>();
  for (const r of rows) {
    const existing = map.get(r.zone) ?? { zone: r.zone, gen: 0, load: 0 };
    if (r.metric === "generation_mwh") existing.gen += r.value;
    if (r.metric === "load_mwh") existing.load += r.value;
    map.set(r.zone, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.zone.localeCompare(b.zone));
}
