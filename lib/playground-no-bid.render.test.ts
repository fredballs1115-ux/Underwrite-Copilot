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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { noBidSentence } from "@/lib/underwrite/solver";

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

  it("says the price the bid is solved against, and a share's own bid beside the whole's (audit C6, LOW-6)", () => {
    const floors = { minIrr: 0.1, minCoc: 0.05 };
    const nb = {
      alone: [
        { key: "minIrr" as const, price: 5_000_000, unbounded: true },
        { key: "minCoc" as const, price: null, unbounded: false },
      ],
      yearOneNegative: true,
      yearOneCapital: null,
    };
    // The report's modelled price, as before.
    expect(noBidSentence(floors, nb)).toContain("up to 64 times the modelled price");
    // A placeholder's bid is solved on the price the reader typed.
    const typed = noBidSentence(floors, nb, { vs: "the price entered" })!;
    expect(typed).toContain("up to 64 times the price entered");
    expect(typed).not.toContain("the modelled price");
    // A share's floor-alone price is the whole's, the share's said beside it.
    const share = noBidSentence(floors, { ...nb, alone: [{ key: "minIrr" as const, price: 20_000_000, unbounded: false }, nb.alone[1]] }, {
      share: { pct: 49, noun: "share" },
    })!;
    expect(share).toContain("up to $20.00M (the whole's price, the share grossed up; the 49% share's is $9.80M)");
    // The playground hands the sentence its words.
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/sensitivity-playground.tsx"), "utf8");
    expect(src).toMatch(/noBidSentence\(floors, noBidRead\(solveOn, floors, levers\), \{[^}]*vs: bidAgainst != null \? "the price entered"/);
  });
});
