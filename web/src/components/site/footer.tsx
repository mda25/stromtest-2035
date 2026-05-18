import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-background/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-base font-medium tracking-tight"
          >
            <span>
              stromtest<span className="text-primary">·</span>2035
            </span>
          </Link>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
            A public stress-test of Germany&apos;s energy plans against historical
            weather years. Open source, open data, every assumption sourced.
          </p>
        </div>

        <FooterColumn
          title="Explore"
          links={[
            { href: "/scenarios", label: "All scenarios" },
            { href: "/scenarios/compare", label: "Compare" },
            { href: "/scenarios/reiche", label: "Reiche-Bundesregierung" },
            { href: "/scenarios/habeck", label: "Habeck era" },
          ]}
        />

        <FooterColumn
          title="Project"
          links={[
            { href: "/methodology", label: "Methodology" },
            { href: "/about", label: "About" },
            {
              href: "https://github.com/mda25/stromtest-2035",
              label: "GitHub",
              external: true,
            },
            {
              href: "https://github.com/mda25/stromtest-2035/blob/main/docs/design.md",
              label: "Design doc",
              external: true,
            },
          ]}
        />

        <FooterColumn
          title="Built on"
          links={[
            {
              href: "https://github.com/PyPSA/pypsa-eur",
              label: "PyPSA-Eur",
              external: true,
            },
            {
              href: "https://www.netzentwicklungsplan.de/",
              label: "Netzentwicklungsplan",
              external: true,
            },
            {
              href: "https://cds.climate.copernicus.eu/",
              label: "Copernicus ERA5",
              external: true,
            },
            {
              href: "https://nextjs.org/",
              label: "Next.js",
              external: true,
            },
          ]}
        />
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © 2026 Matthis Damm · MIT licensed · No warranty, no political
            endorsement.
          </p>
          <p className="font-mono text-muted-foreground/70">
            Built with PyPSA-Eur · Linopy · HiGHS · Next.js
          </p>
        </div>
      </div>
    </footer>
  );
}

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-foreground/80 transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                className="text-foreground/80 transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
