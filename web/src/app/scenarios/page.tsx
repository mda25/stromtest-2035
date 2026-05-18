import Link from "next/link";
import { loadAllScenarios, zoneSum } from "@/lib/scenarios";

export const metadata = {
  title: "Scenarios",
  description:
    "Versioned, citation-disciplined translations of German energy plans into runnable 2035 capacity, demand, and storage data.",
};

export default function ScenariosPage() {
  const files = loadAllScenarios();
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <header className="mb-14 max-w-3xl space-y-4">
        <p className="eyebrow">Scenarios</p>
        <h1 className="display-1 text-balance">
          One YAML per plan. Every number sourced.
        </h1>
        <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
          Each scenario translates a published energy-policy stance into
          runnable 2035 inputs for the PyPSA-Eur pipeline. Numbers reflect
          the underlying plans, not an editorial position.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/scenarios/compare"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Compare side-by-side →
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            How the data is built
          </Link>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {files.map((file) => {
          const c = file.scenario.capacities_2035_gw;
          const totalRenewable =
            zoneSum(c.wind_onshore) +
            zoneSum(c.wind_offshore) +
            zoneSum(c.solar_pv);
          return (
            <Link
              key={`${file.family}-${file.version}`}
              href={`/scenarios/${file.family}`}
              className="group flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md md:p-8"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {file.family} · {file.version}
                  </p>
                  <h2 className="display-3 text-balance">
                    {file.scenario.display_name}
                  </h2>
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

              <dl className="grid grid-cols-3 gap-3 border-t border-border/60 pt-5 text-sm">
                <Cell
                  label="Renewable"
                  value={`${totalRenewable.toFixed(0)} GW`}
                />
                <Cell label="Gas" value={`${zoneSum(c.gas_backup).toFixed(0)} GW`} />
                <Cell
                  label="Demand"
                  value={`${file.scenario.demand_2035.baseline_twh.toFixed(0)} TWh`}
                />
                <Cell
                  label="HP share"
                  value={`${Math.round(file.scenario.demand_2035.heat_pump_share * 100)}%`}
                />
                <Cell
                  label="EV share"
                  value={`${Math.round(file.scenario.demand_2035.ev_share_passenger * 100)}%`}
                />
                <Cell
                  label="Sources"
                  value={`${file.scenario.sources.length}`}
                />
              </dl>
            </Link>
          );
        })}
      </section>

      {files.length === 0 && (
        <p className="text-muted-foreground">
          No scenarios committed yet. Author scenarios under{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            modeling/scenarios/&lt;family&gt;/
          </code>{" "}
          following the schema in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            modeling/src/stromtest/translation/schema.py
          </code>
          .
        </p>
      )}
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-mono tabular-nums">{value}</dd>
      <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}
