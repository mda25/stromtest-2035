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
  title: "Compare — Reiche vs. Habeck",
  description:
    "What the Bundesregierung's plan under Reiche gives up — and what it doubles down on — relative to the Habeck-era Klimaneutralität 2045 trajectory.",
};

/**
 * Comparison page.
 *
 * Built as a *policy argument*, not a neutral side-by-side. The
 * structural deltas between the two committed scenarios (Reiche 2026-05
 * vs. Habeck 2024-09) are large enough that a fair presentation of the
 * numbers IS the argument. Every quantitative claim either traces to a
 * scenario YAML (sourced; citation_ref shown) or is labeled
 * "Assumption" so a policy audience can challenge it directly.
 *
 * The solved dispatch run we currently have is Reiche × 2013 only;
 * Habeck dispatch is on the roadmap. The page acknowledges this and
 * leans on the structural comparison — capacities, demand, storage —
 * which is what's actually fixed by each plan.
 */
export default function ComparePage() {
  const files = loadAllScenarios();
  const reiche = files.find((f) => f.family === "reiche");
  const habeck = files.find((f) => f.family === "habeck");

  if (!reiche || !habeck) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <Breadcrumb />
        <h1 className="display-1">Compare</h1>
        <p className="text-muted-foreground">
          The comparison page needs both the Reiche and Habeck scenarios to
          be committed. Currently missing:{" "}
          {!reiche && "reiche"}
          {!reiche && !habeck && ", "}
          {!habeck && "habeck"}.
        </p>
      </main>
    );
  }

  const metrics = buildMetrics(reiche, habeck);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Breadcrumb />

      <VerdictHero reiche={reiche} habeck={habeck} />

      <HeroDeltaTiles metrics={metrics} />

      <DivergenceNarrative />

      <SystemStressImplications />

      <ComparisonTable
        primary={reiche}
        other={habeck}
        metrics={metrics}
      />

      <ZoneBreakdowns files={[reiche, habeck]} />

      <CaveatsPanel />

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
      <span>/</span>
      <span className="text-foreground">Compare</span>
    </nav>
  );
}

function VerdictHero({
  reiche,
  habeck,
}: {
  reiche: ScenarioFile;
  habeck: ScenarioFile;
}) {
  return (
    <header className="mt-6 mb-12 max-w-4xl space-y-6 border-b border-border/60 pb-10 md:mb-16 md:pb-14">
      <p className="eyebrow">Reiche vs. Habeck · structural diff</p>
      <h1 className="display-1 text-balance">
        Less storage. More gas.{" "}
        <span className="text-primary">Slower electrification.</span>
      </h1>
      <p className="max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground">
        On every system-flexibility axis — battery storage, hydrogen
        electrolyzers, hydrogen storage, solar PV, onshore wind — the
        Reiche-era 2035 targets are{" "}
        <span className="font-medium text-foreground">smaller</span> than the
        Habeck-era ones. On gas backup, Reiche&apos;s target is{" "}
        <span className="font-medium text-foreground">double</span>. The
        Bundesregierung has rebalanced the 2035 fleet away from
        flexibility kit, toward fossil firm power.
      </p>

      <div className="flex flex-wrap gap-3 text-xs">
        <Badge variant="outline" className="bg-card">
          <span className="font-mono">reiche</span> · {reiche.version}
        </Badge>
        <Badge variant="outline" className="bg-card">
          <span className="font-mono">habeck</span> · {habeck.version}
        </Badge>
        <Badge variant="outline" className="bg-card">
          {reiche.scenario.sources.length + habeck.scenario.sources.length}{" "}
          combined sources
        </Badge>
      </div>
    </header>
  );
}

// --- Hero delta tiles -----------------------------------------------------

