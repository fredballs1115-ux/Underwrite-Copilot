// Render smoke test for the FULL multi-page report, mirroring the memo's:
// react-pdf failures (bad style shape, unsupported prop, a chip that breaks
// layout) only surface at render time. This renders the sample deal through
// the same path as /api/deals/[id]/report — buildReportData with buy-box
// checks AND the sensitivity grids — so a redesign that breaks any page
// fails in CI, not at a user's download click.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReportData, rangeRead, ReportDocument } from "./report-document";
import { pdfFillCountOf } from "./pdf-text-of";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData } from "@/lib/underwrite/report-grid";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";

describe("ReportDocument (full report)", () => {
  it("renders the sample deal to a multi-page PDF with every section", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      reconciliation: SAMPLE_DEAL.reconciliation,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;

    const checks = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      {
        assetClass: SAMPLE_DEAL.extraction.assetClass,
        market: SAMPLE_DEAL.extraction.market,
        metrics: SAMPLE_DEAL.extraction.metrics,
      },
      SAMPLE_DEMO_BOX,
    );

    // Same derivation chain as the report route: extraction → model inputs →
    // both heat grids, graded against the buy box's IRR hurdle.
    const derived = deriveUnderwriteInputs(
      SAMPLE_DEAL.extraction as ExtractionResult,
      SAMPLE_DEAL.name,
    );
    const sensitivity = buildSensitivityData(
      derived.inputs,
      SAMPLE_DEMO_BOX.minIrrPct ?? null,
    );
    expect(sensitivity).not.toBeNull();

    const input = buildReportData(deal, "August 24, 2026", checks, sensitivity);
    const element = React.createElement(ReportDocument, {
      input,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10000);
    // The sample deal populates every section: memo + sensitivity + terms +
    // challenges + comps + market + reconciliation = at least 7 pages (long
    // tables may wrap onto more; a hard upper bound guards runaway layout).
    const pages = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(7);
    expect(pages.length).toBeLessThanOrEqual(14);

    // The market page draws each OM figure on its typical range — a track,
    // the span to the figure and a dot, three fills a check — so the same
    // report with ranges that do not parse draws nine fewer shapes.
    const checksCount = SAMPLE_DEAL.market.checks.length;
    expect(checksCount).toBe(3);
    const unranged = {
      ...deal,
      market: {
        ...SAMPLE_DEAL.market,
        checks: SAMPLE_DEAL.market.checks.map((c) => ({ ...c, typicalRange: "varies by submarket" })),
      },
    } as unknown as DealRow;
    const plain = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(unranged, "August 24, 2026", checks, sensitivity),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect(pdfFillCountOf(buf) - pdfFillCountOf(plain)).toBe(checksCount * 3);
  }, 45000);

  it("reads the OM's figure onto its typical range", () => {
    // The sample's three checks: at the low end, past the high end, inside.
    expect(rangeRead("5.25%", "5.25–5.75%")).toBe(0);
    expect(rangeRead("4.0%", "2.5–3.5%")).toBe(1);
    expect(rangeRead("6.0%", "5–7%")).toBeCloseTo(0.5, 6);
    // Dollar ranges, a spelled "to", and a range that is not one.
    expect(rangeRead("$1,300", "$1,200–$1,400")).toBeCloseTo(0.5, 6);
    expect(rangeRead("55%", "50 to 60%")).toBeCloseTo(0.5, 6);
    expect(rangeRead("5%", "varies")).toBeNull();
    expect(rangeRead("n/a", "5–7%")).toBeNull();
  });
  it("renders a conversion with the plan page — yield on cost, stressed — and one more page than without it", async () => {
    const extraction: ExtractionResult = {
      dealName: "1200 K Street — Office-to-Residential Conversion",
      assetClass: "multifamily",
      market: "Washington, DC",
      address: "1200 K St NW, Washington, DC",
      strategy: {
        kind: "conversion",
        summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
        capitalBudget: "$160M hard and soft costs",
        timeline: "24 months of construction, 12 months of lease-up",
      },
      metrics: [
        { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
        { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
        { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
      ],
    };
    const deal = {
      name: extraction.dealName,
      asset_class: "multifamily",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;

    const derived = deriveUnderwriteInputs(extraction, extraction.dealName!);
    const refCap = {
      pct: derived.inputs.exitCapPct,
      provenance: derived.sources.exitCapPct?.provenance ?? ("assumption" as const),
    };
    const plan = buildPlanReport(extraction, refCap);
    expect(plan).not.toBeNull();
    expect(plan!.label).toBe("Conversion");
    expect(plan!.grid.cells[plan!.grid.baseRow][plan!.grid.baseCol].yieldOnCost).toBeCloseTo(21 / 180, 6);
    // No going-in cap in this OM: the reference cap is the screening default.
    expect(refCap.provenance).toBe("assumption");
    expect(plan!.breakevens.overrunToRefCap).not.toBeNull();

    const sensitivity = buildSensitivityData(derived.inputs, null);
    const render = async (withPlan: boolean) => {
      const input = buildReportData(deal, "September 8, 2026", [], sensitivity, undefined, withPlan ? plan : null);
      const element = React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0];
      const buf = await renderToBuffer(element);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    };
    const [withPlan, without] = await Promise.all([render(true), render(false)]);
    // memo + plan + extracted terms, versus the same minus the plan. The IRR
    // sensitivity page is omitted on a plan deal (the annual model's IRR is
    // not the plan's return — the plan page carries its own grid), so the
    // sensitivity passed in never adds a page here.
    expect(withPlan).toBeGreaterThanOrEqual(3);
    expect(withPlan).toBe(without + 1);
  }, 45000);
});
