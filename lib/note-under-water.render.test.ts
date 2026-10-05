// Research pass 38, item 11: a note whose balance is over the collateral's
// stated value — a $5M price for a $20M performing note on a building the
// memorandum values at $8M — printed its contract yield in the cap slot
// ("512.5%") on the pipeline card, the deal header, the CSV and the meeting
// workbook, and "to its maturity" on the memo and the cover, as if the
// collateral could repay it. The slot reads "n/a — under water" now, and the
// sentence says the contract yield assumes a repayment the collateral does
// not cover. Every name is invented.
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
import { askingPriceOf, inferStrategy } from "@/lib/deal-strategy";
import { interestShortLine, noteYieldSentence, readInterest } from "@/lib/interest";
import { noteUnderWater } from "@/lib/note-yield";
import { UNDER_WATER_WORDS, compareInterest, goingInCapFigure, modelReturnsRead } from "@/lib/compare-interest";
import { CAP_WITHHELD, capCellText } from "@/lib/cap-slot";
import { pickSlots } from "@/lib/pipeline-slots";
import { compareReturns } from "@/lib/compare-figures";
import { pipelineExportRow } from "@/lib/pipeline-export-row";
import { buildPipelineWorkbook } from "@/lib/pipeline-workbook";
import { dealAllowance } from "@/lib/deal-allowance";
import { InterestPanel } from "@/app/interest-panel";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { visibleText } from "./render-lint";
import { ASOF, ex, m } from "@/lib/pass38.fixture";

const NOTE = { kind: "note", summary: "A performing first mortgage note secured by an office building", share: "", groundLease: "", loan: "First mortgage note", page: "p. 2" };

const noteUnder = ex({
  assetClass: "Office",
  dealName: "Harbor Point (note sale)",
  interest: NOTE,
  metrics: [
    m("Asking price", "5,000,000"),
    m("Unpaid principal balance", "20,000,000"),
    m("Note rate", "6.00%"),
    m("Maturity date", "March 1, 2031"),
    m("Payment status", "Performing"),
    m("Whole-asset value", "8,000,000"),
    m("NOI (in-place)", "640,000", "in_place"),
    m("Total SF", "120,000 SF"),
  ],
});
// The same note on a building the memorandum values above its balance.
const noteCovered = ex({ ...noteUnder, metrics: noteUnder.metrics.map((r) => (r.label === "Whole-asset value" ? m(r.label, "26,000,000") : r)) });

const ASSUMES =
  "a contract yield that assumes the $20.0M balance is repaid in full, which the collateral's stated $8.0M does not cover: what the note fetches is a foreclosure's question.";

describe("a note under water (research pass 38, item 11)", () => {
  it("reads the balance over the collateral's stated value as under water, and a covered note as not", () => {
    const under = readInterest(noteUnder, askingPriceOf(noteUnder), ASOF)!.note!;
    expect(under.ltvAtBalancePct).toBe(250);
    expect(noteUnderWater(under)).toBe(true);
    expect(under.ytmPct).not.toBeNull();
    expect(noteUnderWater(readInterest(noteCovered, askingPriceOf(noteCovered), ASOF)!.note)).toBe(false);
  });

  it("says what the contract yield assumes on the panel, the headline and the report's note terms, and draws no yield tile", () => {
    const r = readInterest(noteUnder, askingPriceOf(noteUnder), ASOF)!;
    const sentence = noteYieldSentence(r.note);
    expect(sentence).toMatch(/^Held to its Mar 2031 maturity it would yield [\d,.]+% on the price \(interest-only — the memorandum states no amortization period\) — /);
    expect(sentence).toContain(ASSUMES);
    expect(r.headline).toContain(ASSUMES);
    const text = visibleText(renderToStaticMarkup(React.createElement(InterestPanel, { interest: r })));
    expect(text).toContain(ASSUMES);
    expect(text).not.toContain("To maturity");
    // A covered note keeps its tiles.
    const covered = readInterest(noteCovered, askingPriceOf(noteCovered), ASOF)!;
    expect(visibleText(renderToStaticMarkup(React.createElement(InterestPanel, { interest: covered })))).toContain("To maturity");
  });

  it("puts no yield in the cap slot: the deal header, the Model tab, the compare table, the card, its CSV and the meeting workbook", async () => {
    // The deal header and the bar that repeats it.
    expect(goingInCapFigure(noteUnder, null, ASOF)).toEqual({ label: "Yield to maturity", value: "n/a — under water", title: UNDER_WATER_WORDS.title });
    expect(goingInCapFigure(noteCovered, null, ASOF).value).toMatch(/^\d+\.\d%$/);
    // The Model tab's read, and the compare table's.
    expect(modelReturnsRead(noteUnder, null, ASOF)).toMatchObject({ noteYtmPct: null, underWater: true, withheld: "note" });
    expect(compareInterest(noteUnder, null, ASOF)).toMatchObject({ noteYtmPct: null, underWater: true });
    const figs = compareReturns(noteUnder, null, inferStrategy(noteUnder), ASOF);
    expect(figs).toMatchObject({ noteYtmPct: null, underWater: true, capWithheld: "note" });

    // The pipeline's slots, card and CSV.
    const slots = pickSlots(noteUnder, null, null, { address: null, siteFlags: null, today: "2026-10-05" });
    expect(slots.capWithheld).toBe("under_water");
    expect(slots.noteYield).toBeNull();
    expect(capCellText(slots)).toBe("n/a — under water");
    expect(CAP_WITHHELD.under_water).toEqual({ na: UNDER_WATER_WORDS.na, title: UNDER_WATER_WORDS.title });
    const card: DealCard = {
      id: "note",
      name: "Harbor Point (note sale)",
      assetClass: "office",
      createdAt: "2026-09-01T12:00:00Z",
      verdict: null,
      stage: "screening",
      addedBy: null,
      fit: null,
      score: null,
      mandateVerdict: null,
      market: "Columbus, OH",
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
      expect(html, view).toContain(`title="${CAP_WITHHELD.under_water.title.replace(/'/g, "&#x27;")}"`);
      expect(html, view).not.toMatch(/\d{3,}\.\d%/);
      if (view === "cards") expect(visibleText(html)).toContain("under water");
    }

    // The meeting workbook's cap cell, with the reason in its note.
    const row = pipelineExportRow(
      { name: "Harbor Point (note sale)", asset_class: "auto", created_at: "2026-09-08T00:00:00Z", verdict: null, extraction: noteUnder, stage: "screening" },
      { box: null, job: null, offersDue: null, addedBy: null, today: "2026-10-05" },
    );
    expect(row.capWithheld).toBe("under_water");
    expect(row.noteYield).toBeNull();
    const buf = await buildPipelineWorkbook([row], new Date("2026-10-05T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    // Row 6 is the deal; column 8 its cap slot.
    const cell = wb.getWorksheet("Pipeline")!.getRow(6).getCell(8);
    expect(cell.value).toBe("n/a — under water");
    expect(JSON.stringify(cell.note)).toContain("assumes a repayment the collateral does not cover");
  });

  it("says it on the memo's and the cover's line in place of the yield", () => {
    const r = readInterest(noteUnder, askingPriceOf(noteUnder), ASOF)!;
    const line = interestShortLine(r);
    expect(line).toContain(", under water — its contract yield to its Mar 2031 maturity assumes a repayment the collateral's stated value does not cover");
    expect(line).not.toMatch(/\d+\.\d% to its/);
    const covered = interestShortLine(readInterest(noteCovered, askingPriceOf(noteCovered), ASOF)!);
    expect(covered).toMatch(/\d+\.\d% to its Mar 2031 maturity/);
  });
});
