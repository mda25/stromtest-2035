import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  type ScenarioFile,
  formatGW,
  formatGWh,
  formatPercent,
  formatTWh,
  loadAllScenarios,
  zoneSum,
} from "@/lib/scenarios";

export const metadata = {
  title: "Compare · stromtest-2035",
  description:
    "Side-by-side numerical comparison of the committed scenario families.",
};

export default function ComparePage() {
  const files = loadAllScenarios();
  if (files.length < 2) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <BackLink />
        <h1 className="text-3xl font-semibold tracking-tight">Compare</h1>
        <p className="text-muted-foreground">
          Need at least two committed scenarios to compare. Currently:{" "}
          {files.length}.
        </p>
      </main>
    );
  }

  // Take the most-recent version per family.
  const byFamily = new Map<string, ScenarioFile>();
  for (const f of files) {
    if (!byFamily.has(f.family)) byFamily.set(f.family, f);
  }
  const primary = byFamily.get("reiche") ?? Array.from(byFamily.values())[0];
  const others = Array.from(byFamily.values()).filter((f) => f !== primary);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <BackLink />
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Scenario comparison
        </h1>
        <p className="text-pretty text-lg text-muted-foreground">
          National totals per technology, demand, and storage values across the
          committed scenario families. Drill in via the family link for full
          per-zone numbers and citations.
        </p>
      </header>

      <Separator />

      <ComparisonTable primary={primary} others={others} />

      <Separator />

      <ZoneBreakdowns files={[primary, ...others]} />
    </main>
  );
}

function BackLink() {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/" className="text-muted-foreground underline-offset-4 hover:underline">
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
  );
}

function ComparisonTable({
  primary,
  others,
}: {
  primary: ScenarioFile;
  others: ScenarioFile[];
}) {
  const cols = [primary, ...others];
  const rows: { label: string; values: string[] }[] = cols.map((f) => {
    const c = f.scenario.capacities_2035_gw;
    return {
      label: f.family,
      values: [
        formatGW(zoneSum(c.wind_onshore)),
        formatGW(zoneSum(c.wind_offshore)),
        formatGW(zoneSum(c.solar_pv)),
        formatGW(zoneSum(c.gas_backup)),
        formatGW(zoneSum(c.hydrogen_electrolyzer)),
        formatGWh(c.battery_storage_gwh.value),
        `${c.hydrogen_storage_twh.value.toFixed(0)} TWh`,
        formatGW(zoneSum(c.pumped_hydro)),
        formatTWh(f.scenario.demand_2035.baseline_twh),
        formatPercent(f.scenario.demand_2035.heat_pump_share),
        formatPercent(f.scenario.demand_2035.ev_share_passenger),
        formatTWh(f.scenario.demand_2035.electrolyzer_demand_twh),
      ],
    };
  });
  const metrics = [
    "Wind onshore",
    "Wind offshore",
    "Solar PV",
    "Gas backup",
    "H₂ electrolyzer",
    "Battery storage",
    "H₂ storage",
    "Pumped hydro",
    "Demand baseline",
    "Heat pump share",
    "EV share (passenger)",
    "Electrolyzer demand",
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">Metric</th>
            {cols.map((f) => (
              <th
                key={`${f.family}-${f.version}`}
                className="py-2 pr-4 font-medium"
              >
                <div className="flex flex-col gap-1">
                  <span>{f.scenario.display_name}</span>
                  <Badge variant="outline" className="w-fit text-xs">
                    {f.version}
                  </Badge>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={m} className="border-b last:border-0">
              <td className="py-2 pr-4 text-muted-foreground">{m}</td>
              {rows.map((r) => (
                <td
                  key={`${r.label}-${m}`}
                  className="py-2 pr-4 font-mono tabular-nums"
                >
                  {r.values[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ZoneTechKey =
  | "wind_onshore"
  | "wind_offshore"
  | "solar_pv"
  | "gas_backup"
  | "hydrogen_electrolyzer"
  | "pumped_hydro";

function ZoneBreakdowns({ files }: { files: ScenarioFile[] }) {
  const techs: { label: string; key: ZoneTechKey }[] = [
    { label: "Wind onshore (GW)", key: "wind_onshore" },
    { label: "Wind offshore (GW)", key: "wind_offshore" },
    { label: "Solar PV (GW)", key: "solar_pv" },
    { label: "Gas backup (GW)", key: "gas_backup" },
    { label: "H₂ electrolyzer (GW)", key: "hydrogen_electrolyzer" },
    { label: "Pumped hydro (GW)", key: "pumped_hydro" },
  ];
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">
        Per-ÜNB-zone allocation
      </h2>
      <p className="text-sm text-muted-foreground">
        How each scenario distributes installed capacity across the four German
        Regelzonen. TenneT covers Niedersachsen + most of Schleswig-Holstein +
        Bayern + Hessen + Bremen; 50Hertz covers Berlin, Brandenburg, MV,
        Sachsen, Sachsen-Anhalt, Thüringen + Hamburg; Amprion covers NRW + RLP
        + Saarland; TransnetBW covers Baden-Württemberg.
      </p>
      <div className="space-y-4">
        {techs.map(({ label, key }) => (
          <div key={key} className="overflow-x-auto">
            <h3 className="mb-2 font-medium">{label}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Scenario</th>
                  <th className="py-1 pr-4 font-medium">50Hertz</th>
                  <th className="py-1 pr-4 font-medium">TenneT</th>
                  <th className="py-1 pr-4 font-medium">Amprion</th>
                  <th className="py-1 pr-4 font-medium">TransnetBW</th>
                  <th className="py-1 pr-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const caps = f.scenario.capacities_2035_gw[key];
                  return (
                    <tr
                      key={`${f.family}-${key}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-1 pr-4">{f.family}</td>
                      <td className="py-1 pr-4 font-mono tabular-nums">
                        {caps["50hertz"].toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 font-mono tabular-nums">
                        {caps.tennet.toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 font-mono tabular-nums">
                        {caps.amprion.toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 font-mono tabular-nums">
                        {caps.transnetbw.toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 font-mono tabular-nums font-medium">
                        {zoneSum(caps).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

