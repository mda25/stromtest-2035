import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "Why stromtest-2035 exists, who built it, and how to contribute.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <header className="mb-12 space-y-4">
        <p className="eyebrow">About</p>
        <h1 className="display-1 text-balance">
          Why this exists.
        </h1>
        <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
          Germany&apos;s energy transition is being rewritten in real time
          under the current Bundesregierung. Billions in capital allocation
          and a generation of climate policy hinge on plans that are being
          shaped sentence by sentence in BMWE press releases and Bundestag
          speeches. There is no public, methodologically rigorous tool that
          translates the evolving plan into runnable numbers and
          stress-tests it against bad weather years. This is that tool.
        </p>
      </header>

      <section className="mb-12 space-y-4 text-base leading-relaxed text-foreground/85">
        <h2 className="display-3 mb-2">Mission</h2>
        <p>
          Make Germany&apos;s evolving energy plan transparent and
          stress-testable. When a minister states a position, that position
          should become a runnable scenario the same week — versioned,
          cited, and comparable to alternatives. When the weather doesn&apos;t
          cooperate, you should be able to see exactly what breaks.
        </p>
        <p>
          The model is research-grade (PyPSA-Eur, Linopy, HiGHS) and the
          methodology is open. The frontend is the public-facing reading
          surface. Both ship in the same repo.
        </p>
      </section>

      <section className="mb-12 space-y-4 text-base leading-relaxed text-foreground/85">
        <h2 className="display-3 mb-2">Who</h2>
        <p>
          Built by{" "}
          <a
            href="https://github.com/mda25"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Matthis Damm
          </a>{" "}
          as a passion project rooted in a BSc thesis on hydrogen
          electrolysis with time-resolved renewable energy. Open to
          collaborators — the citation discipline + versioned scenarios
          model is designed to accept community contributions of
          alternative scenarios (Agora, NEP, Langfristszenarien) without
          touching modeling code.
        </p>
      </section>

      <section className="mb-12 space-y-4 text-base leading-relaxed text-foreground/85">
        <h2 className="display-3 mb-2">Editorial stance</h2>
        <p>
          No political endorsement. The tool runs the plan as stated by the
          government of the day. Scenarios are translation, not advocacy.
          Where a plan&apos;s arithmetic doesn&apos;t balance under bad
          weather, that&apos;s the data saying so — not us.
        </p>
        <p>
          That said: we expect the numbers to provoke conversations.
          That&apos;s the point of stress-testing a plan publicly. The
          conversations should center on the cited sources, not on whether
          the model is honest. The model is honest.
        </p>
      </section>

      <section className="mb-12 space-y-4 text-base leading-relaxed text-foreground/85">
        <h2 className="display-3 mb-2">Contribute</h2>
        <ul className="space-y-3">
          <li>
            <strong>New scenario:</strong> add a YAML under{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
              modeling/scenarios/&lt;family&gt;/
            </code>{" "}
            with full citations, open a PR. CI validates the citation
            discipline; reviewers check the source links.
          </li>
          <li>
            <strong>Refine an existing scenario:</strong> bump the patch
            version on the same file for citation/typo fixes, or create a
            new dated file for substantive moves.
          </li>
          <li>
            <strong>Plan a feature:</strong> the modeling roadmap lives in{" "}
            <a
              href="https://github.com/mda25/stromtest-2035/blob/main/docs/design.md"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              docs/design.md
            </a>
            . Open an issue before sending a large PR.
          </li>
        </ul>
      </section>

      <div className="mt-16 flex flex-wrap gap-3 border-t border-border/60 pt-10">
        <a
          href="https://github.com/mda25/stromtest-2035"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          GitHub repository →
        </a>
        <Link
          href="/methodology"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Read the methodology
        </Link>
      </div>
    </main>
  );
}
