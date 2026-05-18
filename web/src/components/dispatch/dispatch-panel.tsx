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
import { StackedAreaChart } from "./stacked-area-chart";

interface Props {
  bundle: DispatchBundle;
}

export function DispatchPanel({ bundle }: Props) {
  const { data, carriers } = toRechartsStacked(bundle.stacked_generation_daily);
  const totalsByMetric = groupByMetric(bundle.national_totals);
  const perZoneMatrix = perZoneMatrixFor(bundle.per_zone_totals);
  const totalLoad = totalsByMetric.load_mwh?.reduce((acc, r) => acc + r.value, 0) ?? 0;
  const totalGen =
    totalsByMetric.generation_mwh?.reduce((acc, r) => acc + r.value, 0) ?? 0;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dispatch</h2>
          <p className="text-sm text-muted-foreground">
            {bundle.label}
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
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Daily generation by carrier</CardTitle>
          <CardDescription>
            Stacked daily totals across all four ÜNB zones. Carriers contributing
            less than 0.1 MWh over the horizon are hidden to keep the legend
            readable.
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
          web/src/data/dispatch/{bundle.scenario_id}.daily.parquet
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
