import { describe, expect, it } from "vitest";
import type { StructuredAddress } from "./address";
import {
  censusUrl,
  geocodeAddress,
  parseCensusOneline,
  parsePhoton,
  photonPrecision,
  photonUrl,
  type FetchLike,
} from "./geocode";

// ── fixtures: the services' real response shapes ─────────────────────────

const CENSUS_HIT = {
  result: {
    input: { address: { address: "4507 30th St, Mount Rainier, MD 20712" } },
    addressMatches: [
      {
        tigerLine: { side: "L", tigerLineId: "638062399" },
        coordinates: { x: -76.96508, y: 38.94131 },
        addressComponents: { zip: "20712", streetName: "30TH", city: "MOUNT RAINIER", state: "MD" },
        matchedAddress: "4507 30TH ST, MOUNT RAINIER, MD, 20712",
      },
    ],
  },
};
const CENSUS_MISS = { result: { input: {}, addressMatches: [] } };

const photon = (type: string, extra: Record<string, unknown> = {}) => ({
  features: [
    {
      geometry: { coordinates: [-76.9971, 38.9897] },
      properties: { type, name: "Georgia Avenue", city: "Silver Spring", ...extra },
    },
  ],
});

const ADDR: StructuredAddress = {
  label: "4507 30th St, Mount Rainier, MD 20712",
  street: "4507 30th St",
  city: "Mount Rainier",
  state: "MD",
  zip: "20712",
  county: "Prince George's County",
  submarket: "",
};

