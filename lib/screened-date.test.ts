// The call's date wherever a deal is summarized (research pass 42, M9): the
// deal page, the memo and the shared screen date the call; the pipeline's
// card, list and CSV, the meeting workbook and the compare table had not, so
// a call written nine months ago, against other rates and older rules, read
// like yesterday's in the pipeline meeting. A deal with no call has no date —
// never the day it was added.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";

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

import { screenedDay, screenedOn } from "./screen-run";
import { pipelineExportRow, type ExportDeal } from "./pipeline-export-row";
import { buildPipelineWorkbook } from "./pipeline-workbook";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "./deal-allowance";
import { visibleText } from "./render-lint";

const AT = "2025-12-02T15:04:00.000Z";

describe("screenedDay — the call's day, as the CSV and the workbook write it", () => {
  it("is the day screenedOn says, as an ISO date, and none without a stamp", () => {
    expect(screenedOn(AT)).toBe("Dec 2, 2025");
    expect(screenedDay(AT)).toBe("2025-12-02");
    expect(screenedDay("2025-12-31T23:59:59Z")).toBe("2025-12-31");
    for (const v of [undefined, null, "", "yesterday"]) expect(screenedDay(v)).toBeNull();
  });
});

describe("the meeting workbook", () => {
  const deal = (over: Partial<ExportDeal> = {}): ExportDeal => ({
    name: "Harbor View Apartments",
    asset_class: "multifamily",
    created_at: "2026-09-08T00:00:00Z",
    verdict: { verdict: "caution", generatedAt: AT },
    extraction: { dealName: "Harbor View Apartments", assetClass: "multifamily", market: "Baltimore, MD", address: "", metrics: [] },
    stage: "screening",
    ...over,
  });
  const ctx = { box: null, job: null, offersDue: null, addedBy: null, today: "2026-09-08" };

  it("writes the call's day after the call, and none for a deal with no call", async () => {
    expect(pipelineExportRow(deal(), ctx).screenedAt).toBe("2025-12-02");
    expect(pipelineExportRow(deal({ verdict: null }), ctx).screenedAt).toBeNull();
    // a call saved before the pipeline dated one
    expect(pipelineExportRow(deal({ verdict: { verdict: "pass" } }), ctx).screenedAt).toBeNull();
    const buf = await buildPipelineWorkbook([pipelineExportRow(deal(), ctx), pipelineExportRow(deal({ name: "Unscreened", verdict: null }), ctx)], new Date("2026-09-08T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Pipeline")!;
    expect(ws.getRow(4).getCell(11).value).toBe("Verdict");
    expect(ws.getRow(4).getCell(12).value).toBe("Screened");
    const byName = new Map([6, 7].map((r) => [String(ws.getRow(r).getCell(2).value), ws.getRow(r)]));
    expect(byName.get("Harbor View Apartments")!.getCell(12).value).toBe("2025-12-02");
    expect(byName.get("Unscreened")!.getCell(12).value).toBe("—");
  });
});

describe("the pipeline's card, list and CSV", () => {
  const card = (over: Partial<DealCard> & Pick<DealCard, "id" | "name">): DealCard => ({
    assetClass: "multifamily",
    createdAt: "2026-09-01T12:00:00Z",
    verdict: null,
    stage: "screening",
    addedBy: null,
    fit: null,
    score: null,
    mandateVerdict: null,
    market: "Dallas, TX",
    coveredMarket: "Dallas–Fort Worth",
    offersDue: null,
    slots: { cap: "5.40%", price: "$10,000,000", yoc: null },
    jobStatus: null,
    hasAddress: true,
    ...over,
  });
  const DEALS = [
    card({ id: "a", name: "Harbor View Apartments", verdict: "caution", screened: { on: "Dec 2, 2025", day: "2025-12-02" } }),
    card({ id: "b", name: "Unscreened Lofts" }),
  ];

  it("says the day in the call's tooltip on the card and in the list, and no day without a call", () => {
    for (const view of ["cards", "list"] as const) {
      const html = renderToStaticMarkup(
        React.createElement(
          ToastProvider,
          null,
          React.createElement(Pipeline, {
            deals: DEALS,
            errorMessage: null,
            notice: null,
            onboarding: { hasBuyBox: true, sampleId: null, hasScreenedOm: true },
            billing: { isPro: true, canCreateDeal: true, allowance: dealAllowance({ plan: "pro", dealCount: 2, team: null }) },
            todayIso: "2026-10-05",
            initialView: view,
          }),
        ),
      );
      expect(html, view).toContain('title="Caution — screened Dec 2, 2025"');
      // Only the deal with a call is dated (the list draws its call twice —
      // its column, and the phone's price line); the other has no day.
      const dated = html.match(/screened [A-Z][a-z]{2} \d+, \d{4}/g) ?? [];
      expect(dated.length, view).toBeGreaterThanOrEqual(1);
      expect(new Set(dated), view).toEqual(new Set(["screened Dec 2, 2025"]));
      expect(visibleText(html)).toContain("Harbor View Apartments");
    }
  });

  it("writes a Screened column after the call in the CSV, blank without one", () => {
    const src = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    expect(src).toContain('"Status", "Screened", "Stage"');
    expect(src).toContain('d.screened?.day ?? "",');
    const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(page).toMatch(/const at = verdict\?\.verdict \? \(d\.verdict as \{ generatedAt\?: string \} \| null\)\?\.generatedAt : null;/);
  });
});

describe("the compare table", () => {
  const col = (over: Partial<Col> & Pick<Col, "id" | "name">): Col => ({
    assetClass: "multifamily",
    market: "North Dallas, TX",
    coveredMarket: "Dallas–Fort Worth",
    verdict: "caution",
    reason: null,
    hasModel: false,
    fit: null,
    fitNote: null,
    strategy: "Stabilized",
    planDeal: false,
    irr: null,
    em: null,
    coc: null,
    cap: null,
    yoc: null,
    leverage: null,
    price: null,
    noi: null,
    ...over,
  });

  it("says the day each call was written, and a dash for a deal with none", () => {
    const html = renderToStaticMarkup(
      React.createElement(CompareTable, {
        cols: [col({ id: "a", name: "Harbor View Apartments", screened: "Dec 2, 2025" }), col({ id: "b", name: "Unscreened Lofts", verdict: null, screened: null })],
      }),
    );
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("Screened");
    expect(text).toContain("Dec 2, 2025");
  });
});
