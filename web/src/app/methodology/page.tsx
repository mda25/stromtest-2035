import Link from "next/link";

export const metadata = {
  title: "Methodology",
  description:
    "How stromtest-2035 turns published energy plans into runnable 2035 dispatch — sources, modeling stack, and the gap-to-headline.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 md:py-24">
      <header className="mb-12 max-w-3xl space-y-4">
        <p className="eyebrow">Methodology</p>
        <h1 className="display-1 text-balance">
          How a sentence in a press release becomes a number you can stress-test.
        </h1>
        <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
          stromtest-2035 turns published energy plans into runnable 2035
          dispatch via PyPSA-Eur. Every layer of that transformation is
          documented; every substantive number cites a source. This page is the
          short version. The long version is{" "}
          <a
            href="https://github.com/mda25/stromtest-2035/blob/main/docs/methodology.md"
            className="text-primary underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            in the repo
          </a>
          .
        </p>
      </header>

      <Section
        eyebrow="01 · Translate"
        title="Plans → versioned YAML"
        body={
          <>
            <p>
              Each scenario family lives at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                modeling/scenarios/&lt;family&gt;/&lt;date&gt;.&lt;patch&gt;.yml
              </code>
              . Substantive fields (per-zone capacities, demand, NTC values)
              must carry a <code>citation_ref</code> pointing to an entry in
              the file&apos;s <code>sources</code> list. The translation layer
              refuses to compile any scenario that violates this rule —
              uncited numbers can&apos;t enter the pipeline.
            </p>
            <p>
              Scenarios are versioned by ISO date + patch. Substantive moves
              (new gas number, new electrolyzer capacity, new Bundestag
              statement) bump the date; citation fixes / typos bump the
              patch. Old versions stay forever and can be re-run.
            </p>
          </>
        }
      />

      <Section
        eyebrow="02 · Cluster"
        title="4 ÜNB Regelzonen, hand-curated"
        body={
          <>
            <p>
              PyPSA-Eur clusters Germany&apos;s ~474-bus network into our four
              ÜNB control zones — 50Hertz, TenneT, Amprion, TransnetBW —
              using a hand-curated busmap rather than k-means. Each
              entsoegridkit bus is assigned to a Regelzone via point-in-polygon
              against Bundesländer polygons (modulo well-documented edge
              cases like the Emsland Amprion-overlap).
            </p>
            <p>
              The result: every chart, table, and number on the site is keyed
              to the four real ÜNB zones, not abstract clusters. When the
              tool says &quot;TenneT imports 60 GWh net&quot;, that means
              TenneT.
            </p>
          </>
        }
      />

      <Section
        eyebrow="03 · Run"
        title="PyPSA-Eur · linopy · HiGHS"
        body={
          <>
            <p>
              Hourly dispatch is solved with linopy + HiGHS against the
              cited fleet. PyPSA-Eur is pinned at upstream commit{" "}
              <code className="font-mono text-sm">666fdf1</code>; one small
              upstream patch (path-typing in <code>build_cutout</code>) lives
              in <code>modeling/patches/</code>. Weather years come from
              Copernicus ERA5 via atlite; the snapshot range is configurable.
            </p>
            <p>
              The signature contribution is what happens between the YAML and
              PyPSA-Eur: <code>stromtest translate</code> emits the config
              overlay, <code>stromtest apply</code> drops it into the
              PyPSA-Eur tree, <code>stromtest inject</code> rewrites the
              prepared network to lock generator capacities to scenario
              values + zero out unrepresented carriers. PyPSA-Eur then
              dispatches on the actual scenario fleet rather than
              powerplantmatching defaults.
            </p>
          </>
        }
      />

      <Section
        eyebrow="04 · Aggregate"
        title="NetCDF → Parquet → JSON → this page"
        body={
          <>
            <p>
              The solved <code>.nc</code> file flows through{" "}
              <code>stromtest.aggregate</code> into hourly + daily + weekly
              Parquet per (snapshot × zone × technology × metric). A small
              JSON shape sits alongside the Parquet for the frontend.
              You&apos;re reading the JSON right now.
            </p>
            <p>
              Both formats stay committed in the repo so anyone can
              reproduce the dispatch tables without re-running PyPSA-Eur.
            </p>
          </>
        }
      />

      <CalloutCard />

      <Section
        eyebrow="What this is not"
        title="Honest limitations"
        body={
          <ul className="space-y-3">
            <li>
              <strong>Not the official plan.</strong> Scenarios are our
              translation of public statements + papers into runnable
              numbers. Where sources are ambiguous, we cite the
              interpretation and the source. Disagree with a number? Open
              a PR with a counter-cited value; both versions stay in git.
            </li>
            <li>
              <strong>Not a forecast.</strong> The tool stress-tests plans
              against historical weather. It does not predict 2035
              demand, technology cost, or grid topology.
            </li>
            <li>
              <strong>Hydrogen part-load efficiency is constant in V0.</strong>{" "}
              The signature next step is patching PyPSA-Eur&apos;s
              electrolyzer to use a piecewise-linear efficiency curve
              calibrated to BSc-thesis values. Tracked in{" "}
              <a
                href="https://github.com/mda25/stromtest-2035/blob/main/docs/design.md"
                className="text-primary underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                docs/design.md
              </a>
              .
            </li>
            <li>
              <strong>Storage spatial allocation is uniform in V0.</strong>{" "}
              National battery + H₂ storage values are split equally across
              the four zones. Refining to a load-weighted or geology-aware
              split is a V1 chore.
            </li>
          </ul>
        }
      />

      <div className="mt-16 flex flex-wrap gap-3">
        <Link
          href="/scenarios"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          See it in action →
        </Link>
        <a
          href="https://github.com/mda25/stromtest-2035/blob/main/docs/methodology.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Read the long methodology
        </a>
      </div>
    </main>
  );
}

function Section({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <section className="mb-14 grid gap-8 border-t border-border/60 pt-10 md:grid-cols-[1fr_2fr]">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
        <h2 className="display-3 text-balance">{title}</h2>
      </div>
      <div className="prose prose-neutral space-y-4 text-base leading-relaxed text-foreground/85">
        {body}
      </div>
    </section>
  );
}

function CalloutCard() {
  return (
    <aside className="my-14 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8">
      <p className="eyebrow">The contract</p>
      <p className="mt-3 text-lg leading-relaxed text-balance">
        Every number on this site is one of three things: a statutory floor
        (EEG, WindSeeG, Klimaschutzgesetz), a cited published target (NEP,
        BMWE press release, NWS Fortschreibung), or a documented interpretation
        of a public statement. Nothing is invented.
      </p>
    </aside>
  );
}
