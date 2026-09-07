import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "./address";
import {
  GEO_VERSION,
  cacheFresh,
  resolveDealLocation,
  type DealVisualCache,
} from "./deal-location";
import type { Geocoded } from "./geocode";

const ADDR: StructuredAddress = {
  label: "4507 30th St, Mount Rainier, MD 20712",
  street: "4507 30th St",
  city: "Mount Rainier",
  state: "MD",
  zip: "20712",
  county: "Prince George's County",
  submarket: "",
};

const CENSUS: Geocoded = {
  lat: 38.94131,
  lng: -76.96508,
  precision: "street",
  source: "census",
  matched: "4507 30TH ST",
};

/**
 * Just enough of the Supabase client for writeCache: a row whose `photo`
 * column can be read back and updated, with every write recorded.
 */
function fakeSupabase(initialPhoto: DealVisualCache | null) {
  const row = { photo: initialPhoto as DealVisualCache | null };
  const writes: DealVisualCache[] = [];
  const client = {
    from() {
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: { photo: row.photo } }) }; } };
        },
        update(patch: { photo: DealVisualCache }) {
          return { eq: async () => { row.photo = patch.photo; writes.push(patch.photo); return { data: null }; } };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, row, writes };
}

const NOW = Date.parse("2026-09-07T12:00:00Z");
const deps = (geocode: () => Promise<Geocoded | null>) => ({ geocode, now: () => NOW });

describe("cacheFresh", () => {
  it("is false for an entry written under older geocoding rules, however recent", () => {
    const recent = new Date(NOW - 1000).toISOString();
    expect(cacheFresh({ geoAt: recent, geoV: 1, lat: 1, lng: 1 }, NOW)).toBe(false);
    expect(cacheFresh({ geoAt: recent, lat: 1, lng: 1 }, NOW)).toBe(false);
    expect(cacheFresh({ geoAt: recent, geoV: GEO_VERSION, lat: 1, lng: 1 }, NOW)).toBe(true);
  });

  it("expires after thirty days", () => {
    const old = new Date(NOW - 31 * 86_400_000).toISOString();
    expect(cacheFresh({ geoAt: old, geoV: GEO_VERSION, lat: 1, lng: 1 }, NOW)).toBe(false);
  });
});

describe("resolveDealLocation", () => {
  it("records the precision the geocoder ANSWERED with, not the one the address implied", async () => {
    const { client, writes } = fakeSupabase(null);
    // A street address the geocoder could only place to the block.
    const blockHit: Geocoded = { ...CENSUS, precision: "block", source: "photon" };
    const loc = await resolveDealLocation(client, "d1", ADDR, null, deps(async () => blockHit));
    expect(loc).toMatchObject({ precision: "block" });
    expect(writes.at(-1)).toMatchObject({
      geoPrecision: "block",
      geoSource: "photon",
      geoV: GEO_VERSION,
      geoMiss: false,
    });
  });

  it("re-geocodes an entry cached under the old rules instead of trusting it", async () => {
    // The stale point is the one the old code would have produced: a street
    // centreline labelled as the building.
    const stale: DealVisualCache = {
      lat: 38.95,
      lng: -76.99,
      geoAt: new Date(NOW - 1000).toISOString(),
      geoPrecision: "street",
      // no geoV: written before versioning existed
    };
    const { client, writes } = fakeSupabase(stale);
    let asked = 0;
    const loc = await resolveDealLocation(client, "d1", ADDR, stale, deps(async () => { asked++; return CENSUS; }));
    expect(asked).toBe(1);
    expect(loc).toMatchObject({ lat: CENSUS.lat, lng: CENSUS.lng, precision: "street" });
    expect(writes.at(-1)).toMatchObject({ geoV: GEO_VERSION, geoSource: "census" });
  });

  it("serves a current cache entry without asking again", async () => {
    const current: DealVisualCache = {
      lat: CENSUS.lat,
      lng: CENSUS.lng,
      geoAt: new Date(NOW - 1000).toISOString(),
      geoPrecision: "street",
      geoSource: "census",
      geoV: GEO_VERSION,
    };
    const { client, writes } = fakeSupabase(current);
    let asked = 0;
    const loc = await resolveDealLocation(client, "d1", ADDR, current, deps(async () => { asked++; return CENSUS; }));
    expect(asked).toBe(0);
    expect(writes).toHaveLength(0);
    expect(loc).toMatchObject({ precision: "street" });
  });

  it("caches a definitive miss, so an unknown address costs one lookup", async () => {
    const { client, writes } = fakeSupabase(null);
    const loc = await resolveDealLocation(client, "d1", ADDR, null, deps(async () => null));
    expect(loc).toBeNull();
    expect(writes.at(-1)).toMatchObject({ geoMiss: true, geoV: GEO_VERSION });
    expect(writes.at(-1)!.lat).toBeUndefined();
  });

  it("never caches a network failure as a miss", async () => {
    const { client, writes } = fakeSupabase(null);
    const loc = await resolveDealLocation(client, "d1", ADDR, null, deps(async () => { throw new Error("every service failed"); }));
    expect(loc).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("merges over the ROW's current cache, not the caller's copy", async () => {
    // The clobber this guards: the geocoder wrote a fresh point, then a
    // Street View verdict was written by a caller still holding the OLD
    // cache. Before, the fresh point was lost. Now the row is read first.
    const staleCopy: DealVisualCache = { status: "none", checkedAt: "2026-01-01T00:00:00Z" };
    const { client, row, writes } = fakeSupabase(staleCopy);
    await resolveDealLocation(client, "d1", ADDR, staleCopy, deps(async () => CENSUS));
    // Now a second writer arrives with the stale copy and a verdict patch.
    const { writeCache } = await import("./deal-location");
    await writeCache(client, "d1", staleCopy, { status: "ok", checkedAt: "2026-09-07T12:00:00Z" });
    expect(row.photo).toMatchObject({
      lat: CENSUS.lat,      // survived
      lng: CENSUS.lng,      // survived
      status: "ok",         // applied
      geoV: GEO_VERSION,    // survived
    });
    expect(writes).toHaveLength(2);
  });

  it("returns null for a deal with no address, without touching the cache", async () => {
    const { client, writes } = fakeSupabase(null);
    expect(await resolveDealLocation(client, "d1", null, null, deps(async () => CENSUS))).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
