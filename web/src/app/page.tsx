import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">stromtest-2035</h1>
          <Badge variant="outline">scaffolding</Badge>
        </div>
        <p className="text-balance text-lg text-muted-foreground">
          Public stress-test of Germany&apos;s energy transition plans under
          historical weather years. PyPSA-Eur + Next.js, open source.
        </p>
      </header>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Why</CardTitle>
          <CardDescription>
            Reiche&apos;s plan is being shaped right now. No public, methodologically
            rigorous tool has run it against bad weather years. This will be the first.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Two scenarios committed (Reiche-Bundesregierung 2026-05 + Habeck-era
            Klimaneutralität 2045) with every substantive number citation-disciplined.
            PyPSA-Eur pipeline validated end-to-end. Dispatch results land once
            the per-zone capacity injection (build step 7) ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href="/scenarios" className="underline underline-offset-4">
              Browse scenarios →
            </Link>
            <Link
              href="/scenarios/compare"
              className="underline underline-offset-4"
            >
              Side-by-side comparison →
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Methodology</CardTitle>
          <CardDescription>
            Every substantive assumption traces to a dated, citable source. The
            translation layer refuses to compile a scenario whose substantive
            fields lack a citation_ref. Comparisons run across multiple plans
            simultaneously; no plan-vs-nothing framing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">PyPSA-Eur</Badge>
          <Badge variant="secondary">linopy + HiGHS</Badge>
          <Badge variant="secondary">atlite + ERA5</Badge>
          <Badge variant="secondary">Snakemake</Badge>
          <Badge variant="secondary">4 ÜNB Regelzonen</Badge>
          <Badge variant="secondary">8760-hour H₂ SoC</Badge>
        </CardContent>
      </Card>

      <footer className="mt-auto pt-12 text-sm text-muted-foreground">
        <a
          href="https://github.com/mda25/stromtest-2035"
          className="underline-offset-4 hover:underline"
        >
          github.com/mda25/stromtest-2035
        </a>
      </footer>
    </main>
  );
}
