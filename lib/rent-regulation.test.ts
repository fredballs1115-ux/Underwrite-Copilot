import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import rulesFile from "@/data/research/regulatory_rules.json";
import { RegulationPanel } from "@/app/regulation-panel";
import {
  ALLOWANCES,
  LEGAL_RENT_ROW,
  NO_REGIME,
  PREFERENTIAL_RENT_ROW,
  REGIME_ROW,
  REGIMES,
  UNITS_ROW,
  UNVERIFIED_OPEN,
  allowanceOn,
  allowanceSentence,
  readRegulation,
  regulationContextLine,
  regulationForDeal,
  regulationModelLine,
  regulationNote,
  regulationShortLine,
  regulationTag,
  regulationTermRows,
  rulesSizeText,
  unverifiedRule,
} from "./rent-regulation";
import { readAffordable } from "./affordable";
import { unitCountFromMetrics } from "./criteria";
import { evaluateRules } from "./research";
import { buildSubject, seedRules } from "./research-data";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = ""): Row => ({ label, value, flagged: false, page, basis: "na" });

const ex = (metrics: Row[], assetClass = "multifamily"): ExtractionResult => ({
  dealName: "The Walk-up",
  assetClass,
  totalPages: 40,
  metrics: [row("Asking price", "$14,000,000", "p. 2"), ...metrics],
});

const BROOKLYN = {
  address: { state: "NY", city: "Brooklyn", county: "Kings County" },
  census: { place: { name: "New York city" }, county: { name: "Kings County" } },
  classKey: "multifamily",
};
const walkUp = (extra: Row[] = []) =>
  ex([row("Units", "48", "p. 3"), row("Year built", "1931", "p. 3"), ...extra]);

