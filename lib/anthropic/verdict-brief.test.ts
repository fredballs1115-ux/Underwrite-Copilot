import { describe, expect, it, onTestFinished, vi } from "vitest";
import { buildBrief } from "./verdict";
import { dealContextFor } from "@/lib/deal-context";
import type { ExtractedMetric, ExtractionResult, FirstSignal, MarketResult } from "./types";

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

describe("the verdict reads the deal's kind as every other step does (research pass 18)", () => {
  const unnamed = {
    dealName: "1200 K Street",
    assetClass: "Office",
    market: "Washington, DC",
    address: "1200 K St NW, Washington, DC 20005",
    totalPages: 40,
    strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    metrics: [
      { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 3", basis: "na" },
      { label: "NOI (in place)", value: "$1,200,000", flagged: false, page: "p. 9", basis: "in_place" },
    ],
  } as unknown as ExtractionResult;
  const none = { challenges: null, comps: null, reconciliation: null, market: null };

  it("with the first signal beside the extraction: a conversion the signal names is a conversion here too", () => {
    const signal = { take: "A conversion of a vacant office tower to apartments — check the budget." } as unknown as FirstSignal;
    const read = buildBrief({ extraction: unnamed, firstSignal: signal, ...none });
    expect(read).toContain("DEAL STRATEGY: Conversion");
    // Without the signal the brief is the old one: a stabilized asset says nothing here.
    const bare = buildBrief({ extraction: unnamed, ...none });
    expect(bare).not.toContain("DEAL STRATEGY");
    expect(buildBrief({ extraction: unnamed, firstSignal: null, ...none })).toBe(bare);
  });
});

// The verdict was handed the price beside the unit count and nothing about
// what the price buys: a 49% share's $20M over 240 units invited $83k a unit
// where the building's basis is $170k, a note carried none of its yield, and
// an auction's starting bid beside its NOI invited a 19.2% "cap" (research
// pass 18). It now reads the deal context every other step reads, and the
// building's basis as the code computes it.
describe("the verdict is told what is being sold and the building's own basis", () => {
  const m = (label: string, value: string, basis: ExtractedMetric["basis"] = "na"): ExtractedMetric => ({ label, value, flagged: false, page: "p. 3", basis });
  const base = (over: Partial<ExtractionResult>): ExtractionResult =>
    ({
      dealName: "Harbor View Apartments",
      assetClass: "Multifamily",
      market: "Dallas, TX",
      address: "100 Main St, Dallas, TX 75201",
      totalPages: 40,
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      metrics: [],
      ...over,
    }) as ExtractionResult;
  const none = { challenges: null, comps: null, reconciliation: null, market: null };
  const briefOf = (ex: ExtractionResult, assetClass: string | null = "auto") =>
    buildBrief({ extraction: ex, assetClass, dealContext: dealContextFor(ex), ...none });
  const section = (brief: string) => {
    const at = brief.indexOf("## What the screen established about the deal, checked in code");
    return at < 0 ? "" : brief.slice(at, brief.indexOf("\n## ", at + 1));
  };

  it("a share: the context says what the price buys, and the basis is the whole's — $170k a unit, never $83k", () => {
    const share = base({
      interest: { kind: "partial_interest", summary: "A 49% limited partnership interest in the owner.", share: "49% limited partnership interest", groundLease: "", loan: "", page: "p. 3" },
      metrics: [m("Asking price", "$20,000,000"), m("Units", "240"), m("NOI (in-place)", "$2,450,000", "in_place"), m("Going-in cap rate", "6.00%")],
    });
    const brief = briefOf(share);
    const est = section(brief);
    // Where the brief's own order puts context: after the deal, before the terms.
    expect(brief.indexOf("## What the screen established")).toBeGreaterThan(brief.indexOf("## Deal"));
    expect(brief.indexOf("## What the screen established")).toBeLessThan(brief.indexOf("## Extracted terms"));
    expect(est).toContain("What is being sold: a share of the owning entity. This memorandum sells a 49% share of the owning entity");
    expect(est).toContain("$20.0M for the share is $40.8M for the whole");
    expect(est).toContain(
      "THE BUILDING'S BASIS, computed in code: $170k/unit — the whole the 49% share's price implies, over the OM's unit count. The share's own price over the whole building is no basis.",
    );
    expect(brief).not.toContain("$83k");
    // The existing sections stay.
    expect(brief).toContain("## Extracted terms");
    expect(brief).toContain("- Asking price: $20,000,000 [p. 3]");
  });

  it("a note: the context carries the note's own read, and there is no building basis", () => {
    // Read on a pinned day: the note matures March 1, 2028, and from Feb 2
    // of that year it is due within the month, with no yield to state.
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const note = base({
      interest: { kind: "note", summary: "Sale of a performing first mortgage note.", share: "", groundLease: "", loan: "$15,000,000 UPB, 5.25% fixed, matures March 1, 2028, performing", page: "p. 3" },
      metrics: [
        m("Asking price", "$12,750,000"),
        m("Unpaid principal balance", "$15,000,000"),
        m("Note rate", "5.25%"),
        m("Maturity date", "March 1, 2028"),
        m("Amortization", "30 years"),
        m("Payment status", "Performing"),
        m("Whole-asset value", "$24,000,000"),
        m("Units", "240"),
        m("NOI (in-place)", "$1,560,000", "in_place"),
        m("Going-in cap rate", "6.50%"),
      ],
    });
    const est = section(briefOf(note));
    expect(est).toContain("This memorandum sells a LOAN secured by the property, not the property");
    expect(est).toContain("The $12.8M price is a 15.0% discount to the $15.0M unpaid balance.");
    expect(est).toMatch(/Held to its Mar 2028 maturity it yields \d+\.\d% on the price/);
    expect(est).toContain("THE BUILDING'S BASIS: none — this sells a loan, and its price is a loan's.");
    expect(est).not.toMatch(/\/unit/);
  });

  it("a preferred equity position: the context carries the position's own read, and there is no building basis (lib/position)", () => {
    // Read on a pinned day: its yield to redemption runs from today.
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z"), toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const position = base({
      interest: { kind: "preferred_equity", summary: "A $15M preferred equity investment in the owning entity.", share: "", groundLease: "", loan: "", page: "p. 3" },
      metrics: [
        m("Asking price", "$14,000,000"),
        m("Preferred equity amount", "$15,000,000"),
        m("Preferred return", "12% preferred return, 8% current pay"),
        m("Current pay rate", "8.0%"),
        m("Mandatory redemption date", "June 2029"),
        m("Senior loan balance", "$52,000,000"),
        m("Whole-asset value", "$80,000,000"),
        m("Units", "240"),
        m("NOI (in-place)", "$4,400,000", "in_place"),
        m("Going-in cap rate", "5.50%"),
      ],
    });
    const est = section(briefOf(position));
    expect(est).toContain("This memorandum sells a PREFERRED EQUITY position in the owning entity, not the property");
    expect(est).toContain("A preferred equity position of $15.0M at 8.00% current pay and 4.00% accruing");
    expect(est).toContain("14.3% to redemption at its $14.0M price");
    expect(est).toContain(
      "THE BUILDING'S BASIS: none — this sells a preferred equity position in the owning entity, and its price buys a preferred return and a redemption, never a slice of the building.",
    );
    expect(est).toContain("which are the building's, not the position's");
    // Never the position's price over the building's units.
    expect(est).not.toMatch(/\/unit/);
    expect(est).not.toContain("none computed");
  });

  it("an auction: the starting bid is said to be no price, and no basis is struck on it", () => {
    const auction = base({
      dealName: "Midtown Office Tower",
      assetClass: "Office",
      sale: { method: "auction", terms: "Online auction on Ten-X; 10% deposit; 30-day close", condition: "As-is, where-is", page: "p. 2" },
      metrics: [m("Starting bid", "$2,500,000"), m("Buyer's premium", "5%"), m("Reserve price", "Undisclosed"), m("NOI (in-place)", "$480,000", "in_place"), m("Total SF", "40,000 SF")],
    });
    const est = section(briefOf(auction));
    expect(est).toContain("How it is sold: The property is sold at auction: bidding opens at $2.5M, which is where the price starts, not what it is");
    expect(est).toContain(
      "THE BUILDING'S BASIS: none — the OM states no asking price, and the $2,500,000 starting bid ($2,625,000 all-in with the buyer's premium) is where the bidding opens, not a price",
    );
    expect(est).toContain("a cap or a return struck on it is the ceiling of what the building yields");
  });

  it("an ordinary building: the basis is the asking price over the count, a range read at its top", () => {
    const fee = base({ metrics: [m("Asking price", "$40,000,000 – $42,000,000"), m("Units", "150"), m("NOI (in-place)", "$2,300,000", "in_place")] });
    expect(section(briefOf(fee))).toContain(
      "THE BUILDING'S BASIS, computed in code: $280k/unit — the top of the price range the OM states, the end that does not flatter a return, over the OM's unit count.",
    );
    // An office is priced by the foot, in the class the analyst filed.
    const office = base({ assetClass: "Office", metrics: [m("Asking price", "$80,000,000"), m("Total SF", "300,000 SF")] });
    expect(section(briefOf(office, "office"))).toContain("THE BUILDING'S BASIS, computed in code: $267/SF — the asking price, over the building's area.");
  });

  it("a plan deal's basis is its total cost a planned unit, never the land's price", () => {
    const dev = base({
      dealName: "Riverside — ground-up development site, fully entitled",
      strategy: { kind: "development", summary: "Build 300 apartments on an entitled site.", capitalBudget: "", timeline: "" },
      metrics: [m("Land cost", "$12,000,000"), m("NOI (stabilized, pro forma)", "$9,000,000", "pro_forma"), m("Total development cost", "$120,000,000"), m("Units (proposed)", "300")],
    });
    expect(section(briefOf(dev))).toContain(
      "THE BUILDING'S BASIS, computed in code: on this development deal it is total cost — $120.0M over 300 planned units is $400k per planned unit, never the land's price over them.",
    );
  });

  it("a brief with no extraction and no context is the old one", () => {
    const plain = buildBrief({ extraction: null, ...none });
    expect(plain).not.toContain("What the screen established");
    expect(buildBrief({ extraction: null, dealContext: "  ", ...none })).toBe(plain);
  });
});

