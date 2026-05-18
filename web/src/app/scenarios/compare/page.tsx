import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
  title: "Compare",
  description:
    "Side-by-side numerical comparison of the committed scenario families.",
};

export default function ComparePage() {
  const files = loadAllScenarios();
  if (files.length < 2) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <Breadcrumb />
        <h1 className="display-1">Compare</h1>
        <p className="text-muted-foreground">
          Need at least two committed scenarios to compare. Currently:{" "}
          {files.length}.
        </p>
      </main>
    );
  }

  const byFamily = new Map<string, ScenarioFile>();
  for (const f of files) {
    if (!byFamily.has(f.family)) byFamily.set(f.family, f);
  }
  const primary = byFamily.get("reiche") ?? Array.from(byFamily.values())[0];
  const others = Array.from(byFamily.values()).filter((f) => f !== primary);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Breadcrumb />

      <header className="mt-6 mb-12 max-w-3xl space-y-4 border-b border-border/60 pb-10 md:mb-16 md:pb-14">
        <p className="eyebrow">Compare</p>
        <h1 className="display-1 text-balance">
          Two plans, head-to-head.
        </h1>
        <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
          National totals per technology, demand, and storage across the
          committed scenario families. Drill into a family for full per-zone
          numbers and cited sources.
        </p>
      </header>

      <ComparisonTable primary={primary} others={others} />

      <ZoneBreakdowns files={[primary, ...others]} />

      <div className="mt-16 flex flex-wrap gap-3 border-t border-border/60 pt-10">
        <Link
          href="/scenarios"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          ← All scenarios
        </Link>
        <Link
          href="/methodology"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Methodology
        </Link>
      </div>
    </main>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link href="/" className="hover:text-foreground">
        Home
      </Link>
      <span>/</span>
      <Link href="/scenarios" className="hover:text-foreground">
        Scenarios
      </Link>
      <span>/</span>
      <span className="text-foreground">Compare</span>
    </nav>
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
  const rows: { values: string[] }[] = cols.map((f) => {
    const c = f.scenario.capacities_2035_gw;
    return {
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
    <section className="mb-16">
      <div className="mb-6 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          01 · Headline numbers
        </p>
        <h2 className="display-3 text-balance">
          National totals, side-by-side
        </h2>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-4 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Metric
              </th>
              {cols.map((f) => (
                <th
                  key={`${f.family}-${f.version}`}
                  className="px-4 py-4 align-top text-xs font-medium uppercase tracking-[0.1em]"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="font-semibold text-foreground">
                      {f.scenario.display_name}
                    </span>
                    <Badge variant="outline" className="w-fit text-[10px]">
                      {f.version}
                    </Badge>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {metrics.map((m, i) => (
              <tr key={m} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{m}</td>
                {rows.map((r, j) => (
                  <td
                    key={`${m}-${j}`}
                    className="px-4 py-3 font-mono tabular-nums"
                  >
                    {r.values[i]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
    { label: "Wind onshore", key: "wind_onshore" },
    { label: "Wind offshore", key: "wind_offshore" },
    { label: "Solar PV", key: "solar_pv" },
    { label: "Gas backup", key: "gas_backup" },
    { label: "H₂ electrolyzer", key: "hydrogen_electrolyzer" },
    { label: "Pumped hydro", key: "pumped_hydro" },
  ];

  return (
    <section className="space-y-10">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          02 · Per-zone
        </p>
        <h2 className="display-3 text-balance">
          How each plan distributes the fleet
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          TenneT covers Niedersachsen + most of Schleswig-Holstein + Bayern +
          Hessen + Bremen. 50Hertz covers Berlin, Brandenburg, MV, Sachsen,
          Sachsen-Anhalt, Thüringen + Hamburg. Amprion covers NRW + RLP +
          Saarland. TransnetBW covers Baden-Württemberg.
        </p>
      </div>

      <div className="space-y-6">
        {techs.map(({ label, key }) => (
          <div
            key={key}
            className="overflow-hidden rounded-2xl border border-border/60"
          >
            <div className="bg-muted/40 px-4 py-3 text-sm font-semibold">
              {label} <span className="text-muted-foreground">(GW)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <tr className="border-t border-border/60">
                    <th className="px-4 py-2 font-medium">Scenario</th>
                    <th className="px-4 py-2 font-medium">50Hertz</th>
                    <th className="px-4 py-2 font-medium">TenneT</th>
                    <th className="px-4 py-2 font-medium">Amprion</th>
                    <th className="px-4 py-2 font-medium">TransnetBW</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {files.map((f) => {
                    const caps = f.scenario.capacities_2035_gw[key];
                    return (
                      <tr
                        key={`${f.family}-${key}`}
                        className="transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-2 font-medium">{f.family}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {caps["50hertz"].toFixed(1)}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {caps.tennet.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {caps.amprion.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {caps.transnetbw.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 font-mono font-semibold tabular-nums text-primary">
                          {zoneSum(caps).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
