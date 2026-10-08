// One read for the market memory (research pass 42, H5): /market's "Your
// market data" read the newest 500 of the reader's screens and the deal
// page's "From your past screens" strip up to 1,000 in no order, so between
// 500 and 1,000 screens the two pages stated two counts for one market.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMarketMemory, readMemoryGroup, readMemoryKeys } from "./market-memory-read";
import { buildComps, marketMemoryFor, summarizeMarkets } from "./market-memory";

type Row = Record<string, unknown>;

/** A deals table that answers at most `maxRows` a response, filtering by
 *  user, by a non-null extraction and by ids as the database does. */
function fakeDb(rows: Row[], maxRows = 3): { client: SupabaseClient; reads: number } {
  const state = { reads: 0 };
  const client = {
    from() {
      let cols = "";
      let user: unknown = undefined;
      let ids: unknown[] | null = null;
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
      const q = {
        select: (c: string) => {
          cols = c;
          return q;
        },
        eq: (_col: string, v: unknown) => {
          user = v;
          return q;
        },
        not: () => q,
        order: () => q,
        in: (_col: string, list: unknown[]) => {
          ids = list;
          return q;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          state.reads++;
          let out = rows.filter((r) => r.extraction != null);
          if (user !== undefined) out = out.filter((r) => r.user_id === user);
          if (ids) out = out.filter((r) => ids!.includes(r.id));
          out = [...out].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          // The cap binds a paged read; a hundred ids a request sits under
          // any project's max rows, so an id read answers whole.
          const [from, to] = range;
          out = ids ? out : out.slice(from, Math.min(to + 1, from + maxRows));
          const data = cols.includes("ext_class")
            ? out.map((r) => ({
                id: r.id,
                asset_class: r.asset_class,
                is_sample: r.is_sample,
                market: (r.extraction as { market?: string }).market ?? null,
                ext_class: (r.extraction as { assetClass?: string }).assetClass ?? null,
              }))
            : out;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return {
    client,
    get reads() {
      return state.reads;
    },
  };
}

const deal = (i: number, user: string, market = "Dallas, TX"): Row => ({
  id: `d${i}`,
  name: `Deal ${i}`,
  asset_class: "multifamily",
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  is_sample: false,
  verdict: { verdict: "pass" },
  user_id: user,
  first_signal: null,
  extraction: {
    assetClass: "multifamily",
    market,
    metrics: [
      { label: "Asking price", value: "$10,000,000", flagged: false, page: "" },
      { label: "Going-in cap rate", value: "5.50%", flagged: false, page: "" },
      { label: "Units", value: "100", flagged: false, page: "" },
    ],
  },
});

const ROWS: Row[] = [
  ...Array.from({ length: 8 }, (_, i) => deal(i, "u1")),
  // a teammate's screens and the reader's other market are no part of it
  deal(20, "mate"),
  deal(21, "mate"),
  deal(30, "u1", "Phoenix, AZ"),
  { ...deal(40, "u1"), extraction: null },
];

describe("the market memory's one read", () => {
  it("is every one of the reader's own screens, past one response's rows", async () => {
    const { client } = fakeDb(ROWS);
    const { data, error } = await readMarketMemory(client, "u1");
    expect(error).toBeNull();
    expect(data?.map((r) => r.id).sort()).toEqual([...Array.from({ length: 8 }, (_, i) => `d${i}`), "d30"].sort());
  });

  it("gives /market and the deal page's strip one count for one market", async () => {
    const { client } = fakeDb(ROWS);
    const all = (await readMarketMemory(client, "u1")).data!;
    const dallas = summarizeMarkets(buildComps(all)).find((g) => g.market.startsWith("Dallas"))!;
    expect(dallas.count).toBe(8);
    // The strip on one of those deals: the same group less the deal itself.
    const keys = (await readMemoryKeys(client, "u1"))!;
    expect(keys).toHaveLength(9);
    const group = (await readMemoryGroup(client, keys, "d3", "multifamily", "Dallas, TX"))!;
    const strip = marketMemoryFor(buildComps(group), "d3", "multifamily", "Dallas, TX")!;
    expect(strip.count).toBe(dallas.count - 1);
  });

  it("is what both pages read, with no cut of their own", () => {
    const market = readFileSync("app/market/page.tsx", "utf8");
    expect(market).toContain("readMarketMemory(supabase, user.id)");
    expect(market).not.toMatch(/\.limit\(500\)/);
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toContain("readMemoryKeys(supabase, user.id)");
    expect(page).toContain("readMemoryGroup(supabase,");
    expect(page).not.toMatch(/ext_class:extraction->>assetClass"\)\s*\.eq\("user_id", user\.id\)/);
  });
});
