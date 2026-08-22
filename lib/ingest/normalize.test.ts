import { describe, expect, it } from "vitest";
import {
  absenteeFlag,
  normalizeCookClass,
  normalizeNycBuildingClass,
  normalizeNycCategory,
  normalizePhillyCategory,
  numOrNull,
} from "./normalize";

describe("normalizePhillyCategory", () => {
  it("drops single-family and single condo units — the SFR gate", () => {
    expect(normalizePhillyCategory("SINGLE FAMILY").assetClass).toBeNull();
    expect(normalizePhillyCategory("Condominium").assetClass).toBeNull();
  });
  it("maps the investable classes", () => {
    expect(normalizePhillyCategory("MULTI FAMILY").assetClass).toBe("multifamily");
    expect(normalizePhillyCategory("Mixed Use").assetClass).toBe("mixed_use");
    expect(normalizePhillyCategory("INDUSTRIAL WAREHOUSE").assetClass).toBe("industrial");
    expect(normalizePhillyCategory("HOTELS AND APARTMENTS").assetClass).toBe("multifamily");
    expect(normalizePhillyCategory("VACANT LAND").assetClass).toBe("land");
    expect(normalizePhillyCategory("GARAGE - COMMERCIAL").assetClass).toBe("specialty");
  });
  it("unknown vocab falls to 'other' with the raw string kept — never invented", () => {
    const r = normalizePhillyCategory("WEIRD NEW CODE");
    expect(r.assetClass).toBe("other");
    expect(r.note).toContain("WEIRD NEW CODE");
  });
});

describe("normalizeNycCategory", () => {
  it("drops one-family, condo units, and co-op units", () => {
    expect(normalizeNycCategory("01 ONE FAMILY DWELLINGS").assetClass).toBeNull();
    expect(normalizeNycCategory("12 CONDOS - WALKUP APARTMENTS").assetClass).toBeNull();
    expect(normalizeNycCategory("09 COOPS - WALKUP APARTMENTS").assetClass).toBeNull();
  });
  it("keeps the investable classes", () => {
    expect(normalizeNycCategory("02 TWO FAMILY DWELLINGS").assetClass).toBe("multifamily");
    expect(normalizeNycCategory("07 RENTALS - WALKUP APARTMENTS").assetClass).toBe("multifamily");
    expect(normalizeNycCategory("21 OFFICE BUILDINGS").assetClass).toBe("office");
    expect(normalizeNycCategory("30 WAREHOUSES").assetClass).toBe("industrial");
    expect(normalizeNycCategory("31 COMMERCIAL VACANT LAND").assetClass).toBe("land");
  });
});

describe("normalizeNycBuildingClass", () => {
  it("A (one-family) and R (condo unit) drop; B/C/D are multifamily; S is mixed", () => {
    expect(normalizeNycBuildingClass("A4").assetClass).toBeNull();
    expect(normalizeNycBuildingClass("R4").assetClass).toBeNull();
    expect(normalizeNycBuildingClass("B1").assetClass).toBe("multifamily");
    expect(normalizeNycBuildingClass("C3").assetClass).toBe("multifamily");
    expect(normalizeNycBuildingClass("D7").assetClass).toBe("multifamily");
    expect(normalizeNycBuildingClass("S3").assetClass).toBe("mixed_use");
    expect(normalizeNycBuildingClass("V1").assetClass).toBe("land");
  });
});

describe("normalizeCookClass", () => {
  it("211/212 (2-6 unit) survive the residential drop; other 2xx fall", () => {
    expect(normalizeCookClass("211").assetClass).toBe("multifamily");
    expect(normalizeCookClass("212").assetClass).toBe("multifamily");
    expect(normalizeCookClass("203").assetClass).toBeNull();
    expect(normalizeCookClass("299").assetClass).toBeNull();
  });
  it("3xx multifamily and 5xx commercial are kept", () => {
    expect(normalizeCookClass("315").assetClass).toBe("multifamily");
    expect(normalizeCookClass("517").assetClass).toBe("commercial_retail");
  });
});

describe("absenteeFlag", () => {
  it("null when either side is missing", () => {
    expect(absenteeFlag("123 MAIN ST", null)).toBeNull();
    expect(absenteeFlag("", "PO BOX 9")).toBeNull();
  });
  it("same address (formatting aside) = not absentee", () => {
    expect(absenteeFlag("123 Main St", "123 MAIN STREET")).toBe(false);
  });
  it("different mailing address = absentee", () => {
    expect(absenteeFlag("123 Main St, Philadelphia", "PO BOX 552, WILMINGTON DE")).toBe(true);
  });
});

describe("numOrNull", () => {
  it("null-safe (no Number(null)=0 trap) and strips currency", () => {
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull("")).toBeNull();
    expect(numOrNull("$1,250,000")).toBe(1250000);
    expect(numOrNull("abc")).toBeNull();
  });
});
