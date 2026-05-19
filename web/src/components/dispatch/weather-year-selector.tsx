"use client";

import { type WeatherYearMeta } from "@/lib/weather-years";

interface Props {
  /** Years for which a committed dispatch JSON exists. */
  availableYears: number[];
  /** Full catalog (committed + pending) — pending years render as disabled. */
  catalog: WeatherYearMeta[];
  /** Currently-selected year. */
  activeYear: number;
  /** Called when the user picks a different available year. */
  onSelect: (year: number) => void;
}

/**
 * Segmented control over weather years.
 *
 * The selector shows every year in the catalog. Years with a committed
 * dispatch JSON are clickable; the rest are disabled chips with tooltips
 * explaining why (cutout build pending). This way the roadmap is visible
 * even before all years have shipped.
 */
export function WeatherYearSelector({
  availableYears,
  catalog,
  activeYear,
  onSelect,
}: Props) {
  const sorted = [...catalog].sort((a, b) => a.year - b.year);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Weather year
        </span>
        <div
          role="radiogroup"
          aria-label="Weather year for the 2035 fleet"
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-background p-1 text-sm"
        >
          {sorted.map((meta) => {
            const isAvailable = availableYears.includes(meta.year);
            const isActive = meta.year === activeYear;
            const base =
              "rounded-full px-3 py-1 text-sm font-medium transition-colors";
            if (!isAvailable) {
              return (
                <button
                  key={meta.year}
                  type="button"
                  disabled
                  title={`${meta.label} (${meta.year}) — pending: see modeling/RUNBOOK.md to run this weather year`}
                  className={`${base} cursor-not-allowed text-muted-foreground/60`}
                >
                  {meta.year}
                  <span className="ml-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    pending
                  </span>
                </button>
              );
            }
            return (
              <button
                key={meta.year}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onSelect(meta.year)}
                title={meta.description}
                className={`${base} ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/80 hover:bg-muted"
                }`}
              >
                {meta.year}
              </button>
            );
          })}
        </div>
      </div>
      <ActiveYearCaption catalog={sorted} activeYear={activeYear} />
    </div>
  );
}

function ActiveYearCaption({
  catalog,
  activeYear,
}: {
  catalog: WeatherYearMeta[];
  activeYear: number;
}) {
  const meta = catalog.find((c) => c.year === activeYear);
  if (!meta) return null;
  return (
    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">
        {meta.label} ({meta.year})
      </span>{" "}
      — {meta.description}
    </p>
  );
}
