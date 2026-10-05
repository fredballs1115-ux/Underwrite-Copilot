// A plan's yield on cost past the ceiling (research pass 38, item 7): a
// development's "Total project cost 48,500 ($000s)", read as $48,500 beside
// a $3.2M stabilized NOI, printed a 6597.94% yield on cost on the plan's
// facts, the pipeline card, the deal context every Claude step reads and
// the compare table, with a 99.9% NOI cushion under it. Every surface that
// prints the yield now refuses it in one sentence — and they say the same
// sentence, so no surface prints the figure another withholds.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";

// The pipeline's router and server actions, as lib/views.render.test.ts
// stubs them — never called in a static render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return {
    createDeal: noop,
    createDealFromBatch: noop,
    createManualDeal: noop,
    updateManualFacts: noop,
    createSampleDeal: noop,
    setStage: noop,
    setOffersDue: noop,
    renameDeal: noop,
    deleteDeal: noop,
    rerunAnalysis: noop,
    replaceOm: noop,
    reconcileWithModel: noop,
    addDealNote: noop,
    deleteDealNote: noop,
    replacePicture: noop,
  };
});
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { assessPlausibility, inferStrategy, planSummary, plausibilityNote } from "@/lib/deal-strategy";
import { YOC_WITHHELD, planFacts } from "@/lib/plan-facts";
import { buildPlanReport, buildYieldOnCostGrid, planBreakevens } from "@/lib/plan-sensitivity";
import { pickSlots } from "@/lib/pipeline-slots";
import { dealContextFor } from "@/lib/deal-context";
import { compareReturns } from "@/lib/compare-figures";
import { pipelineExportRow } from "@/lib/pipeline-export-row";
import { buildPipelineWorkbook } from "@/lib/pipeline-workbook";
import { dealAllowance } from "@/lib/deal-allowance";
import { PlanStrip } from "@/app/(app)/deals/[id]/plausibility-panel";
import { PlanSensitivity } from "@/app/(app)/deals/[id]/plan-sensitivity";
import { SharePlan } from "@/app/share/[token]/plan-facts";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const metric = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "p. 3", basis: "na" });
const DEV = { kind: "development" as const, summary: "Ground-up 240-unit apartment development", capitalBudget: "", timeline: "" };
// The pass's fixture, row for row.
const devTotalThousands = {
  dealName: "Parkline (development site)",
  assetClass: "Multifamily",
  market: "",
  address: "",
  strategy: DEV,
  metrics: [metric("Total project cost", "48,500 ($000s)"), metric("NOI (stabilized, pro forma)", "3,200,000"), metric("Units (proposed)", "200")],
} as ExtractionResult;
const REFUSED =
  "No yield on cost is struck: the $3.2M stabilized NOI is 25% or more of the $49k total cost, a yield no project earns, so the total cost or the NOI was most likely misread.";
const NO_FIGURE = /6,?597|6,?598/;

const strategy = inferStrategy(devTotalThousands);
const plan = planSummary(devTotalThousands, strategy)!;

