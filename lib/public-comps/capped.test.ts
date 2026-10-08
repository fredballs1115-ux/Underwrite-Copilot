// A recorded-sales search that stopped at its source's limit (research pass
// 42, H6): the live providers ask for their 80 newest sales, the property
// database for its 80 nearest, and the page had said "N recorded sales
// within 1 mi · last 24 months" over whatever came back, as if it were every
// sale in the radius and the window.
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let rpcRows: Record<string, unknown>[] | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => (rpcRows ? { data: rpcRows, error: null } : { data: null, error: { message: "absent here" } }),
  }),
}));

import { PROVIDERS, STORED_COMPS, compsCutNote, compsScope, type RecordComp, type RecordCompsResult } from "./core";
import { computeRecordComps } from "./run";
import { RECORDED_SALES } from "@/lib/public-record-asks";
import { CompsResultView } from "@/app/(app)/comps/result-view";
import { visibleText } from "@/lib/render-lint";

const SUBJECT = { lat: 39.9526, lng: -75.1652 };
const day = (k: number) => new Date(Date.UTC(2026, 8, 30) - k * 86_400_000).toISOString().slice(0, 10);

/** n sales, newest first, each a little farther north of the subject (all
 *  inside the mile), as Philadelphia's Carto rows. */
const phillyRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    location: `${100 + i} N Broad St`,
    unit: "",
    sale_date: `${day(i)}T00:00:00Z`,
    sale_price: 400_000 + 1_000 * i,
    total_livable_area: 1_500,
    category_code_description: "MULTI FAMILY",
    parcel_number: `88${i}`,
    lat: SUBJECT.lat + 0.0001 * ((i * 37) % n),
    lng: SUBJECT.lng,
  }));

function stubFetch(rows: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("photon.komoot.io")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [SUBJECT.lng, SUBJECT.lat] },
                properties: { state: "Pennsylvania", city: "Philadelphia", county: "Philadelphia County" },
              },
            ],
          }),
        );
      }
      if (url.includes("phl.carto.com")) return new Response(JSON.stringify({ rows }));
      throw new Error(`unexpected ${url}`);
    }),
  );
}

const ASK = { label: "1400 N Broad St, Philadelphia, PA", state: "PA", city: "Philadelphia", county: "", assetClass: "multifamily" };

afterEach(() => {
  vi.unstubAllGlobals();
  rpcRows = null;
});

describe("each live provider says how many rows came back and in what order", () => {
  it("counts the rows a response carries, parsed or not", () => {
    const by = (id: string) => PROVIDERS.find((p) => p.id === id)!;
    expect(by("philly_opa").rowCount({ rows: [{}, {}, {}] })).toBe(3);
    expect(by("philly_opa").order).toBe("newest");
    expect(by("md_sdat").rowCount([{}, {}])).toBe(2);
    expect(by("md_sdat").order).toBe("newest");
    // New Jersey's query names no order: which sales come back is the service's.
    expect(by("nj_modiv").rowCount({ features: [{}] })).toBe(1);
    expect(by("nj_modiv").order).toBeNull();
    // and each asks for the one limit
    const q = { lat: 40, lng: -75, radiusKm: 1.6, monthsBack: 24, assetClass: "", nowIso: "2026-10-05T00:00:00Z" };
    expect(decodeURIComponent(by("philly_opa").buildUrl(q))).toContain(`LIMIT ${RECORDED_SALES.limit}`);
    expect(by("md_sdat").buildUrl(q)).toContain(`%24limit=${RECORDED_SALES.limit}`);
    expect(by("nj_modiv").buildUrl(q)).toContain(`resultRecordCount=${RECORDED_SALES.limit}`);
  });
});

