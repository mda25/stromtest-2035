import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DispatchPanel } from "@/components/dispatch/dispatch-panel";
import { loadDispatchForFamily } from "@/lib/dispatch";
import {
  type ScenarioFile,
  type ZoneCapacities,
  formatGW,
  formatGWh,
  formatPercent,
  formatTWh,
  loadAllScenarios,
  zoneSum,
} from "@/lib/scenarios";

export const dynamicParams = false;

export function generateStaticParams() {
  const files = loadAllScenarios();
  const families = Array.from(new Set(files.map((f) => f.family)));
  return families.map((family) => ({ family }));
}

interface Props {
  params: Promise<{ family: string }>;
}

export default async function ScenarioFamilyPage({ params }: Props) {
  const { family } = await params;
  const files = loadAllScenarios().filter((f) => f.family === family);
  if (files.length === 0) notFound();
  const latest = files[0];
  const s = latest.scenario;
  const dispatch = loadDispatchForFamily(family);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          ← stromtest-2035
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/scenarios"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          scenarios
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {s.display_name}
          </h1>
          <Badge variant="outline">{latest.version}</Badge>
        </div>
        <p className="text-pretty text-lg text-muted-foreground">{s.description}</p>
        <p className="text-sm text-muted-foreground">
          Authors: {s.authors.join(", ")} ·{" "}
          {files.length} version{files.length === 1 ? "" : "s"} committed
        </p>
      </header>

      <Separator />

      <NationalTotalsCard file={latest} />

      <ZoneTable file={latest} />

      <DemandCard file={latest} />

      {dispatch ? (
        <>
          <Separator />
          <DispatchPanel bundle={dispatch} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dispatch</CardTitle>
            <CardDescription>
              No solved dispatch committed for this scenario yet. Run the
              PyPSA-Eur pipeline + capacity injection (see
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5">
                modeling/RUNBOOK.md
              </code>{" "}
              smoke test 4) and run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                bin/build_dispatch_json.py
              </code>{" "}
              to populate{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                web/src/data/dispatch/{family}.json
              </code>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <SourcesList file={latest} />

      {latest.changelog_md && (
        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Changelog</h2>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap">
            {latest.changelog_md}
          </pre>
        </section>
      )}
    </main>
  );
}

function NationalTotalsCard({ file }: { file: ScenarioFile }) {
  const c = file.scenario.capacities_2035_gw;
  const stats: { label: string; value: string }[] = [
    { label: "Wind onshore", value: formatGW(zoneSum(c.wind_onshore)) },
    { label: "Wind offshore", value: formatGW(zoneSum(c.wind_offshore)) },
    { label: "Solar PV", value: formatGW(zoneSum(c.solar_pv)) },
    { label: "Gas backup", value: formatGW(zoneSum(c.gas_backup)) },
    {
      label: "H₂ electrolyzer",
      value: formatGW(zoneSum(c.hydrogen_electrolyzer)),
    },
    { label: "Pumped hydro", value: formatGW(zoneSum(c.pumped_hydro)) },
    { label: "Battery storage", value: formatGWh(c.battery_storage_gwh.value) },
    {
      label: "H₂ storage",
      value: `${c.hydrogen_storage_twh.value.toFixed(0)} TWh`,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>National totals (2035)</CardTitle>
        <CardDescription>
          Sum across the four ÜNB Regelzonen for installed capacity and storage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="font-mono tabular-nums text-lg">{s.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ZoneTable({ file }: { file: ScenarioFile }) {
  const c = file.scenario.capacities_2035_gw;
  const rows: { label: string; zc: ZoneCapacities }[] = [
    { label: "Wind onshore", zc: c.wind_onshore },
    { label: "Wind offshore", zc: c.wind_offshore },
    { label: "Solar PV", zc: c.solar_pv },
    { label: "Gas backup", zc: c.gas_backup },
    { label: "H₂ electrolyzer", zc: c.hydrogen_electrolyzer },
    { label: "Pumped hydro", zc: c.pumped_hydro },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-zone capacity (GW)</CardTitle>
        <CardDescription>
          Allocation across the four ÜNB control zones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Technology</th>
                <th className="py-2 pr-4 font-medium">50Hertz</th>
                <th className="py-2 pr-4 font-medium">TenneT</th>
                <th className="py-2 pr-4 font-medium">Amprion</th>
                <th className="py-2 pr-4 font-medium">TransnetBW</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 pr-4 font-mono tabular-nums">
                    {r.zc["50hertz"].toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums">
                    {r.zc.tennet.toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums">
                    {r.zc.amprion.toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums">
                    {r.zc.transnetbw.toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums font-medium">
                    {zoneSum(r.zc).toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {r.zc.citation_ref}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DemandCard({ file }: { file: ScenarioFile }) {
  const d = file.scenario.demand_2035;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demand &amp; electrification (2035)</CardTitle>
        <CardDescription>
          Projected demand baseline plus heat-pump / EV / electrolyzer shares.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4 text-sm">
        <div>
          <p className="text-muted-foreground">Baseline</p>
          <p className="font-mono tabular-nums text-lg">
            {formatTWh(d.baseline_twh)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Heat pump share</p>
          <p className="font-mono tabular-nums text-lg">
            {formatPercent(d.heat_pump_share)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">EV passenger share</p>
          <p className="font-mono tabular-nums text-lg">
            {formatPercent(d.ev_share_passenger)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Electrolyzer demand</p>
          <p className="font-mono tabular-nums text-lg">
            {formatTWh(d.electrolyzer_demand_twh)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SourcesList({ file }: { file: ScenarioFile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cited sources ({file.scenario.sources.length})</CardTitle>
        <CardDescription>
          Every substantive number traces back to one of these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {file.scenario.sources.map((src) => (
            <li key={src.ref} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {src.ref}
                </code>
                {src.date && (
                  <span className="text-xs text-muted-foreground">{src.date}</span>
                )}
              </div>
              <a
                href={src.url}
                className="underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {src.title}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
