// The reference tables are read whole (research pass 42, M4): one read
// answers at most the project's max rows, as a normal success, and the
// signed-in research read and the steward's link-health sweep each read
// `benchmarks` and `regulatory_rules` in one — past the cap, the first 1,000
// rows in no order, with nothing saying the rest exist.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = {
  benchmarks: [] as Record<string, unknown>[],
  regulatory_rules: [] as Record<string, unknown>[],
  maxRows: 4,
  fail: null as string | null,
};

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: "benchmarks" | "regulatory_rules") {
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      let ordered = false;
      const q = {
        select: () => q,
        order: () => ((ordered = true), q),
        range: (from: number, to: number) => ((range = [from, to]), q),
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (db.fail === table) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve);
          const rows = ordered ? [...db[table]].sort((a, b) => String(a.id).localeCompare(String(b.id))) : db[table];
          const [from, to] = range;
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + db.maxRows)), error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));

import { signedInBenchmarkRows, signedInRuleRows } from "./research-read";

const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ id: `${p}${String(i).padStart(3, "0")}`, source: "" }));

describe("the signed-in research read", () => {
  it("reads every benchmark and every rule past one response's rows", async () => {
    db.benchmarks = ids(11, "b");
    db.regulatory_rules = ids(9, "r");
    expect((await signedInBenchmarkRows())?.map((r) => (r as unknown as { id: string }).id)).toEqual(db.benchmarks.map((r) => r.id));
    expect((await signedInRuleRows())?.length).toBe(9);
  });

  it("answers no table, never part of one, where a page fails", async () => {
    db.fail = "benchmarks";
    expect(await signedInBenchmarkRows()).toBeNull();
    db.fail = null;
  });
});

describe("the steward's link-health sweep", () => {
  it("reads every row's source a page at a time, and stops on a failed read", () => {
    const steward = readFileSync("scripts/steward.mjs", "utf8");
    expect(steward).toContain('import { readAll } from "../lib/read-all.ts"');
    expect(steward).toContain('supabase.from(table).select("id, source").order("id").range(from, to)');
    expect(steward).toContain("if (!rows) throw new Error(`${table} read failed");
    expect(steward).not.toContain('await supabase.from(table).select("source")');
  });
});

// Next keeps an unstable_cache entry only under 2 MB, measured as the JSON of
// the entry, whose body is the JSON of the rows (node_modules/next/dist/
// server/lib/incremental-cache: past it, production warns and keeps nothing,
// so every signed-in view would read both tables page by page). The cached
// `benchmarks` read is bounded: one row a (sector, metro, metric), the
// research rows, the two monthly pulls' metrics for each metro they read, and
// HUD's rents a fiscal year (audit C5, LOW-10).
describe("what the signed-in research read hands the cache", () => {
  it("fits the 2 MB entry with room to spare, on the checked-in files and both pulls' rows, generously", async () => {
    const { seedBenchmarks, seedRules } = await import("./research-data");
    const { REALTOR_METRICS, ZILLOW_METRICS } = await import("./feed-rows");
    const dataMetros = JSON.parse(readFileSync("data/data-metros.json", "utf8")) as { metros: unknown[] };
    const briefed = (file: string) => (readFileSync(file, "utf8").match(/^\s*\{ id: "/gm) ?? []).length;
    const asStored = (r: object) => ({ id: "00000000-0000-0000-0000-000000000000", ...r, created_at: "2026-10-05T00:00:00.000000+00:00" });
    const entry = (rows: unknown[]) => JSON.stringify({ body: JSON.stringify(rows) }).length;
    const seeds = seedBenchmarks().map(asStored);
    // Each pull's metros — its briefed list and the metro areas read without
    // a brief — each metric with a note longer than any the pulls write.
    const pullRows = (metros: number, metrics: readonly string[]) =>
      Array.from({ length: metros }, (_, i) =>
        metrics.map((metric) =>
          asStored({
            sector: "multifamily",
            metro: `Metro ${i} with a long name`,
            metric,
            low: 1_234_567,
            high: 1_234_567,
            unit: "usd_month",
            source: "https://www.realtor.com/research/data/",
            as_of: "2026-09-01",
            status: "verified",
            note: "x".repeat(300),
          }),
        ),
      ).flat();
    const zillowMetros = briefed("scripts/fetch-zori.mjs") + dataMetros.metros.length;
    const realtorMetros = briefed("scripts/fetch-realtor.mjs") + dataMetros.metros.length;
    expect(zillowMetros).toBeGreaterThan(40);
    const feed = [...pullRows(zillowMetros, ZILLOW_METRICS), ...pullRows(realtorMetros, REALTOR_METRICS)];
    // HUD's rents for two fiscal years before the one on file, never deleted.
    const fmr = seeds.filter((r) => /^hud_fmr_fy/.test((r as unknown as { metric: string }).metric));
    const benchmarks = entry([...seeds, ...feed, ...fmr, ...fmr]);
    // 756,709 characters on 2026-10-05, 1,113 rows. Half the cap is the line,
    // so the table's growth fails here long before the cache stops keeping it.
    expect(benchmarks).toBeLessThan(1024 * 1024);
    expect(entry(seedRules().map(asStored))).toBeLessThan(256 * 1024);
  });
});
