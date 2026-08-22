import { describe, expect, it } from "vitest";
import { absenteeFlag, normalizePhillyCategory, numOrNull } from "./normalize";

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
