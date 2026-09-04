import { describe, expect, it } from "vitest";
import {
  compStats,
  COVERAGE_DISCOVERY,
  COVERAGE_SUMMARY,
  finalizeComps,
  PROVIDERS,
  providerFor,
} from "./core";

const philly = PROVIDERS.find((p) => p.id === "philly_opa")!;
const dc = PROVIDERS.find((p) => p.id === "dc_its")!;
const md = PROVIDERS.find((p) => p.id === "md_sdat")!;
const nj = PROVIDERS.find((p) => p.id === "nj_modiv")!;

describe("providerFor — jurisdiction routing", () => {
  it("routes Philadelphia, DC, any Maryland county, and statewide NJ", () => {
    expect(providerFor({ state: "PA", city: "Philadelphia", county: "" })?.id).toBe("philly_opa");
    expect(providerFor({ state: "PA", city: "", county: "Philadelphia County" })?.id).toBe("philly_opa");
    expect(providerFor({ state: "PA", city: "Scranton", county: "Lackawanna" })).toBeNull();
    // DC deliberately routes to NOTHING. Its service's own layer list, read
    // from a live health probe, contains no layer 53 and no sales table at
    // all — Property_and_Land is cadastral. Routing there would send every DC
    // deal at a layer that does not exist; "no source wired yet" is the honest
    // answer until the real ITS sales endpoint is confirmed.
    expect(providerFor({ state: "DC", city: "Washington", county: "" })).toBeNull();
    expect(providerFor({ state: "MD", city: "Hyattsville", county: "Prince George's County" })?.id).toBe("md_sdat");
    expect(providerFor({ state: "NJ", city: "Trenton", county: "Mercer" })?.id).toBe("nj_modiv");
    expect(providerFor({ state: "VA", city: "Woodbridge", county: "Prince William" })).toBeNull();
  });
  it("discovery-mode providers are never routed to, even when they match", () => {
    // Fairfax matches a Fairfax deal but is unconfigured — must fall through.
    expect(providerFor({ state: "VA", city: "", county: "Fairfax County" })).toBeNull();
    expect(providerFor({ state: "PA", city: "Pittsburgh", county: "Allegheny" })).toBeNull();
    expect(providerFor({ state: "DE", city: "Wilmington", county: "New Castle" })).toBeNull();
  });
  it("coverage copy derives from the registry", () => {
    expect(COVERAGE_SUMMARY).toContain("New Jersey (statewide)");
    expect(COVERAGE_SUMMARY).toContain("Maryland (statewide)");
    // discovery jurisdictions never appear in the LIVE summary
    expect(COVERAGE_SUMMARY).not.toContain("Fairfax");
    expect(COVERAGE_DISCOVERY.map((p) => p.id)).toContain("va_fairfax");
  });
});

describe("NJ provider", () => {
  const q = {
    lat: 40.2206,
    lng: -74.7597,
    radiusKm: 1.6,
    monthsBack: 24,
    assetClass: "multifamily",
    nowIso: "2026-08-21T12:00:00.000Z",
  };
  it("builds a centroid point-distance query", () => {
    const url = nj.buildUrl(q);
    expect(url).toContain("Parcels_Composite_NJ_WM/FeatureServer/0/query");
    expect(url).toContain("returnCentroid=true");
    expect(url).toContain("distance=1600");
    expect(decodeURIComponent(url).replace(/\+/g, " ")).toContain(
      "DEED_DATE >= DATE '2024-08-21'"
    );
  });
  it("parses centroid features with epoch or string dates; junk dropped", () => {
    const out = nj.parse({
      features: [
        {
          attributes: {
            PROP_LOC: "12 MAIN ST",
            MUN_NAME: "TRENTON",
            SALE_PRICE: 450000,
            DEED_DATE: Date.UTC(2026, 1, 3),
            PROP_CLASS: "2",
          },
          centroid: { x: -74.76, y: 40.221 },
        },
        { attributes: { PROP_LOC: "NO PRICE", DEED_DATE: Date.UTC(2026, 1, 3) }, centroid: { x: -74.7, y: 40.2 } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      address: "12 MAIN ST, TRENTON",
      price: 450000,
      saleDate: "2026-02-03",
      propertyType: "class 2",
    });
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
  // Both of these were wrong until a live health probe returned the dataset's
  // real column list: there is no `mdp_location` and no `..._transfer_date`,
  // and the date column is named "..._yyyy_mm_dd_...", so the comparison is
  // an ISO date rather than the packed YYYYMMDD this used to send.
  it("md: within_circle on the real location column, ISO date bound", () => {
    const url = md.buildUrl(q);
    const decoded = decodeURIComponent(url.replace(/\+/g, " "));
    expect(decoded).toContain(
      "within_circle(mappable_latitude_and_longitude, 39.9526, -75.1652, 1600)",
    );
    expect(decoded).toContain(">= '2024-08-21'");
    expect(decoded).not.toContain("mdp_location");
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
  // Column names verbatim from the dataset's own schema, as returned by a live
  // health probe. The parser still accepts BOTH date shapes, because the probe
  // proved the names but not the format — so the packed form is exercised here
  // and the ISO form in the test below.
  it("md rows parse compact dates", () => {
    const out = md.parse([
      {
        mdp_street_address_mdp_field_address: "4507 30TH ST",
        mdp_street_address_city_mdp_field_city: "MOUNT RAINIER",
        sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89: "20260210",
        sales_segment_1_consideration_mdp_field_considr1_sdat_field_90: "610000",
        land_use_code_mdp_field_lu_desclu_sdat_field_50: "R",
        mdp_latitude_mdp_field_digycord_converted_to_wgs84: "38.941",
        mdp_longitude_mdp_field_digxcord_converted_to_wgs84: "-76.965",
        c_a_m_a_system_data_structure_area_sq_ft_mdp_field_sqftstrc_sdat_field_241: "2140",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      saleDate: "2026-02-10",
      price: 610000,
      address: "4507 30TH ST, MOUNT RAINIER",
      // Building area, newly available now the real column is known — this is
      // what lets a Maryland comp carry a $/SF at all.
      sqft: 2140,
    });
  });

  it("md rows parse ISO dates too, and a missing structure area stays null", () => {
    const out = md.parse([
      {
        mdp_street_address_mdp_field_address: "8100 GEORGIA AVE",
        mdp_street_address_city_mdp_field_city: "SILVER SPRING",
        sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89: "2026-02-10T00:00:00.000",
        sales_segment_1_consideration_mdp_field_considr1_sdat_field_90: "1250000",
        mdp_latitude_mdp_field_digycord_converted_to_wgs84: "39.001",
        mdp_longitude_mdp_field_digxcord_converted_to_wgs84: "-77.031",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].saleDate).toBe("2026-02-10");
    // Absent is absent: an unstated area must not become a zero that would
    // divide into a nonsense $/SF downstream.
    expect(out[0].sqft).toBeNull();
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
