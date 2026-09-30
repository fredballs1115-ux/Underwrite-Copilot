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
      current_year: 2026,
      occupancy: "tenant_occupied",
    });
    expect(o["ca-la-rso-coverage"]).toBe("not_applicable"); // panels filter this out
    expect(o["ca-ab1482-rent-cap"]).toBe("applies");
  });
});

describe("the statewide caps' new-building exemptions roll forward every January 1", () => {
  // California's AB 1482 exempts housing whose certificate of occupancy is
  // under 15 years old, Washington's HB 1217 buildings under 12 (the rules'
  // own text) — windows that move each year. Encoded as fixed "permit after"
  // dates (2011, 2014) they were right for 2026 alone; as ages they read the
  // year the subject is evaluated in, to the year built.
  const tenant = { ...BASE, units: 4, occupancy: "tenant_occupied" };
  const ca = (built_year: number, current_year: number) =>
    outcomes({ ...tenant, state: "CA", locality: ["Fresno"], built_year, current_year })["ca-ab1482-rent-cap"];
  const wa = (built_year: number, current_year: number) =>
    outcomes({ ...tenant, state: "WA", locality: ["Spokane"], built_year, current_year })["wa-rent-cap-hb1217"];

  it("California in 2026: built 2012 is exempt, built 2011 is capped (the same answers the 2026 snapshot gave)", () => {
    expect(ca(2012, 2026)).toBe("exempt");
    expect(ca(2011, 2026)).toBe("applies");
  });

  it("California in 2027: the window has moved a year — built 2012 is capped now, built 2013 exempt", () => {
    expect(ca(2012, 2027)).toBe("applies");
    expect(ca(2013, 2027)).toBe("exempt");
  });

  it("Washington in 2026 and 2027: built 2015 is exempt, then capped; built 2016 exempt in 2027", () => {
    expect(wa(2015, 2026)).toBe("exempt");
    expect(wa(2014, 2026)).toBe("applies");
    expect(wa(2015, 2027)).toBe("applies");
    expect(wa(2016, 2027)).toBe("exempt");
  });

  it("buildSubject's injected year is the year the windows are read in", () => {
    const at = (currentYear: number) =>
      outcomes(
        buildSubject({
          address: { state: "CA", city: "Fresno" },
          sizeText: "4 units",
          yearBuilt: 2012,
          sectorFields: { will_owner_occupy: false },
          currentYear,
        }),
      )["ca-ab1482-rent-cap"];
    expect(at(2026)).toBe("exempt");
    expect(at(2027)).toBe("applies");
  });

  it("a permit year alone proves a young building young, and an old permit proves nothing", () => {
    const permitOnly = (building_permit_year: number, current_year: number) =>
      outcomes({ ...tenant, state: "CA", locality: ["Fresno"], building_permit_year, current_year })["ca-ab1482-rent-cap"];
    // Permitted 2016: finished no earlier, so under 15 years old in 2027.
    expect(permitOnly(2016, 2027)).toBe("exempt");
    // Permitted 2010: it may have been finished any year since.
    expect(permitOnly(2010, 2027)).toBe("possibly_applies");
  });

  it("the seed file carries no fixed 'built after' date for either window", () => {
    const rule = (id: string) => seedRules().find((r) => r.id === id)!;
    for (const id of ["ca-ab1482-rent-cap", "wa-rent-cap-hb1217"]) {
      const exempt = JSON.stringify(rule(id).exempt_if);
      expect(exempt, id).not.toContain("building_permit_issued_after");
      expect(exempt, id).toContain("building_age_years_lt");
      expect(rule(id).effect, id).not.toMatch(/snapshot/i);
    }
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
      ...BASE, state: "WA", locality: ["Seattle"], units: 3, built_year: 1980, current_year: 2026, occupancy: "tenant_occupied",
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

describe("boroughs are New York City (jurisdiction aliases)", () => {
  it("a Brooklyn deal sees the NYC rent-stabilization rule", () => {
    const o = outcomes({
      ...BASE, state: "NY", locality: ["Brooklyn", "Kings County"], units: 8, built_year: 1930,
    });
    expect(o["ny-nyc-rent-stabilization-coverage"]).toBe("applies");
  });
  it("Richmond VA never aliases into NYC — the alias table is state-guarded", () => {
    const o = outcomes({ ...BASE, state: "VA", locality: ["Richmond"], units: 4 });
    expect(o["ny-nyc-rent-stabilization-coverage"]).toBeUndefined();
    expect(o["va-no-local-rent-control"]).toBe("applies");
  });
});

describe("deal-facts answers: rolling age + owner-occupancy intent", () => {
  const moco = { ...BASE, state: "MD", locality: ["Montgomery County"] };
  it("MoCo: a 2010-build sits inside the under-23-years exemption in 2026", () => {
    const o = outcomes({ ...moco, units: 4, built_year: 2010, current_year: 2026 });
    expect(o["md-moco-rent-stabilization"]).toBe("exempt");
  });
  it("MoCo: a 1990 absentee triplex is capped; owner-occupying a duplex escapes", () => {
    const capped = outcomes({
      ...moco, units: 3, built_year: 1990, current_year: 2026, owner_occupied: false,
    });
    expect(capped["md-moco-rent-stabilization"]).toBe("applies");
    const duplex = outcomes({
      ...moco, units: 2, built_year: 1990, current_year: 2026, owner_occupied: true,
    });
    expect(duplex["md-moco-rent-stabilization"]).toBe("exempt");
  });
  it("without a current_year the rolling-age test stays an open question", () => {
    const o = outcomes({ ...moco, units: 4, built_year: 2010, owner_occupied: false });
    expect(o["md-moco-rent-stabilization"]).toBe("possibly_applies");
  });
  it("the owner_occupied boolean answers Chicago and Newark without an occupancy string", () => {
    const chi = outcomes({ ...BASE, state: "IL", locality: ["Chicago"], units: 3, owner_occupied: true });
    expect(chi["il-chicago-rlto-owner-occupied-exemption"]).toBe("exempt");
    const nwk = outcomes({ ...BASE, state: "NJ", locality: ["Newark"], units: 4, owner_occupied: false });
    expect(nwk["nj-newark-rent-control"]).toBe("applies");
  });
});

describe("buildSubject deal-facts wiring", () => {
  it("year_built + will_owner_occupy flow through; the deal-facts year beats the OM claim", () => {
    const s = buildSubject({
      address: { state: "NY", city: "Brooklyn" },
      sizeText: "8 units",
      yearBuilt: 1999, // the OM's (wrong) claim
      sectorFields: { year_built: 1930, will_owner_occupy: false },
      currentYear: 2026,
    });
    expect(s.built_year).toBe(1930);
    expect(s.owner_occupied).toBe(false);
    expect(s.current_year).toBe(2026);
    expect(outcomes(s)["ny-nyc-rent-stabilization-coverage"]).toBe("applies");
  });
  it("no answer means intent stays unknown — never a silent false", () => {
    const s = buildSubject({ address: { state: "IL", city: "Chicago" }, sizeText: "3 units" });
    expect(s.owner_occupied).toBeUndefined();
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

describe("a city's rules reach the city, not a county or a neighbour of its name (#452)", () => {
  const la = { ...BASE, state: "CA", units: 4, built_year: 1965 };
  const withUnknowns = (subject: RuleSubject, id: string) => evaluateRules(seedRules(), subject).find((e) => e.rule.id === id);

  it("Los Angeles County is not the City of Los Angeles: Pasadena reads no RSO once the Census names its city", () => {
    const pasadena = buildSubject({
      address: { state: "CA", city: "Pasadena", county: "Los Angeles County" },
      census: { place: { name: "Pasadena" }, county: { name: "Los Angeles County" } },
      sizeText: "4 units",
      yearBuilt: 1965,
    });
    expect(outcomes({ ...BASE, ...pasadena })["ca-la-rso-coverage"]).toBeUndefined();
    // AB 1482 is the state's and still reaches it.
    expect(outcomes({ ...BASE, ...pasadena })["ca-ab1482-rent-cap"]).toBeDefined();
  });

  it("a Van Nuys address is inside the City of Los Angeles whatever its postal city says", () => {
    const vanNuys = buildSubject({
      address: { state: "CA", city: "Van Nuys", county: "Los Angeles County" },
      census: { place: { name: "Los Angeles" }, county: { name: "Los Angeles County" } },
      sizeText: "4 units",
      yearBuilt: 1965,
    });
    expect(outcomes({ ...BASE, ...vanNuys })["ca-la-rso-coverage"]).toBe("applies");
  });

  it("before the Census answers, a Los Angeles County address that names another place is asked, not decided", () => {
    const e = withUnknowns({ ...la, locality: ["Van Nuys", "Los Angeles County"] }, "ca-la-rso-coverage");
    expect(e?.outcome).toBe("possibly_applies");
    expect(e?.unknowns[0]).toBe("within_city_limits");
    // The city itself, named: no question.
    expect(outcomes({ ...la, locality: ["Los Angeles", "Los Angeles County"] })["ca-la-rso-coverage"]).toBe("applies");
    // An unincorporated point is in no city.
    expect(outcomes({ ...la, locality: ["East Los Angeles", "Los Angeles County"], place: null })["ca-la-rso-coverage"]).toBeUndefined();
  });

  it("a neighbour whose name contains the city's is not the city", () => {
    expect(outcomes({ ...BASE, state: "CA", locality: ["South San Francisco", "San Mateo County"], units: 6, built_year: 1925 })["ca-sf-rent-ordinance"]).toBeUndefined();
    expect(outcomes({ ...BASE, state: "IL", locality: ["Chicago Heights", "Cook County"], units: 3 })["il-chicago-rlto-owner-occupied-exemption"]).toBeUndefined();
    expect(outcomes({ ...BASE, state: "NJ", locality: ["East Newark", "Hudson County"], units: 4 })["nj-newark-rent-control"]).toBeUndefined();
    expect(outcomes({ ...BASE, state: "NY", locality: ["New York Mills", "Oneida County"], units: 8, built_year: 1930 })["ny-nyc-rent-stabilization-coverage"]).toBeUndefined();
    expect(outcomes({ ...BASE, state: "NY", locality: ["York", "Livingston County"], units: 8, built_year: 1930 })["ny-nyc-rent-stabilization-coverage"]).toBeUndefined();
  });

  it("Baltimore County is not Baltimore City, and the Census's own county name places a Baltimore address", () => {
    const towson = { ...BASE, state: "MD", units: 4 };
    // A Parkville address mails as "Baltimore" and sits in Baltimore County.
    expect(outcomes({ ...towson, locality: ["Baltimore", "Baltimore County"] })["md-baltimore-rental-license"]).toBeUndefined();
    expect(outcomes({ ...towson, locality: ["Towson"], place: null })["md-baltimore-rental-license"]).toBeUndefined();
    const city = buildSubject({ address: { state: "MD", city: "Baltimore" }, census: { place: { name: "Baltimore" }, county: { name: "Baltimore city" } }, sizeText: "4 units" });
    expect(outcomes({ ...BASE, ...city })["md-baltimore-rental-license"]).toBeDefined();
  });

  it("a county's rules read the county the Census names where the address names none", () => {
    const rockville = buildSubject({
      address: { state: "MD", city: "Rockville" },
      census: { place: { name: "Rockville" }, county: { name: "Montgomery County" } },
      sizeText: "4 units",
      yearBuilt: 1990,
      currentYear: 2026,
    });
    expect(rockville.locality).toEqual(["Rockville", "Montgomery County"]);
    expect(outcomes({ ...BASE, ...rockville })["md-moco-rent-stabilization"]).toBeDefined();
  });

  it("a consolidated city-county's county name is the city, and a borough is New York", () => {
    expect(outcomes({ ...BASE, state: "PA", locality: ["Philadelphia County"], units: 4 })["pa-philadelphia-eviction-diversion"]).toBeDefined();
    expect(outcomes({ ...BASE, state: "NY", locality: ["Kings County"], units: 8, built_year: 1930 })["ny-nyc-rent-stabilization-coverage"]).toBeDefined();
    const brooklyn = buildSubject({ address: { state: "NY", city: "Brooklyn" }, census: { place: { name: "New York" }, county: { name: "Kings County" } }, sizeText: "8 units", yearBuilt: 1930 });
    expect(outcomes({ ...BASE, ...brooklyn })["ny-nyc-rent-stabilization-coverage"]).toBe("applies");
  });
});