describe("a live provider's newest 80", () => {
  it("is flagged capped, and the page says the window it covers, never the 24 months asked", async () => {
    stubFetch(phillyRows(RECORDED_SALES.limit));
    const r = await computeRecordComps(ASK);
    expect(r.status).toBe("ok");
    expect(r.capped).toBe(true);
    expect(r.sourceOrder).toBe("newest");
    expect(r.found).toBe(RECORDED_SALES.limit);
    expect(r.comps).toHaveLength(STORED_COMPS);
    expect(r.stats?.count).toBe(STORED_COMPS);
    const oldest = r.comps.map((c) => c.saleDate).sort()[0];
    const said = new Date(`${oldest}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    expect(compsScope(r)).toBe(`within 1 mi · sold since ${said} · multifamily/mixed`);
    expect(compsCutNote(r)).toBe(
      "The source returns its 80 newest sales a search and returned 80: older sales within 1 mi and the last 24 months were not read; the 40 nearest of the 80 found are kept.",
    );
    const text = visibleText(renderToStaticMarkup(React.createElement(CompsResultView, { result: r, subjectPrice: null }))).replace(/\s+/g, " ");
    expect(text).toContain(`40 recorded sales within 1 mi · sold since ${said} · multifamily/mixed — median`);
    expect(text).not.toContain("40 recorded sales within 1 mi · last 24 months");
    expect(text).toContain("older sales within 1 mi and the last 24 months were not read");
  });

  it("is not flagged where the source returned fewer than it asks for — and the stored cut is said", async () => {
    stubFetch(phillyRows(63));
    const r = await computeRecordComps(ASK);
    expect(r.capped).toBe(false);
    expect(r.found).toBe(63);
    expect(compsScope(r)).toBe("within 1 mi · last 24 months · multifamily/mixed");
    expect(compsCutNote(r)).toBe("The 40 nearest of the 63 found are kept.");
  });

  it("says nothing more where nothing was left out", async () => {
    stubFetch(phillyRows(12));
    const r = await computeRecordComps(ASK);
    expect(r.capped).toBe(false);
    expect(compsCutNote(r)).toBe("");
    const text = visibleText(renderToStaticMarkup(React.createElement(CompsResultView, { result: r, subjectPrice: null }))).replace(/\s+/g, " ");
    expect(text).toContain("12 recorded sales within 1 mi · last 24 months · multifamily/mixed");
  });
});

describe("the property database's nearest 80", () => {
  it("is flagged capped, and the page says the radius it reaches, never the mile asked", async () => {
    rpcRows = Array.from({ length: RECORDED_SALES.limit }, (_, i) => ({
      address: `${200 + i} Spring Garden St`,
      lat: SUBJECT.lat + 0.00005 * i,
      lng: SUBJECT.lng,
      sale_date: day(i * 3),
      price: 500_000,
      building_sf: 2_000,
      asset_class: "multifamily",
      source_url: "https://example.org/deed",
    }));
    stubFetch([]);
    const r = await computeRecordComps(ASK);
    expect(r.providerId).toBe("ingested_db");
    expect(r.capped).toBe(true);
    expect(r.sourceOrder).toBe("nearest");
    const far = Math.max(...r.comps.map((c: RecordComp) => c.distanceKm));
    expect(compsScope(r)).toBe(`within ${(far / 1.609344).toFixed(1)} mi · last 24 months · multifamily`);
    expect(compsCutNote(r)).toBe(
      "The property database returns its 80 nearest sales a search and returned 80: sales farther out, within 1 mi, were not read; the 40 nearest of the 80 found are kept.",
    );
  });
});

describe("a source that names no order", () => {
  it("says other sales may not have been read", () => {
    const r: Pick<RecordCompsResult, "params" | "capped" | "sourceOrder" | "comps" | "found" | "providerId"> = {
      params: { radiusKm: 1.6, monthsBack: 24, classFilter: "all sales" },
      capped: true,
      sourceOrder: null,
      comps: [],
      found: 0,
      providerId: "nj_modiv",
    };
    expect(compsCutNote(r)).toBe(
      "The source returns at most 80 sales a search, in no order it states, and returned 80: other sales within 1 mi and the last 24 months may not have been read.",
    );
  });

  it("reads a result stored before the flag as before", () => {
    const r = { params: { radiusKm: 1.6, monthsBack: 24, classFilter: "all sales" }, comps: [] };
    expect(compsScope(r)).toBe("within 1 mi · last 24 months · all sales");
    expect(compsCutNote(r)).toBe("");
  });
});
