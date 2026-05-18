/**
 * Server-only dispatch loader.
 *
 * Reads from per-scenario JSON files at src/data/dispatch/{family}.json,
 * built at modeling-pipeline time by ``modeling/bin/build_dispatch_json.py``.
 *
 * Client-safe types + transforms live in `./dispatch-utils.ts` — import
 * from there in Client Components. This file is server-only because it
 * uses `node:fs`.
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";

import type { DispatchBundle } from "./dispatch-utils";

const DISPATCH_DIR = path.resolve(process.cwd(), "src", "data", "dispatch");

export function loadDispatchForFamily(family: string): DispatchBundle | null {
  const filepath = path.join(DISPATCH_DIR, `${family}.json`);
  if (!fs.existsSync(filepath)) return null;
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as DispatchBundle;
}

export function listFamiliesWithDispatch(): string[] {
  if (!fs.existsSync(DISPATCH_DIR)) return [];
  return fs
    .readdirSync(DISPATCH_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// Re-export client-safe types for callers that want a single import.
export type {
  DispatchBundle,
  DispatchRow,
  StackedRow,
  TotalRow,
  ZoneTotalRow,
} from "./dispatch-utils";
