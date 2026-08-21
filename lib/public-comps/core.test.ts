import { describe, expect, it } from "vitest";
import {
  compStats,
  finalizeComps,
  PROVIDERS,
  providerFor,
} from "./core";

const philly = PROVIDERS.find((p) => p.id === "philly_opa")!;
const dc = PROVIDERS.find((p) => p.id === "dc_its")!;
const md = PROVIDERS.find((p) => p.id === "md_sdat")!;

describe("providerFor — jurisdiction routing", () => {
  it("routes Philadelphia, DC, and any Maryland county; nothing for VA yet", () => {
    expect(providerFor({ state: "PA", city: "Philadelphia", county: "" })?.id).toBe("philly_opa");
    expect(providerFor({ state: "PA", city: "", county: "Philadelphia County" })?.id).toBe("philly_opa");
    expect(providerFor({ state: "PA", city: "Scranton", county: "Lackawanna" })).toBeNull();
    expect(providerFor({ state: "DC", city: "Washington", county: "" })?.id).toBe("dc_its");
    expect(providerFor({ state: "MD", city: "Hyattsville", county: "Prince George's County" })?.id).toBe("md_sdat");
    expect(providerFor({ state: "VA", city: "Woodbridge", county: "Prince William" })).toBeNull();
  });
});

describe("query builders — deterministic, correctly parameterized", () => {
  const q = {
    lat: 39.9526,
    lng: -75.1652,
    radiusKm: 1.6,
    monthsBack: 24,
    assetClass: "multifamily",
    nowIso: "2026-08-21T12:00:00.000Z",
  };
  it("philly: radius meters, since-date, multifamily filter, encoded SQL", () => {
    const url = philly.buildUrl(q);
    const sql = decodeURIComponent(url.split("?q=")[1]);
    expect(url.startsWith("https://phl.carto.com/api/v2/sql?q=")).toBe(true);
    expect(sql).toContain("ST_MakePoint(-75.1652, 39.9526)");
    expect(sql).toContain("1600");
    expect(sql).toContain("sale_date >= '2024-08-21'");
    expect(sql).toContain("ILIKE '%MULTI%'");
  });
  it("philly: no class filter for non-multifamily deals", () => {
    const sql = decodeURIComponent(philly.buildUrl({ ...q, assetClass: "retail" }).split("?q=")[1]);
    expect(sql).not.toContain("ILIKE");
  });
  it("dc: point-distance query with since-date", () => {
    const url = dc.buildUrl(q);
    expect(url).toContain("geometryType=esriGeometryPoint");
    expect(url).toContain("distance=1600");
    expect(decodeURIComponent(url).replace(/\+/g, " ")).toContain(
      "SALEDATE >= DATE '2024-08-21'"
    );
  });
  it("md: within_circle with compact date format", () => {
    const url = md.buildUrl(q);
    const decoded = decodeURIComponent(url.replace(/\+/g, " "));
    expect(decoded).toContain("within_circle(mdp_location, 39.9526, -75.1652, 1600)");
    expect(decoded).toContain(">= '20240821'");
  });
});

describe("parsers — fixture rows in, comps out, junk dropped", () => {
  it("philly rows parse; $-less and coordinate-less rows are dropped", () => {
    const out = philly.parse({
      rows: [
        {
          location: "922 ELLSWORTH ST",
          unit: "",
          sale_date: "2026-06-05T00:00:00Z",
          sale_price: "575000",
          total_livable_area: 1665,
          category_code_description: "MULTI FAMILY",
          parcel_number: "012345678",
          lat: 39.939,
          lng: -75.162,
        },
        { location: "BAD ROW", sale_price: null, lat: 39.9, lng: -75.1, sale_date: "2026-01-01" },
        { location: "NO COORDS", sale_price: 300000, lat: null, lng: null, sale_date: "2026-01-01" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      address: "922 ELLSWORTH ST",
      price: 575000,
      saleDate: "2026-06-05",
      sqft: 1665,
      propertyType: "MULTI FAMILY",
    });
    expect(out[0].sourceUrl).toContain("property.phila.gov");
  });
  it("dc features parse epoch-ms dates and fall back to geometry coords", () => {
    const out = dc.parse({
      features: [
        {
          attributes: {
            PREMISEADD: "1234 HARVARD ST NW",
            SALEDATE: Date.UTC(2026, 3, 15),
            SALEPRICE: 1150000,
            USECODE: "024",
            LANDAREA: 1800,
            LATITUDE: null,
            LONGITUDE: null,
          },
          geometry: { x: -77.036, y: 38.926 },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].saleDate).toBe("2026-04-15");
    expect(out[0].lat).toBeCloseTo(38.926);
  });
  it("md rows parse compact dates", () => {
    const out = md.parse([
      {
        premise_address_line_1: "4507 30TH ST",
        premise_address_city: "MOUNT RAINIER",
        sales_segment_1_transfer_date: "20260210",
        sales_segment_1_consideration: "610000",
        land_use_code: "R",
        mdp_latitude: "38.941",
        mdp_longitude: "-76.965",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ saleDate: "2026-02-10", price: 610000 });
  });
  it("all parsers survive garbage payloads", () => {
    for (const p of PROVIDERS) {
      expect(p.parse(null)).toEqual([]);
      expect(p.parse({})).toEqual([]);
      expect(p.parse("nonsense")).toEqual([]);
    }
  });
});

describe("finalizeComps + compStats", () => {
  const subject = { lat: 39.95, lng: -75.16 };
  const mk = (over: Partial<Parameters<typeof finalizeComps>[0][number]>) => ({
    address: "1 TEST ST",
    lat: 39.951,
    lng: -75.161,
    saleDate: "2026-01-01",
    price: 400000,
    sqft: 1600,
    propertyType: "MULTI FAMILY",
    sourceUrl: "https://example.gov",
    ...over,
  });
  it("dedupes address+date, drops out-of-radius, sorts nearest first", () => {
    const comps = finalizeComps(
      [
        mk({}),
        mk({}), // duplicate
        mk({ address: "2 FAR ST", lat: 40.05, lng: -75.16 }), // ~11km away
        mk({ address: "3 NEAR ST", lat: 39.9502, lng: -75.1601, price: 500000 }),
      ],
      subject,
      1.6
    );
    expect(comps.map((c) => c.address)).toEqual(["3 NEAR ST", "1 TEST ST"]);
    expect(comps[0].distanceKm).toBeLessThan(comps[1].distanceKm);
  });
  it("stats: median price + per-sqft only with 3+ measurable rows", () => {
    const comps = finalizeComps(
      [
        mk({ address: "A", price: 300000 }),
        mk({ address: "B", price: 400000 }),
        mk({ address: "C", price: 500000, sqft: null }),
      ],
      subject,
      1.6
    );
    const s = compStats(comps)!;
    expect(s.count).toBe(3);
    expect(s.medianPrice).toBe(400000);
    expect(s.medianPerSqft).toBeNull(); // only 2 rows have sqft
    expect(compStats([])).toBeUndefined();
  });
});
