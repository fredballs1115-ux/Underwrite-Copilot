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
