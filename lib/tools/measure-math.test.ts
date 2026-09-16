import { describe, expect, it } from "vitest";
import { readLand, readSpace, SF_PER_ACRE } from "./measure-math";

const NO_LAND = {
  acres: null,
  landSf: null,
  buildingSf: null,
  units: null,
  spaces: null,
  farLimit: null,
};

const NO_SPACE = {
  grossSf: null,
  rentableSf: null,
  usableSf: null,
  rentPerRsf: null,
};

describe("readLand — acres and square feet are one measurement", () => {
  it("fills the square feet from the acres", () => {
    const r = readLand({ ...NO_LAND, acres: 2.5 });
    expect(r.landSf).toBe(108_900);
    expect(r.acres).toBe(2.5);
  });

  it("fills the acres from the square feet", () => {
    const r = readLand({ ...NO_LAND, landSf: 108_900 });
    expect(r.acres).toBe(2.5);
    expect(r.landSf).toBe(108_900);
  });

  it("the constant is the legal one", () => {
    expect(SF_PER_ACRE).toBe(43_560);
  });

  it("says nothing when both are given and they agree", () => {
    const r = readLand({ ...NO_LAND, acres: 2.5, landSf: 108_900 });
    expect(r.note).toBeNull();
    expect(r.landSf).toBe(108_900);
  });

  it("tolerates a rounded restatement", () => {
    // 108,900 stated as 109,000 is a rounding, not a different parcel.
    const r = readLand({ ...NO_LAND, acres: 2.5, landSf: 109_000 });
    expect(r.note).toBeNull();
  });

  it("names the gap when the two describe different parcels, and answers from the acreage", () => {
    const r = readLand({ ...NO_LAND, acres: 2.5, landSf: 100_000 });
    expect(r.note).toContain("108,900");
    expect(r.note).toContain("100,000");
    expect(r.landSf).toBe(108_900);
  });
});

describe("readLand — what the site carries", () => {
  const site = {
    ...NO_LAND,
    acres: 2.5,
    buildingSf: 217_800,
    units: 180,
    spaces: 270,
    farLimit: 2.5,
  };

  it("reads the floor area ratio off the gross building area", () => {
    // 217,800 on 108,900 is exactly 2.0.
    expect(readLand(site).far).toBe(2);
  });

  it("says what the limit allows and what is left", () => {
    const r = readLand(site);
    expect(r.allowedSf).toBe(272_250);
    expect(r.headroomSf).toBe(54_450);
  });

  it("reports a building over its limit as a NEGATIVE headroom, never clamped", () => {
    // A legal non-conforming building is a real condition, and hiding it
    // behind a zero is exactly the wrong answer for someone checking zoning.
    const r = readLand({ ...site, buildingSf: 300_000 });
    expect(r.headroomSf).toBe(-27_750);
    expect(r.far).toBe(2.75);
  });

  it("counts density per acre and land per unit", () => {
    const r = readLand(site);
    expect(r.unitsPerAcre).toBe(72);
    expect(r.landSfPerUnit).toBe(605);
  });

  it("gives the average unit off the gross area", () => {
    expect(readLand(site).avgUnitSf).toBe(1_210);
  });

  it("says parking both ways, because the two markets quote it differently", () => {
    const r = readLand(site);
    expect(r.spacesPerUnit).toBe(1.5);
    expect(r.spacesPer1000Sf).toBe(1.24);
  });

  it("a blank is null, never zero", () => {
    const r = readLand(NO_LAND);
    expect(r.acres).toBeNull();
    expect(r.landSf).toBeNull();
    expect(r.far).toBeNull();
    expect(r.headroomSf).toBeNull();
    expect(r.unitsPerAcre).toBeNull();
    expect(r.spacesPerUnit).toBeNull();
    expect(r.note).toBeNull();
  });

  it("gives the FAR without a limit, and the limit without a building", () => {
    expect(readLand({ ...NO_LAND, acres: 2.5, buildingSf: 217_800 }).far).toBe(2);
    expect(readLand({ ...NO_LAND, acres: 2.5, buildingSf: 217_800 }).headroomSf).toBeNull();
    expect(readLand({ ...NO_LAND, acres: 2.5, farLimit: 2.5 }).allowedSf).toBe(272_250);
    expect(readLand({ ...NO_LAND, acres: 2.5, farLimit: 2.5 }).headroomSf).toBeNull();
  });
});

