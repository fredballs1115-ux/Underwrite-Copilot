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
    // The stored count of national lines is said: the 10-year is the nation's.
    const counted = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { ...market, liveBrief: { ...market.liveBrief!, national: 1 } } });
    expect(counted).toContain("The last line is the nation's figure, not the market's — it says so.");
    expect(brief).not.toContain("the nation's figure");
    const two = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { ...market, liveBrief: { ...market.liveBrief!, national: 2 } } });
    expect(two).toContain("The last 2 lines are the nation's figures, not the market's — each says so.");
  });

  it("a check that read no figures adds no section, and the brief is the old one", () => {
    const plain = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { ...market, liveBrief: null } });
    expect(plain).not.toContain("published figures the market check read");
    expect(plain).toContain("## Market plausibility check");
    const older = buildBrief({ extraction: null, challenges: null, comps: null, reconciliation: null, market: { checks: market.checks, summary: market.summary } });
    expect(older).toBe(plain);
  });
});

describe("a portfolio across markets: each other market's figures under its own heading (#413)", () => {
  it("names the market and how many of the properties sit there, and says the figure speaks for those alone", () => {
    const brief = buildBrief({
      extraction: null,
      challenges: null,
      comps: null,
      reconciliation: null,
      market: {
        ...market,
        liveBrief: { ...market.liveBrief!, portfolio: { here: 2, of: 5 } },
        otherBriefs: [
          { metro: "Baltimore MD", grain: "metro", readOn: "2026-09-23", lines: ["Unemployment 3.9% (Jul 2026, Baltimore MSA; FRED)"], portfolio: { here: 2, of: 5 } },
          { metro: "Virginia", grain: "state", readOn: "2026-09-23", lines: ["Unemployment 3.1% (Aug 2026, Virginia; FRED)"], portfolio: { here: 1, of: 5 } },
          { metro: "Ohio", grain: "state", readOn: "2026-09-23", lines: [], portfolio: { here: 1, of: 5 } },
        ],
      },
    });
    const dc = brief.indexOf("## The Washington DC market's published figures");
    const balt = brief.indexOf("## The Baltimore MD market's published figures, where 2 of the portfolio's 5 properties sit, read on 2026-09-23");
    const va = brief.indexOf("## The state of Virginia's published figures, where 1 of the portfolio's 5 properties sits, read on 2026-09-23");
    expect(dc).toBeGreaterThan(0);
    expect(balt).toBeGreaterThan(dc);
    expect(va).toBeGreaterThan(balt);
    expect(brief).toContain("- Unemployment 3.9% (Jul 2026, Baltimore MSA; FRED)");
    expect(brief).toContain("it speaks for the properties in Baltimore MD alone, never for the portfolio or for another market's properties");
    expect(brief).toContain("Each is dated and is the state's — it speaks for the properties in Virginia alone");
    // A market that read nothing adds no heading.
    expect(brief).not.toContain("Ohio");
  });
});