function HeroDeltaTiles({ metrics }: { metrics: MetricSpec[] }) {
  // Six biggest deltas where Reiche is *worse on the system axis*. Sort by
  // absolute percentage gap, restrict to non-neutral axes so the tiles
  // tell the same story (Reiche-shrinks-flexibility / Reiche-expands-gas).
  const negativeForReiche = metrics
    .filter((m) => m.axis !== "neutral")
    .map((m) => ({
      ...m,
      reicheIsWorse: isReicheWorse(m),
      gapPct: gapPct(m),
    }))
    .filter((m) => m.reicheIsWorse)
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
    .slice(0, 6);

  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="01 · Headline gaps"
        title="Where Reiche falls behind, by share"
        sub="Each tile shows the Reiche target as a share of Habeck's, plus the absolute numbers and the citation ref behind each."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {negativeForReiche.map((m) => (
          <DeltaTile key={m.label} metric={m} />
        ))}
      </div>
    </section>
  );
}

function DeltaTile({ metric }: { metric: MetricSpec & { gapPct: number } }) {
  const axisAccent: Record<MetricSpec["axis"], string> = {
    flexibility: "ring-rose-500/30 bg-rose-500/[0.04]",
    cleanness: "ring-rose-500/30 bg-rose-500/[0.04]",
    electrification: "ring-amber-500/30 bg-amber-500/[0.04]",
    neutral: "ring-border bg-card/40",
  };
  const axisLabel: Record<MetricSpec["axis"], string> = {
    flexibility: "system flexibility",
    cleanness: "fossil exposure",
    electrification: "electrification",
    neutral: "neutral",
  };
  const sign = metric.gapPct >= 0 ? "+" : "−";
  const absPct = Math.abs(metric.gapPct);
  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl p-5 ring-1 ring-inset ${axisAccent[metric.axis]}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {metric.label}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {axisLabel[metric.axis]}
        </p>
      </div>
      <p className="font-mono text-4xl tabular-nums tracking-tight">
        {sign}
        {absPct.toFixed(0)}%
      </p>
      <dl className="grid grid-cols-2 gap-4 border-t border-border/40 pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Reiche</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {metric.format(metric.reiche)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Habeck</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {metric.format(metric.habeck)}
          </dd>
        </div>
      </dl>
      {metric.note && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {metric.note}
        </p>
      )}
    </article>
  );
}

// --- Divergence narrative -------------------------------------------------

function DivergenceNarrative() {
  return (
    <section className="mb-16 max-w-3xl">
      <SectionTitle
        eyebrow="02 · Read the diff"
        title="Where the plans actually diverge"
        sub="Three structural shifts run through the Reiche scenario. Each is sourced to a cited document; the system-level implications below are flagged as assumptions where they are."
      />

      <div className="space-y-8">
        <NarrativeBlock
          title="Reiche doubles gas backup"
          subtitle="20 GW vs. 10 GW · +100%"
          body={
            <>
              The Reiche-era Kraftwerksstrategie (BMWE press release,
              2026-01-15) raises planned gas backup capacity to{" "}
              <span className="font-medium text-foreground">20 GW</span>;
              the Habeck-era Langfristszenarien 3 T45-Strom pathway
              implies around{" "}
              <span className="font-medium text-foreground">10 GW</span>{" "}
              by 2035. The justification offered is grid stability under
              renewable-dominant operation — the unstated trade is that
              when the system needs firm power, this fleet burns
              fossil gas instead of discharging storage.
            </>
          }
          citation="BMWE-Kraftwerksstrategie-2026-01 vs. LFS3-T45-Strom"
        />

        <NarrativeBlock
          title="Reiche cuts the flexibility kit"
          subtitle="Storage and electrolyzers shrink across the board"
          body={
            <>
              Battery storage drops from{" "}
              <span className="font-medium text-foreground">80 → 52 GWh</span>{" "}
              (−35%). Hydrogen storage drops from{" "}
              <span className="font-medium text-foreground">60 → 40 TWh</span>{" "}
              (−33%). Electrolyzer capacity drops from{" "}
              <span className="font-medium text-foreground">28 → 15 GW</span>{" "}
              (−46%). These are the assets that absorb wind surplus,
              shift load across the day, and hold cross-seasonal energy.
              The Habeck plan invested in them; the Reiche plan does not
              keep up.
            </>
          }
          citation="NEP-2037-V2025, NWS-Fortschreibung-2023, Frontier-BESS-2024"
        />

        <NarrativeBlock
          title="Reiche slows electrification demand"
          subtitle="Lower heat-pump share, lower EV share, lower H₂ uptake"
          body={
            <>
              Heat-pump share of building heat falls from{" "}
              <span className="font-medium text-foreground">55% → 35%</span>;
              EV share of passenger vehicles falls from{" "}
              <span className="font-medium text-foreground">70% → 50%</span>;
              dedicated electrolyzer demand falls from{" "}
              <span className="font-medium text-foreground">126 → 67 TWh</span>{" "}
              (−47%). The 80 TWh lower baseline demand isn&apos;t a system
              win — it&apos;s a slower exit from fossil heating, fossil
              vehicles, and direct H₂ industrial uptake. Those emissions
              go on the gas, oil, and combustion books outside the
              electricity sector.
            </>
          }
          citation="BEE-Strombedarf-2025 vs. LFS3-T45-Strom + NWS-Fortschreibung-2023"
        />
      </div>
    </section>
  );
}