describe("readSpace — the load factor, said the way a landlord says it", () => {
  const suite = { ...NO_SPACE, grossSf: 100_000, rentableSf: 11_500, usableSf: 10_000 };

  it("quotes the load off the usable foot", () => {
    // 11,500 rentable on 10,000 usable IS a 15% load factor.
    expect(readSpace(suite).loadFactorPct).toBe(15);
  });

  it("keeps the common-area share apart from it", () => {
    // The same building, the other arithmetic: common area is 13.0% of the
    // rentable foot. Both get called "the load factor" and they are never
    // the same number.
    const r = readSpace(suite);
    expect(r.commonAreaSharePct).toBe(13);
    expect(r.commonAreaSharePct).not.toBe(r.loadFactorPct);
  });

  it("reads efficiency off the gross area", () => {
    expect(readSpace({ ...suite, rentableSf: 92_000, usableSf: 80_000 }).efficiencyPct).toBe(92);
  });

  it("refuses a usable area larger than the rentable one", () => {
    const r = readSpace({ ...suite, rentableSf: 10_000, usableSf: 11_500 });
    expect(r.note).toContain("part of rentable area");
    expect(r.loadFactorPct).toBeNull();
    expect(r.rentPerUsf).toBeNull();
  });

  it("flags rentable above gross", () => {
    const r = readSpace({ ...NO_SPACE, grossSf: 10_000, rentableSf: 11_000, usableSf: 10_000 });
    expect(r.note).toContain("above gross");
  });
});

describe("readSpace — what the rent really is", () => {
  it("converts the quote to the foot a tenant can furnish", () => {
    const r = readSpace({ ...NO_SPACE, rentableSf: 11_500, usableSf: 10_000, rentPerRsf: 40 });
    expect(r.rentPerUsf).toBe(46);
  });

  it("the cheaper quote is the dearer space", () => {
    // The inversion the card exists for. A quotes $40 at an 18% load;
    // B quotes $42 at 10%. B looks dearer and is not.
    const a = readSpace({ ...NO_SPACE, rentableSf: 11_800, usableSf: 10_000, rentPerRsf: 40 });
    const b = readSpace({ ...NO_SPACE, rentableSf: 11_000, usableSf: 10_000, rentPerRsf: 42 });
    expect(a.loadFactorPct).toBe(18);
    expect(b.loadFactorPct).toBe(10);
    expect(a.rentPerUsf).toBe(47.2);
    expect(b.rentPerUsf).toBe(46.2);
    expect(a.rentPerUsf! > b.rentPerUsf!).toBe(true);
  });

  it("rent per usable foot is never below the quote", () => {
    for (const usable of [10_000, 9_500, 8_800, 10_000 - 1]) {
      const r = readSpace({ ...NO_SPACE, rentableSf: 10_000, usableSf: usable, rentPerRsf: 35 });
      expect(r.rentPerUsf).not.toBeNull();
      expect(r.rentPerUsf! >= 35).toBe(true);
    }
  });

  it("writes the cheque annually and monthly", () => {
    const r = readSpace({ ...NO_SPACE, rentableSf: 11_500, rentPerRsf: 40 });
    expect(r.annualRent).toBe(460_000);
    expect(r.monthlyRent).toBe(38_333);
  });

  it("a blank is null, never zero", () => {
    const r = readSpace(NO_SPACE);
    expect(r.efficiencyPct).toBeNull();
    expect(r.loadFactorPct).toBeNull();
    expect(r.rentPerUsf).toBeNull();
    expect(r.annualRent).toBeNull();
    expect(r.note).toBeNull();
  });

  it("gives the rent without a usable area, and the load without a rent", () => {
    expect(readSpace({ ...NO_SPACE, rentableSf: 11_500, rentPerRsf: 40 }).rentPerUsf).toBeNull();
    expect(readSpace({ ...NO_SPACE, rentableSf: 11_500, rentPerRsf: 40 }).annualRent).toBe(460_000);
    expect(readSpace({ ...NO_SPACE, rentableSf: 11_500, usableSf: 10_000 }).loadFactorPct).toBe(15);
  });
});
