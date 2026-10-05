// Research pass 40, M7: on a share, the deal page's playground printed the
// whole building's grossed-up figure under "Purchase price" and solved its max
// bid on it — "$38.87M (−4.7% vs the modeled price)" for a 49% share whose
// own bid is $19,050,982 — while the workbook's tile already named the figure
// "Whole Price (49% share grossed up)". The field takes the model's own name
// for its price, and the bid says the share's beside the whole's, at the
// share the memorandum states. The fixture is the report's; every name is
// invented.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { screeningCompareModel } from "@/lib/underwrite/report-grid";
import { solveMaxBid } from "@/lib/underwrite/solver";
import { modelReturnsRead } from "@/lib/compare-interest";
import { isTenancyInCommon } from "@/lib/interest";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { a11yIssues, visibleText } from "./render-lint";

const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3" });
const SHARE = {
  dealName: "Share deal",
  assetClass: "multifamily",
  totalPages: 40,
  interest: {
    kind: "partial_interest",
    summary: "A 49% limited partnership interest.",
    share: "49% limited partnership interest in the partnership that owns 100% of the fee simple interest",
    groundLease: "",
    loan: "",
    page: "p. 2",
  },
  metrics: [row("Asking price", "$20,000,000"), row("NOI (in-place)", "$2,250,000"), row("Going-in cap rate", "5.5%"), row("Units", "180")],
} as unknown as ExtractionResult;

// The playground's data as the deal page builds it from the derived model.
function drawn(ex: ExtractionResult) {
  const d = deriveUnderwriteInputs(ex, "x");
  const data: PlaygroundData = {
    inputs: d.inputs,
    dealAssetClass: "multifamily",
    checkSource: { assetClass: "multifamily", market: "", metrics: ex.metrics },
    box: { ...SAMPLE_DEMO_BOX, minIrrPct: 12, minCoCPct: undefined, minCapPct: undefined },
    strategy: d.meta.strategy ?? null,
    sources: d.sources,
    interest: modelReturnsRead(ex, screeningCompareModel(d.inputs)),
    occupancyPct: d.meta.occupancyPct ?? null,
    buildingPriced: !d.meta.interest?.basisWithheld,
    priceLabel: d.meta.priceLabel ?? null,
    sharePct: d.meta.grossedUpSharePct ?? null,
    shareNoun: isTenancyInCommon(ex) ? "interest" : "share",
  };
  const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
  return { d, html, text: visibleText(html) };
}

describe("a share's price and max bid on the deal page (research pass 40, M7)", () => {
  it("names the price the whole's, and states the share's bid beside the whole's", () => {
    const { d, html, text } = drawn(SHARE);
    expect(Math.round(d.inputs.purchasePrice)).toBe(40_816_327);
    expect(d.meta.priceLabel).toBe("Whole Price (49% share grossed up)");
    expect(d.meta.grossedUpSharePct).toBe(49);
    // The field says what the figure is, and so does its accessible name.
    expect(text).toContain("Whole Price (49% share grossed up)");
    expect(html).toMatch(/aria-label="Whole Price \(49% share grossed up\) scenario"/);
    expect(text).not.toMatch(/Purchase price\s+\$40,816,327/);
    // The whole's bid at the 12% floor, and the share's beside it: the
    // whole's times 49%, rounded down as the whole's is.
    const whole = solveMaxBid(d.inputs, { minIrr: 0.12 }).price!;
    expect(Math.abs(whole * 0.49 - 19_050_982)).toBeLessThan(2);
    expect(text).toContain("$38.87M");
    expect(text).toContain("That is the whole's price, the share grossed up; the 49% share's is $19.05M.");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("says nothing of a share where the price buys the whole building", () => {
    const fee = { ...SHARE, interest: undefined } as unknown as ExtractionResult;
    const { d, html, text } = drawn(fee);
    expect(d.meta.priceLabel ?? null).toBeNull();
    expect(d.meta.grossedUpSharePct).toBeUndefined();
    expect(html).toMatch(/aria-label="Purchase price scenario"/);
    expect(text).not.toContain("share's is");
  });

  // Audit C4, L4: a tenancy in common's share is an interest in the
  // property, never an entity's share (research pass 37); the bid had said
  // "the 30% share's is …" beside "Whole Price (30% TIC interest grossed up)".
  it("calls a TIC's share an interest in the bid's words, as its price label does", () => {
    const tic = {
      ...SHARE,
      interest: {
        kind: "partial_interest",
        summary: "An undivided 30% tenant-in-common interest in the fee simple, held under a TIC agreement",
        share: "30% tenant-in-common interest",
        groundLease: "",
        loan: "",
        page: "p. 2",
      },
    } as unknown as ExtractionResult;
    const { d, text } = drawn(tic);
    expect(d.meta.priceLabel).toBe("Whole Price (30% TIC interest grossed up)");
    expect(text).toMatch(/That is the whole's price, the interest grossed up; the 30% interest's is \$[\d.]+M\./);
    expect(text).not.toMatch(/share grossed up|share's is/);
  });
});
