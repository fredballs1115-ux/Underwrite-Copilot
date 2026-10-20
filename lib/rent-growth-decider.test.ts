import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_HOMES_RENT_LABEL, APARTMENT_RENT_LABEL, CPI_RENT_LABEL, readsNoRentIndex, rentGrowthDecider } from "./rent-growth-decider";

const ALL = [ALL_HOMES_RENT_LABEL, APARTMENT_RENT_LABEL, CPI_RENT_LABEL];
const pick = (cls: string, labels = ALL) => {
  const d = rentGrowthDecider(cls, labels);
  return d ? labels[d.index] : null;
};

describe("one rent-growth decider for the stress test and the model's check (audit H1, M4, L4)", () => {
  it("holds an apartment building to Zillow's apartment rents, then all homes, then CPI rent", () => {
    expect(pick("multifamily")).toBe(APARTMENT_RENT_LABEL);
    expect(pick("multifamily", [ALL_HOMES_RENT_LABEL, CPI_RENT_LABEL])).toBe(ALL_HOMES_RENT_LABEL);
    expect(pick("multifamily", [CPI_RENT_LABEL])).toBe(CPI_RENT_LABEL);
    expect(rentGrowthDecider("multifamily", ALL)!.why).toBe("the figure for this kind of rent");
  });

  it("holds a rented house to all homes first, and never to the apartment index", () => {
    expect(pick("sfr_btr")).toBe(ALL_HOMES_RENT_LABEL);
    expect(pick("sfr_btr", [APARTMENT_RENT_LABEL])).toBeNull();
    expect(pick("sfr_btr", [CPI_RENT_LABEL])).toBe(CPI_RENT_LABEL);
  });

  it("names a park's, a student building's and a mixed-use building's figure as the closest published one, never as its kind of rent", () => {
    expect(pick("manufactured_housing")).toBe(ALL_HOMES_RENT_LABEL);
    expect(pick("student_housing")).toBe(APARTMENT_RENT_LABEL);
    expect(pick("mixed_use")).toBe(APARTMENT_RENT_LABEL);
    for (const cls of ["manufactured_housing", "student_housing", "mixed_use"]) {
      const d = rentGrowthDecider(cls, ALL)!;
      expect(d.why, cls).toMatch(/^the closest published figure/);
      expect(d.why, cls).not.toContain("the figure for this kind of rent");
    }
  });

  it("holds a commercial class to its lessors' national index", () => {
    const d = rentGrowthDecider("office", ["Rents charged by lessors of professional and office buildings, national (PPI)"])!;
    expect(d.name).toBe("the national index of rents charged by lessors of professional and office buildings");
  });

  it("says lodging and licensed care read no rent index", () => {
    expect(readsNoRentIndex("hospitality_str")).toBe(true);
    expect(readsNoRentIndex("senior_housing")).toBe(true);
    expect(readsNoRentIndex("multifamily")).toBe(false);
  });

  it("is the one order both readers use: neither keeps a copy of its own", () => {
    // The stress test reads it through lib/stress-deciders, the one module
    // of every row's deciding figure.
    for (const f of ["lib/stress-deciders.ts", "lib/model-vs-market.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toContain("rentGrowthDecider(");
      expect(s, f).not.toContain("RENT_GROWTH_DECIDERS");
    }
    expect(readFileSync("lib/stress-test.ts", "utf8")).toContain("rentGrowthDeciding(");
  });
});
