import { describe, it, expect } from "vitest";
import { deriveUnderwriteInputs } from "./inputs";
import { computeUnderwrite } from "./engine";
import type { ExtractionResult } from "@/lib/anthropic/types";

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
});
