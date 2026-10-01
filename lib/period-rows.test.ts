import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERIOD_METRICS, PERIOD_METRICS_IN, isPeriodMetric, withoutPeriodRows } from "./period-rows";
import { REALTOR_METRICS, ZILLOW_METRICS, isFeedMetric } from "./feed-rows";
import { seedBenchmarks, twoToFourMedian } from "./research-data";
import { benchmark30 } from "./debt-index";
import { benchRowLabel } from "@/app/(app)/deals/[id]/research-panel";

/**
 * A research row whose `as_of` is the period its figure is for is never the
 * steward's to re-date (lib/period-rows): once the feed rows were left out
 * of its re-verification, its three oldest rows were the 2–4 unit medians,
 * and a "confirmed" verdict would have turned "Median sale price of a 2–4
 * unit property, May 2026" into October's. These hold the list to every
 * reader that takes a period off `as_of`, and the steward to the list.
 */

const seeds = seedBenchmarks();
const src = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** What the seed script writes that is research, not a feed. */
const SEEDED = [...src("scripts/seed-research.mjs").matchAll(/metric:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

/** Every source file under a directory, for the call-site scan. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("period rows — the rows whose as_of is the period their figure is for", () => {
  it("lists every metric whose label is named by its as_of", () => {
    // A label that changes with the row's date reads a period off it — the
    // deal page's "…, May 2026".
    const metrics = new Set([...seeds.map((b) => b.metric), ...SEEDED]);
    const dated = [...metrics].filter(
      (metric) => benchRowLabel({ metric, as_of: "2031-07-31" }) !== benchRowLabel({ metric, as_of: "2032-02-29" }),
    );
    expect(dated).toContain("median_sale_price_2_4_unit");
    for (const metric of dated) expect(PERIOD_METRICS as readonly string[], metric).toContain(metric);
  });

  it("lists every row of the 2–4 unit block, dated the last day of the month it is for", () => {
    const month = twoToFourMedian("philadelphia_pa")!.asOf;
    const block = seeds.filter((b) => b.sector === "multifamily" && /_2_4_unit$/.test(b.metric));
    expect(block.length).toBeGreaterThan(0);
    for (const b of block) {
      expect(b.as_of, `${b.metro} ${b.metric}`).toBe(month);
      expect(isPeriodMetric(b.metric), b.metric).toBe(true);
    }
  });

  it("lists the snapshot the leverage check dates its survey week by", () => {
    // The survey's date is the row's as_of (lib/debt-index)…
    const pmms = seeds.find((b) => b.metric === "pmms_30y_fixed")!;
    expect(benchmark30(null, pmms)?.asOf).toBe(pmms.as_of);
    // …and every caller hands it the row a metric names: each such metric is
    // a period row.
    const files = [...sources("app"), ...sources("lib")].filter((f) => src(f).includes("benchmark30("));
    const handed: string[] = [];
    for (const f of files) {
      for (const call of src(f).split("benchmark30(").slice(1)) {
        const args = call.slice(0, call.indexOf(";"));
        handed.push(...[...args.matchAll(/metric === "([a-z0-9_]+)"/g)].map((m) => m[1]));
      }
    }
    expect(handed.length).toBeGreaterThan(0);
    for (const metric of handed) expect(PERIOD_METRICS as readonly string[], metric).toContain(metric);
  });

  it("names no row dated by the day it was read, and no feed row (which has its own rule)", () => {
    const readOn = seeds.filter((b) => b.cite || b.metric.startsWith("cap_rate__"));
    expect(readOn.length).toBeGreaterThan(0);
    for (const b of readOn) expect(isPeriodMetric(b.metric), b.metric).toBe(false);
    for (const metric of PERIOD_METRICS) expect(isFeedMetric(metric), metric).toBe(false);
    // Every listed metric is one the research layer writes.
    for (const metric of PERIOD_METRICS) expect(seeds.some((b) => b.metric === metric), metric).toBe(true);
  });
});

describe("the steward leaves the period rows alone", () => {
  /** A query builder that records what it was asked to leave out. */
  function recorder() {
    const calls: [string, string, string][] = [];
    const q = {
      not(column: string, op: string, value: string) {
        calls.push([column, op, value]);
        return q;
      },
    };
    return { q, calls };
  }

  it("leaves out exactly the period rows, in the database", () => {
    const { q, calls } = recorder();
    expect(withoutPeriodRows(q)).toBe(q);
    expect(calls).toEqual([["metric", "in", PERIOD_METRICS_IN]]);
    const listed = PERIOD_METRICS_IN.replace(/^\(|\)$/g, "")
      .split(",")
      .map((v) => v.replace(/^"|"$/g, ""));
    expect(listed).toEqual([...PERIOD_METRICS]);
    // Nothing else: the research rows the steward may re-date, and the feed
    // rows (left out by their own filter), are not in this one.
    for (const m of [...ZILLOW_METRICS, ...REALTOR_METRICS, "office_vacancy_pct", "cap_rate__class_a"]) expect(listed).not.toContain(m);
  });

  it("filters its re-verification query and both its writes, and checks again in hand", () => {
    const steward = src("scripts/steward.mjs");
    expect(steward).toContain('from "../lib/period-rows.ts"');
    const statements = steward.split(";").filter((s) => s.includes('.from("benchmarks")'));
    const touching = statements.filter((s) => s.includes(".update(") || s.includes('.order("as_of"'));
    expect(touching.length).toBe(3);
    for (const s of touching) expect(s, s.trim().slice(0, 120)).toContain("withoutPeriodRows(");
    expect(steward).toMatch(/\.filter\(\(b\) => !isPeriodMetric\(b\.metric\)\)/);
  });
});