describe("a yield on cost no project earns is refused on every surface, in one sentence (research pass 38)", () => {
  it("the plan's facts, the deal page's plan strip and the shared screen's plan say it, never the figure", () => {
    expect(plan.yieldWithheld).toBe(REFUSED);
    expect(planFacts(plan)).toContainEqual(["Yield on cost", YOC_WITHHELD]);
    for (const [name, node] of [
      ["plan strip", React.createElement(PlanStrip, { strategy, plan })],
      ["shared plan", React.createElement(SharePlan, { strategy, plan })],
    ] as const) {
      const html = renderToStaticMarkup(node);
      const text = visibleText(html);
      expect(text, name).toContain(YOC_WITHHELD);
      expect(text, name).toContain(REFUSED);
      expect(text, name).not.toMatch(NO_FIGURE);
      expect(gluedWords(text), name).toEqual([]);
      expect(a11yIssues(html), name).toEqual([]);
    }
  });

  it("no grid and no breakevens are drawn on it — the deal page's and the report's plan page alike", () => {
    const refCap = { pct: 0.06, provenance: "assumption" as const };
    expect(buildYieldOnCostGrid(plan, 0.06)).toBeNull();
    expect(planBreakevens(plan, 0.06)).toBeNull();
    expect(buildPlanReport(devTotalThousands, refCap)).toBeNull();
    expect(renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap }))).toBe("");
  });

  it("the pipeline's slot, card and list say n/a with the sentence as its title, and the meeting workbook says it in its cell", async () => {
    const slots = pickSlots(devTotalThousands, null);
    expect(slots.yoc).toBeNull();
    expect(slots.yocWithheld).toBe(REFUSED);
    const card: DealCard = {
      id: "dev",
      name: "Parkline (development site)",
      assetClass: "multifamily",
      createdAt: "2026-09-01T12:00:00Z",
      verdict: null,
      stage: "screening",
      addedBy: null,
      fit: null,
      score: null,
      mandateVerdict: null,
      market: "Frisco, TX",
      coveredMarket: null,
      offersDue: null,
      slots,
      jobStatus: null,
      hasAddress: false,
    };
    for (const view of ["list", "cards"] as const) {
      const html = renderToStaticMarkup(
        React.createElement(
          ToastProvider,
          null,
          React.createElement(Pipeline, {
            deals: [card],
            errorMessage: null,
            notice: null,
            onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
            billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) },
            todayIso: "2026-10-05",
            initialView: view,
          }),
        ),
      );
      expect(html, view).toContain(`title="${REFUSED}"`);
      expect(visibleText(html), view).toMatch(/\bn\/a\b/);
      expect(html, view).not.toMatch(NO_FIGURE);
    }
    const row = pipelineExportRow(
      { name: "Parkline (development site)", asset_class: "auto", created_at: "2026-09-08T00:00:00Z", verdict: null, extraction: devTotalThousands, stage: "screening" },
      { box: null, job: null, offersDue: null, addedBy: null, today: "2026-10-05" },
    );
    expect(row.yieldOnCost).toBeNull();
    expect(row.yieldWithheld).toBe(REFUSED);
    const buf = await buildPipelineWorkbook([row], new Date("2026-10-05T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    // Row 6 is the deal; column 9 its yield on cost.
    const cell = wb.getWorksheet("Pipeline")!.getRow(6).getCell(9);
    expect(cell.value).toBe(YOC_WITHHELD);
    expect(JSON.stringify(cell.note)).toContain(REFUSED);
  });

  it("the deal context every Claude step reads, and the challenger's and the verdict's paragraph, say the sentence", () => {
    const ctx = dealContextFor(devTotalThousands)!;
    expect(ctx).toContain(REFUSED);
    expect(ctx).not.toMatch(NO_FIGURE);
    const note = plausibilityNote(assessPlausibility(devTotalThousands, strategy), strategy, plan, devTotalThousands);
    expect(note).toContain(REFUSED.replace(/^No /, "no ").replace(/\.$/, ""));
    expect(note).not.toMatch(NO_FIGURE);
  });

  it("the compare table says it in the plan facts' words — the plan's, or the first-draft model's own past the ceiling", () => {
    const r = compareReturns(devTotalThousands, null, strategy);
    expect(r).toMatchObject({ planDeal: true, yoc: null, yocFrom: null, yocWithheld: REFUSED });
    // A first-draft model's own yield past the ceiling is refused too, said
    // as the model's; under it, it stands; and where the model's is refused,
    // the plan's own figure stands as where the model has none.
    const model = { purchasePrice: null, year1Noi: null, goingInCapPct: null };
    const fromModel = compareReturns(devTotalThousands, { ...model, yieldOnCostPct: 6597.94 }, strategy);
    expect(fromModel.yoc).toBeNull();
    expect(fromModel.yocWithheld).toBe(
      "No yield on cost is shown: the first-draft model's 6597.94% puts its stabilized NOI at 25% or more of its total cost, a yield no project earns, so its total cost or its NOI was most likely misread.",
    );
    const sound = { ...devTotalThousands, metrics: [metric("Total project cost", "48,500,000"), ...devTotalThousands.metrics.slice(1)] } as ExtractionResult;
    const soundPlan = planSummary(sound, inferStrategy(sound))!;
    const fallback = compareReturns(sound, { ...model, yieldOnCostPct: 30 }, inferStrategy(sound));
    expect(fallback).toMatchObject({ yocFrom: "om", yocWithheld: null });
    expect(fallback.yoc).toBeCloseTo(soundPlan.yieldOnCost! * 100, 10);
    expect(compareReturns(sound, { ...model, yieldOnCostPct: 6.2 }, inferStrategy(sound))).toMatchObject({ yoc: 6.2, yocFrom: "model", yocWithheld: null });

    const col: Col = {
      id: "dev",
      name: "Parkline (development site)",
      assetClass: "multifamily",
      market: "Frisco, TX",
      coveredMarket: null,
      verdict: null,
      reason: null,
      hasModel: false,
      fit: null,
      fitNote: null,
      strategy: "Development",
      planDeal: true,
      irr: null,
      em: null,
      coc: null,
      cap: null,
      yoc: r.yoc,
      yocFrom: r.yocFrom,
      yocWithheld: r.yocWithheld,
      leverage: null,
      price: null,
      noi: null,
    };
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: [col] }));
    const row = html.match(/<tr\b(?:(?!<\/tr>)[\s\S])*?>Yield on cost \(stabilized\)[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(row).not.toBe("");
    expect(visibleText(row)).toContain(YOC_WITHHELD);
    expect(visibleText(row)).not.toContain("not stated");
    expect(html).not.toMatch(NO_FIGURE);
  });
});
