import { describe, it, expect } from "vitest";
import { HOLD_MONTHS, deriveUnderwriteInputs, permanentLoanSpread } from "./inputs";
import { computeUnderwrite } from "./engine";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { DebtIndex } from "@/lib/debt-index";

const extraction: ExtractionResult = {
  dealName: "Test Industrial Portfolio",
  assetClass: "industrial",
  market: "Inland Empire, CA",
  address: "1 Logistics Way, Fontana, CA",
  metrics: [
    { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
    { label: "Going-in cap rate", value: "6.0%", flagged: true, page: "p. 6" },
    { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
    { label: "Rentable square feet", value: "250,000", flagged: false, page: "p. 4" },
    { label: "Occupancy", value: "95%", flagged: false, page: "p. 8" },
  ],
};

describe("deriveUnderwriteInputs — NOI anchor", () => {
  const { inputs, sources, meta } = deriveUnderwriteInputs(extraction, "fallback");
  const r = computeUnderwrite(inputs);

  it("reconstructs year-1 NOI to equal the extracted NOI", () => {
    expect(r.cashFlow[0].noi).toBeCloseTo(3_000_000, 0);
  });
  it("workbook going-in cap ties to the OM cap", () => {
    expect(r.returns.goingInCapPct).toBeCloseTo(0.06, 4);
  });
  it("carries the real price page, never fabricated", () => {
    expect(sources.purchasePrice?.provenance).toBe("extracted");
    expect(sources.purchasePrice?.page).toBe("p. 5");
  });
  it("marks the income split as derived (NOI is real, the split is assumed)", () => {
    expect(sources.inPlaceRentAnnual?.provenance).toBe("derived");
  });
  it("carries deal identity for the Deal Summary tab", () => {
    expect(meta.dealName).toBe("Test Industrial Portfolio");
    expect(meta.rsf).toBe(250_000);
    expect(meta.occupancyPct).toBeCloseTo(0.95, 4);
  });
  it("Sources = Uses on the derived model", () => {
    expect(r.sourcesUses.balanced).toBe(true);
  });
});

// Research pass 28: a skilled-nursing deck stating "EBITDAR (T-12) $2.8M",
// or a car wash stating its EBITDA, ran on "No NOI or cap in the OM —
// assumed 6% going-in" — a note that read as if the memorandum stated no
// earnings at all. The note now says what it states and that it is not
// used; the model's figures do not move.
describe("deriveUnderwriteInputs — an operating business's EBITDA is said, never used", () => {
  const snf = (metrics: ExtractionResult["metrics"]): ExtractionResult => ({
    dealName: "Lakeside Skilled Nursing",
    assetClass: "Skilled Nursing Facility",
    metrics: [
      { label: "Asking price", value: "$18,000,000", flagged: false, page: "p. 2" },
      { label: "Licensed beds", value: "120", flagged: false, page: "p. 2" },
      { label: "Occupancy", value: "84%", flagged: false, page: "p. 3" },
      ...metrics,
    ],
  });
  const EBITDAR = { label: "EBITDAR (T-12)", value: "$2,800,000", flagged: true, page: "p. 9" };

  it("names the stated EBITDAR in the NOI note, and every figure is the model's as before", () => {
    const withIt = deriveUnderwriteInputs(snf([EBITDAR]), "x");
    const without = deriveUnderwriteInputs(snf([]), "x");
    // Not one number moves: the NOI is still the assumed 6% of the price.
    expect(withIt.inputs).toEqual(without.inputs);
    expect(computeUnderwrite(withIt.inputs).returns).toEqual(computeUnderwrite(without.inputs).returns);
    expect(computeUnderwrite(withIt.inputs).cashFlow[0].noi).toBeCloseTo(18_000_000 * 0.06, 0);
    expect(withIt.sources.inPlaceRentAnnual?.provenance).toBe("assumption");
    expect(withIt.sources.inPlaceRentAnnual?.note).toBe(
      "The OM states the business's EBITDAR (T-12) of $2,800,000, which is not the real estate's NOI and is not used; with no NOI or cap in the OM, the model assumed 6% going-in",
    );
    // With none stated, the note is as it was.
    expect(without.sources.inPlaceRentAnnual?.note).toBe("No NOI or cap in the OM — assumed 6% going-in");
    // A car wash's EBITDA, by the same rule.
    const wash = deriveUnderwriteInputs(
      { dealName: "Express Car Wash", assetClass: "Car Wash", metrics: [{ label: "Asking price", value: "$9,000,000", flagged: false, page: "p. 1" }, { label: "EBITDA", value: "$900,000", flagged: false, page: "p. 4" }] },
      "x",
    );
    expect(wash.sources.inPlaceRentAnnual?.note).toBe(
      "The OM states the business's EBITDA of $900,000, which is not the real estate's NOI and is not used; with no NOI or cap in the OM, the model assumed 6% going-in",
    );
    expect(computeUnderwrite(wash.inputs).cashFlow[0].noi).toBeCloseTo(540_000, 0);
  });

  it("no NOI reader takes an EBITDA row, and a margin, a multiple or a coverage is no EBITDA", async () => {
    const { classifyNoi, ebitdaFigure, noiFigures } = await import("@/lib/deal-strategy");
    const labels = ["EBITDA", "EBITDAR", "EBITDAR (T-12)", "EBITDARM", "Adjusted EBITDA", "Store-level EBITDA (TTM)"];
    for (const label of labels) {
      expect(classifyNoi({ label, value: "$900,000" }), label).toBeNull();
      expect(ebitdaFigure([{ label, value: "$900,000" }])?.value, label).toBe(900_000);
    }
    expect(noiFigures(labels.map((label) => ({ label, value: "$900,000" })))).toEqual([]);
    for (const [label, value] of [
      ["EBITDA margin", "32%"],
      ["EBITDA multiple", "6.5x"],
      ["EBITDAR coverage", "1.40x"],
      ["EBITDA per unit", "$7,500"],
      ["EBITDAR", "1.4x"],
      ["EBITDA", "18%"],
    ]) {
      expect(ebitdaFigure([{ label, value }]), label).toBeNull();
    }
    expect(ebitdaFigure([])).toBeNull();
    // The extraction is asked to file it where this reads it, never as an NOI.
    const { extractionInstruction } = await import("@/lib/anthropic/prompts");
    const prompt = extractionInstruction("auto");
    expect(prompt).toContain('under "EBITDA" or "EBITDAR" exactly as stated, with its period (like "EBITDAR (T-12)"), and never under an NOI label');
  });

  it("beside an NOI that cannot anchor year 1, the note names the EBITDA too", () => {
    const d = deriveUnderwriteInputs(snf([{ label: "NOI (in-place)", value: "$0", flagged: false, page: "p. 9" }, EBITDAR]), "x");
    expect(d.sources.inPlaceRentAnnual?.note).toBe(
      "The OM's NOI (in-place) is $0 — no income in place to anchor year 1 on. No going-in cap in the OM either — assumed 6% going-in; enter the in-place NOI. The OM states the business's EBITDAR (T-12) of $2,800,000, which is not the real estate's NOI and is not used",
    );
    expect(d.inputs).toEqual(deriveUnderwriteInputs(snf([{ label: "NOI (in-place)", value: "$0", flagged: false, page: "p. 9" }]), "x").inputs);
  });
});

describe("deriveUnderwriteInputs — the cap the workbook reads is the going-in cap the page shows", () => {
  it("a residual or at-completion cap never backs a price out, and never seeds the exit cap", () => {
    for (const label of ["Residual cap rate", "Cap rate at completion", "Cap rate (Year 3)"]) {
      const { inputs, sources } = deriveUnderwriteInputs(
        {
          ...extraction,
          metrics: [
            { label, value: "7.50%", flagged: false, page: "p. 6" },
            { label: "NOI (in-place)", value: "$1,000,000", flagged: false, page: "p. 7" },
          ],
        },
        "fallback",
      );
      expect(sources.purchasePrice?.provenance, label).toBe("assumption");
      expect(inputs.exitCapPct, label).not.toBeCloseTo(0.075, 4);
    }
  });
});

describe("deriveUnderwriteInputs — the unit count is the row that counts units", () => {
  const mf = (metrics: Array<[string, string]>): ExtractionResult => ({
    dealName: "Maddox Apartments",
    assetClass: "multifamily",
    market: "Dallas, TX",
    address: "",
    metrics: metrics.map(([label, value]) => ({ label, value, flagged: false, page: "" })),
  });

  it("a 'Unit mix' row ahead of 'Units' never shadows the count, and '248 units' parses", () => {
    const { meta } = deriveUnderwriteInputs(
      mf([
        ["Asking price", "$50,000,000"],
        ["Unit mix", "40% studio / 60% 1BR"],
        ["Units", "248 units"],
      ]),
      "x",
    );
    expect(meta.units).toBe(248);
  });

  it("a partial count ('Vacant units') is not the count — null, never a guess", () => {
    const { meta } = deriveUnderwriteInputs(
      mf([
        ["Asking price", "$50,000,000"],
        ["Vacant units", "12"],
      ]),
      "x",
    );
    expect(meta.units).toBeNull();
  });
});

describe("deriveUnderwriteInputs — empty extraction", () => {
  it("falls back to labelled assumptions and still computes a balanced model", () => {
    const { inputs, sources } = deriveUnderwriteInputs(null, "Blank Deal");
    const r = computeUnderwrite(inputs);
    expect(sources.purchasePrice?.provenance).toBe("assumption");
    expect(r.sourcesUses.balanced).toBe(true);
    expect(r.returns.leveredIrrPct).not.toBeNull();
  });
});

// ── Feature 1: property actuals re-base the model ──────────────────────────

const T12 = {
  summary: {
    collectedRent: 3_400_000,
    vacancyLoss: 150_000,
    otherIncome: 100_000,
    egi: 3_350_000,
    opex: [],
    totalOpex: 1_150_000,
    noi: 2_200_000, // vs the OM's assumed $3.0M — an optimistic OM
    noiDerived: false,
  },
  periodEnd: "2026-05-31",
};
const RENT_ROLL = {
  summary: {
    unitCount: 40,
    occupiedUnits: 36,
    totalSf: 240_000,
    occupiedSf: 216_000,
    sfWeightedOccupancy: 0.9, // vs the OM's stated 95%
    waltYears: 3.2,
    weightedAvgRentPsf: 14,
    expiryBuckets: null,
    expiryCoveredSf: 0,
    truncated: false,
  },
  asOf: "2026-05-01",
};

describe("deriveUnderwriteInputs — actuals override the OM narrative", () => {
  const base = deriveUnderwriteInputs(extraction, "fallback");
  const withActuals = deriveUnderwriteInputs(extraction, "fallback", {
    rentRoll: RENT_ROLL,
    t12: T12,
  });
  const r = computeUnderwrite(withActuals.inputs);

  it("anchors year-1 NOI on the T-12 actual, not the OM figure", () => {
    expect(r.cashFlow[0].noi).toBeCloseTo(2_200_000, 0);
    expect(withActuals.sources.inPlaceRentAnnual?.note).toMatch(/T-12 actual NOI/);
  });
  it("uses the T-12 actual expense ratio (opex/EGI) in the reconstruction", () => {
    const er = 1_150_000 / 3_350_000;
    const egr = 2_200_000 / (1 - er);
    expect(withActuals.inputs.expenseLines[0].annual).toBeCloseTo(egr - 2_200_000, 0);
    expect(withActuals.sources.expenseLines?.provenance).toBe("extracted");
  });
  it("uses the rent roll's SF-weighted occupancy as vacancy", () => {
    expect(withActuals.inputs.vacancyPct).toBeCloseTo(0.1, 6);
    expect(withActuals.sources.vacancyPct?.provenance).toBe("extracted");
    expect(withActuals.sources.vacancyPct?.note).toMatch(/Rent roll actual/);
  });
  it("uses the rent roll's summed SF over the OM building size", () => {
    expect(withActuals.inputs.rsf).toBe(240_000);
    expect(withActuals.meta.occupancyPct).toBeCloseTo(0.9, 6);
  });
  it("a weaker actual NOI lowers the returns vs the OM story", () => {
    const baseR = computeUnderwrite(base.inputs);
    expect(r.returns.leveredIrrPct ?? 0).toBeLessThan(baseR.returns.leveredIrrPct ?? 0);
  });
  it("model still balances with actuals in", () => {
    expect(r.sourcesUses.balanced).toBe(true);
  });
});

describe("deriveUnderwriteInputs — degenerate actuals are ignored", () => {
  it("non-positive NOI, zero SF, and out-of-band ratios fall back to defaults", () => {
    const junk = deriveUnderwriteInputs(extraction, "fallback", {
      rentRoll: {
        summary: { ...RENT_ROLL.summary, totalSf: 0, sfWeightedOccupancy: 0.01 },
        asOf: null,
      },
      t12: {
        summary: { ...T12.summary, noi: -500_000, totalOpex: 3_400_000, egi: 3_350_000 },
        periodEnd: null,
      },
    });
    const clean = deriveUnderwriteInputs(extraction, "fallback");
    expect(junk.inputs).toEqual(clean.inputs);
  });

  it("the OM-only path is byte-identical with and without an empty actuals arg", () => {
    const a = deriveUnderwriteInputs(extraction, "fallback");
    const b = deriveUnderwriteInputs(extraction, "fallback", {});
    expect(b).toEqual(a);
  });

  it("a TRUNCATED roll's partial SF sum never replaces the OM building size", () => {
    const { inputs } = deriveUnderwriteInputs(extraction, "fallback", {
      rentRoll: {
        summary: { ...RENT_ROLL.summary, truncated: true, totalSf: 160_000 },
        asOf: "2026-05-01",
      },
    });
    expect(inputs.rsf).toBe(250_000); // the OM figure stands
    // …while the ratio-based occupancy still applies (a valid sample estimate).
    expect(inputs.vacancyPct).toBeCloseTo(0.1, 6);
  });
});

describe("deriveUnderwriteInputs — implausible cap rates never anchor", () => {
  it("a parsed 0% cap falls back to the 6% exit default", () => {
    const ex: ExtractionResult = {
      dealName: "Zero Cap",
      assetClass: "industrial",
      metrics: [{ label: "Cap Rate", value: "0%", flagged: false, page: "" }],
    };
    const { inputs } = deriveUnderwriteInputs(ex, "fallback");
    expect(inputs.exitCapPct).toBe(0.06);
  });
  it("an 'Expense Cap: 35%' label is never read as the cap rate", () => {
    const ex: ExtractionResult = {
      dealName: "Expense Cap",
      assetClass: "industrial",
      metrics: [{ label: "Expense Cap", value: "35%", flagged: false, page: "" }],
    };
    const { inputs } = deriveUnderwriteInputs(ex, "fallback");
    expect(inputs.exitCapPct).toBe(0.06);
  });
});

describe("deriveUnderwriteInputs — a spelled-out NOI label anchors", () => {
  it("'Net operating income' is not disqualified by the 'per' in 'operating'", () => {
    const ex: ExtractionResult = {
      dealName: "Spelled Out",
      assetClass: "industrial",
      metrics: [
        { label: "Asking price", value: "$50,000,000", flagged: false, page: "" },
        { label: "Going-in cap rate", value: "6.0%", flagged: false, page: "" },
        // Deliberately different from price × cap ($3.0M) so a fallback there
        // can't mask a failure to read this metric.
        { label: "Net operating income", value: "$2,600,000", flagged: false, page: "" },
      ],
    };
    const { inputs } = deriveUnderwriteInputs(ex, "fallback");
    const r = computeUnderwrite(inputs);
    expect(r.cashFlow[0].noi).toBeCloseTo(2_600_000, 0);
  });
});

describe("deriveUnderwriteInputs — the In-Place Occupancy cell reads today's figure", () => {
  const mf = (metrics: Array<[string, string]>): ExtractionResult => ({
    dealName: "Maddox Apartments",
    assetClass: "multifamily",
    market: "Dallas, TX",
    address: "",
    metrics: metrics.map(([label, value]) => ({ label, value, flagged: false, page: "" })),
  });

  it("a stabilized occupancy listed first never fills it; the current figure does", () => {
    const { meta } = deriveUnderwriteInputs(
      mf([
        ["Asking price", "$50,000,000"],
        ["Stabilized occupancy", "95%"],
        ["Current occupancy", "42%"],
      ]),
      "x",
    );
    expect(meta.occupancyPct).toBeCloseTo(0.42, 6);
  });

  it("an OM that states only the finished project's occupancy states none", () => {
    const { meta } = deriveUnderwriteInputs(
      mf([
        ["Asking price", "$50,000,000"],
        ["Stabilized occupancy", "95%"],
      ]),
      "x",
    );
    expect(meta.occupancyPct).toBeNull();
  });
});

describe("deriveUnderwriteInputs — the rate starts from today's curve", () => {
  // The 5-year Treasury as the runner's own table printed it (lib/live-rates.fixture.ts).
  const five: DebtIndex = { id: "DGS5", short: "5-yr", pct: 4.78, asOf: "2026-09-17", kind: "treasury" };
  const withClass = (cls: string): ExtractionResult => ({
    ...extraction,
    assetClass: cls as ExtractionResult["assetClass"],
  });

  it("with the day's index, the rate is the tenor nearest the hold plus the class spread, and the note names both with the date", () => {
    const { inputs, sources, meta } = deriveUnderwriteInputs(extraction, "x", undefined, { debtIndex: five });
    // Industrial: 4.78 + 225 bps.
    expect(inputs.allInRatePct).toBeCloseTo(0.0703, 6);
    expect(inputs.holdMonths).toBe(HOLD_MONTHS);
    expect(sources.allInRatePct?.provenance).toBe("assumption");
    expect(sources.allInRatePct?.note).toBe(
      "5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 225 bps industrial spread, a screening default — enter your quote",
    );
    // The seed rides in meta so the deal page's sizer starts where the workbook does.
    expect(meta.rateSeed).toEqual({ pct: 7.03, note: sources.allInRatePct?.note });
  });

  it("each class carries its own spread — an apartment prices tighter than a hotel", () => {
    const rate = (cls: string) =>
      deriveUnderwriteInputs(withClass(cls), "x", undefined, { debtIndex: five }).inputs.allInRatePct;
    expect(rate("multifamily")).toBeCloseTo(0.0678, 6);
    expect(rate("office")).toBeCloseTo(0.0778, 6);
    expect(rate("hospitality_str")).toBeCloseTo(0.0803, 6);
    expect(deriveUnderwriteInputs(withClass("multifamily"), "x", undefined, { debtIndex: five }).sources.allInRatePct?.note).toContain(
      "+ 200 bps multifamily spread",
    );
  });

  it("without an index the flat default stays, and the note never claims the market was consulted", () => {
    const { inputs, sources, meta } = deriveUnderwriteInputs(extraction, "x");
    expect(inputs.allInRatePct).toBe(0.06);
    expect(sources.allInRatePct?.note).toBe("Enter your all-in rate (index + spread)");
    expect(meta.rateSeed).toBeNull();
    expect(deriveUnderwriteInputs(extraction, "x", undefined, { debtIndex: null }).inputs.allInRatePct).toBe(0.06);
    expect(deriveUnderwriteInputs(extraction, "x", undefined, {}).sources.allInRatePct?.note).toBe(
      "Enter your all-in rate (index + spread)",
    );
  });

  it("land carries no permanent loan to seed a rate from, and says so", () => {
    const land = deriveUnderwriteInputs(withClass("land_infill"), "x", undefined, { debtIndex: five });
    expect(land.inputs.allInRatePct).toBe(0.06);
    expect(land.sources.allInRatePct?.note).toMatch(/^Land carries no permanent loan/);
    expect(land.meta.rateSeed).toBeNull();
  });

  // Research pass 18: the rates line a Claude step reads names the spread
  // the model adds; the reader must be the one the seed is built from.
  it("permanentLoanSpread names the spread the seeded rate adds, class for class, and none on land", () => {
    for (const cls of ["multifamily", "office", "industrial", "hospitality_str", "self_storage", "Boutique hotel", "auto"]) {
      const spread = permanentLoanSpread(cls);
      const note = deriveUnderwriteInputs(withClass(cls), "x", undefined, { debtIndex: five }).sources.allInRatePct?.note ?? "";
      expect(spread.bps, cls).not.toBeNull();
      expect(note, cls).toContain(`+ ${spread.bps} bps ${spread.label}, a screening default`);
    }
    expect(permanentLoanSpread("multifamily")).toEqual({ bps: 200, label: "multifamily spread" });
    expect(permanentLoanSpread("land_infill").bps).toBeNull();
  });

  it("the seeded rate is what the engine runs on — the debt service moves with the curve", () => {
    const flat = computeUnderwrite(deriveUnderwriteInputs(extraction, "x").inputs);
    const seeded = computeUnderwrite(
      deriveUnderwriteInputs(extraction, "x", undefined, { debtIndex: five }).inputs,
    );
    expect(seeded.cashFlow[0].debtService).toBeGreaterThan(flat.cashFlow[0].debtService);
  });
});
