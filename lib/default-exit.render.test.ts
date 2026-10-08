// Research pass 38, item 6: where the memorandum states no going-in cap the
// exit is the model's 6.00% default, set against no entry. A $10M office
// whose NOI is $800,000 (an 8.00% entry) read a 25.1% IRR on the default
// exit — 200 bps of compression nobody chose — and the note said only
// "Default 6.0% — set your exit view". The exit's SOURCE note and one line
// under the playground's tiles now name the model's own entry and the gap.
// Which default the exit takes is the owner's.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { defaultExitGap } from "@/lib/underwrite/cost-note";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { visibleText } from "@/lib/render-lint";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { ex, m } from "@/lib/pass38.fixture";

const noCap75 = ex({ assetClass: "Office", dealName: "Corporate Plaza", metrics: [m("Asking price", "10,000,000"), m("NOI (in-place)", "800,000", "in_place"), m("Total SF", "60,000 SF")] });
const noCap45 = ex({ assetClass: "Multifamily", dealName: "Bayview", metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "900,000", "in_place"), m("Units", "70")] });

const drawn = (e: ExtractionResult, extra: Partial<PlaygroundData> = {}) => {
  const d = deriveUnderwriteInputs(e, "x");
  const data: PlaygroundData = {
    inputs: d.inputs,
    dealAssetClass: e.assetClass ?? "auto",
    checkSource: null,
    box: null,
    sources: d.sources,
    occupancyPct: d.meta.occupancyPct,
    buildingPriced: !d.meta.interest?.basisWithheld,
    ...extra,
  };
  return { d, text: visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }))) };
};

describe("the default exit set against the model's own entry (research pass 38, item 6)", () => {
  it("names the compression the default carries in the exit's note and under the tiles", () => {
    const { d, text } = drawn(noCap75);
    const said = "Default 6.00%; the model's own year-1 NOI over its price is 8.00%: 200 bps of compression ride in these returns";
    expect(d.sources.exitCapPct?.note).toBe(`${said} — set your exit view`);
    expect(text).toContain(`Exit cap — ${said}.`);
  });

  it("names an expansion as one", () => {
    const { d, text } = drawn(noCap45);
    expect(d.sources.exitCapPct?.note).toBe(
      "Default 6.00%; the model's own year-1 NOI over its price is 4.50%: 150 bps of expansion ride in these returns — set your exit view",
    );
    expect(text).toContain("150 bps of expansion ride in these returns.");
  });

  it("says nothing new where a cap is stated, the NOI is assumed, or the price is not the building's", () => {
    const stated = deriveUnderwriteInputs(ex({ ...noCap75, metrics: [...noCap75.metrics, m("Going-in cap rate", "8.00%")] }), "x");
    expect(stated.sources.exitCapPct?.note).toBe("Defaulted to the OM's stated going-in cap — set your exit view");
    const assumed = drawn(ex({ assetClass: "Office", metrics: [m("Asking price", "10,000,000"), m("Total SF", "60,000 SF")] }));
    expect(assumed.d.sources.exitCapPct?.note).toBe("Default 6.0% — set your exit view");
    expect(assumed.text).not.toContain("Exit cap —");
    expect(drawn(noCap75, { buildingPriced: false }).text).not.toContain("Exit cap —");
    expect(defaultExitGap(0.06, 0.0603)).toBeNull();
    expect(defaultExitGap(0.06, 0.249)).toBe(
      "Default 6.00%; the model's own year-1 NOI over its price is 24.90%: 1,890 bps of compression ride in these returns",
    );
  });
});
