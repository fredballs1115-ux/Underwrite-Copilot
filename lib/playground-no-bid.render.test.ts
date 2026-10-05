// Audit C3a, MED-7: where no price clears the buy box's floors together, the
// report names the floor that never clears and how far each other floor
// clears alone (ccee302), and its own test holds it to never saying "the
// deal's economics, not its price, are the blocker". The deal page's max-bid
// card still printed that line beside an IRR floor the price does clear:
// one deal, two reasons. Both now read one sentence, solved beside
// solveMaxBid. The fixture is the sample's model with a year-1 capital
// budget its NOI cannot carry.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildSensitivityData, maxBidSentence } from "@/lib/underwrite/report-grid";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { visibleText } from "./render-lint";

describe("the deal page's no-bid sentence is the report's", () => {
  it("names the floor that never clears and how far the others clear alone, never 'the economics are the blocker'", () => {
    const d = sampleDerivedInputs();
    const inputs = { ...d.inputs, capitalImprovementsYr1: 20_000_000 };
    const box = { ...SAMPLE_DEMO_BOX, minIrrPct: 10, minCoCPct: 5, minCapPct: 5 };
    const report = maxBidSentence(buildSensitivityData(inputs, 10, { floors: { minIrr: 0.1, minCoc: 0.05, minCap: 0.05 } }));
    expect(report).toMatch(/^No price inside the tested range clears your 5% cash-on-cash floor: year 1 carries \$20\.0M of capital/);
    const data: PlaygroundData = {
      inputs,
      dealAssetClass: "multifamily",
      checkSource: { assetClass: "multifamily", market: "", metrics: [] },
      box,
      strategy: null,
      sources: d.sources,
      occupancyPct: d.meta.occupancyPct ?? null,
    };
    const text = visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })));
    expect(text).toContain(report);
    expect(text).not.toContain("the deal economics, not the price, are the blocker");
  });
});
