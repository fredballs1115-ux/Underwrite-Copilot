import { describe, expect, it } from "vitest";
import rulesFile from "@/data/research/regulatory_rules.json";
import {
  evaluateRules,
  jurisdictionMatches,
  OPEN_QUESTION_LABELS,
  RULE_UNVERIFIED,
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

// The batch-2 audit: the regulation panel said an unverified rule possibly
// applies while the rules panel beside it said "Applies" with an
// "unverified" badge. The evaluation itself now says it, for every surface.
describe("evaluateRules — a rule the site has not verified", () => {
  it("possibly applies where it would apply, and says why; a verified rule is unchanged", () => {
    const subject = { ...dcRowhouse, building_permit_year: 1960 };
    const unverified = { ...dcCoverage, id: "unverified-coverage", status: "unverified_not_found" as const };
    const sourceless = { ...dcCoverage, id: "sourceless-coverage", source: "" };
    const out = evaluateRules([dcCoverage, unverified, sourceless], subject);
    expect(out.find((r) => r.rule.id === dcCoverage.id)).toMatchObject({ outcome: "applies" });
    for (const id of ["unverified-coverage", "sourceless-coverage"]) {
      const e = out.find((r) => r.rule.id === id)!;
      expect(e.outcome, id).toBe("possibly_applies");
      expect(e.unknowns[0], id).toBe(RULE_UNVERIFIED);
    }
    expect(OPEN_QUESTION_LABELS[RULE_UNVERIFIED]).toBe("the ordinance itself, which the site has not verified");
    // A rule that reaches no deal stays not applicable, verified or not.
    expect(evaluateRules([unverified], { ...dcRowhouse, building_permit_year: 1994 })[0].outcome).toBe("not_applicable");
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

describe("ranges", () => {
  // A research date's age is lib/research-age's (research-age.test.ts).
  it("vsRange handles open-ended and null ranges", () => {
    expect(vsRange(500, 400, 600)).toBe("within");
    expect(vsRange(300, 400, 600)).toBe("below");
    expect(vsRange(700, 400, 600)).toBe("above");
    expect(vsRange(700, null, null)).toBe("no_range");
    expect(vsRange(700, 400, null)).toBe("within");
  });
});

describe("an open question is named as the question it asks", () => {
  const rules = (Array.isArray(rulesFile) ? rulesFile : (rulesFile as { rules: RegulatoryRule[] }).rules) as RegulatoryRule[];

  it("labels every condition a rule in the file can leave open", () => {
    const keys = new Set<string>();
    const walk = (c: unknown) => {
      if (!c || typeof c !== "object") return;
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        if (k === "any_of" && Array.isArray(v)) v.forEach(walk);
        else keys.add(k);
      }
    };
    for (const r of rules) {
      walk(r.applies_if);
      walk(r.exempt_if);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const k of keys) expect(OPEN_QUESTION_LABELS[k], k).toBeTruthy();
  });

  it("names an open any-of by the questions inside it, never as 'any of'", () => {
    const moco = rules.find((r) => r.id === "md-moco-rent-stabilization")!;
    // A duplex in the county with no year built and no answer on
    // owner-occupancy: both exemptions are open.
    const [e] = evaluateRules([moco], {
      state: "MD",
      locality: ["Montgomery County"],
      units: 2,
      property_type: "rental_housing",
      current_year: 2026,
      today: "2026-10-05",
    });
    expect(e.unknowns).not.toContain("any_of");
    expect(e.unknowns).toEqual(expect.arrayContaining(["building_age_years_lt", "owner_occupied_with_units_lte"]));
    // One branch answered yes: nothing is open.
    const [old] = evaluateRules([moco], {
      state: "MD",
      locality: ["Montgomery County"],
      units: 40,
      property_type: "rental_housing",
      built_year: 2015,
      current_year: 2026,
      today: "2026-10-05",
    });
    expect(old.unknowns).not.toContain("building_age_years_lt");
  });

  // The audit of 2026-10-05: a building over an owner-occupancy exemption's
  // unit limit was still asked whether the buyer would live in it, so the
  // cap "possibly applied" where it applies.
  it("never asks a building over an owner-occupancy exemption's unit limit whether the buyer will live in it", () => {
    const rule = (id: string) => rules.find((r) => r.id === id)!;
    const subject = { property_type: "rental_housing", current_year: 2026, today: "2026-10-05" };
    const [seattle] = evaluateRules([rule("wa-rent-cap-hb1217")], { ...subject, state: "WA", locality: ["Seattle"], units: 48, built_year: 1990 });
    expect(seattle.unknowns).not.toContain("owner_occupied_with_units_lte");
    expect(seattle.outcome).toBe("applies");
    const [newark] = evaluateRules([rule("nj-newark-rent-control")], { ...subject, state: "NJ", locality: ["Newark"], units: 120, built_year: 1960 });
    expect(newark.unknowns).toEqual([]);
    expect(newark.outcome).toBe("applies");
    // MoCo's 40-unit building of no stated year: only its age is open.
    const [moco] = evaluateRules([rule("md-moco-rent-stabilization")], { ...subject, state: "MD", locality: ["Montgomery County"], units: 40 });
    expect(moco.unknowns).toEqual(["building_age_years_lt"]);
    // At or under the limit the question stays open; with no count, open too.
    const [duplex] = evaluateRules([rule("nj-newark-rent-control")], { ...subject, state: "NJ", locality: ["Newark"], units: 4 });
    expect(duplex.unknowns).toEqual(["owner_occupied_with_units_lte"]);
    const [uncounted] = evaluateRules([rule("nj-newark-rent-control")], { ...subject, state: "NJ", locality: ["Newark"] });
    expect(uncounted.outcome).toBe("possibly_applies");
  });
});
