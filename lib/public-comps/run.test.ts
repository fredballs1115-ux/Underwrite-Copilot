import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recorded-sales pull against a fake property database and a fake
// geocoder: a search the database answers with no sales is widened once and,
// where the database holds the address's market, said as none found under
// the database's name — never as "no source wired" (the comps research
// pass's H1: New York, Chicago, Seattle and Boston read "no source" on an
// empty answer).

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeRecordComps } from "./run";
import { noSalesSentence } from "./core";

type Row = Record<string, unknown>;

/** A fake admin client: `nearby_sales` answers from `answers` in turn (an
 *  Error makes that call fail), and `recorded_sales` holds `marketRows`. */
function fakeAdmin(answers: (Row[] | Error)[], marketRows: Row[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    calls,
    async rpc(name: string, args: Record<string, unknown>) {
      expect(name).toBe("nearby_sales");
      calls.push(args);
      const next = answers.shift() ?? [];
      return next instanceof Error ? { data: null, error: { message: next.message } } : { data: next, error: null };
    },
    from(table: string) {
      expect(table).toBe("recorded_sales");
      let market = "";
      const builder = {
        select: () => builder,
        eq(col: string, v: string) {
          expect(col).toBe("market");
          market = v;
          return builder;
        },
        limit: () => builder,
        then(resolve: (v: unknown) => void) {
          resolve({ data: marketRows.filter((r) => r.market === market).slice(0, 1), error: null });
        },
      };
      return builder;
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
  return client;
}

/** Photon's answer for the address: Brooklyn, New York. */
function photonAt(lat: number, lng: number, props: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ features: [{ geometry: { coordinates: [lng, lat] }, properties: props }] }))),
  );
}

beforeEach(() => {
  photonAt(40.69, -73.99, { state: "New York", city: "New York", county: "Kings County" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createSupabaseAdminClient).mockReset();
});

const brooklyn = { label: "100 Court St, Brooklyn, NY 11201", state: "NY", city: "Brooklyn", county: "Kings County" };

describe("an empty answer from the property database", () => {
  it("is widened once and said as none found in a market the database holds", async () => {
    const admin = fakeAdmin([[], []], [{ market: "nyc" }]);
    const r = await computeRecordComps(brooklyn);
    expect(admin.calls).toHaveLength(2);
    expect(admin.calls[1].in_radius_m).toBe(4800);
    expect(r.status).toBe("no_sales");
    expect(r.providerId).toBe("ingested_db");
    expect(r.dbMarket).toBe("New York City");
    expect(r.params).toMatchObject({ radiusKm: 4.8, monthsBack: 36 });
    expect(noSalesSentence(r)).toBe(
      "No recorded sales within 3 mi of the address in the last 36 months, in the property database's New York City records.",
    );
  });

  it("is no source where the database holds no sales for the market", async () => {
    fakeAdmin([[], []], []);
    const r = await computeRecordComps(brooklyn);
    expect(r.status).toBe("no_provider");
  });

  it("is no source where the lookup failed, never a claim of none found", async () => {
    fakeAdmin([new Error("down"), new Error("down")], [{ market: "nyc" }]);
    const r = await computeRecordComps(brooklyn);
    expect(r.status).toBe("no_provider");
  });

  it("keeps the sales a widened search found", async () => {
    const sale = (i: number): Row => ({
      address: `${i} Court St`,
      lat: 40.69 + i * 0.001,
      lng: -73.99,
      sale_date: "2026-05-01",
      price: 1_000_000 + i,
      building_sf: 5000,
      asset_class: "multifamily",
      source_url: "https://example.org/",
    });
    fakeAdmin([[], [sale(1), sale(2), sale(3)]], [{ market: "nyc" }]);
    const r = await computeRecordComps(brooklyn);
    expect(r.status).toBe("ok");
    expect(r.comps).toHaveLength(3);
    expect(r.params?.radiusKm).toBe(4.8);
  });
});
