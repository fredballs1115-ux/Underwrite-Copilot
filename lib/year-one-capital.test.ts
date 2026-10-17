// Research pass 40, M6: the model pays its year-1 capital from the year's
// cash flow, not from the equity at closing, so the equity multiple nets it
// against the distributions and the year-1 cash-on-cash falls by it — the
// report's deal A with $2,000,000 of year-1 repairs printed a 1.52x multiple
// where its distributions over its contributions are 1.42x, and a −23.1%
// year-1 return, with nothing saying either was net of the repairs. The
// definition is the owner's; the deal page's tiles, the report's base case
// and the workbook's Deal Summary now say what both are net of. Every name is
// invented.
import { describe, expect, it } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildBaseCase } from "@/lib/underwrite/report-grid";
import { yearOneCapitalLine } from "@/lib/underwrite/cost-note";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { visibleText } from "./render-lint";

const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3" });
// Deal A of the report's fixtures, as a memorandum states it: $20,000,000,
// $1,100,000 of NOI, and a PCA's $2,000,000 of immediate repairs, which the
// model spends in year 1 where no budget is stated.
const REPAIRS: ExtractionResult = {
  dealName: "Harbor Point Apartments",
  assetClass: "multifamily",
  market: "",
  metrics: [
    row("Asking price", "$20,000,000"),
    row("NOI (in-place)", "$1,100,000"),
    row("Total SF", "150,000 SF"),
    row("PCA immediate repairs", "$2,000,000"),
  ],
};

const LINE =
  "The equity multiple and the year-1 cash-on-cash are net of the $2.0M of year-1 capital, which the model pays from the year's cash flow, not from the equity at closing.";

describe("the year-1 capital the multiple and the year-1 return are net of (research pass 40, M6)", () => {
  const d = deriveUnderwriteInputs(REPAIRS, "x");

  it("is said on the deal page's tiles, the report's base case and the workbook's Deal Summary", async () => {
    expect(d.inputs.capitalImprovementsYr1).toBe(2_000_000);
    expect(yearOneCapitalLine(d.inputs.capitalImprovementsYr1)).toBe(LINE);

    const data: PlaygroundData = {
      inputs: d.inputs,
      dealAssetClass: "multifamily",
      checkSource: { assetClass: "multifamily", market: "", metrics: REPAIRS.metrics },
      box: null,
      sources: d.sources,
      occupancyPct: d.meta.occupancyPct,
    };
    const page = visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })));
    expect(page).toContain(LINE);

    expect(buildBaseCase(d.inputs, d.sources).capitalLine).toBe(LINE);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
    const ds = wb.getWorksheet("Deal Summary")!;
    const said: string[] = [];
    for (let r = 1; r <= 12; r++) said.push(String(ds.getCell(r, 1).value ?? ""));
    expect(said).toContain(LINE);
  }, 60_000);

  it("is not said where the model spends no capital in year 1", () => {
    const none = deriveUnderwriteInputs({ ...REPAIRS, metrics: REPAIRS.metrics.filter((m) => !/PCA/.test(m.label)) }, "x");
    expect(none.inputs.capitalImprovementsYr1).toBe(0);
    expect(yearOneCapitalLine(0)).toBeNull();
    expect(buildBaseCase(none.inputs, none.sources).capitalLine).toBeNull();
  });
});
