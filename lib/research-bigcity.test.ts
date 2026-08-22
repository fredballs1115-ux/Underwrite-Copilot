import { describe, expect, it } from "vitest";
import { evaluateRules, type RuleSubject } from "@/lib/research";
import { buildSubject, seedRules } from "@/lib/research-data";

// The big-city rule set (national expansion research, 2026-08-22): these are
// the load-bearing evaluations the homepage playground and deal panel lean
// on. Each test pins an outcome a real underwrite depends on.

const BASE: Partial<RuleSubject> = {
  property_type: "rental_housing",
  transaction: "sale_of_rental_housing_accommodation",
};

const outcomes = (subject: RuleSubject) =>
  Object.fromEntries(evaluateRules(seedRules(), subject).map((e) => [e.rule.id, e.outcome]));

describe("NYC", () => {
  it("a pre-1974 fourplex sits OUTSIDE rent stabilization (the small-building path)", () => {
    const o = outcomes({ ...BASE, state: "NY", locality: ["New York"], units: 4, built_year: 1930 });
    expect(o["ny-nyc-rent-stabilization-coverage"]).toBe("exempt");
  });
  it("a pre-1974 eight-unit building IS stabilized", () => {
    const o = outcomes({ ...BASE, state: "NY", locality: ["New York"], units: 8, built_year: 1930 });
    expect(o["ny-nyc-rent-stabilization-coverage"]).toBe("applies");
  });
  it("Good Cause exempts the <=10-unit statewide landlord, catches the 15-unit one", () => {
    const small = outcomes({
      ...BASE,
      state: "NY",
      locality: ["New York"],
      units: 4,
      built_year: 1985,
      owner_total_rental_units_in_state: 4,
    });
    expect(small["ny-good-cause-eviction"]).toBe("exempt");
    const big = outcomes({
      ...BASE,
      state: "NY",
      locality: ["New York"],
      units: 15,
      built_year: 1985,
      owner_total_rental_units_in_state: 15,
      occupancy: "tenant_occupied",
    });
    expect(big["ny-good-cause-eviction"]).toBe("applies");
  });
});

describe("New Jersey", () => {
  it("Jersey City exempts EVERY 1-4 unit building, no owner-occupancy needed", () => {
    const o = outcomes({ ...BASE, state: "NJ", locality: ["Jersey City"], units: 4, built_year: 1961 });
    expect(o["nj-jersey-city-rent-control"]).toBe("exempt");
  });
  it("a Jersey City six-unit pre-1987 building is rent-controlled", () => {
    const o = outcomes({ ...BASE, state: "NJ", locality: ["Jersey City"], units: 6, built_year: 1961 });
    expect(o["nj-jersey-city-rent-control"]).toBe("applies");
  });
  it("Newark's small-building exemption requires living there", () => {
    const owner = outcomes({
      ...BASE, state: "NJ", locality: ["Newark"], units: 4, occupancy: "owner_occupied",
    });
    expect(owner["nj-newark-rent-control"]).toBe("exempt");
    const absentee = outcomes({
      ...BASE, state: "NJ", locality: ["Newark"], units: 4, occupancy: "tenant_occupied",
    });
    expect(absentee["nj-newark-rent-control"]).toBe("applies");
  });
});

describe("California", () => {
  it("a 1965 LA fourplex is RSO stock, and AB 1482 stays an open question without occupancy facts", () => {
    const o = outcomes({
      ...BASE, state: "CA", locality: ["Los Angeles"], units: 4, built_year: 1965,
    });
    expect(o["ca-la-rso-coverage"]).toBe("applies");
    expect(o["ca-ab1482-rent-cap"]).toBe("possibly_applies");
  });
  it("a 1990 LA fourplex escapes the RSO but not AB 1482 (tenant-occupied)", () => {
    const o = outcomes({
      ...BASE,
      state: "CA",
      locality: ["Los Angeles"],
      units: 4,
      built_year: 1990,
      occupancy: "tenant_occupied",
    });
    expect(o["ca-la-rso-coverage"]).toBe("not_applicable"); // panels filter this out
    expect(o["ca-ab1482-rent-cap"]).toBe("applies");
  });
});

describe("Chicago", () => {
  it("owner-occupied three-flat is RLTO-exempt while the statewide no-rent-control rule still reads out", () => {
    const o = outcomes({
      ...BASE, state: "IL", locality: ["Chicago"], units: 3, occupancy: "owner_occupied",
    });
    expect(o["il-chicago-rlto-owner-occupied-exemption"]).toBe("exempt");
    expect(o["il-rent-control-preemption"]).toBe("applies");
  });
});

describe("San Francisco", () => {
  it("a 1925 six-unit is Rent Ordinance stock; a 1995 building escapes the caps", () => {
    const old = outcomes({ ...BASE, state: "CA", locality: ["San Francisco"], units: 6, built_year: 1925 });
    expect(old["ca-sf-rent-ordinance"]).toBe("applies");
    const newer = outcomes({ ...BASE, state: "CA", locality: ["San Francisco"], units: 6, built_year: 1995 });
    expect(newer["ca-sf-rent-ordinance"]).toBe("exempt");
  });
});

describe("statewide caps and preemptions", () => {
  it("WA HB 1217 catches a tenant-occupied 1980 triplex (no exemption path holds)", () => {
    const o = outcomes({
      ...BASE, state: "WA", locality: ["Seattle"], units: 3, built_year: 1980, occupancy: "tenant_occupied",
    });
    expect(o["wa-rent-cap-hb1217"]).toBe("applies");
  });
  it("covered no-cap jurisdictions surface for their markets", () => {
    // Covered-market jurisdictions only (per the 15-market scope).
    for (const [state, city, id] of [
      ["TX", "Dallas", "tx-rent-control-preemption"],
      ["GA", "Atlanta", "ga-rent-control-preemption"],
      ["FL", "Miami", "fl-rent-control-preemption"],
      ["DE", "Wilmington", "de-no-rent-control"],
    ] as const) {
      const o = outcomes({ ...BASE, state, locality: [city], units: 4 });
      expect(o[id]).toBe("applies");
    }
  });
});

describe("buildSubject portfolio totals", () => {
  it("propagates the in-jurisdiction answer to the statewide floor", () => {
    const s = buildSubject({
      address: { state: "NY", city: "New York" },
      sizeText: "4 units",
      sectorFields: { owner_units_in_jurisdiction: 2 },
    });
    expect(s.owner_total_rental_units_in_state).toBe(6);
  });
  it("ALWAYS counts the deal's own units — a 15-unit acquisition can't ride the small-landlord exemption via the default", () => {
    const s = buildSubject({ address: { state: "NY", city: "New York" }, sizeText: "15 units" });
    expect(s.owner_total_rental_units_in_state).toBe(15);
    const o = outcomes({
      ...BASE,
      state: "NY",
      locality: ["New York"],
      units: 15,
      built_year: 1985,
      owner_total_rental_units_in_state: 15,
    });
    // Not exempt; owner-occupancy is the one path left open, so it reads as
    // an open question rather than a silent pass either way.
    expect(o["ny-good-cause-eviction"]).toBe("possibly_applies");
  });
});
