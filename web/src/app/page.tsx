import Link from "next/link";
import { ZoneMap } from "@/components/dispatch/zone-map";
import { loadDispatchForFamily } from "@/lib/dispatch";
import {
  type ScenarioFile,
  loadAllScenarios,
  zoneSum,
} from "@/lib/scenarios";

export default function Home() {
  const scenarios = loadAllScenarios();
  const reicheDispatch = loadDispatchForFamily("reiche");
  const reiche = scenarios.find((s) => s.family === "reiche");
  const habeck = scenarios.find((s) => s.family === "habeck");

  // Headline stats.
  const totalSources = scenarios.reduce(
    (acc, f) => acc + f.scenario.sources.length,
    0,
  );

  return (
    <>
      <Hero reicheDispatch={reicheDispatch} />
      <StatStrip
        scenarioCount={scenarios.length}
        sourceCount={totalSources}
      />
      {reiche && habeck && (
        <ComparisonAtAGlance reiche={reiche} habeck={habeck} />
      )}
      <HowItWorks />
      <FeaturedScenarios />
    </>
  );
}

function Hero({
  reicheDispatch,
}: {
  reicheDispatch: ReturnType<typeof loadDispatchForFamily>;
}) {
  return (
    <section className="surface-soft relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.3fr_1fr] md:items-center md:py-28 lg:py-32">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="eyebrow">Public energy stress-test · Reiche vs. Habeck 2035</p>
            <h1 className="display-1 text-balance">
              The Bundesregierung&apos;s plan has{" "}
              <span className="text-primary">less storage</span>, more gas, and
              slower electrification than its predecessor.
            </h1>
          </div>

          <p className="max-w-xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
            An open, sourced comparison of the Reiche-era 2035 fleet against
            the Habeck-era Klimaneutralität 2045 trajectory. Built on
            PyPSA-Eur. Every capacity, demand assumption, and storage figure
            traces to a citable document — and the inferred system-level
            consequences are clearly labeled.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/scenarios/compare"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow"
            >
              Compare the plans
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              View scenarios
            </Link>
            <Link
              href="/methodology"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              How it works
            </Link>
          </div>
        </div>

        {reicheDispatch ? (
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-2xl" />
            <div className="rounded-2xl border bg-card p-3 shadow-sm">
              <ZoneMap bundle={reicheDispatch} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Reiche 2035 fleet · March 2013 weather · net balance per
              ÜNB Regelzone
            </p>
          </div>
        ) : (
          <DecorativeMap />
        )}
      </div>
    </section>
  );
}

function DecorativeMap() {
  // Fallback decoration if no dispatch is committed yet.
  return (
    <div className="aspect-square rounded-2xl border bg-card/40 p-6">
      <svg
        viewBox="0 0 100 100"
        className="size-full text-primary/40"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
      >
        <path d="M30 70 L40 30 L50 60 L60 20 L70 70" />
        <path d="M20 80 L80 80" strokeDasharray="2 2" />
      </svg>
    </div>
  );
}

