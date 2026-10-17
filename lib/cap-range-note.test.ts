// Research pass 38, item 17 (C27): a going-in cap stated as a range ran at
// its low end, and the notes called it "the OM's stated going-in cap" — the
// exit at 5.25% of "5.25% - 5.75%", and with no price the price backed out
// at 5.25% as "NOI ÷ going-in cap". The notes name the range and the end the
// model takes now, as the price note does a price range's. Which end is the
// owner's. Every name is invented.
import { describe, expect, it } from "vitest";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { ex, m } from "@/lib/pass38.fixture";

const RANGE = "the low end of the 5.25%–5.75% range the OM states as its going-in cap";
const capRange = ex({
  assetClass: "Multifamily",
  dealName: "Alder Commons",
  metrics: [m("Asking price", "40,000,000"), m("NOI (in-place)", "2,200,000", "in_place"), m("Going-in cap rate", "5.25% - 5.75%"), m("Units", "180")],
});
const capRangeNoPrice = ex({
  assetClass: "Multifamily",
  dealName: "Alder Commons",
  metrics: [m("Going-in cap rate", "5.25% - 5.75%"), m("NOI (in-place)", "2,200,000", "in_place"), m("Units", "180")],
});

describe("a going-in cap stated as a range (research pass 38, item 17)", () => {
  it("names the range and the end the exit runs at", () => {
    const d = deriveUnderwriteInputs(capRange, "x");
    expect(d.inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    expect(d.sources.exitCapPct?.note).toMatch(new RegExp(`^Defaulted to ${RANGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.* — set your exit view$`));
  });

  it("names them where the price is backed out of the cap", () => {
    const d = deriveUnderwriteInputs(capRangeNoPrice, "x");
    expect(d.inputs.purchasePrice).toBeCloseTo(2_200_000 / 0.0525, 0);
    expect(d.sources.purchasePrice?.note).toBe(`NOI ÷ ${RANGE}`);
  });

  it("names them where the NOI is struck from the price and the cap", () => {
    const d = deriveUnderwriteInputs(
      ex({ assetClass: "Office", dealName: "Linden Plaza", metrics: [m("Asking price", "40,000,000"), m("Going-in cap rate", "6.75% to 7.25%"), m("Total SF", "160,000 SF")] }),
      "x",
    );
    expect(d.sources.inPlaceRentAnnual?.note).toBe(
      "From price × the low end of the 6.75%–7.25% range the OM states as its going-in cap, at an assumed expense ratio",
    );
  });

  it("says nothing new of one stated cap", () => {
    const d = deriveUnderwriteInputs(
      ex({ assetClass: "Multifamily", dealName: "Alder Commons", metrics: [m("Going-in cap rate", "5.50%"), m("NOI (in-place)", "2,200,000", "in_place"), m("Units", "180")] }),
      "x",
    );
    expect(d.sources.purchasePrice?.note).toBe("NOI ÷ going-in cap");
    expect(d.sources.exitCapPct?.note).toMatch(/^Defaulted to the OM's stated going-in cap/);
  });
});
