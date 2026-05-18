import Link from "next/link";
import { ZoneMap } from "@/components/dispatch/zone-map";
import { loadDispatchForFamily } from "@/lib/dispatch";
import { loadAllScenarios, zoneSum } from "@/lib/scenarios";

export default function Home() {
  const scenarios = loadAllScenarios();
  const reicheDispatch = loadDispatchForFamily("reiche");
  const reicheScenario = scenarios.find((s) => s.family === "reiche")?.scenario;

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
      <HowItWorks />
      <FeaturedScenarios />
      {reicheScenario && (
        <SignatureContribution
          windOnshore={zoneSum(reicheScenario.capacities_2035_gw.wind_onshore)}
          solarPv={zoneSum(reicheScenario.capacities_2035_gw.solar_pv)}
          gasBackup={zoneSum(reicheScenario.capacities_2035_gw.gas_backup)}
        />
      )}
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
            <p className="eyebrow">Public energy stress-test · Germany 2035</p>
            <h1 className="display-1 text-balance">
              What happens to{" "}
              <span className="text-primary">Germany&apos;s energy plan</span>{" "}
              when the weather doesn&apos;t cooperate?
            </h1>
          </div>

          <p className="max-w-xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
            An open public stress-test of the Bundesregierung&apos;s plan
            against historical weather years. Built on PyPSA-Eur. Every
            assumption sourced. The first public translation of the
            currently-evolving Reiche plan into runnable numbers.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow"
            >
              View scenarios
              <span aria-hidden>→</span>
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

function SignatureContribution({
  windOnshore,
  solarPv,
  gasBackup,
}: {
  windOnshore: number;
  solarPv: number;
  gasBackup: number;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:items-start">
        <div className="space-y-4">
          <p className="eyebrow">Signature contribution</p>
          <h2 className="display-2 text-balance">
            Reiche&apos;s plan, in numbers nobody else is running publicly.
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            The Bundesregierung&apos;s plan under Federal Minister Reiche is
            being shaped in real time. There&apos;s no other public, citable
            tool that translates her statements into a runnable 2035 fleet.
            stromtest-2035 is that tool.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every number traces to BMWE press releases, Koalitionsvertrag
            clauses, NEP 2037 V2025 tables, or NWS Fortschreibung updates.
            When Reiche restates a position, the scenario gets a new dated
            version. The model re-runs. The dispatch updates. The tool ages
            with the plan.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/scenarios/reiche"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              See the Reiche scenario →
            </Link>
            <Link
              href="/scenarios/compare"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Compare against Habeck
            </Link>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60">
          <BigStat
            label="Wind onshore"
            value={`${windOnshore.toFixed(0)} GW`}
            sublabel="EEG-2023 trajectory"
          />
          <BigStat
            label="Solar PV"
            value={`${solarPv.toFixed(0)} GW`}
            sublabel="EEG + Reiche tempering"
          />
          <BigStat
            label="Gas backup"
            value={`${gasBackup.toFixed(0)} GW`}
            sublabel="Kraftwerksstrategie 2026-01"
            accent
          />
          <BigStat
            label="Wind offshore"
            value="40 GW"
            sublabel="WindSeeG § 1 (statutory)"
          />
        </dl>
      </div>
    </section>
  );
}

function BigStat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-card p-6 md:p-8 ${accent ? "ring-1 ring-inset ring-primary/20" : ""}`}
    >
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-3 font-mono text-3xl tabular-nums tracking-tight md:text-4xl ${accent ? "text-primary" : ""}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}
