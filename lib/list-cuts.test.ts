// The reader's own leasing profiles and submarkets are read whole (research
// pass 42, L9): the rent roll read the newest 30 profiles and picked a
// deal's opening profile from among them, and /market and the deal page
// listed the newest 100 submarkets, each with nothing saying more exist.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listProfiles } from "./rentroll/store";
import { listSubmarkets } from "./market/store";

function fakeDb(rows: Record<string, unknown>[], maxRows: number, fail = false): SupabaseClient {
  return {
    from() {
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      let limit = Number.MAX_SAFE_INTEGER;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: (n: number) => ((limit = n), q),
        range: (from: number, to: number) => ((range = [from, to]), q),
        then<T>(resolve: (v: { data: unknown; error: unknown }) => T) {
          if (fail) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve);
          const [from, to] = range;
          const data = rows.slice(from, Math.min(to + 1, from + maxRows, from + limit));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const profile = (i: number) => ({
  id: `p${String(i).padStart(3, "0")}`,
  user_id: "u1",
  name: `Profile ${i}`,
  asset_class: "office",
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString(),
});
const submarket = (i: number) => ({
  id: `s${String(i).padStart(3, "0")}`,
  user_id: "u1",
  name: `Submarket ${i}`,
  metro: "Dallas, TX",
  asset_class: "office",
  exclusion_rules: {},
  supply_warning_months: null,
  notes: null,
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString(),
});

describe("the reader's own lists", () => {
  it("every leasing profile, past thirty and past one response's rows", async () => {
    const rows = Array.from({ length: 45 }, (_, i) => profile(i));
    expect((await listProfiles(fakeDb(rows, 20), "u1", "office")).map((p) => p.id)).toEqual(rows.map((r) => r.id));
    await expect(listProfiles(fakeDb(rows, 20, true), "u1", "office")).rejects.toThrow(/leasing profiles read failed/);
  });

  it("every submarket, past a hundred and past one response's rows", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => submarket(i));
    expect((await listSubmarkets(fakeDb(rows, 50), "u1")).map((s) => s.id)).toEqual(rows.map((r) => r.id));
    await expect(listSubmarkets(fakeDb(rows, 50, true), "u1")).rejects.toThrow(/submarkets read failed/);
  });
});
