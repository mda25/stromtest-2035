import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { ScenarioCard } from "@/components/scenarios/scenario-card";
import { loadAllScenarios } from "@/lib/scenarios";

export const metadata = {
  title: "Scenarios · stromtest-2035",
  description:
    "Versioned, citation-disciplined translations of German energy plans into runnable 2035 capacity, demand, and storage data.",
};

export default function ScenariosPage() {
  const files = loadAllScenarios();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← stromtest-2035
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Scenarios</h1>
        <p className="text-pretty text-lg text-muted-foreground">
          Each scenario is a versioned, source-cited translation of a published
          energy-policy stance into runnable 2035 inputs for the PyPSA-Eur
          pipeline. Numbers reflect the underlying plans, not an editorial
          position.
        </p>
        <p className="text-sm">
          <Link
            href="/scenarios/compare"
            className="underline underline-offset-4"
          >
            Side-by-side comparison →
          </Link>
        </p>
      </header>

      <Separator />

      <section className="grid gap-6 md:grid-cols-2">
        {files.map((file) => (
          <ScenarioCard key={`${file.family}-${file.version}`} file={file} />
        ))}
      </section>

      {files.length === 0 && (
        <p className="text-muted-foreground">
          No scenarios committed yet. Author scenarios under
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5">
            modeling/scenarios/&lt;family&gt;/&lt;date&gt;.&lt;patch&gt;.yml
          </code>
          following the schema in <code>modeling/src/stromtest/translation/schema.py</code>.
        </p>
      )}
    </main>
  );
}
