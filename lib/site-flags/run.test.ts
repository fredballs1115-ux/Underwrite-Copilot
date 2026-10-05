import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The site-flags lookup's Opportunity Zone answer (#473): the CDFI Fund's
// list of every designated tract (lib/qoz, the real vendored list) answers
// for every state, checked by the 2010 tract number the zones were
// designated on; the registry the ingest loads (Maryland's zones by
// default) is asked for a tract the list does not name.

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/public-comps/run", () => ({ geocode: vi.fn(async () => null) }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeSiteFlags } from "./run";
import { SITE_FLAGS_V } from "./core";
import { QOZ_DATASET } from "@/lib/qoz";

type ZoneRow = { zone_type: string; tract_geoid: string; source_dataset: string };

/** A fake of the admin client's query builder over `incentive_zones`: the
 *  filters the lookup uses (`eq`, `like` with a trailing %), `limit`, and a
 *  head-only count. `failRead` makes the row read error; `reads` counts the
 *  registry's reads. */
function fakeAdmin(rows: ZoneRow[], opts: { failRead?: boolean } = {}) {
  const likes: string[] = [];
  const client = {
    likes,
    reads: 0,
    from(table: string) {
      expect(table).toBe("incentive_zones");
      const filters: ((r: ZoneRow) => boolean)[] = [];
      let head = false;
      let limit = Infinity;
      const builder = {
        select(_cols: string, o?: { count?: string; head?: boolean }) {
          head = !!o?.head;
          return builder;
        },
        eq(col: keyof ZoneRow, v: string) {
          filters.push((r) => r[col] === v);
          return builder;
        },
        like(col: keyof ZoneRow, pattern: string) {
          likes.push(pattern);
          expect(pattern).toMatch(/^\d{2}%$/);
          const prefix = pattern.slice(0, -1);
          filters.push((r) => String(r[col]).startsWith(prefix));
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        then(resolve: (v: unknown) => void) {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (head) {
            resolve({ data: null, count: hit.length, error: null });
          } else {
            client.reads += 1;
            resolve(opts.failRead ? { data: null, error: { message: "boom" } } : { data: hit.slice(0, limit), error: null });
          }
        },
      };
      return builder;
    },
  };
  return client;
}

const MD_DATASET = "Maryland Opportunity Zones (Socrata hu7s-ph9b)";
const REGISTRY: ZoneRow[] = [
  { zone_type: "opportunity_zone", tract_geoid: "24510040100", source_dataset: MD_DATASET },
  { zone_type: "opportunity_zone", tract_geoid: "24033805903", source_dataset: MD_DATASET },
];

/** The Census geocoder's geographies answer for a tract — `tract2010` for
 *  its 2010 vintage (the same tract unless given; "fail" answers a 503) —
 *  and FEMA's for no zone. */
function stubFetch(tract: string, tract2010: string | "fail" = tract) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const is2010 = u.includes("vintage=Census2010_Current");
      if (is2010 && tract2010 === "fail") return new Response("down", { status: 503 });
      const t = is2010 ? tract2010 : tract;
      const body = u.includes("geocoding.geo.census.gov")
        ? { result: { geographies: { "Census Tracts": [{ GEOID: t }], Counties: [{ NAME: "Somewhere County", GEOID: t.slice(0, 5) }] } } }
        : u.includes("?f=json")
          ? { layers: [{ id: 28, name: "Flood Hazard Zones" }] }
          : { features: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("computeSiteFlags — the Opportunity Zone answer, from the national list and the registry", () => {
  let admin: ReturnType<typeof fakeAdmin>;
  beforeEach(() => {
    admin = fakeAdmin(REGISTRY);
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => admin as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a tract off the national list is off it in any state, where the registry held one state alone", async () => {
    stubFetch("48085030100");
    const r = await computeSiteFlags({ label: "5000 Main St, Frisco, TX 75034", subject: { lat: 33.15, lng: -96.82 } });
    expect(r.status).toBe("ok");
    expect(r.tractGeoid).toBe("48085030100");
    expect(r.opportunityZone).toBeNull();
    expect(r.opportunityZoneUnchecked).toBeUndefined();
    // No count of the registry's zones: the list holds every state's.
    expect(admin.likes).toEqual([]);
    expect(r.v).toBe(SITE_FLAGS_V);
  });

  it("a tract on the national list is listed by it, and the registry is not asked", async () => {
    stubFetch("24510040100");
    const r = await computeSiteFlags({ label: "100 Light St, Baltimore, MD 21202", subject: { lat: 39.28, lng: -76.61 } });
    expect(r.opportunityZone).toEqual({ sourceDataset: QOZ_DATASET });
    expect(admin.reads).toBe(0);
  });

  it("checks the zone by the 2010 tract it was designated on, not the current number", async () => {
    // Frisco as the runner printed it: the 2010 tract and the current one
    // differ. The list's Collin County tract is found by its 2010 number.
    stubFetch("48085032099", "48085032013");
    const r = await computeSiteFlags({ label: "5000 Main St, Frisco, TX 75034", subject: { lat: 33.1507, lng: -96.8236 } });
    expect(r.tractGeoid).toBe("48085032099");
    expect(r.ozTract).toEqual({ geoid: "48085032013", vintage: "2010" });
    expect(r.opportunityZone).toEqual({ sourceDataset: QOZ_DATASET });
  });

  it("asks the registry for a tract the list does not name", async () => {
    stubFetch("24033805903");
    const r = await computeSiteFlags({ label: "1 Main St, Upper Marlboro, MD 20772", subject: { lat: 38.8, lng: -76.75 } });
    expect(r.opportunityZone).toEqual({ sourceDataset: MD_DATASET });
    expect(admin.reads).toBe(1);
  });

  it("falls back to the current number where the 2010 call fails, and says which it read", async () => {
    stubFetch("24005400100", "fail");
    const r = await computeSiteFlags({ label: "1 W Pennsylvania Ave, Towson, MD 21204", subject: { lat: 39.4, lng: -76.6 } });
    expect(r.ozTract).toEqual({ geoid: "24005400100", vintage: "current" });
    expect(r.opportunityZone).toBeNull();
    expect(r.error).toBeUndefined();
  });

  it("a registry that cannot be read leaves the list's answer; a point with no tract says so", async () => {
    admin = fakeAdmin(REGISTRY, { failRead: true });
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => admin as never);
    stubFetch("24005400100");
    const failed = await computeSiteFlags({ label: "1 W Pennsylvania Ave, Towson, MD 21204", subject: { lat: 39.4, lng: -76.6 } });
    expect(failed.opportunityZone).toBeNull();

    stubFetch("not-a-tract");
    const noTract = await computeSiteFlags({ label: "Somewhere, MD", subject: { lat: 39.4, lng: -76.6 } });
    expect(noTract.tractGeoid).toBeNull();
    expect(noTract.opportunityZone).toBe("unchecked");
    expect(noTract.opportunityZoneUnchecked).toBe("no_tract");

    // The Census geocoder failing is not "no tract here": said as the failure.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const failedTract = await computeSiteFlags({ label: "Somewhere, MD", subject: { lat: 39.4, lng: -76.6 } });
    expect(failedTract.opportunityZone).toBe("unchecked");
    expect(failedTract.opportunityZoneUnchecked).toBe("tract_failed");
    expect(failedTract.error).toMatch(/^census tract: /);
  });
});
