// Research pass 40, H2: an auction's modelled price is its opening floor,
// and the max-bid solver stopped at twice the modelled price, so the deal
// page's sale panel, the workbook's cover and the report said "the bidding,
// not the model, sets the ceiling" of a model whose own ceiling at the 15%
// hurdle is $7,314,580 all-in. The window now doubles while every floor
// clears, and the bid is solved inside it. The fixture is lib/sale-terms'
// own auction; every name is invented.
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { buildSensitivityData, maxBidSentence } from "@/lib/underwrite/report-grid";
import { MAX_BID_SEARCH_X, solveMaxBid } from "@/lib/underwrite/solver";
import { saleCeiling } from "@/lib/sale-ceiling";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 3"): Row => ({ label, value, flagged: false, page, basis: "na" });

const AUCTION = {
  dealName: "Midtown Office Tower",
  assetClass: "office",
  totalPages: 30,
  sale: { method: "auction", terms: "Online auction; 10% non-refundable deposit; 30-day close; no financing contingency", condition: "As-is, where-is", page: "p. 3" },
  metrics: [
    row("NOI (in-place)", "$480,000"),
    row("Total SF", "62,000 SF"),
    row("Starting bid", "$2,500,000"),
    row("Buyer's premium", "5% of the winning bid"),
    row("Reserve price", "Undisclosed"),
    row("Bid deadline", "October 15, 2026"),
  ],
} as unknown as ExtractionResult;

describe("the model's own ceiling past twice the opening floor (research pass 40, H2)", () => {
  const { inputs } = deriveUnderwriteInputs(AUCTION, "x");

  it("solves the auction's ceiling at the 15% hurdle, and backs the premium out of it", () => {
    expect(inputs.purchasePrice).toBe(2_625_000);
    const c = saleCeiling(AUCTION, inputs, 15)!;
    expect(c.unbounded).toBe(false);
    expect(Math.abs(c.maxAllIn! - 7_314_580)).toBeLessThan(2);
    expect(Math.abs(c.hammer! - 6_966_267)).toBeLessThan(2);
    expect(c.line).toBe(
      "At a 15% levered IRR the model pays at most $7.31M all-in — a hammer price of $6.97M with the 5% premium on top, $4.47M over the starting bid.",
    );
    // The edge: the hurdle at the ceiling, and under it a little past.
    expect(computeUnderwrite({ ...inputs, purchasePrice: c.maxAllIn! }).returns.leveredIrrPct!).toBeGreaterThanOrEqual(0.15 - 1e-9);
    expect(computeUnderwrite({ ...inputs, purchasePrice: c.maxAllIn! + 1_000 }).returns.leveredIrrPct!).toBeLessThan(0.15);
  });

  it("feeds the report's max bid from the same window, and says what was searched where every floor clears", () => {
    const s = buildSensitivityData(inputs, null, {});
    expect(Math.abs(s.maxBid!.price - 7_314_580)).toBeLessThan(2);
    expect(s.maxBid!.unbounded).toBe(false);
    // A floor that clears across the whole range is at least its top, and
    // the sentence says what was searched.
    const floors = { minCap: 0.0001 };
    const low = solveMaxBid(inputs, floors);
    expect(low.unbounded).toBe(true);
    expect(low.price).toBeCloseTo(inputs.purchasePrice * MAX_BID_SEARCH_X, 6);
    const box = buildSensitivityData(inputs, null, { floors });
    expect(maxBidSentence(box)).toBe(
      "Max bid: your buy box's floors (0.01% going-in cap) hold even at 64 times the modelled price ($168.00M), the top of the range searched, so the box is not the constraint on this deal.",
    );
  });
});
