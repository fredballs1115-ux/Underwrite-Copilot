// Research pass 38, item 15: a levered IRR that did not solve printed as "—"
// beside a negative equity multiple, on the playground's tiles, the report's
// base case and grids and the workbook's Deal Summary, with no reason. Each
// now says why in the dash's place ("no IRR: the sale does not repay the
// loan"). The floor under a non-recourse loss is the owner's. Every name is
// invented.
import { describe, expect, it } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { scenarioMetrics } from "@/lib/underwrite/playground";
import { buildBaseCase, buildSensitivityData, gridNoIrrNote, heatCellIrr } from "@/lib/underwrite/report-grid";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { NO_IRR_WHY, noIrrText, noIrrWhy } from "@/lib/underwrite/no-irr";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import { visibleText } from "@/lib/render-lint";
import type { DealRow } from "@/lib/deals";
import { ex, m } from "@/lib/pass38.fixture";

const office = ex({
  assetClass: "Office",
  dealName: "Westgate Commons",
  metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "1,200,000", "in_place"), m("Going-in cap rate", "6.00%"), m("Total SF", "100,000 SF")],
});
const derived = deriveUnderwriteInputs(office, "x");
// The same building sold at a 20% exit cap: the sale no longer repays the loan.
const short = { ...derived, inputs: { ...derived.inputs, exitCapPct: 0.2 } };
const SAID = "no IRR: the sale does not repay the loan";

describe("a levered IRR that does not solve says why (research pass 38, item 15)", () => {
  it("names the reason from the sale, the cash back and the rate", () => {
    expect(noIrrWhy(0.12, -1, 5)).toBeNull();
    expect(noIrrWhy(null, -1_000_000, 4_000_000)).toBe("sale");
    expect(noIrrWhy(null, 100_000, -50_000)).toBe("nothingBack");
    expect(noIrrWhy(null, 100_000, 9_000_000)).toBe("noRate");
    expect(noIrrText("sale")).toBe(SAID);
    const run = scenarioMetrics(short.inputs);
    expect(run.leveredIrrPct).toBeNull();
    expect(run.noIrr).toBe("sale");
    expect(scenarioMetrics(derived.inputs).noIrr).toBeNull();
  });

  it("says it on the playground's tile in the dash's place", () => {
    const data: PlaygroundData = {
      inputs: short.inputs,
      dealAssetClass: "Office",
      checkSource: null,
      box: null,
      sources: short.sources,
      occupancyPct: null,
    };
    const text = visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })));
    expect(text).toMatch(new RegExp(`Levered IRR\\s+${SAID}`));
    expect(text).not.toMatch(/Levered IRR\s+—/);
  });

  it("says it on the report's base case and under its grids", async () => {
    const base = buildBaseCase(short.inputs, short.sources);
    expect(base.leveredIrr).toBeNull();
    expect(base.noIrr).toBe("sale");
    const sensitivity = buildSensitivityData(short.inputs, null, { sources: short.sources });
    expect(heatCellIrr(sensitivity.grid.cells[sensitivity.grid.baseRow][sensitivity.grid.baseCol])).toBe("no IRR");
    expect(gridNoIrrNote(sensitivity.grid.cells)).toBe(`Where a cell reads no IRR, ${NO_IRR_WHY.sale}.`);
    const deal = { name: "Westgate Commons", asset_class: "office", extraction: office, challenges: null, comps: null, market: null, reconciliation: null, verdict: null, prior_screen: null } as unknown as DealRow;
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input: buildReportData(deal, "October 5, 2026", [], sensitivity) }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = pdfTextOf(buf).replace(/\s+/g, " ");
    expect(text).toContain("LEVERED IRR no IRR the sale does not repay the loan");
    expect(text).toContain(`Where a cell reads no IRR, ${NO_IRR_WHY.sale}.`);
  }, 45000);

  it("says it in the workbook's Deal Summary, live", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(short)) as unknown as ArrayBuffer);
    const cellToHf = (v: unknown): number | string | boolean | null => {
      if (v == null) return null;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
      const o = v as { formula?: string; result?: unknown; richText?: { text: string }[] };
      if (o.formula != null) return "=" + o.formula;
      if (o.richText) return o.richText.map((r) => r.text).join("");
      return (o.result as number | string | undefined) ?? null;
    };
    const sheets: Record<string, (number | string | boolean | null)[][]> = {};
    wb.eachSheet((ws) => {
      const grid: (number | string | boolean | null)[][] = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const row: (number | string | boolean | null)[] = [];
        for (let c = 1; c <= ws.columnCount; c++) row.push(cellToHf(ws.getCell(r, c).value));
        grid.push(row);
      }
      sheets[ws.name] = grid;
    });
    const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
    for (const dn of (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model) {
      if (!dn.ranges?.length) continue;
      try {
        hf.addNamedExpression(dn.name, "=" + dn.ranges[0]);
      } catch {
        /* duplicate or unsupported — skipped */
      }
    }
    // The returns block's named cell, and the KPI tile beside the price.
    expect(hf.getNamedExpressionValue("LeveredIRR")).toBe(SAID);
    const summary = hf.getSheetValues(hf.getSheetId("Deal Summary")!) as unknown[][];
    // Row 4 holds the KPI tiles' values; the IRR is the second.
    expect(summary[3][1]).toBe(SAID);
    expect(summary.flat()).not.toContain("check inputs");
    // And where it solves, the figure.
    const solved = new ExcelJS.Workbook();
    await solved.xlsx.load((await buildUnderwriteWorkbook(derived)) as unknown as ArrayBuffer);
    const formula = (solved.getWorksheet("Deal Summary")!.getCell(4, 2).value as { formula: string }).formula;
    expect(formula).toMatch(/^IFERROR\(IRR\(.+\),IF\(NetSaleProceeds<0,"no IRR: the sale does not repay the loan"/);
  }, 45000);
});