/** A fetch that answers by URL host, so the order of asking is observable. */
function fakeFetch(
  answers: { census?: unknown | Error; photon?: unknown | Error; photonArea?: unknown | Error },
  calls: string[] = [],
): FetchLike {
  return async (url) => {
    calls.push(url);
    let body: unknown | Error | undefined;
    const q = new URL(url).searchParams.get("q") ?? "";
    if (url.includes("census.gov")) body = answers.census;
    // The area-level last resort asks for "city, state" with no street.
    else if (url.includes("photon") && q === "Mount Rainier, MD") body = answers.photonArea;
    else if (url.includes("photon")) body = answers.photon;
    if (body instanceof Error) throw body;
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

// ── parsers ──────────────────────────────────────────────────────────────

describe("parseCensusOneline", () => {
  it("reads lat from y and lng from x — Census puts them the GIS way round", () => {
    const hit = parseCensusOneline(CENSUS_HIT)!;
    expect(hit.lat).toBeCloseTo(38.94131, 5);
    expect(hit.lng).toBeCloseTo(-76.96508, 5);
    expect(hit.matched).toBe("4507 30TH ST, MOUNT RAINIER, MD, 20712");
  });

  it("treats an empty addressMatches as a definitive miss", () => {
    expect(parseCensusOneline(CENSUS_MISS)).toBeNull();
  });

  it("never invents a point from a malformed or 0,0 answer", () => {
    expect(parseCensusOneline(null)).toBeNull();
    expect(parseCensusOneline({ result: { addressMatches: [{ coordinates: { x: "a", y: 1 } }] } })).toBeNull();
    expect(parseCensusOneline({ result: { addressMatches: [{ coordinates: { x: 0, y: 0 } }] } })).toBeNull();
  });
});

describe("parsePhoton + photonPrecision", () => {
  it("returns the point and the kind of thing matched", () => {
    const hit = parsePhoton(photon("street"))!;
    expect(hit.lat).toBeCloseTo(38.9897, 4);
    expect(hit.lng).toBeCloseTo(-76.9971, 4);
    expect(hit.type).toBe("street");
  });

  it("maps a house to street precision, a street to a block, anything else to an area", () => {
    expect(photonPrecision("house")).toBe("street");
    expect(photonPrecision("street")).toBe("block");
    for (const t of ["locality", "district", "city", "county", "postcode", "state", undefined]) {
      expect(photonPrecision(t)).toBe("area");
    }
  });

  it("drops non-finite coordinates", () => {
    expect(parsePhoton({ features: [{ geometry: { coordinates: [NaN, 1] } }] })).toBeNull();
    expect(parsePhoton({ features: [] })).toBeNull();
  });
});

describe("request URLs", () => {
  it("asks Census the current public benchmark, as JSON", () => {
    const u = new URL(censusUrl(ADDR.label));
    expect(u.hostname).toBe("geocoding.geo.census.gov");
    expect(u.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(u.searchParams.get("format")).toBe("json");
    expect(u.searchParams.get("address")).toBe(ADDR.label);
  });

  it("asks Photon for exactly one result", () => {
    expect(photonUrl("x")).toContain("limit=1");
  });
});

// ── the resolver ─────────────────────────────────────────────────────────

describe("geocodeAddress", () => {
  it("takes the Census match first for a street address, at street precision", async () => {
    const calls: string[] = [];
    const g = await geocodeAddress(ADDR, fakeFetch({ census: CENSUS_HIT }, calls));
    expect(g).toMatchObject({ source: "census", precision: "street" });
    expect(g!.lat).toBeCloseTo(38.94131, 5);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("census.gov");
  });

  it("falls to Photon when Census has no match — and reads precision off what Photon matched", async () => {
    const asStreet = await geocodeAddress(ADDR, fakeFetch({ census: CENSUS_MISS, photon: photon("street") }));
    expect(asStreet).toMatchObject({ source: "photon", precision: "block" });

    const asHouse = await geocodeAddress(ADDR, fakeFetch({ census: CENSUS_MISS, photon: photon("house") }));
    expect(asHouse).toMatchObject({ source: "photon", precision: "street" });

    const asCity = await geocodeAddress(ADDR, fakeFetch({ census: CENSUS_MISS, photon: photon("city") }));
    expect(asCity).toMatchObject({ source: "photon", precision: "area" });
  });

  it("never claims street precision for an address with no street, whatever Photon says", async () => {
    const noStreet = { ...ADDR, street: "", label: "Mount Rainier, MD" };
    const calls: string[] = [];
    // The label IS the "city, state" query here, so the fake answers it from
    // the area slot — and answers with a `house`, the most precise type
    // Photon has, to prove the input's missing street wins.
    const g = await geocodeAddress(noStreet, fakeFetch({ photonArea: photon("house") }, calls));
    expect(g).toMatchObject({ source: "photon", precision: "area" });
    // And Census was never asked: there is no door to find.
    expect(calls.some((u) => u.includes("census.gov"))).toBe(false);
    // Nor was the same query sent twice — the label and the area query are
    // one and the same string, so one call answers both.
    expect(calls).toHaveLength(1);
  });

  it("degrades to the city as an area-level last resort", async () => {
    const g = await geocodeAddress(
      ADDR,
      fakeFetch({ census: CENSUS_MISS, photon: { features: [] }, photonArea: photon("city") }),
    );
    expect(g).toMatchObject({ source: "photon", precision: "area" });
  });

  it("returns null on a definitive miss everywhere", async () => {
    const g = await geocodeAddress(
      ADDR,
      fakeFetch({ census: CENSUS_MISS, photon: { features: [] }, photonArea: { features: [] } }),
    );
    expect(g).toBeNull();
  });

  it("still answers from Photon when Census is down", async () => {
    const g = await geocodeAddress(
      ADDR,
      fakeFetch({ census: new Error("ECONNRESET"), photon: photon("house") }),
    );
    expect(g).toMatchObject({ source: "photon", precision: "street" });
  });

  it("THROWS, rather than reporting a miss, when every service failed to answer", async () => {
    // The caller must not cache "no such place" because the network was down.
    await expect(
      geocodeAddress(
        ADDR,
        fakeFetch({
          census: new Error("timeout"),
          photon: new Error("timeout"),
          photonArea: new Error("timeout"),
        }),
      ),
    ).rejects.toThrow(/every service failed/);
  });

  it("returns null for an address with no label at all", async () => {
    expect(await geocodeAddress(null)).toBeNull();
    expect(await geocodeAddress({ ...ADDR, label: "  " })).toBeNull();
  });
});
