import { describe, expect, it } from "vitest";
import { fieldsForAssetClass, parseSectorFields, SECTOR_FIELDS } from "./sector-fields";

describe("fieldsForAssetClass", () => {
  it("multifamily gets exactly its regulatory fields", () => {
    expect(fieldsForAssetClass("multifamily").map((f) => f.key)).toEqual(
      SECTOR_FIELDS.multifamily.map((f) => f.key)
    );
  });
  it("residential classes inherit the regulatory fields", () => {
    const keys = fieldsForAssetClass("sfr_btr").map((f) => f.key);
    expect(keys).toContain("building_permit_year");
    expect(keys).toContain("year_built");
  });
  it("auto (unset) still asks the regulatory questions; non-residential does not", () => {
    expect(fieldsForAssetClass("auto").map((f) => f.key)).toContain("building_permit_year");
    expect(fieldsForAssetClass("retail").map((f) => f.key)).not.toContain(
      "building_permit_year"
    );
  });
  it("unknown classes get no fields (no crash)", () => {
    expect(fieldsForAssetClass("weird_thing")).toEqual([]);
  });
});

describe("parseSectorFields", () => {
  it("keeps typed values, drops blanks — absence stays absence", () => {
    const out = parseSectorFields("multifamily", {
      building_permit_year: "1922",
      rad_exemption_registered: "",
      owner_units_in_jurisdiction: "",
      dealId: "x", // foreign keys ignored
    });
    expect(out).toEqual({ building_permit_year: 1922 });
  });
  it("three-way booleans: explicit no is kept, unknown is dropped", () => {
    expect(
      parseSectorFields("multifamily", { rad_exemption_registered: "false" })
    ).toEqual({ rad_exemption_registered: false });
    expect(parseSectorFields("multifamily", { rad_exemption_registered: "" })).toEqual({});
  });
  it("percent and currency-ish strings coerce; junk is dropped", () => {
    const out = parseSectorFields("self_storage", {
      unit_count: "240",
      occupancy_pct: "91.5%",
      climate_controlled_pct: "abc",
    });
    expect(out).toEqual({ unit_count: 240, occupancy_pct: 91.5 });
  });
  it("text is length-capped", () => {
    const out = parseSectorFields("retail", { tenant_credit: "x".repeat(500) });
    expect((out.tenant_credit as string).length).toBe(200);
  });
});