function StatStrip({
  scenarioCount,
  sourceCount,
}: {
  scenarioCount: number;
  sourceCount: number;
}) {
  const stats = [
    { value: "4", label: "ÜNB Regelzonen" },
    { value: "474", label: "Network buses" },
    { value: `${scenarioCount}`, label: "Committed scenarios" },
    { value: `${sourceCount}`, label: "Cited sources" },
    { value: "8 760h", label: "Annual resolution" },
  ];
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-6 py-10 sm:grid-cols-3 md:grid-cols-5 md:py-12">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="font-mono text-2xl tabular-nums tracking-tight text-foreground md:text-3xl">
              {s.value}
            </span>
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Translate the plan",
      body: "Each scenario is a YAML file that translates a published energy plan (Reiche statements, Koalitionsvertrag, Langfristszenarien, NEP) into per-zone 2035 capacities. Every substantive number traces to a citable source.",
    },
    {
      n: "02",
      title: "Run the model",
      body: "PyPSA-Eur clusters Germany into the four ÜNB Regelzonen, builds the 2035 fleet from the scenario, and solves hour-by-hour optimal dispatch against historical weather (ERA5 via Copernicus). HiGHS handles the LP.",
    },
    {
      n: "03",
      title: "See the stress",
      body: "Per-zone hourly dispatch lands in Parquet, then in this frontend. Maps show who exports and who imports; charts show generation mix over time; tables show whether the plan balances under each weather year.",
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mb-12 max-w-2xl space-y-3">
        <p className="eyebrow">How it works</p>
        <h2 className="display-2 text-balance">
          From a plan you read in the news to a number you can stress-test.
        </h2>
      </div>

      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-primary/40 hover:bg-card"
          >
            <span className="font-mono text-xs tracking-[0.18em] text-primary">
              {step.n}
            </span>
            <h3 className="display-3">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeaturedScenarios() {
  const scenarios = loadAllScenarios();
  return (
    <section className="bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">Committed scenarios</p>
            <h2 className="display-2 text-balance">
              The two plans currently in the pipeline.
            </h2>
          </div>
          <Link
            href="/scenarios"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            All scenarios →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((file) => {
            const c = file.scenario.capacities_2035_gw;
            const totalRenewable =
              zoneSum(c.wind_onshore) +
              zoneSum(c.wind_offshore) +
              zoneSum(c.solar_pv);
            return (
              <Link
                key={`${file.family}-${file.version}`}
                href={`/scenarios/${file.family}`}
                className="group flex flex-col gap-5 rounded-2xl border border-border/60 bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md md:p-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {file.family} · {file.version}
                    </p>
                    <h3 className="display-3 text-balance">
                      {file.scenario.display_name}
                    </h3>
                  </div>
                  <span
                    aria-hidden
                    className="mt-1 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  >
                    →
                  </span>
                </div>

                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {file.scenario.description}
                </p>

                <dl className="grid grid-cols-3 gap-4 border-t border-border/60 pt-5">
                  <Stat
                    label="Renewable"
                    value={`${totalRenewable.toFixed(0)} GW`}
                  />
                  <Stat label="Gas" value={`${zoneSum(c.gas_backup).toFixed(0)} GW`} />
                  <Stat
                    label="Demand"
                    value={`${file.scenario.demand_2035.baseline_twh.toFixed(0)} TWh`}
                  />
                </dl>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-mono text-lg tabular-nums tracking-tight">{value}</dd>
      <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}

function ComparisonAtAGlance({
  reiche,
  habeck,
}: {
  reiche: ScenarioFile;
  habeck: ScenarioFile;
}) {
  const rc = reiche.scenario.capacities_2035_gw;
  const hc = habeck.scenario.capacities_2035_gw;
  const rd = reiche.scenario.demand_2035;
  const hd = habeck.scenario.demand_2035;

  const reicheGas = zoneSum(rc.gas_backup);
  const habeckGas = zoneSum(hc.gas_backup);
  const reicheElectrolyzer = zoneSum(rc.hydrogen_electrolyzer);
  const habeckElectrolyzer = zoneSum(hc.hydrogen_electrolyzer);
  const reicheBattery = rc.battery_storage_gwh.value;
  const habeckBattery = hc.battery_storage_gwh.value;

  const deltas: ComparisonDelta[] = [
    {
      label: "Gas backup",
      reicheValue: `${reicheGas.toFixed(0)} GW`,
      habeckValue: `${habeckGas.toFixed(0)} GW`,
      gapText: signedPct(reicheGas, habeckGas),
      worse: reicheGas > habeckGas,
      caption: "Kraftwerksstrategie 2026-01",
    },
    {
      label: "H₂ electrolyzer",
      reicheValue: `${reicheElectrolyzer.toFixed(0)} GW`,
      habeckValue: `${habeckElectrolyzer.toFixed(0)} GW`,
      gapText: signedPct(reicheElectrolyzer, habeckElectrolyzer),
      worse: reicheElectrolyzer < habeckElectrolyzer,
      caption: "NWS Fortschreibung trajectory",
    },
    {
      label: "Battery storage",
      reicheValue: `${reicheBattery.toFixed(0)} GWh`,
      habeckValue: `${habeckBattery.toFixed(0)} GWh`,
      gapText: signedPct(reicheBattery, habeckBattery),
      worse: reicheBattery < habeckBattery,
      caption: "NEP-2037-V2025 vs. Agora KNStrom2035",
    },
    {
      label: "Heat-pump share",
      reicheValue: `${(rd.heat_pump_share * 100).toFixed(0)} %`,
      habeckValue: `${(hd.heat_pump_share * 100).toFixed(0)} %`,
      gapText: `${rd.heat_pump_share < hd.heat_pump_share ? "−" : "+"}${Math.abs(
        (rd.heat_pump_share - hd.heat_pump_share) * 100,
      ).toFixed(0)} pp`,
      worse: rd.heat_pump_share < hd.heat_pump_share,
      caption: "Building heat electrification share",
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:items-start">
        <div className="space-y-4">
          <p className="eyebrow">At a glance</p>
          <h2 className="display-2 text-balance">
            Four numbers that{" "}
            <span className="text-primary">summarize the shift</span>.
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Each tile shows the Reiche-era 2035 target alongside the
            Habeck-era one, plus the gap. Capacities and demand figures
            trace to the citation refs shown below each tile and on the
            scenario pages.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            On gas backup, Reiche doubles. On batteries, electrolyzers,
            and electrification, Reiche cuts. The full table — plus
            inferred system-level consequences (clearly labeled as
            assumptions) — lives on the comparison page.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/scenarios/compare"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              See the full comparison →
            </Link>
            <Link
              href="/scenarios/reiche"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Reiche detail
            </Link>
            <Link
              href="/scenarios/habeck"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Habeck detail
            </Link>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60">
          {deltas.map((d) => (
            <DeltaCell key={d.label} delta={d} />
          ))}
        </dl>
      </div>
    </section>
  );
}

interface ComparisonDelta {
  label: string;
  reicheValue: string;
  habeckValue: string;
  gapText: string;
  worse: boolean;
  caption: string;
}

function DeltaCell({ delta }: { delta: ComparisonDelta }) {
  return (
    <div
      className={`bg-card p-6 md:p-8 ${
        delta.worse ? "ring-1 ring-inset ring-rose-500/30" : ""
      }`}
    >
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {delta.label}
      </p>
      <p
        className={`mt-3 font-mono text-3xl tabular-nums tracking-tight md:text-4xl ${
          delta.worse ? "text-rose-700 dark:text-rose-400" : "text-foreground"
        }`}
      >
        {delta.gapText}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Reiche</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {delta.reicheValue}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Habeck</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {delta.habeckValue}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{delta.caption}</p>
    </div>
  );
}

function signedPct(reiche: number, habeck: number): string {
  if (habeck === 0) return "—";
  const pct = ((reiche - habeck) / habeck) * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(0)}%`;
}
