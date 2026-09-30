// The meeting workbook's row as the route builds it (lib/pipeline-export-row):
// a deal read through the same readers the pipeline card, the deal page and
// the compare table read it through, so the meeting's sheet never says a
// different thing about the same deal.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractedMetric, ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { BuyBox } from "./criteria";
import { buildPipelineWorkbook } from "./pipeline-workbook";
import { pickSlots } from "./pipeline-slots";
import { pipelineExportRow, type ExportDeal, type ExportRowContext } from "./pipeline-export-row";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

const deal = (over: Partial<ExportDeal> = {}): ExportDeal => ({
  name: "Harbor View Apartments",
  asset_class: "auto",
  created_at: "2026-09-08T00:00:00Z",
  verdict: { verdict: "caution" },
  extraction: {
    dealName: "Harbor View Apartments",
    assetClass: "multifamily",
    market: "Baltimore, MD",
    address: "",
    metrics: [m("Asking price", "$41,250,000"), m("Going-in cap rate", "5.90%")],
  },
  stage: "screening",
  ...over,
});

const ctx: ExportRowContext = { box: null, job: null, offersDue: null, addedBy: null };

async function classCell(d: ExportDeal): Promise<unknown> {
  const buf = await buildPipelineWorkbook([pipelineExportRow(d, ctx)], new Date("2026-09-08T12:00:00Z"), null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Row 5 is the stage band; the deal is row 6, its class column 4.
  return wb.getWorksheet("Pipeline")!.getRow(6).getCell(4).value;
}

describe("pipelineExportRow — the meeting workbook reads a deal as every surface does", () => {
  it("prints the deal's one class: the deck's on a deal filed Auto, the analyst's where they filed one", async () => {
    expect(pipelineExportRow(deal(), ctx).assetClass).toBe("multifamily");
    expect(pipelineExportRow(deal({ asset_class: "office" }), ctx).assetClass).toBe("office");
    // Nothing has read the deck yet: no class, never "auto".
    expect(pipelineExportRow(deal({ extraction: null }), ctx).assetClass).toBe("");
    // The sheet's cell says it, where it printed a dash for every Auto deal.
    expect(await classCell(deal())).toBe("Multifamily");
    expect(await classCell(deal({ extraction: null }))).toBe("—");
  });

  // Nothing in the extraction names a plan; the first signal names the
  // conversion (the audit of 2026-09-30).
  const wexley = {
    dealName: "The Wexley",
    assetClass: "multifamily",
    market: "Bethesda, MD",
    address: "",
    metrics: [
      m("Asking price", "$20,000,000"),
      m("In-place NOI", "$900,000"),
      m("Hard costs", "$18,000,000"),
      m("Stabilized NOI", "$2,660,000"),
      m("Units", "180"),
    ],
  } as ExtractionResult;
  const SIGNAL: FirstSignal = {
    dealName: "The Wexley",
    assetClass: "multifamily",
    market: "Bethesda, MD",
    askPrice: "$20,000,000",
    size: "180 units",
    goingInCap: "",
    perUnit: "",
    take: "An office-to-residential conversion of a 1962 tower, sold vacant.",
  };

  it("reads the deal's kind as the pipeline card does, from the extraction and the first signal", () => {
    const row = pipelineExportRow(deal({ extraction: wexley, first_signal: SIGNAL }), ctx);
    expect(row.dealType).toBe("Conversion");
    expect(row.planDeal).toBe(true);
    expect(row.cap).toBeNull();
    expect(row.yieldOnCost).toBe("7.0%");
    // The card's own slots say the same.
    expect(row.yieldOnCost).toBe(pickSlots(wexley, SIGNAL).yoc);
    expect(row.cap).toBe(pickSlots(wexley, SIGNAL).cap);
    // A row screened before the first signal existed reads as before.
    const before = pipelineExportRow(deal({ extraction: wexley }), ctx);
    expect(before.dealType).toBe("Stabilized");
    expect(before.planDeal).toBe(false);
  });

  it("judges the buy box on the pipeline page's inputs: the address widens the geography", () => {
    const box: BuyBox = { markets: "Montgomery County" };
    const address = {
      label: "7501 Wisconsin Ave, Bethesda, MD 20814",
      street: "7501 Wisconsin Ave",
      city: "Bethesda",
      state: "MD",
      zip: "20814",
      county: "Montgomery County",
      submarket: "",
    };
    // The memorandum names the city, the address its county: in the box.
    expect(pipelineExportRow(deal({ extraction: wexley, address }), { ...ctx, box }).fit).toBe("fits");
    expect(pipelineExportRow(deal({ extraction: wexley }), { ...ctx, box }).fit).toBe("outside");
    // Before the extraction lands the first signal stands in, as on the card.
    expect(pipelineExportRow(deal({ extraction: null, first_signal: SIGNAL, address }), { ...ctx, box }).fit).toBe("fits");
  });
});
