import { describe, expect, it } from "vitest";
import {
  evaluateRules,
  isStale,
  jurisdictionMatches,
  vsRange,
  type RegulatoryRule,
  type RuleSubject,
} from "./research";

const dcCoverage: RegulatoryRule = {
  id: "dc-rent-stab-coverage",
  jurisdiction_state: "DC",
  jurisdiction_local: "Washington",
  rule_type: "rent_control_coverage",
  applies_if: { building_permit_issued_on_or_before: "1975-12-31" },
  exempt_if: null,
  effect: "pre-1976 stock rent-stabilized",
  source: "https://code.dccouncil.gov/us/dc/council/code/sections/42-3502.05",
  as_of: "2026-07-16",
  status: "verified",
};

const dcSmallLandlord: RegulatoryRule = {
  id: "dc-rent-stab-small-landlord-exemption",
  jurisdiction_state: "DC",
  jurisdiction_local: "Washington",
  rule_type: "rent_control_exemption",
  applies_if: { building_permit_issued_on_or_before: "1975-12-31" },
  exempt_if: {
    units_lte: 4,
    owner_is_natural_person: true,
    owner_other_rental_units_in_dc: 0,
    exemption_registered_with_rad: true,
  },
  effect: "natural-person ≤4 unit exemption",
  source: "https://code.dccouncil.gov/us/dc/council/code/sections/42-3502.05",
  as_of: "2026-07-16",
  status: "verified",
};

const pgExemption: RegulatoryRule = {
  id: "md-pg-prsa-small-landlord-exemption",
  jurisdiction_state: "MD",
  jurisdiction_local: "Prince George's County",
  rule_type: "rent_control_exemption",
  applies_if: { property_type: "rental_housing" },
  exempt_if: {
    owner_total_rental_units_in_county_lte: 5,
    owner_form_any_of: ["natural_person", "living_trust_of_natural_person"],
  },
  effect: "PRSA natural-person ≤5 unit exemption",
  source: "https://www.princegeorgescountymd.gov/",
  as_of: "2026-07-16",
  status: "sourced",
};

const etpa: RegulatoryRule = {
  id: "ny-etpa-product-class-carveout",
  jurisdiction_state: "NY",
  jurisdiction_local: null,
  rule_type: "rent_control_coverage",
  applies_if: { units_gte: 6, built_before: "1974-01-01", municipality_adopted_etpa: true },
  exempt_if: { units_lte: 5 },
  effect: "ETPA cannot reach 2-4 unit product",
  source: "https://hcr.ny.gov/",
  as_of: "2026-07-16",
  status: "sourced",
};

const dcRowhouse: RuleSubject = {
  state: "DC",
  locality: ["Washington", "District of Columbia"],
  units: 4,
  building_permit_year: 1922,
  property_type: "rental_housing",
};

describe("jurisdictionMatches", () => {
  it("matches DC by state alone (one jurisdiction)", () => {
    expect(jurisdictionMatches(dcCoverage, dcRowhouse)).toBe(true);
    expect(
      jurisdictionMatches(dcCoverage, { state: "District of Columbia", locality: [] })
    ).toBe(true);
  });
  it("rejects wrong state and matches statewide rules anywhere in-state", () => {
    expect(jurisdictionMatches(pgExemption, dcRowhouse)).toBe(false);
    expect(jurisdictionMatches(etpa, { state: "NY", locality: ["Albany"] })).toBe(true);
  });
  it("matches county names loosely (apostrophes, 'County' suffix)", () => {
    expect(
      jurisdictionMatches(pgExemption, {
        state: "Maryland",
        locality: ["Mount Rainier", "Prince Georges County"],
      })
    ).toBe(true);
  });
});

describe("evaluateRules — DC rent stabilization", () => {
  it("pre-1976 + natural person + registered → exemption rule says exempt", () => {
    const out = evaluateRules([dcCoverage, dcSmallLandlord], {
      ...dcRowhouse,
      owner_is_natural_person: true,
      owner_other_rental_units_in_dc: 0,
      exemption_registered_with_rad: true,
    });
    expect(out.find((r) => r.rule.id === dcCoverage.id)?.outcome).toBe("applies");
    expect(out.find((r) => r.rule.id === dcSmallLandlord.id)?.outcome).toBe("exempt");
  });

  it("LLC buyer cannot take the exemption — rule APPLIES", () => {
    const out = evaluateRules([dcSmallLandlord], {
      ...dcRowhouse,
      owner_is_natural_person: false,
      owner_other_rental_units_in_dc: 0,
      exemption_registered_with_rad: true,
    });
    expect(out[0].outcome).toBe("applies");
  });

  it("post-1975 permit → coverage not applicable at all", () => {
    const out = evaluateRules([dcCoverage], { ...dcRowhouse, building_permit_year: 1994 });
    expect(out[0].outcome).toBe("not_applicable");
  });

  it("unknown permit year → possibly_applies, and the unknown is NAMED", () => {
    const out = evaluateRules([dcCoverage], { ...dcRowhouse, building_permit_year: undefined });
    expect(out[0].outcome).toBe("possibly_applies");
    expect(out[0].unknowns).toContain("building_permit_issued_on_or_before");
  });

  it("missing buyer profile never silently exempts", () => {
    const out = evaluateRules([dcSmallLandlord], dcRowhouse); // no owner fields
    expect(out[0].outcome).toBe("possibly_applies");
    expect(out[0].unknowns).toContain("owner_is_natural_person");
  });
});

describe("evaluateRules — PG County PRSA", () => {
  const pgFourplex: RuleSubject = {
    state: "MD",
    locality: ["Hyattsville", "Prince George's County"],
    units: 4,
    property_type: "rental_housing",
  };
  it("natural person with ≤5 county units → exempt (no domicile condition)", () => {
    const out = evaluateRules([pgExemption], {
      ...pgFourplex,
      owner_total_rental_units_in_county: 4,
      owner_form: "natural_person",
    });
    expect(out[0].outcome).toBe("exempt");
  });
  it("sixth county unit breaks the exemption", () => {
    const out = evaluateRules([pgExemption], {
      ...pgFourplex,
      owner_total_rental_units_in_county: 6,
      owner_form: "natural_person",
    });
    expect(out[0].outcome).toBe("applies");
  });
});

describe("evaluateRules — NY ETPA carve-out", () => {
  it("a 3-unit Albany building is outside ETPA (not_applicable)", () => {
    const out = evaluateRules([etpa], {
      state: "NY",
      locality: ["Albany"],
      units: 3,
      built_year: 1930,
      municipality_adopted_etpa: false,
    });
    expect(out[0].outcome).toBe("not_applicable");
  });
});

describe("staleness + ranges", () => {
  it("flags >180 days", () => {
    const today = new Date("2026-08-21");
    expect(isStale("2026-07-16", today)).toBe(false);
    expect(isStale("2025-12-01", today)).toBe(true);
    expect(isStale("garbage", today)).toBe(true);
  });
  it("vsRange handles open-ended and null ranges", () => {
    expect(vsRange(500, 400, 600)).toBe("within");
    expect(vsRange(300, 400, 600)).toBe("below");
    expect(vsRange(700, 400, 600)).toBe("above");
    expect(vsRange(700, null, null)).toBe("no_range");
    expect(vsRange(700, 400, null)).toBe("within");
  });
});
