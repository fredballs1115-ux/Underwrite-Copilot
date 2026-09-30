// The meeting workbook's row as the route builds it (lib/pipeline-export-row):
// a deal read through the same readers the pipeline card, the deal page and
// the compare table read it through, so the meeting's sheet never says a
// different thing about the same deal.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractedMetric } from "@/lib/anthropic/types";
import { buildPipelineWorkbook } from "./pipeline-workbook";
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
});
