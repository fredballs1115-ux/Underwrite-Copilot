import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The site-flags lookup against a registry that holds one state's zones —
// the shape the ingest leaves by default (scripts/ingest/opportunity_zones.ts
// loads Maryland's unless a national layer is set). A tract elsewhere that is
// missing from it must read as not checked, never as "not in a zone".

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/public-comps/run", () => ({ geocode: vi.fn(async () => null) }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeSiteFlags } from "./run";
import { SITE_FLAGS_V } from "./core";

type ZoneRow = { zone_type: string; tract_geoid: string; source_dataset: string };

/** A fake of the admin client's query builder over `incentive_zones`: the
 *  filters the lookup uses (`eq`, `like` with a trailing %), `limit`, and a
 *  head-only count. `failCount` makes the count read error. */
function fakeAdmin(rows: ZoneRow[], opts: { failCount?: boolean } = {}) {
  const likes: string[] = [];
  const client = {
    likes,
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
            resolve(opts.failCount ? { data: null, count: null, error: { message: "boom" } } : { data: null, count: hit.length, error: null });
          } else {
            resolve({ data: hit.slice(0, limit), error: null });
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

/** The Census geocoder's geographies answer for a tract, and FEMA's for no zone. */
function stubFetch(tract: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("geocoding.geo.census.gov")
        ? { result: { geographies: { "Census Tracts": [{ GEOID: tract }], Counties: [{ NAME: "Somewhere County", GEOID: tract.slice(0, 5) }] } } }
        : u.includes("?f=json")
          ? { layers: [{ id: 28, name: "Flood Hazard Zones" }] }
          : { features: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("computeSiteFlags — the Opportunity Zone answer is the tract's own state's", () => {
  let admin: ReturnType<typeof fakeAdmin>;
  beforeEach(() => {
    admin = fakeAdmin(REGISTRY);
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => admin as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a Texas tract against a registry of Maryland's zones is not checked, never 'not in a zone'", async () => {
    stubFetch("48085030100");
    const r = await computeSiteFlags({ label: "5000 Main St, Frisco, TX 75034", subject: { lat: 33.15, lng: -96.82 } });
    expect(r.status).toBe("ok");
    expect(r.tractGeoid).toBe("48085030100");
    expect(r.opportunityZone).toBe("unchecked");
    expect(r.opportunityZoneUnchecked).toBe("state_not_loaded");
    // The count was of Texas's zones, by the GEOID's state digits.
    expect(admin.likes).toEqual(["48%"]);
    expect(r.v).toBe(SITE_FLAGS_V);
  });

  it("a Maryland tract off the list, with Maryland's zones on file, is not listed", async () => {
    stubFetch("24005400100");
    const r = await computeSiteFlags({ label: "1 W Pennsylvania Ave, Towson, MD 21204", subject: { lat: 39.4, lng: -76.6 } });
    expect(r.opportunityZone).toBeNull();
    expect(r.opportunityZoneUnchecked).toBeUndefined();
    expect(admin.likes).toEqual(["24%"]);
  });

  it("a Maryland tract on the list names its source, and asks for no count", async () => {
    stubFetch("24510040100");
    const r = await computeSiteFlags({ label: "100 Light St, Baltimore, MD 21202", subject: { lat: 39.28, lng: -76.61 } });
    expect(r.opportunityZone).toEqual({ sourceDataset: MD_DATASET });
    expect(admin.likes).toEqual([]);
  });

  it("a count that cannot be read is no answer, and a point with no tract says so", async () => {
    admin = fakeAdmin(REGISTRY, { failCount: true });
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => admin as never);
    stubFetch("24005400100");
    const failed = await computeSiteFlags({ label: "1 W Pennsylvania Ave, Towson, MD 21204", subject: { lat: 39.4, lng: -76.6 } });
    expect(failed.opportunityZone).toBe("unchecked");
    expect(failed.opportunityZoneUnchecked).toBe("lookup_failed");

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
