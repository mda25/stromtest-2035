/**
 * Server-only dispatch loader.
 *
 * Uses direct TypeScript JSON imports rather than fs.readFile so the
 * bundles get traced by Next.js into the build output reliably. Same
 * pattern as src/data/scenarios.json — survives Vercel monorepo / Output
 * File Tracing quirks.
 *
 * One JSON per (scenario family, weather year) at
 * src/data/dispatch/<family>.<year>.json. The frontend's year selector
 * picks between them.
 *
 * Adding a new (family, year) dispatch:
 *   1. Drop the JSON under src/data/dispatch/, named <family>.<year>.json
 *   2. Add an import here
 *   3. Add a line in DISPATCH_REGISTRY
 *
 * Client-safe types + transforms live in `./dispatch-utils.ts` — import
 * from there in Client Components.
 */

import type { DispatchBundle } from "./dispatch-utils";

// Per-(family, year) dispatch JSONs.
import reicheDispatch2013 from "@/data/dispatch/reiche.2013.json";

interface FamilyYearBundle {
  family: string;
  year: number;
  bundle: DispatchBundle;
}

const DISPATCH_REGISTRY: FamilyYearBundle[] = [
  {
    family: "reiche",
    year: 2013,
    bundle: reicheDispatch2013 as unknown as DispatchBundle,
  },
];

/**
 * Returns the bundle for a (family, year). If year is omitted, returns
 * the most recent year for that family. Returns null when nothing matches.
 */
export function loadDispatchForFamily(
  family: string,
  year?: number,
): DispatchBundle | null {
  const matches = DISPATCH_REGISTRY.filter((e) => e.family === family);
  if (matches.length === 0) return null;
  if (year !== undefined) {
    const match = matches.find((e) => e.year === year);
    return match ? match.bundle : null;
  }
  // Default: most-recent year.
  matches.sort((a, b) => b.year - a.year);
  return matches[0].bundle;
}

/** Lists every committed weather year for a given family, sorted ascending. */
export function listYearsForFamily(family: string): number[] {
  return DISPATCH_REGISTRY.filter((e) => e.family === family)
    .map((e) => e.year)
    .sort((a, b) => a - b);
}

/** Lists every family that has at least one committed dispatch run. */
export function listFamiliesWithDispatch(): string[] {
  const families = new Set(DISPATCH_REGISTRY.map((e) => e.family));
  return Array.from(families);
}

/** Returns the (family, year) bundles for a family, sorted by year. */
export function loadAllYearsForFamily(family: string): FamilyYearBundle[] {
  return DISPATCH_REGISTRY.filter((e) => e.family === family).sort(
    (a, b) => a.year - b.year,
  );
}

export type {
  DispatchBundle,
  DispatchRow,
  StackedRow,
  TotalRow,
  ZoneTotalRow,
} from "./dispatch-utils";
