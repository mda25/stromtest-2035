import Link from "next/link";

const PRIMARY_LINKS = [
  { href: "/scenarios", label: "Scenarios" },
  { href: "/scenarios/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-medium tracking-tight"
          aria-label="stromtest-2035 home"
        >
          <LogoMark />
          <span className="text-foreground transition-colors group-hover:text-primary">
            stromtest<span className="text-primary">·</span>2035
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm md:flex">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <a
            href="https://github.com/mda25/stromtest-2035"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <Link
            href="/scenarios"
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Explore →
          </Link>
        </div>
      </div>

      <MobileNav />
    </header>
  );
}

function MobileNav() {
  return (
    <div className="border-t border-border/60 px-6 py-2 md:hidden">
      <nav className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {PRIMARY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function LogoMark() {
  // Stylized lightning + pulse line — energy + signal.
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 text-primary"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12h4l2-5 3 10 3-7 2 4h4" />
    </svg>
  );
}
