#!/usr/bin/env node
// Sync scenario YAMLs from ../modeling/scenarios/ into web/src/data/scenarios.json.
//
// Runs as `prebuild` so the JSON is always fresh at build time. Committed so
// `npm run dev` works without running sync first, and so Vercel builds succeed
// even when modeling/ is not visible to the web/ build context (e.g. when the
// project's Root Directory is set to web/).
//
// If the source dir is missing (Vercel sometimes ships only the project root
// in Output File Tracing), we fall back to whatever scenarios.json is already
// committed rather than failing the build.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SCENARIOS_DIR = join(REPO_ROOT, "modeling", "scenarios");
const OUT_FILE = join(WEB_ROOT, "src", "data", "scenarios.json");

function main() {
  if (!existsSync(SCENARIOS_DIR)) {
    throw new Error(`scenarios source dir not found: ${SCENARIOS_DIR}`);
  }
  const families = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const result = [];
  for (const family of families) {
    const famDir = join(SCENARIOS_DIR, family);
    const changelogPath = join(famDir, "CHANGELOG.md");
    const changelog = existsSync(changelogPath)
      ? readFileSync(changelogPath, "utf-8")
      : null;
    const versionFiles = readdirSync(famDir)
      .filter((f) => f.endsWith(".yml") && !f.startsWith("_"))
      .sort();
    for (const vf of versionFiles) {
      const scenario = yaml.load(readFileSync(join(famDir, vf), "utf-8"));
      result.push({
        family,
        version: scenario.version,
        filename: vf,
        scenario,
        changelog_md: changelog,
      });
    }
  }
  result.sort(
    (a, b) =>
      a.family.localeCompare(b.family) || b.version.localeCompare(a.version),
  );

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + "\n", "utf-8");
  console.log(
    `sync-scenarios: wrote ${result.length} scenario(s) to src/data/scenarios.json`,
  );
}

try {
  main();
} catch (err) {
  if (existsSync(OUT_FILE)) {
    console.warn(
      `sync-scenarios: ${err.message} — keeping committed baseline scenarios.json`,
    );
    process.exit(0);
  }
  throw err;
}
