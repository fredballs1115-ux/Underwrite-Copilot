// A submarket's pipeline is read whole (research pass 42, M7): the page and
// the deal card read it in one request asking for 2,000 — cut to the
// project's max rows with nothing saying so — and read a failed read as no
// pipeline; the import read the rows it replaces with a `.limit(5000)` cut
// the same way, so past the cap a building already loaded could go in twice.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPipeline } from "./store";

function fakeDb(rows: Record<string, unknown>[], maxRows: number, fail = false): SupabaseClient {
  return {
    from() {
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        range: (from: number, to: number) => ((range = [from, to]), q),
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (fail) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve);
          const [from, to] = range;
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null }).then(resolve);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const building = (i: number) => ({
  id: `p${String(i).padStart(4, "0")}`,
  submarket_id: "s1",
  name: `Building ${i}`,
  address: null,
  sf: 100_000,
  status: "under_construction",
  expected_delivery: "2027-06-30",
  subtype: null,
  owner_occupied: false,
  excluded: false,
  exclusion_reason: null,
  stale_flag: false,
  stale_reason: null,
  source: "export.csv",
  notes: null,
});

describe("a submarket's pipeline", () => {
  it("is every building, past one response's rows", async () => {
    const rows = Array.from({ length: 23 }, (_, i) => building(i));
    const got = await getPipeline(fakeDb(rows, 10), "s1");
    expect(got.map((p) => p.id)).toEqual(rows.map((r) => r.id));
  });

  it("throws on a failed read rather than reading it as no pipeline", async () => {
    await expect(getPipeline(fakeDb([building(1)], 10, true), "s1")).rejects.toThrow(/pipeline read failed/);
  });

  it("the import reads every stored row it may replace, a page at a time", () => {
    const actions = readFileSync("app/(app)/submarkets/actions.ts", "utf8");
    expect(actions).not.toMatch(/\.limit\(5000\)/);
    expect(actions).toMatch(/\.select\("id, name, address, source"\)\s*\.eq\("submarket_id", id\)\s*\.order\("id"\)\s*\.range\(from, to\)/);
    expect(actions).toContain("if (!existing) redirect(`/submarkets/${id}?error=importsave`)");
  });
});