// Research pass 18: the verdict was handed the bare criteria and told to
// judge fit and name the entry price that would fit — re-deriving in prose
// what lib/criteria `evaluateBuyBox` already decides in code.
describe("the verdict is handed the code's buy-box checks, not the bare criteria to re-derive", () => {
  const none = { extraction: null, challenges: null, comps: null, reconciliation: null, market: null };
  const lines = ["Price: $15.0M max", "Min going-in cap: 6.25%", "Dealbreakers: price ≤ $18M"];
  const checks = [
    { label: "Price", status: "miss" as const, detail: "Mandate is $15.0M max — the ask is $20.0M. Beyond the mandate." },
    { label: "Going-in cap", status: "near" as const, detail: "Mandate wants ≥6.25% going-in — the deal shows 6.00%, 25bps light. Close; a price cut could clear it." },
    { label: "Asset class", status: "pass" as const, detail: "Mandate is multifamily — this is multifamily. In scope." },
    { label: "Target return", status: "unknown" as const, detail: "Mandate targets ≥15% IRR; no parseable IRR in the screen yet." },
  ];

  it("each check's call and its own sentence, the fold, and the red lines tripped — with the entry price said to be the verdict's own estimate", () => {
    const brief = buildBrief({ ...none, buyBox: lines, buyBoxChecks: { checks, tripped: ["price $20.0M over the $18.0M ceiling"] } });
    const at = brief.indexOf("## The buyer's standing buy box");
    const box = brief.slice(at, brief.indexOf("\n## ", at + 1));
    expect(box).toContain("- Price: $15.0M max");
    expect(box).toContain("The code's checks of this deal against the box, computed before you read this");
    expect(box).toContain("never re-derive a check or recompute its figure");
    expect(box).toContain("- Price — outside: Mandate is $15.0M max — the ask is $20.0M. Beyond the mandate.");
    expect(box).toContain("- Going-in cap — near miss: Mandate wants ≥6.25% going-in — the deal shows 6.00%, 25bps light.");
    expect(box).toContain("- Asset class — fits: Mandate is multifamily — this is multifamily. In scope.");
    expect(box).toContain("- Target return — not checked: Mandate targets ≥15% IRR; no parseable IRR in the screen yet.");
    expect(box).toContain("The code's call across the checks: outside the box on at least one criterion.");
    expect(box).toContain("Red lines the buyer set that this deal trips: price $20.0M over the $18.0M ceiling.");
    expect(box).toContain("The code computes no entry price: one you name is your own estimate — give its arithmetic and say it is yours.");
    // A check's call is never the verdict's own word "pass".
    expect(box).not.toMatch(/— pass\b/);
  });

  it("with no checks to hand, the criteria alone — and an entry price is still the verdict's own estimate", () => {
    const brief = buildBrief({ ...none, buyBox: lines });
    expect(brief).not.toContain("The code's checks");
    expect(brief).toContain("Judge this deal's fit against these criteria explicitly");
    expect(brief).toContain("the code computes no entry price, so one you name is your own estimate, and say so");
    // No box, no section.
    expect(buildBrief({ ...none, buyBoxChecks: { checks, tripped: [] } })).not.toContain("buy box");
  });
});

// Research pass 18: the verdict judged the debt with no rate in hand, and the
// line the challenger read named no spread of the site's own.
describe("the verdict is handed the latest published rates the challenger reads", () => {
  const none = { extraction: null, challenges: null, comps: null, reconciliation: null, market: null };

  it("last, as the challenger was handed them; none, no section", () => {
    const line = "LATEST PUBLISHED RATES (FRED, each dated the day it is for): the 5-yr Treasury 3.90% (Sep 22, 2026), which the site's model prices a fixed-rate permanent loan off for its hold of 5 years, adding a 200 bps multifamily spread — the site's screening default, an assumption a lender's quote replaces, never a quote.";
    const brief = buildBrief({ ...none, ratesLine: line });
    expect(brief.endsWith(`## The latest published rates\n\n${line}`)).toBe(true);
    expect(buildBrief({ ...none, ratesLine: null })).not.toContain("latest published rates");
  });
});

