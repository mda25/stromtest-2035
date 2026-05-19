import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DispatchPanel } from "@/components/dispatch/dispatch-panel";
import { loadAllYearsForFamily } from "@/lib/dispatch";
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
import { WEATHER_YEAR_CATALOG } from "@/lib/weather-years";
import { buildZonePaths } from "@/lib/zone-paths";

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
  const dispatchBundles = loadAllYearsForFamily(family);
  const hasDispatch = dispatchBundles.length > 0;
  const zonePaths = hasDispatch ? buildZonePaths() : null;
  const c = s.capacities_2035_gw;
  const totalRenewable =
    zoneSum(c.wind_onshore) + zoneSum(c.wind_offshore) + zoneSum(c.solar_pv);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Breadcrumb />

      <header className="mt-6 mb-12 space-y-5 border-b border-border/60 pb-10 md:mb-16 md:pb-14">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {family} · {latest.version}
          </p>
          <Badge variant="outline">
            {files.length} version{files.length === 1 ? "" : "s"} committed
          </Badge>
          {hasDispatch && (
            <Badge variant="outline" className="bg-primary/10 text-primary">
              Dispatch available
            </Badge>
          )}
        </div>
        <h1 className="display-1 text-balance">{s.display_name}</h1>
        <p className="max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {s.description}
        </p>
        <p className="text-sm text-muted-foreground">
          Authors: {s.authors.join(", ")} · {s.sources.length} cited sources
        </p>
      </header>

      <NationalTotalsBlock file={latest} totalRenewable={totalRenewable} />

      <ZoneTable file={latest} />

      <DemandRow file={latest} />

      {hasDispatch && zonePaths ? (
        <section className="mt-16">
          <DispatchPanel
            bundles={dispatchBundles}
            paths={zonePaths}
            catalog={WEATHER_YEAR_CATALOG}
          />
        </section>
      ) : (
        <NoDispatchCard family={family} />
      )}

      <SourcesList file={latest} />

      {latest.changelog_md && <ChangelogBlock changelog={latest.changelog_md} />}

      <NavLinks />
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
    </nav>
  );
}

function NationalTotalsBlock({
  file,
  totalRenewable,
}: {
  file: ScenarioFile;
  totalRenewable: number;
}) {
  const c = file.scenario.capacities_2035_gw;
  const stats: { label: string; value: string; accent?: boolean }[] = [
    {
      label: "Total renewables",
      value: `${totalRenewable.toFixed(0)} GW`,
      accent: true,
    },
    { label: "Wind onshore", value: formatGW(zoneSum(c.wind_onshore)) },
    { label: "Wind offshore", value: formatGW(zoneSum(c.wind_offshore)) },
    { label: "Solar PV", value: formatGW(zoneSum(c.solar_pv)) },
    { label: "Gas backup", value: formatGW(zoneSum(c.gas_backup)) },
    { label: "H₂ electrolyzer", value: formatGW(zoneSum(c.hydrogen_electrolyzer)) },
    { label: "Pumped hydro", value: formatGW(zoneSum(c.pumped_hydro)) },
    { label: "Battery storage", value: formatGWh(c.battery_storage_gwh.value) },
    {
      label: "H₂ storage",
      value: `${c.hydrogen_storage_twh.value.toFixed(0)} TWh`,
    },
  ];
  return (
    <section className="mb-16">
      <SectionTitle eyebrow="01 · Capacity" title="National totals (2035)" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 md:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`bg-card p-5 ${s.accent ? "ring-1 ring-inset ring-primary/30" : ""}`}
          >
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {s.label}
            </p>
            <p
              className={`mt-2 font-mono text-2xl tabular-nums tracking-tight ${s.accent ? "text-primary" : ""}`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </section>
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
    <section className="mb-16">
      <SectionTitle
        eyebrow="02 · Allocation"
        title="Per-ÜNB-zone capacity (GW)"
      />
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Technology</th>
              <th className="px-4 py-3 font-medium">50Hertz</th>
              <th className="px-4 py-3 font-medium">TenneT</th>
              <th className="px-4 py-3 font-medium">Amprion</th>
              <th className="px-4 py-3 font-medium">TransnetBW</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr key={r.label} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 font-mono tabular-nums">
                  {r.zc["50hertz"].toFixed(1)}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums">
                  {r.zc.tennet.toFixed(1)}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums">
                  {r.zc.amprion.toFixed(1)}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums">
                  {r.zc.transnetbw.toFixed(1)}
                </td>
                <td className="px-4 py-3 font-mono font-semibold tabular-nums text-primary">
                  {zoneSum(r.zc).toFixed(1)}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {r.zc.citation_ref}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DemandRow({ file }: { file: ScenarioFile }) {
  const d = file.scenario.demand_2035;
  const items = [
    { label: "Baseline demand", value: formatTWh(d.baseline_twh) },
    { label: "Heat pump share", value: formatPercent(d.heat_pump_share) },
    { label: "EV passenger share", value: formatPercent(d.ev_share_passenger) },
    { label: "Electrolyzer demand", value: formatTWh(d.electrolyzer_demand_twh) },
  ];
  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="03 · Demand"
        title="Projected demand &amp; electrification"
      />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 md:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="bg-card p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function NoDispatchCard({ family }: { family: string }) {
  return (
    <section className="mb-16">
      <SectionTitle eyebrow="04 · Dispatch" title="No solved run yet" />
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/30 p-6 md:p-8">
        <p className="text-sm leading-relaxed text-muted-foreground">
          No solved dispatch committed for this scenario yet. Run the
          PyPSA-Eur pipeline plus capacity injection (see{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            modeling/RUNBOOK.md
          </code>{" "}
          smoke test 4), then{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            bin/build_dispatch_json.py
          </code>{" "}
          to populate{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            web/src/data/dispatch/{family}.&lt;weather-year&gt;.json
          </code>
          . The dispatch panel will populate automatically — and the
          weather-year selector will switch that year from{" "}
          <em>pending</em> to active.
        </p>
      </div>
    </section>
  );
}

function SourcesList({ file }: { file: ScenarioFile }) {
  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="05 · Provenance"
        title={`Cited sources (${file.scenario.sources.length})`}
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {file.scenario.sources.map((src) => (
          <li
            key={src.ref}
            className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {src.ref}
              </code>
              {src.date && (
                <span className="text-muted-foreground">{src.date}</span>
              )}
            </div>
            <a
              href={src.url}
              className="mt-2 block text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {src.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangelogBlock({ changelog }: { changelog: string }) {
  return (
    <section className="mb-16">
      <SectionTitle eyebrow="06 · History" title="Changelog" />
      <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-card p-5 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
        {changelog}
      </pre>
    </section>
  );
}

function NavLinks() {
  return (
    <div className="mt-16 flex flex-wrap gap-3 border-t border-border/60 pt-10">
      <Link
        href="/scenarios"
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        ← All scenarios
      </Link>
      <Link
        href="/scenarios/compare"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Compare scenarios →
      </Link>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </p>
      <h2 className="display-3 text-balance">{title}</h2>
    </div>
  );
}
