import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEED_METRICS_IN,
  FMR_METRICS_LIKE,
  REALTOR_METRICS,
  YEAR_AGO_METRICS,
  YEAR_AGO_METRICS_IN,
  ZILLOW_METRICS,
  isFeedMetric,
  isYearAgoMetric,
  withoutFeedRows,
  withoutYearAgoRows,
} from "./feed-rows";
import { ZILLOW_METRICS as READ_BY_ZORI } from "./zori";
import { REALTOR_METRICS as READ_BY_REALTOR } from "./realtor";
import { FMR_BEDS, fmrMetric, readFmrMetric } from "./fmr";

/**
 * A feed row is its pull's alone (lib/feed-rows): the steward re-verified
 * the oldest rows in `benchmarks` every night, and they were Realtor.com's
 * year-ago hotness ranks, so it re-dated and overwrote publishers' figures
 * and kept its 180-day count tripped. These hold the one list to what the
 * pulls write, the filters to the list, and the steward to the filters.
 */

const SCRIPTS = "scripts";
const src = (file: string) => readFileSync(join(SCRIPTS, file), "utf8");

/** What the seed script writes that is research, not a feed: its own
 *  `metric:` literals (the FMR rows come through lib/fmr). */
const RESEARCH_METRICS = [...src("seed-research.mjs").matchAll(/metric:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

/** PostgREST's `not.in` and `not.like`, as the database applies them, over
 *  the calls a query builder was handed. */
function survivors(calls: readonly [string, string, string][], metrics: readonly string[]): string[] {
  return metrics.filter((metric) =>
    calls.every(([column, op, value]) => {
      expect(column).toBe("metric");
      if (op === "in") {
        const listed = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
        return !listed.includes(metric);
      }
      if (op === "like") {
        const re = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`);
        return !re.test(metric);
      }
      throw new Error(`unexpected operator ${op}`);
    }),
  );
}

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

describe("feed rows — the one list of what the pulls write", () => {
  it("names every Zillow and Realtor.com metric, and every fair market rent lib/fmr writes, as a feed row", () => {
    for (const m of [...ZILLOW_METRICS, ...REALTOR_METRICS]) expect(isFeedMetric(m), m).toBe(true);
    for (let fy = 2020; fy <= 2040; fy++) {
      for (const bed of FMR_BEDS) {
        const m = fmrMetric(fy, bed);
        expect(isFeedMetric(m), m).toBe(true);
        expect(readFmrMetric(m)).not.toBeNull();
      }
    }
    // And a metric lib/fmr does not read as a fair market rent is not one here.
    for (const m of ["hud_fmr_fy2027", "hud_fmr_2027_2br", "hud_fmr_fy2027_5br", "xhud_fmr_fy2027_2br"]) {
      expect(readFmrMetric(m), m).toBeNull();
      expect(isFeedMetric(m), m).toBe(false);
    }
  });

  it("leaves the research rows the seed script writes to the steward", () => {
    expect(RESEARCH_METRICS).toContain("median_sale_price_2_4_unit");
    expect(RESEARCH_METRICS).toContain("pmms_30y_fixed");
    for (const m of RESEARCH_METRICS) expect(isFeedMetric(m), m).toBe(false);
  });

  it("is the list the reads ask for", () => {
    expect([...READ_BY_ZORI]).toEqual([...ZILLOW_METRICS]);
    expect([...READ_BY_REALTOR]).toEqual([...REALTOR_METRICS]);
  });

  it("is the list the pulls write: each imports it and names no metric outside it", () => {
    for (const [file, list, pattern] of [
      ["fetch-zori.mjs", ZILLOW_METRICS, /"((?:zori|zhvi)[a-z_]*)"/g],
      ["fetch-realtor.mjs", REALTOR_METRICS, /"(rdc_[a-z_]+)"/g],
    ] as const) {
      const text = src(file);
      expect(text, file).toContain('from "../lib/feed-rows.ts"');
      const written = [...new Set([...text.matchAll(pattern)].map((m) => m[1]))];
      expect(written.length, file).toBeGreaterThan(0);
      for (const m of written) expect(list as readonly string[], `${file} writes ${m}`).toContain(m);
    }
    // Realtor.com's changes from a year ago are its columns' metrics with
    // "_yoy" on the end, which the pull derives rather than spells out.
    for (const m of REALTOR_METRICS.filter((x) => x.endsWith("_yoy"))) {
      expect(REALTOR_METRICS as readonly string[]).toContain(m.replace(/_yoy$/, ""));
    }
  });

  it("names the year-ago rows apart, and they are Realtor.com's", () => {
    expect([...YEAR_AGO_METRICS]).toEqual(["rdc_hotness_rank_prior"]);
    for (const m of YEAR_AGO_METRICS) {
      expect(isYearAgoMetric(m)).toBe(true);
      expect(isFeedMetric(m)).toBe(true);
      expect(REALTOR_METRICS as readonly string[]).toContain(m);
    }
    expect(isYearAgoMetric("rdc_hotness_rank")).toBe(false);
  });
});

describe("the steward's filters leave every feed row out in the database", () => {
  const every = [
    ...ZILLOW_METRICS,
    ...REALTOR_METRICS,
    ...FMR_BEDS.map((bed) => fmrMetric(2027, bed)),
    fmrMetric(2026, "2br"),
    ...RESEARCH_METRICS,
  ];

  it("keeps only the research rows, in a select, a count or an update alike", () => {
    const { q, calls } = recorder();
    expect(withoutFeedRows(q)).toBe(q);
    expect(calls).toEqual([
      ["metric", "in", FEED_METRICS_IN],
      ["metric", "like", FMR_METRICS_LIKE],
    ]);
    expect(survivors(calls, every)).toEqual(RESEARCH_METRICS);
  });

  it("the 180-day count leaves out the year-ago rows and nothing else", () => {
    const { q, calls } = recorder();
    withoutYearAgoRows(q);
    expect(calls).toEqual([["metric", "in", YEAR_AGO_METRICS_IN]]);
    expect(survivors(calls, every)).toEqual(every.filter((m) => m !== "rdc_hotness_rank_prior"));
  });

  it("the steward runs its re-verification and its count through them, and checks again in hand", () => {
    const steward = src("steward.mjs");
    expect(steward).toContain('from "../lib/feed-rows.ts"');
    const statements = steward.split(";").filter((s) => s.includes('.from("benchmarks")'));
    // Every benchmark row it selects to re-verify or writes to is filtered…
    const touching = statements.filter((s) => s.includes(".update(") || s.includes('.order("as_of"'));
    expect(touching.length).toBe(3);
    for (const s of touching) expect(s, s.trim().slice(0, 120)).toContain("withoutFeedRows(");
    // …the count is taken without the year-ago rows…
    const count = statements.filter((s) => s.includes('.lt("as_of"'));
    expect(count.length).toBe(1);
    expect(count[0]).toContain("withoutYearAgoRows(");
    // …and what comes back is checked once more before anything is asked.
    expect(steward).toMatch(/\.filter\(\(b\) => !isFeedMetric\(b\.metric\)\)/);
  });
});
