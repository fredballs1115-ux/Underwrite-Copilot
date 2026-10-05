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
