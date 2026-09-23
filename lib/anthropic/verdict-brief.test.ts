import { describe, expect, it } from "vitest";
import { buildBrief } from "./verdict";
import type { MarketResult } from "./types";

const market: MarketResult = {
  checks: [
    { assumption: "Rent growth", omSays: "4.0%/yr", typicalRange: "2.5%–3.5%", assessment: "aggressive", note: "Above the rent index.", page: "p. 40" },
  ],
  summary: "One aggressive assumption.",
  liveBrief: {
    metro: "Washington DC",
    readOn: "2026-09-23",
    lines: [
      "Rent paid by sitting tenants (CPI rent of primary residence) +2.8% from a year ago (Aug 2026, Washington MSA; the BLS)",
      "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED), -3 bps on the day before",
    ],
    figures: [],
  },
};

describe("the verdict's brief carries the figures the market check read", () => {
  it("as their own section after the market check, dated, with the instruction to name a figure as a source", () => {
    const brief = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market });
    const at = brief.indexOf("## The Washington DC market's published figures the market check read on 2026-09-23");
    expect(at).toBeGreaterThan(brief.indexOf("## Market plausibility check"));
    expect(brief).toContain("- Rent paid by sitting tenants (CPI rent of primary residence) +2.8% from a year ago (Aug 2026, Washington MSA; the BLS)");
    expect(brief).toContain("- Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED), -3 bps on the day before");
    expect(brief).toContain("name the figure and its date as its source");
    expect(brief).toContain("not the submarket's or the building's");
  });

  it("a check that read no figures adds no section, and the brief is the old one", () => {
    const plain = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { ...market, liveBrief: null } });
    expect(plain).not.toContain("published figures the market check read");
    expect(plain).toContain("## Market plausibility check");
    const older = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { checks: market.checks, summary: market.summary } });
    expect(older).toBe(plain);
  });
});
