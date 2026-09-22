import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every unit a pull writes into `benchmarks` is one the table accepts.
 *
 * Migration 0023 checks `unit` against a fixed list and Postgres refuses any
 * other row — which a pull's dry run never sees, because a dry run prints
 * and writes nothing. The Realtor.com pull passed its dry run writing
 * "listings" and "days" and failed its first real run on exactly that
 * (run 35785192214). So the list is read out of the migration itself, and
 * every `unit: "…"` literal in every script that writes the table is held
 * to it: a new unit fails here, not on the 8th of the month.
 */

const MIGRATION = "supabase/migrations/0023_market_research.sql";
const SCRIPTS = "scripts";

function allowedUnits(): Set<string> {
  const sql = readFileSync(MIGRATION, "utf8");
  const m = sql.match(/check \(unit in \(([^)]*)\)\)/);
  if (!m) throw new Error(`${MIGRATION} no longer states the unit check`);
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

/** The scripts that write the table — found, not listed, so a new pull is
 *  covered the day it is written. */
function benchmarkWriters(): string[] {
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(SCRIPTS, f))
    .filter((p) => readFileSync(p, "utf8").includes('from("benchmarks")'));
}

describe("benchmark units", () => {
  const allowed = allowedUnits();

  it("reads the check list out of the migration", () => {
    expect(allowed.has("usd")).toBe(true);
    expect(allowed.has("usd_month")).toBe(true);
    expect(allowed.has("count")).toBe(true);
    expect(allowed.size).toBeGreaterThanOrEqual(6);
  });

  it("finds the pulls that write the table", () => {
    const writers = benchmarkWriters();
    expect(writers).toContain(join(SCRIPTS, "fetch-realtor.mjs"));
    expect(writers).toContain(join(SCRIPTS, "fetch-zori.mjs"));
    expect(writers).toContain(join(SCRIPTS, "fetch-fmr.mjs"));
  });

  for (const file of benchmarkWriters()) {
    it(`${file} writes only units the table accepts`, () => {
      const src = readFileSync(file, "utf8");
      const units = [...src.matchAll(/unit:\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
      for (const u of units) {
        expect(allowed.has(u), `${file} writes unit "${u}", which 0023's check refuses`).toBe(true);
      }
    });
  }

  it("the Realtor pull's own guard names the same list", () => {
    // The script refuses a unit outside the table's list before it fetches
    // anything, so a dry run fails on it too; its copy of the list must be
    // the migration's, or the guard guards the wrong thing.
    const src = readFileSync(join(SCRIPTS, "fetch-realtor.mjs"), "utf8");
    const m = src.match(/BENCHMARK_UNITS = new Set\(\[([^\]]*)\]\)/);
    expect(m, "fetch-realtor.mjs holds BENCHMARK_UNITS").toBeTruthy();
    const inScript = new Set([...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
    expect([...inScript].sort()).toEqual([...allowed].sort());
  });
});