describe("the file: every rent rule is a regime or says there is none", () => {
  it("holds each rule that regulates rent to a name, and each that preempts it to the other list", () => {
    const rentRules = (rulesFile as { rules: { id: string; rule_type: string }[] }).rules.filter((r) =>
      /^rent_control(_coverage|_absence)?$/.test(r.rule_type),
    );
    for (const r of rentRules) {
      const regime = Object.hasOwn(REGIMES, r.id);
      const none = NO_REGIME.includes(r.id);
      expect(regime !== none, r.id).toBe(true);
    }
    // Nothing named that the rules do not hold.
    const ids = new Set((rulesFile as { rules: { id: string }[] }).rules.map((r) => r.id));
    for (const id of [...Object.keys(REGIMES), ...NO_REGIME]) expect(ids.has(id), id).toBe(true);
  });

  it("files an allowance only for a regime, with a source, the day it was read and a period of days", () => {
    for (const a of ALLOWANCES) {
      expect(Object.hasOwn(REGIMES, a.rule_id), a.rule_id).toBe(true);
      expect(a.source).toMatch(/^https:\/\//);
      expect(a.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.read.length).toBeGreaterThan(20);
      expect(a.period_start < a.period_end).toBe(true);
      expect(a.figures.length).toBeGreaterThan(0);
      for (const f of a.figures) expect(Number.isFinite(f.pct) && f.pct >= 0 && f.pct <= 25).toBe(true);
    }
  });
});

describe("the size the rules test (rulesSizeText)", () => {
  // The deal page's rules panel had read the header's Size slot, which
  // shows the area where a memorandum states both, so a 48-unit building's
  // unit questions stayed open beside its stated count (research pass 34).
  it("is the building's stated count, whatever else the memorandum states", () => {
    expect(rulesSizeText(walkUp([row("Total SF", "42,000", "p. 3")]), "multifamily")).toBe("48 units");
    expect(rulesSizeText(walkUp(), "multifamily")).toBe("48 units");
    expect(rulesSizeText(ex([row("Total SF", "42,000", "p. 3")]), "multifamily")).toBeNull();
    expect(rulesSizeText(null, "multifamily")).toBeNull();
  });

  it("is no one building's count on a portfolio or a set of homes", () => {
    const portfolio: ExtractionResult = {
      ...walkUp(),
      properties: [
        { name: "One", address: "", count: "24", area: "", noi: "", occupancy: "", yearBuilt: "", allocatedPrice: "", page: "" },
        { name: "Two", address: "", count: "24", area: "", noi: "", occupancy: "", yearBuilt: "", allocatedPrice: "", page: "" },
      ],
    };
    expect(rulesSizeText(portfolio, "multifamily")).toBeNull();
    expect(rulesSizeText(walkUp(), "sfr_btr")).toBeNull();
  });
});

describe("the allowance on a day", () => {
  it("is the period holding the day; past its end it has ended; before it, it is next", () => {
    expect(allowanceOn("ny-nyc-rent-stabilization-coverage", "2026-10-05")?.state).toBe("current");
    expect(allowanceOn("ny-nyc-rent-stabilization-coverage", "2026-09-30")?.state).toBe("upcoming");
    expect(allowanceOn("ny-nyc-rent-stabilization-coverage", "2027-09-30")?.state).toBe("current");
    expect(allowanceOn("ny-nyc-rent-stabilization-coverage", "2027-10-01")?.state).toBe("ended");
    // Washington's two filed years: the one holding the day, with the next.
    const wa = allowanceOn("wa-rent-cap-hb1217", "2026-12-31")!;
    expect(wa.state).toBe("current");
    expect(wa.figures[0].pct).toBe(9.683);
    expect(wa.next?.figures[0].pct).toBe(10);
    expect(allowanceOn("wa-rent-cap-hb1217", "2027-01-01")!.figures[0].pct).toBe(10);
    // None filed for a regime: none read, never a zero.
    expect(allowanceOn("md-pg-prsa-cap", "2026-10-05")).toBeNull();
    expect(allowanceOn("ny-nyc-rent-stabilization-coverage", "not a day")).toBeNull();
  });

  it("says a figure with its period and whose it is, and an ended one as needing checking", () => {
    const now = allowanceOn("ny-nyc-rent-stabilization-coverage", "2026-10-05")!;
    expect(allowanceSentence("NYC rent stabilization", now)).toBe(
      "Under NYC rent stabilization, the allowance for leases commencing Oct 1, 2026 to Sep 30, 2027 is 0% on a one-year lease and 0% on a two-year lease (the Rent Guidelines Board's Apartment/Loft Order #58).",
    );
    const ended = allowanceOn("ny-nyc-rent-stabilization-coverage", "2027-12-01")!;
    expect(allowanceSentence("NYC rent stabilization", ended)).toContain("has ended; the figure in force now needs checking.");
  });
});

describe("a rent-stabilized walk-up in Brooklyn", () => {
  const r = readRegulation(walkUp([row("Rent-regulated units", "41", "p. 9"), row("Rent regulation", "Rent stabilization", "p. 9")]), BROOKLYN, "2026-10-05")!;

  it("reads the regime the rules say applies, the memorandum's count as the share, and today's allowance", () => {
    expect(r.regimes.map((g) => [g.ruleId, g.outcome])).toEqual([["ny-nyc-rent-stabilization-coverage", "applies"]]);
    expect(r.regulatedUnits).toBe(41);
    expect(r.totalUnits).toBe(48);
    expect(Math.round(r.sharePct!)).toBe(85);
    expect(r.regimes[0].allowance?.state).toBe("current");
    expect(r.headline).toContain("NYC rent stabilization applies by the site's rules.");
    expect(r.headline).toContain("The memorandum states 41 of the 48 units are rent-regulated (85%).");
    expect(r.headline).toContain("the allowance for leases commencing Oct 1, 2026 to Sep 30, 2027 is 0% on a one-year lease");
  });

  it("is a tag, a short line, a model line and the challenger's traps", () => {
    expect(regulationTag(r)).toBe("Rent-stabilized, 41 of 48");
    expect(regulationShortLine(r)).toBe(
      "Rent regulation: NYC rent stabilization applies; 41 of the 48 units rent-regulated as stated (85%); 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027",
    );
    expect(regulationModelLine(r, 3)).toBe(
      "The model grows every rent 3% a year; NYC rent stabilization allows 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027 (the Rent Guidelines Board's Apartment/Loft Order #58), and 41 of the 48 units are regulated as the memorandum states. The model's one growth rate is the market-rate units', not the regulated ones'.",
    );
    expect(regulationNote(r)).toContain("REGULATION TRAPS");
    expect(regulationContextLine(r).startsWith("Rent regulation: NYC rent stabilization applies")).toBe(true);
  });

  it("never reads the regulated units as the building's count, or as an affordable program's", () => {
    const deal = walkUp([row("Rent-regulated units", "41")]);
    expect(unitCountFromMetrics(deal.metrics)).toBe(48);
    expect(readAffordable(deal)).toBeNull();
  });

  it("lists the regulation's rows for the key terms, each only where stated", () => {
    const rows = regulationTermRows(walkUp([row("Rent regulation", "Rent stabilization"), row("Rent-stabilized units", "41"), row("Legal regulated rent", "$1,650 / month avg")]).metrics);
    expect(rows.map((m) => m.label)).toEqual(["Rent regulation", "Rent-stabilized units", "Legal regulated rent"]);
  });

  it("says no share where the memorandum states no count, and none where its count is larger than the building", () => {
    const none = readRegulation(walkUp(), BROOKLYN, "2026-10-05")!;
    expect(none.sharePct).toBeNull();
    expect(none.headline).toContain("The memorandum states no count of regulated units, so no share of the building is read.");
    expect(regulationTag(none)).toBe("Rent-stabilized, 0% cap");
    const over = readRegulation(walkUp([row("Rent-regulated units", "60")]), BROOKLYN, "2026-10-05")!;
    expect(over.countsDisagree).toBe(true);
    expect(over.sharePct).toBeNull();
    expect(over.headline).toContain("more than the 48 it counts in the building; no share is read.");
  });

  it("says an allowance past its period as ended, and the model line as holding no figure in force", () => {
    const later = readRegulation(walkUp([row("Rent-regulated units", "41")]), BROOKLYN, "2027-11-15")!;
    expect(later.regimes[0].allowance?.state).toBe("ended");
    expect(later.headline).toContain("has ended; the figure in force now needs checking.");
    expect(regulationModelLine(later, 3)).toContain("the site holds no figure in force for it today");
  });
});

describe("the rules decide; a blank stays null", () => {
  it("a building of five units or fewer is outside stabilization, and an office is not rental housing", () => {
    const small = ex([row("Units", "4"), row("Year built", "1931")]);
    expect(readRegulation(small, BROOKLYN, "2026-10-05")).toBeNull();
    const office = ex([row("Rentable SF", "120,000"), row("Year built", "1931")], "office");
    expect(readRegulation(office, { ...BROOKLYN, classKey: "office" }, "2026-10-05")).toBeNull();
  });

  it("a building whose year is not stated possibly applies, and names the open question", () => {
    const r = readRegulation(ex([row("Units", "48")]), BROOKLYN, "2026-10-05")!;
    expect(r.regimes[0].outcome).toBe("possibly_applies");
    expect(r.regimes[0].unknowns).toContain("year built");
    expect(regulationTag(r)).toBe("Rent rules: check");
  });

  it("a regime the memorandum names where no rule reaches is the memorandum's claim", () => {
    const austin = { address: { state: "TX", city: "Austin" }, classKey: "multifamily" };
    const r = readRegulation(ex([row("Units", "120"), row("Rent regulation", "Rent stabilized under a city program")]), austin, "2026-10-05")!;
    expect(r.claimOnly).toBe(true);
    expect(r.regimes).toEqual([]);
    expect(r.headline).toContain("so that is the memorandum's claim.");
    expect(regulationTag(r)).toBe("Rent-regulated (OM)");
    expect(regulationModelLine(r, 3)).toBeNull();
  });

  it("reads past rows analysis output can carry — a null, a row with no value, metrics that are no list — and never throws", () => {
    const odd = {
      ...walkUp([row("Rent-regulated units", "41")]),
      metrics: [null, { label: "Rent regulation" }, row("Units", "48"), row("Year built", "1931"), row("Rent-regulated units", "41")],
    } as unknown as ExtractionResult;
    const r = readRegulation(odd, BROOKLYN, "2026-10-05")!;
    expect(r.regulatedUnits).toBe(41);
    expect(r.stated).toBeNull();
    expect(regulationTermRows(odd.metrics).map((m) => m.label)).toEqual(["Rent-regulated units"]);
    expect(readRegulation({ ...walkUp(), metrics: { not: "a list" } } as unknown as ExtractionResult, BROOKLYN, "2026-10-05")!.totalUnits).toBeNull();
  });

  it("no address, no rule read", () => {
    expect(readRegulation(walkUp(), { address: null, classKey: "multifamily" }, "2026-10-05")).toBeNull();
    expect(readRegulation(null, BROOKLYN, "2026-10-05")).toBeNull();
  });
});

describe("a stated none is no claim", () => {
  const park = (control: string) =>
    ex([row("Pads", "150"), row("Lot rent", "$430"), row("Rent control", control)], "manufactured_housing");
  const lancaster = { address: { state: "PA", city: "Lancaster" }, classKey: "manufactured_housing" };

  it("reads a park's 'Rent control: None' — the row lib/manufactured-housing reads as not regulated — as no regime", () => {
    for (const none of ["None", "No rent control", "N/A", "Not subject to rent control", "Not rent-controlled", "Exempt", "Market rate", "—"]) {
      expect(readRegulation(park(none), lancaster, "2026-10-05"), none).toBeNull();
    }
    // Words that name a regime are still the memorandum's claim, even with
    // an exemption inside them.
    const claim = readRegulation(park("Subject to the county's manufactured-home rent ordinance"), lancaster, "2026-10-05")!;
    expect(claim.claimOnly).toBe(true);
    expect(regulationTag(claim)).toBe("Rent-regulated (OM)");
    const austin = { address: { state: "TX", city: "Austin" }, classKey: "multifamily" };
    expect(readRegulation(ex([row("Units", "120"), row("Rent regulation", "Rent stabilization (12 units exempt)")]), austin, "2026-10-05")!.stated).toBe(
      "Rent stabilization (12 units exempt)",
    );
  });

  it("keeps the rules' read where the memorandum states none, and never says it names the regime as none", () => {
    const none = readRegulation(walkUp([row("Rent regulation", "None")]), BROOKLYN, "2026-10-05")!;
    expect(none.regimes[0].outcome).toBe("applies");
    expect(none.stated).toBeNull();
    expect(none.headline).not.toContain("It names the regime as None");
    // A regulated count of 0 is a stated zero, so it is no claim either.
    const austin = { address: { state: "TX", city: "Austin" }, classKey: "multifamily" };
    expect(readRegulation(ex([row("Units", "120"), row("Rent-regulated units", "0")]), austin, "2026-10-05")).toBeNull();
  });
});

// The audit of 2026-10-05: a regulated count the reader could not take —
// "41 of 48", "All", "41 RS / 7 FM", and "0", which the count reader
// refuses — was said as "no count of regulated units", beside key terms
// printing the row.
describe("the regulated count as the memorandum states it", () => {
  it("says words it takes no count from as stated, and a stated zero as none", () => {
    for (const words of ["41 of 48", "All", "41 RS / 7 FM"]) {
      const r = readRegulation(walkUp([row("Rent-stabilized units", words)]), BROOKLYN, "2026-10-05")!;
      expect(r.regulatedUnits, words).toBeNull();
      expect(r.regulatedUnitsStated, words).toBe(words);
      expect(r.sharePct, words).toBeNull();
      expect(r.headline, words).toContain(`The memorandum states the regulated units as: ${words}; no share is read.`);
      expect(r.headline, words).not.toContain("no count of regulated units");
    }
    for (const zero of ["0", "None", "Zero"]) {
      const r = readRegulation(walkUp([row("Rent-stabilized units", zero)]), BROOKLYN, "2026-10-05")!;
      expect(r.regulatedUnits, zero).toBe(0);
      expect(r.headline, zero).toContain("The memorandum states none of the 48 units are rent-regulated.");
      expect(r.headline, zero).not.toContain("no count of regulated units");
      // Rules that apply to a building the memorandum says has none of its
      // units regulated: never "Rent-stabilized, 0 of 48", which read as a
      // stabilized building (the batch audit).
      expect(regulationTag(r), zero).toBe("Rent rules apply; 0 of 48 regulated (OM)");
      expect(regulationShortLine(r), zero).toContain("none of the 48 units rent-regulated as stated");
      expect(regulationModelLine(r, 3), zero).toContain("and none of the 48 units are regulated as the memorandum states");
    }
    // A row that states nothing is no row.
    const blank = readRegulation(walkUp([row("Rent-stabilized units", "N/A")]), BROOKLYN, "2026-10-05")!;
    expect(blank.regulatedUnitsStated).toBeNull();
    expect(blank.headline).toContain("The memorandum states no count of regulated units, so no share of the building is read.");
    // Words naming regulated units are the memorandum's claim where no rule reaches.
    const austin = readRegulation(ex([row("Units", "48"), row("Rent-regulated units", "41 of 48")]), { address: { state: "TX", city: "Austin" }, classKey: "multifamily" }, "2026-10-05")!;
    expect(austin.claimOnly).toBe(true);
    expect(austin.headline).toContain("The memorandum states the regulated units as: 41 of 48; no share is read.");
  });
});

// The batch audit: a regulated-units row whose words say the count is not
// known was read as a stated zero — "The memorandum states none of the 48
// units are rent-regulated" on the panel, "Rent-stabilized, 0 of 48" on the
// pipeline, and the same sentence in every Claude step.
describe("a regulated count the memorandum does not know", () => {
  const UNKNOWN = [
    "Unknown - pending DHCR registration review",
    "Unknown – pending DHCR review",
    "Not provided by seller",
    "TBD (see rent roll)",
    "N/A - see registration history",
    "Not disclosed; registrations in data room",
    "No count available",
    "None stated",
  ];

  it("is no count at all, said as stated, and never a zero", () => {
    for (const words of UNKNOWN) {
      const r = readRegulation(walkUp([row("Rent-stabilized units", words)]), BROOKLYN, "2026-10-05")!;
      expect(r.regulatedUnits, words).toBeNull();
      expect(r.regulatedUnitsStated, words).toBeNull();
      expect(r.regulatedUnitsUnknown, words).toBe(words);
      expect(r.sharePct, words).toBeNull();
      expect(r.headline, words).toContain(
        `The memorandum gives no count of regulated units (it states: ${words}), so no share of the building is read.`,
      );
      expect(r.headline, words).not.toMatch(/none of the 48/i);
      expect(regulationTag(r), words).toBe("Rent-stabilized, 0% cap");
      expect(regulationShortLine(r), words).not.toMatch(/none of the/i);
      expect(regulationModelLine(r, 3), words).not.toMatch(/none of the/i);
      expect(regulationContextLine(r), words).not.toMatch(/none of the 48/i);
      const html = renderToStaticMarkup(React.createElement(RegulationPanel, { regulation: r, today: "2026-10-05" }));
      expect(visibleText(html), words).not.toMatch(/none of the 48/i);
      expect(gluedWords(r.headline), words).toEqual([]);
    }
  });

  it("is no claim of regulation where no rule reaches", () => {
    const austin = { address: { state: "TX", city: "Austin" }, classKey: "multifamily" };
    for (const words of UNKNOWN) {
      expect(readRegulation(ex([row("Units", "48"), row("Rent-regulated units", words)]), austin, "2026-10-05"), words).toBeNull();
    }
  });

  it("reads a zero only from the figure 0 or from words that state none at the start", () => {
    for (const zero of ["0", "0 units", "Zero", "None", "No units", "No rent-stabilized units", "Market rate", "Market-rate units only", "Exempt", "Deregulated"]) {
      const r = readRegulation(walkUp([row("Rent-stabilized units", zero)]), BROOKLYN, "2026-10-05")!;
      expect(r.regulatedUnits, zero).toBe(0);
      expect(r.regulatedUnitsUnknown, zero).toBeNull();
      expect(r.headline, zero).toContain("The memorandum states none of the 48 units are rent-regulated.");
      expect(regulationTag(r), zero).toBe("Rent rules apply; 0 of 48 regulated (OM)");
    }
  });
});

// The audit of 2026-10-05: a rent row stating none made the memorandum's
// claim of regulation, a regime row's "Yes", "Non-regulated" or
// "Deregulated" was read as the regime's name.
describe("a row's words that state none, or a bare yes", () => {
  const austin = { address: { state: "TX", city: "Austin" }, classKey: "multifamily" };

  it("reads a legal or preferential rent that states none as no rent and no claim", () => {
    for (const r of [row("Legal regulated rent", "N/A"), row("Preferential rent", "None"), row("Legal regulated rent", "—"), row("Preferential rent", "Not applicable")]) {
      expect(readRegulation(ex([row("Units", "48"), r]), austin, "2026-10-05"), `${r.label}: ${r.value}`).toBeNull();
    }
    // Where a regime reaches the building, a rent that states none is not said.
    const nyc = readRegulation(walkUp([row("Legal regulated rent", "N/A"), row("Preferential rent", "None")]), BROOKLYN, "2026-10-05")!;
    expect(nyc.legalRent).toBeNull();
    expect(nyc.preferentialRent).toBeNull();
    expect(nyc.headline).not.toContain("rent as stated");
  });

  it("reads a regime row's non-regime words as none, and a yes as regulated with no regime named", () => {
    for (const none of ["Non-regulated", "Nonregulated", "Deregulated", "Destabilized", "Market", "Market-rate units"]) {
      expect(readRegulation(ex([row("Units", "48"), row("Rent regulation", none)]), austin, "2026-10-05"), none).toBeNull();
    }
    const nyc = readRegulation(walkUp([row("Rent regulation", "Deregulated")]), BROOKLYN, "2026-10-05")!;
    expect(nyc.stated).toBeNull();
    expect(nyc.headline).not.toContain("It names the regime as Deregulated");
    // A bare yes: the memorandum's claim, never a regime called "Yes".
    const yes = readRegulation(ex([row("Units", "48"), row("Rent control", "Yes")]), austin, "2026-10-05")!;
    expect(yes).toMatchObject({ claimOnly: true, stated: null, statedYes: "Yes" });
    expect(yes.headline).toBe("The memorandum states the building is rent-regulated; no rent rule the site holds reaches this address, so that is the memorandum's claim.");
    expect(regulationTag(yes)).toBe("Rent-regulated (OM)");
    expect(regulationShortLine(yes)).toBe("Rent regulation: The memorandum states regulated rents, which no rule the site holds reaches here");
    // A yes with words after it keeps them, quoted, and names no regime.
    const park = readRegulation(
      ex([row("Pads", "80"), row("Rent control", "Yes — city caps lot rent at CPI")], "manufactured_housing"),
      { address: { state: "NJ", city: "Toms River" }, classKey: "manufactured_housing" },
      "2026-10-05",
    )!;
    expect(park.stated).toBeNull();
    expect(park.headline).toContain('It states the building is rent-regulated ("Yes — city caps lot rent at CPI") without naming the regime.');
    expect(park.headline).not.toContain("It names the regime as Yes");
    for (const r of [yes, park]) expect(gluedWords(r.headline)).toEqual([]);
  });
});

describe("the prompt asks for what the reader reads", () => {
  it("names each regulation row by a label the reader's own pattern takes", () => {
    const prompt = extractionInstruction("multifamily");
    const labels: [string, RegExp][] = [
      ["Rent regulation", REGIME_ROW],
      ["Rent-regulated units", UNITS_ROW],
      ["Legal regulated rent", LEGAL_RENT_ROW],
      ["Preferential rent", PREFERENTIAL_RENT_ROW],
    ];
    for (const [label, re] of labels) {
      expect(prompt).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    // An affordable program's restricted units stay its own: the prompt names
    // them beside the regulated count, and the regulated count's pattern
    // never takes them.
    expect(prompt).toContain('never an affordable program\'s restricted units, which stay under "Restricted units"');
    expect(UNITS_ROW.test("Restricted units")).toBe(false);
    // Each label, as the extraction writes it, is read: the regime, the count
    // as the share of the building's, and both rents as stated.
    const r = readRegulation(
      walkUp([row("Rent regulation", "Rent stabilization"), row("Rent-regulated units", "41"), row("Legal regulated rent", "$1,650"), row("Preferential rent", "$1,480")]),
      BROOKLYN,
      "2026-10-05",
    )!;
    expect([r.stated, r.regulatedUnits, r.legalRent, r.preferentialRent]).toEqual(["Rent stabilization", 41, "$1,650", "$1,480"]);
  });
});

// The audit of 2026-10-05: New Jersey's municipal rule — no source, filed
// "unverified_not_found", its own text saying every municipality but Newark
// and Jersey City is unscreened — told every rental building in the state
// "A New Jersey municipal rent ordinance applies", Newark's included.
describe("a rule the site has not verified", () => {
  const nj = (city: string, units: string, built: string) =>
    readRegulation(ex([row("Units", units), row("Year built", built)]), { address: { state: "NJ", city }, classKey: "multifamily" }, "2026-10-05");

  it("possibly applies, its own caution the open question, and is marked unverified", () => {
    const r = nj("Princeton", "120", "2010")!;
    expect(r.regimes.map((g) => [g.ruleId, g.outcome, g.unverified])).toEqual([["nj-municipal-rent-control", "possibly_applies", true]]);
    expect(r.regimes[0].unknowns).toEqual([UNVERIFIED_OPEN]);
    expect(r.headline).toContain(`A New Jersey municipal rent ordinance possibly applies (open: ${UNVERIFIED_OPEN}).`);
    expect(r.headline).not.toContain("applies by the site's rules");
    expect(regulationTag(r)).toBe("Rent rules: check");
    expect(regulationShortLine(r)).toBe("Rent regulation: A New Jersey municipal rent ordinance possibly applies");
    expect(regulationModelLine(r, 3)).toContain("a New Jersey municipal rent ordinance possibly applies");
    // Every regime rule with a source and a verified or sourced status is read as before.
    expect(unverifiedRule({ status: "verified", source: "https://example.gov" })).toBe(false);
    expect(unverifiedRule({ status: "sourced", source: null })).toBe(true);
    expect(nj("Newark", "120", "1960")!.regimes.every((g) => !g.unverified)).toBe(true);
  });

  it("is not read where the place's own rule reaches the deal", () => {
    const newark = nj("Newark", "120", "1960")!;
    expect(newark.regimes.map((g) => g.ruleId)).toEqual(["nj-newark-rent-control"]);
    expect(regulationTag(newark)).not.toBe("NJ rent ordinance");
    expect(newark.headline).not.toContain("New Jersey municipal");
    // Jersey City's own rule exempts a building of four units or fewer; the
    // statewide rule is not read in its place.
    expect(nj("Jersey City", "3", "1950")).toBeNull();
  });

  // The pre-merge audit (C1, L9): the rules panel still listed the statewide
  // rule on a Newark deal as "possibly applies (the ordinance itself, which
  // the site has not verified)" beside the rent rules that had dropped it.
  it("is not read by the rules panel either where the place's own rule reaches the deal, and both panels read one set", () => {
    const panel = (city: string) =>
      evaluateRules(
        seedRules(),
        buildSubject({ address: { state: "NJ", city }, sizeText: "120 units", yearBuilt: 1960, residential: true, today: "2026-10-05" }),
      ).filter((e) => e.outcome === "applies" || e.outcome === "possibly_applies");
    const newark = panel("Newark");
    expect(newark.map((e) => e.rule.id)).toContain("nj-newark-rent-control");
    expect(newark.map((e) => e.rule.id)).not.toContain("nj-municipal-rent-control");
    expect(panel("Jersey City").map((e) => e.rule.id)).not.toContain("nj-municipal-rent-control");
    // Elsewhere in the state the rule is read on both, as possibly applying.
    expect(panel("Princeton").find((e) => e.rule.id === "nj-municipal-rent-control")?.outcome).toBe("possibly_applies");
    // The rent rules list exactly the regimes the panel lists.
    for (const city of ["Newark", "Princeton"]) {
      const regimes = panel(city).filter((e) => ["nj-newark-rent-control", "nj-jersey-city-rent-control", "nj-municipal-rent-control"].includes(e.rule.id));
      expect(nj(city, "120", "1960")!.regimes.map((g) => g.ruleId).sort(), city).toEqual(regimes.map((e) => e.rule.id).sort());
    }
  });

  it("is marked on the panel as the rules panel marks it", () => {
    const html = renderToStaticMarkup(React.createElement(RegulationPanel, { regulation: nj("Princeton", "120", "2010"), today: "2026-10-05" }));
    expect(html).toContain('data-qa="regime-unverified"');
    expect(visibleText(html)).toContain("Possibly applies");
    expect(visibleText(html)).toContain("Unverified");
    // A verified rule carries no such mark.
    const verified = renderToStaticMarkup(React.createElement(RegulationPanel, { regulation: readRegulation(walkUp(), BROOKLYN, "2026-10-05"), today: "2026-10-05" }));
    expect(verified).not.toContain('data-qa="regime-unverified"');
  });
});

// The audit of 2026-10-05: a portfolio's count, or a set of homes', was
// read as one building's against the rules' per-building size tests.
describe("a count that is no one building's", () => {
  const property = (name: string) => ({ name, address: "", count: "4", area: "", noi: "", occupancy: "", yearBuilt: "1925", allocatedPrice: "", page: "" });

  it("leaves the size question open on single-family homes and on a portfolio, rather than the sum answering it", () => {
    const la = { address: { state: "CA", city: "Los Angeles" }, classKey: "sfr_btr" };
    const homes = readRegulation(ex([row("Homes", "30"), row("Year built", "1965")], "sfr_btr"), la, "2026-10-05")!;
    const rso = homes.regimes.find((g) => g.ruleId === "ca-la-rso-coverage")!;
    expect(rso.outcome).toBe("possibly_applies");
    expect(rso.unknowns).toContain("unit count");
    expect(homes.headline).not.toContain("The Los Angeles RSO applies by the site's rules");
    expect(regulationTag(homes)).toBe("Rent rules: check");
    // Eight four-unit buildings in Brooklyn, 32 units in all.
    const eight = { ...ex([row("Units", "32"), row("Year built", "1925")]), properties: Array.from({ length: 8 }, (_, i) => property(`Building ${i + 1}`)) };
    const r = readRegulation(eight, BROOKLYN, "2026-10-05")!;
    expect(r.regimes[0]).toMatchObject({ ruleId: "ny-nyc-rent-stabilization-coverage", outcome: "possibly_applies" });
    expect(r.regimes[0].unknowns).toContain("unit count");
    expect(regulationTag(r)).toBe("Rent rules: check");
    // The same 32 units in one building: stabilization applies, as before.
    expect(readRegulation(ex([row("Units", "32"), row("Year built", "1925")]), BROOKLYN, "2026-10-05")!.regimes[0].outcome).toBe("applies");
    // A one-entry list is one property restated.
    expect(readRegulation({ ...eight, properties: [property("The building")] }, BROOKLYN, "2026-10-05")!.regimes[0].outcome).toBe("applies");
  });
});

describe("Washington DC and Los Angeles", () => {
  it("reads DC's two caps for its rent control year", () => {
    const dc = { address: { state: "DC", city: "Washington" }, classKey: "multifamily" };
    const r = readRegulation(ex([row("Units", "24"), row("Year built", "1962")]), dc, "2026-10-05")!;
    const g = r.regimes.find((x) => x.ruleId === "dc-rent-stab-coverage")!;
    expect(g.allowance?.state).toBe("current");
    expect(r.headline).toContain(
      "the allowance for increases taking effect May 1, 2026 to Apr 30, 2027 is 4.1% on a rent-controlled unit and 2.1% on a unit with a registered elderly or disabled tenant",
    );
    // The tag names both caps, never the elderly or disabled tenant's 2.1%
    // as the building's (the audit of 2026-10-05).
    expect(regulationTag(r)).toBe("DC rent control, 2.1–4.1% cap");
  });

  // The audit of 2026-10-05: the panel linked only the RULE's source (the
  // D.C. Code) beside figures the Office of the Tenant Advocate published.
  it("links each allowance's own source beside its figures on the panel, and the rule's beside the regime", () => {
    const dc = { address: { state: "DC", city: "Washington" }, classKey: "multifamily" };
    const r = readRegulation(ex([row("Units", "24"), row("Year built", "1962")]), dc, "2026-10-05")!;
    const html = renderToStaticMarkup(React.createElement(RegulationPanel, { regulation: r, today: "2026-10-05", modelGrowthPct: 3 }));
    const text = visibleText(html);
    const ota = ALLOWANCES.find((a) => a.rule_id === "dc-rent-stab-coverage")!.source;
    expect(html).toContain(`href="${ota}"`);
    expect(text).toContain("Allowance source: ota.dc.gov");
    expect(html).toContain('href="https://code.dccouncil.gov/us/dc/council/code/sections/42-3502.05"');
    expect(text).toContain("Source: code.dccouncil.gov");
    expect(a11yIssues(html)).toEqual([]);
    // No allowance in force, no allowance source drawn.
    const ended = readRegulation(ex([row("Units", "24"), row("Year built", "1962")]), dc, "2027-06-01")!;
    expect(renderToStaticMarkup(React.createElement(RegulationPanel, { regulation: ended, today: "2027-06-01" }))).not.toContain('data-qa="allowance-source"');
  });

  it("puts the city's own regime before the state's cap", () => {
    const la = {
      address: { state: "CA", city: "Los Angeles", county: "Los Angeles County" },
      census: { place: { name: "Los Angeles city" }, county: { name: "Los Angeles County" } },
      classKey: "multifamily",
    };
    const r = readRegulation(ex([row("Units", "16"), row("Year built", "1964")]), la, "2026-10-05")!;
    expect(r.regimes[0].ruleId).toBe("ca-la-rso-coverage");
    expect(r.headline.startsWith("The Los Angeles RSO applies by the site's rules")).toBe(true);
    expect(regulationTag(r)).toBe("LA RSO, 3% cap");
  });
});

describe("the words", () => {
  it("never glue a figure to a word", () => {
    const r = readRegulation(walkUp([row("Rent-regulated units", "41"), row("Preferential rent", "$1,480")]), BROOKLYN, "2026-10-05")!;
    for (const s of [r.headline, regulationShortLine(r), regulationModelLine(r, 3.5)!, regulationNote(r)]) {
      expect(gluedWords(s), s).toEqual([]);
    }
  });
});

describe("a deal row read in one call", () => {
  const address = { state: "NY", city: "Brooklyn", county: "Kings County", label: "100 Walk-up St, Brooklyn, NY 11215" };
  const flags = (label: string) =>
    ({
      status: "ok",
      subject: { lat: 40.67, lng: -73.98, label },
      tractGeoid: null,
      place: { name: "New York city", geoid: "3651000" },
      county: { name: "Kings County", geoid: "36047" },
      opportunityZone: null,
      flood: null,
      retrievedAt: "2026-10-01T00:00:00Z",
      note: "",
    }) as const;

  it("reads the class the deck turned out to be, and the Census place only from flags for this address", () => {
    const deal = walkUp([row("Rent-regulated units", "41")]);
    const r = regulationForDeal({ extraction: deal, address, siteFlags: flags(address.label), assetClass: "auto" }, "2026-10-05")!;
    expect(r.regimes[0].outcome).toBe("applies");
    expect(regulationTag(r)).toBe("Rent-stabilized, 41 of 48");
    // Flags looked up for another address are not this building's place.
    const stale = regulationForDeal({ extraction: deal, address, siteFlags: flags("9 Elsewhere Ave, Queens, NY"), assetClass: null }, "2026-10-05")!;
    expect(stale.regimes[0].ruleId).toBe("ny-nyc-rent-stabilization-coverage");
    // A deal filed as an office says nothing of rent rules.
    expect(regulationForDeal({ extraction: walkUp(), address, siteFlags: null, assetClass: "office" }, "2026-10-05")).toBeNull();
  });
});