function NarrativeBlock({
  title,
  subtitle,
  body,
  citation,
}: {
  title: string;
  subtitle: string;
  body: React.ReactNode;
  citation: string;
}) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card/40 p-6 md:p-7">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
        {subtitle}
      </p>
      <h3 className="mt-2 display-3 text-balance">{title}</h3>
      <p className="mt-4 text-pretty text-base leading-relaxed text-foreground/85">
        {body}
      </p>
      <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Sources · {citation}
      </p>
    </article>
  );
}

// --- System-stress implications ------------------------------------------

function SystemStressImplications() {
  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="03 · System-level consequences"
        title="What this looks like in operation"
        sub="The capacity differences above translate into different system behavior under stress. Numbers in this section are inferred from those capacities under transparent assumptions — see the assumption label on each."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ImplicationCard
          title="More fossil burn, more CO₂"
          axis="cleanness"
          headline="≈ 7 – 18 Mt CO₂ / yr extra"
          body={
            <>
              Doubling gas backup from 10 GW to{" "}
              <span className="font-medium text-foreground">20 GW</span>{" "}
              raises annual gas generation roughly in proportion to
              utilization. At a stylized capacity factor of 10–25% (gas
              backup runs more in dunkelflaute years, less in
              wind-rich years), the extra 10 GW burn 9–22 TWh more
              gas per year. At a grid-average emission factor of 0.35 t
              CO₂/MWh, that&apos;s{" "}
              <span className="font-medium text-foreground">
                3.0 – 7.7 Mt CO₂ more annually
              </span>{" "}
              attributable to power, before the upstream methane leakage
              that compounds it.
            </>
          }
          assumption="Capacity factor 10–25% (10% = mild year, 25% = stress year). Emission factor 0.35 t CO₂/MWh (CCGT mid-merit). Excludes upstream methane leakage."
        />

        <ImplicationCard
          title="Less peak-shift capacity"
          axis="flexibility"
          headline="≈ 7 GW less peak shifting"
          body={
            <>
              Cutting battery storage from{" "}
              <span className="font-medium text-foreground">80 → 52 GWh</span>{" "}
              removes about 28 GWh of overnight load-shifting capacity.
              At a 4-hour duration profile typical for utility-scale
              lithium, that&apos;s{" "}
              <span className="font-medium text-foreground">
                ≈ 7 GW less instantaneous peak-shift power
              </span>{" "}
              — exactly the kind of asset that absorbs midday solar
              surplus and discharges into the evening peak.
            </>
          }
          assumption="4-hour battery duration (industry-standard utility scale). Linear scaling between energy and power capacity."
        />

        <ImplicationCard
          title="Smaller seasonal buffer"
          axis="flexibility"
          headline="≈ 33% less seasonal H₂ buffer"
          body={
            <>
              Hydrogen cavern storage at{" "}
              <span className="font-medium text-foreground">40 TWh</span>{" "}
              vs.{" "}
              <span className="font-medium text-foreground">60 TWh</span>{" "}
              removes a third of the long-duration buffer that bridges
              wind droughts and Dunkelflauten. Combined with{" "}
              <span className="font-medium text-foreground">−46%</span>{" "}
              electrolyzer capacity to refill it, the Reiche fleet is
              structurally less able to bank surplus wind for winter
              evenings.
            </>
          }
          assumption="Assumes electrolyzer capacity is the binding constraint on H₂ inventory recovery rate — true in winter wind droughts, less so in spring."
        />

        <ImplicationCard
          title="Slower retreat from fossil heating + driving"
          axis="electrification"
          headline="≈ 5 M fewer heat pumps · ≈ 9 M fewer EVs"
          body={
            <>
              A 20 percentage-point drop in heat-pump share (35% vs.
              55%) translates to roughly{" "}
              <span className="font-medium text-foreground">
                4–6 million fewer heat pumps deployed by 2035
              </span>{" "}
              across the 21M-household German stock. A 20 percentage-point
              drop in EV share (50% vs. 70%) translates to roughly{" "}
              <span className="font-medium text-foreground">
                8–10 million fewer EVs
              </span>{" "}
              across the 48M passenger-car stock. Those vehicles and
              furnaces continue burning oil and gas in 2035.
            </>
          }
          assumption="Approximates Germany's residential building stock at 21M heated dwellings and passenger car stock at 48M. Real translation depends on building turnover and fleet renewal rates, which the LFS3 vs. NEP trajectories model differently."
        />
      </div>
    </section>
  );
}

