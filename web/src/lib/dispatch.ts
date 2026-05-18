/**
 * Server-only dispatch loader.
 *
 * Uses direct TypeScript JSON imports rather than fs.readFile so the
 * bundles get traced by Next.js into the build output reliably. Same
 * pattern as src/data/scenarios.json — survives Vercel monorepo / Output
 * File Tracing quirks.
 *
 * Adding a new dispatch: drop the JSON under src/data/dispatch/, then
 * add an import here and a line in DISPATCH_BY_FAMILY.
 *
 * Client-safe types + transforms live in `./dispatch-utils.ts` — import
 * from there in Client Components.
 */

import type { DispatchBundle } from "./dispatch-utils";

// Per-family dispatch JSONs. Each entry corresponds to one committed
// solved-run bundle under web/src/data/dispatch/.
import reicheDispatch from "@/data/dispatch/reiche.json";

const DISPATCH_BY_FAMILY: Record<string, DispatchBundle | undefined> = {
  reiche: reicheDispatch as unknown as DispatchBundle,
};

export function loadDispatchForFamily(family: string): DispatchBundle | null {
  return DISPATCH_BY_FAMILY[family] ?? null;
}

export function listFamiliesWithDispatch(): string[] {
  return Object.keys(DISPATCH_BY_FAMILY).filter(
    (k) => DISPATCH_BY_FAMILY[k] !== undefined,
  );
}

export type {
  DispatchBundle,
  DispatchRow,
  StackedRow,
  TotalRow,
  ZoneTotalRow,
} from "./dispatch-utils";
