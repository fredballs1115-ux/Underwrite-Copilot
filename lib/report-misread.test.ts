// Research pass 38, part 1's leftover (a): while the plausibility check
// finds the figures the returns run on do not tie — an implied cap under the
// floor, or any high finding — the deal page's playground withheld its tiles
// and its max bid, and the report still printed its IRR grids and its max
// bid beside them. The report follows the page's rule now, under the same
// finding and the same clause; the model's reads of the terms stand in both.
// Every name is invented.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData, misreadPageLine, misreadReturnsLine } from "@/lib/underwrite/report-grid";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import { visibleText } from "@/lib/render-lint";
import type { DealRow } from "@/lib/deals";
import { ex, m } from "@/lib/pass38.fixture";

const STABILIZED = { kind: "stabilized", summary: "A stabilized office building", capitalBudget: "", timeline: "" };
// An NOI stated a month at a time: $120,000 against a $20M price.
const monthly = ex({
  assetClass: "Office",
  dealName: "Fernwood Center",
  strategy: STABILIZED,
  metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "120,000", "in_place"), m("Total SF", "80,000 SF")],
});

describe("the report withholds its grids where the page withholds its tiles (research pass 38)", () => {
  it("leaves the grids and the max bid out under the page's own finding, and keeps the model's reads", async () => {
    const findings = assessPlausibility(monthly, inferStrategy(monthly));
    const title = findings.find((f) => f.code === "implied_cap_low")?.title;
    expect(title).toBeTruthy();
    const page = misreadPageLine(findings, { maxBid: true });
    const report = misreadReturnsLine(findings);
    expect(page).toBe(`The returns and the max bid are withheld: ${title}, and returns built on figures that do not tie would be a misread's.`);
    expect(report).toBe(`The IRR grids and the max bid are left out: ${title}, and returns built on figures that do not tie would be a misread's.`);

    // The page's playground withholds its tiles under it.
    const d = deriveUnderwriteInputs(monthly, "x");
    const data: PlaygroundData = { inputs: d.inputs, dealAssetClass: "Office", checkSource: null, box: null, sources: d.sources, occupancyPct: null, findings };
    const pageText = visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })));
    expect(pageText).toContain(`${title}, and returns built on figures that do not tie would be a misread's.`);

    // The report's sensitivity data says the same and keeps the reads.
    const sensitivity = buildSensitivityData(d.inputs, null, { sources: d.sources, findings });
    expect(sensitivity.withheld).toBe(report);
    expect(sensitivity.readsStand).toBe(true);
    const deal = { name: "Fernwood Center", asset_class: "office", extraction: monthly, challenges: null, comps: null, market: null, reconciliation: null, verdict: null, prior_screen: null } as unknown as DealRow;
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity);
    expect(input.sensitivity).toBeNull();
    expect(input.withheld).toBe(report);
    const text = pdfTextOf(
      await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]),
    ).replace(/\s+/g, " ");
    expect(text).toContain("The IRR grids and the max bid are left out:");
    expect(text).not.toContain("The retrade grid");
  }, 45000);

  it("still leaves the reads out on a placeholder's model, and prints the grids where nothing stands", () => {
    const fine = ex({ assetClass: "Office", dealName: "Fernwood Center", strategy: STABILIZED, metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "1,400,000", "in_place"), m("Total SF", "80,000 SF")] });
    const d = deriveUnderwriteInputs(fine, "x");
    const s = buildSensitivityData(d.inputs, null, { sources: d.sources, findings: assessPlausibility(fine, inferStrategy(fine)) });
    expect(s.withheld).toBeNull();
    expect(s.readsStand).toBeUndefined();
    const unpriced = ex({ assetClass: "Office", dealName: "Fernwood Center", strategy: STABILIZED, metrics: [m("Total SF", "80,000 SF")] });
    const u = deriveUnderwriteInputs(unpriced, "x");
    const su = buildSensitivityData(u.inputs, null, { sources: u.sources, findings: [] });
    expect(su.withheld).toMatch(/^The IRR grids and the max bid are left out: no price was read/);
    expect(su.readsStand).toBeUndefined();
  });
});