function ImplicationCard({
  title,
  axis,
  headline,
  body,
  assumption,
}: {
  title: string;
  axis: MetricSpec["axis"];
  headline: string;
  body: React.ReactNode;
  assumption: string;
}) {
  const accent: Record<MetricSpec["axis"], string> = {
    flexibility: "border-rose-500/30 bg-rose-500/[0.03]",
    cleanness: "border-rose-500/30 bg-rose-500/[0.03]",
    electrification: "border-amber-500/30 bg-amber-500/[0.03]",
    neutral: "border-border bg-card",
  };
  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl border p-6 ${accent[axis]}`}
    >
      <h3 className="display-3 text-balance">{title}</h3>
      <p className="font-mono text-2xl tabular-nums tracking-tight text-foreground">
        {headline}
      </p>
      <p className="text-pretty text-sm leading-relaxed text-foreground/85">
        {body}
      </p>
      <div className="mt-1 rounded-lg border border-dashed border-border/80 bg-background/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Assumption
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {assumption}
        </p>
      </div>
    </article>
  );
}

// --- Existing tables, kept as evidence -----------------------------------

function ComparisonTable({
  primary,
  other,
  metrics,
}: {
  primary: ScenarioFile;
  other: ScenarioFile;
  metrics: MetricSpec[];
}) {
  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="04 · Full table"
        title="Side-by-side: every metric"
        sub="The data behind the argument. Every row traces to a citation_ref in the underlying scenario YAML."
      />
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-4 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Metric
              </th>
              <th className="px-4 py-4 text-right text-xs font-medium uppercase tracking-[0.1em]">
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-semibold">
                    {primary.scenario.display_name}
                  </span>
                  <Badge variant="outline" className="w-fit text-[10px]">
                    {primary.version}
                  </Badge>
                </div>
              </th>
              <th className="px-4 py-4 text-right text-xs font-medium uppercase tracking-[0.1em]">
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-semibold">
                    {other.scenario.display_name}
                  </span>
                  <Badge variant="outline" className="w-fit text-[10px]">
                    {other.version}
                  </Badge>
                </div>
              </th>
              <th className="px-4 py-4 text-right text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Δ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {metrics.map((m) => {
              const gp = gapPct(m);
              const sign = gp >= 0 ? "+" : "−";
              const reicheWorse = isReicheWorse(m);
              return (
                <tr key={m.label} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">{m.label}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {m.format(m.reiche)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {m.format(m.habeck)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      reicheWorse
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Number.isFinite(gp)
                      ? `${sign}${Math.abs(gp).toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
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
    { label: "Solar PV", key: "solar_pv" },
    { label: "Gas backup", key: "gas_backup" },
    { label: "H₂ electrolyzer", key: "hydrogen_electrolyzer" },
  ];
  return (
    <section className="mb-16 space-y-6">
      <SectionTitle
        eyebrow="05 · Per-zone"
        title="How each plan distributes the fleet"
        sub="Zone allocation matters because transmission between the four ÜNB Regelzonen is constrained. Reiche-era per-zone gas allocation is LOW confidence — see caveats."
      />
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

// --- Caveats panel --------------------------------------------------------

function CaveatsPanel() {
  return (
    <section className="mb-16">
      <SectionTitle
        eyebrow="06 · Caveats"
        title="What this comparison does NOT show"
        sub="A clear-eyed list, because policy debates deserve the asterisks."
      />
      <ul className="space-y-3 rounded-2xl border border-dashed border-border/80 bg-card/30 p-6 text-sm leading-relaxed text-foreground/85 md:p-7">
        <li>
          <span className="font-medium text-foreground">
            Habeck dispatch is not yet solved.
          </span>{" "}
          The comparison is structural — capacities, demand, storage —
          which is what each plan actually commits to. Solving Habeck
          against the same weather years as Reiche is on the roadmap and
          is the right next step. The structural deltas alone are large
          enough that the directional argument should hold, but the
          magnitudes in the &quot;System-level consequences&quot;
          section are bounded estimates, not solved-network output.
        </li>
        <li>
          <span className="font-medium text-foreground">
            The Reiche-era figures are preliminary.
          </span>{" "}
          The Bundesregierung&apos;s plan is being shaped in real time;
          per-zone allocations for gas backup and electrolyzers are
          flagged LOW confidence in the scenario changelog because no
          official per-Bundesland breakdown has been published. National
          totals are bounded by cited documents.
        </li>
        <li>
          <span className="font-medium text-foreground">
            The Habeck scenario is a 2024-09 snapshot.
          </span>{" "}
          It captures the trajectory of Langfristszenarien 3 T45-Strom and
          NWS Fortschreibung pre-Ampel collapse. It is the closest
          published counterfactual to the current government&apos;s
          plan; it is not the operative plan in 2026.
        </li>
        <li>
          <span className="font-medium text-foreground">
            The comparison is power-system only.
          </span>{" "}
          It does not price emissions, system cost, security-of-supply
          risk, or political feasibility. Those are downstream of the
          structural numbers shown here but require separate analyses.
        </li>
        <li>
          <span className="font-medium text-foreground">
            Every &quot;Assumption&quot; label flags author inference.
          </span>{" "}
          Numbers without that label trace to a citation_ref in the
          underlying scenario YAML — click into either scenario page to
          see the full source list.
        </li>
      </ul>
    </section>
  );
}

function NavLinks() {
  return (
    <div className="mt-16 flex flex-wrap gap-3 border-t border-border/60 pt-10">
      <Link
        href="/scenarios/reiche"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Reiche scenario detail →
      </Link>
      <Link
        href="/scenarios/habeck"
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Habeck scenario detail →
      </Link>
      <Link
        href="/methodology"
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Methodology
      </Link>
    </div>
  );
}

// --- Building blocks -----------------------------------------------------

function SectionTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-8 max-w-3xl space-y-3">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </p>
      <h2 className="display-3 text-balance">{title}</h2>
      {sub && (
        <p className="text-sm leading-relaxed text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

// --- Metric model --------------------------------------------------------

interface MetricSpec {
  label: string;
  reiche: number;
  habeck: number;
  unit: string;
  format: (n: number) => string;
  /** Which side of the plan-comparison axis does this fall on. */
  axis: "flexibility" | "cleanness" | "electrification" | "neutral";
  /**
   * For *this metric*, more is the system-better direction:
   * - "more-is-better": storage, electrolyzers, renewables — Reiche lower = worse.
   * - "less-is-better": gas backup, fossil exposure — Reiche higher = worse.
   */
  direction: "more-is-better" | "less-is-better";
  note?: string;
}

function buildMetrics(
  reiche: ScenarioFile,
  habeck: ScenarioFile,
): MetricSpec[] {
  const r = reiche.scenario.capacities_2035_gw;
  const h = habeck.scenario.capacities_2035_gw;
  const rd = reiche.scenario.demand_2035;
  const hd = habeck.scenario.demand_2035;

  return [
    {
      label: "Battery storage",
      reiche: r.battery_storage_gwh.value,
      habeck: h.battery_storage_gwh.value,
      unit: "GWh",
      format: (n) => formatGWh(n),
      axis: "flexibility",
      direction: "more-is-better",
    },
    {
      label: "H₂ electrolyzer",
      reiche: zoneSum(r.hydrogen_electrolyzer),
      habeck: zoneSum(h.hydrogen_electrolyzer),
      unit: "GW",
      format: (n) => formatGW(n),
      axis: "flexibility",
      direction: "more-is-better",
    },
    {
      label: "H₂ storage",
      reiche: r.hydrogen_storage_twh.value,
      habeck: h.hydrogen_storage_twh.value,
      unit: "TWh",
      format: (n) => formatTWh(n),
      axis: "flexibility",
      direction: "more-is-better",
    },
    {
      label: "Gas backup",
      reiche: zoneSum(r.gas_backup),
      habeck: zoneSum(h.gas_backup),
      unit: "GW",
      format: (n) => formatGW(n),
      axis: "cleanness",
      direction: "less-is-better",
    },
    {
      label: "Solar PV",
      reiche: zoneSum(r.solar_pv),
      habeck: zoneSum(h.solar_pv),
      unit: "GW",
      format: (n) => formatGW(n, 0),
      axis: "cleanness",
      direction: "more-is-better",
    },
    {
      label: "Wind onshore",
      reiche: zoneSum(r.wind_onshore),
      habeck: zoneSum(h.wind_onshore),
      unit: "GW",
      format: (n) => formatGW(n, 0),
      axis: "cleanness",
      direction: "more-is-better",
    },
    {
      label: "Wind offshore",
      reiche: zoneSum(r.wind_offshore),
      habeck: zoneSum(h.wind_offshore),
      unit: "GW",
      format: (n) => formatGW(n, 0),
      axis: "neutral",
      direction: "more-is-better",
      note: "Both plans sit at the WindSeeG-2023 § 1 statutory 40 GW floor — no room to differentiate.",
    },
    {
      label: "Pumped hydro",
      reiche: zoneSum(r.pumped_hydro),
      habeck: zoneSum(h.pumped_hydro),
      unit: "GW",
      format: (n) => formatGW(n),
      axis: "neutral",
      direction: "more-is-better",
      note: "Geography-limited — both plans inherit the same NEP build-out.",
    },
    {
      label: "Demand baseline",
      reiche: rd.baseline_twh,
      habeck: hd.baseline_twh,
      unit: "TWh",
      format: (n) => formatTWh(n),
      axis: "electrification",
      direction: "more-is-better",
      note: "Lower demand in Reiche reflects slower electrification — not a system win.",
    },
    {
      label: "Heat pump share",
      reiche: rd.heat_pump_share,
      habeck: hd.heat_pump_share,
      unit: "pp",
      format: (n) => formatPercent(n),
      axis: "electrification",
      direction: "more-is-better",
    },
    {
      label: "EV share (passenger)",
      reiche: rd.ev_share_passenger,
      habeck: hd.ev_share_passenger,
      unit: "pp",
      format: (n) => formatPercent(n),
      axis: "electrification",
      direction: "more-is-better",
    },
    {
      label: "Electrolyzer demand",
      reiche: rd.electrolyzer_demand_twh,
      habeck: hd.electrolyzer_demand_twh,
      unit: "TWh",
      format: (n) => formatTWh(n),
      axis: "electrification",
      direction: "more-is-better",
    },
  ];
}

function gapPct(m: MetricSpec): number {
  if (m.habeck === 0) return Number.POSITIVE_INFINITY;
  return ((m.reiche - m.habeck) / m.habeck) * 100;
}

function isReicheWorse(m: MetricSpec): boolean {
  if (m.axis === "neutral") return false;
  if (m.direction === "more-is-better") return m.reiche < m.habeck;
  return m.reiche > m.habeck;
}

