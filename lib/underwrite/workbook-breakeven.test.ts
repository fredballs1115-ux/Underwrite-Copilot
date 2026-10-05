// Research pass 38, item 14 (C19): the workbook's breakeven occupancy
// printed unbounded — 428.0% where the year's expenses and debt service ran
// past what the building collects full, and 0.8% on a vacant building whose
// potential gross revenue was its income grossed up a hundredfold. Past full
// occupancy the live formula now says "not reached at full occupancy", and
// on a building the model runs 90% vacant or more the row is left out with
// a sentence. Every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { buildUnderwriteWorkbook } from "./workbook";
import { deriveUnderwriteInputs } from "./inputs";
import { ex, m } from "@/lib/pass38.fixture";

type Grid = (number | string | boolean | null)[][];

const cellToHf = (v: unknown): number | string | boolean | null => {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  const o = v as { formula?: string; result?: unknown; richText?: { text: string }[] };
  if (o.formula != null) return "=" + o.formula;
  if (o.richText) return o.richText.map((r) => r.text).join("");
  return (o.result as number | string | undefined) ?? null;
};

async function opsOf(extraction: ReturnType<typeof ex>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(deriveUnderwriteInputs(extraction, "x"))) as unknown as ArrayBuffer);
  const sheets: Record<string, Grid> = {};
  wb.eachSheet((ws) => {
    const grid: Grid = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row: Grid[number] = [];
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
  const ws = wb.getWorksheet("Operating Metrics")!;
  const labels: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) labels.push(String(ws.getCell(r, 1).value ?? ""));
  const values = hf.getSheetValues(hf.getSheetId("Operating Metrics")!) as unknown[][];
  return { ws, labels, values };
}

const office = (noi: string, occupancy: string) =>
  ex({
    assetClass: "Office",
    dealName: "Lakeview Plaza",
    metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", noi, "in_place"), m("Total SF", "60,000 SF"), m("Occupancy", occupancy, "in_place")],
  });

describe("the workbook's breakeven occupancy (research pass 38, item 14)", () => {
  it("says a breakeven past full occupancy in words, with the formula live", async () => {
    const { ws, labels, values } = await opsOf(office("300,000", "90%"));
    const r = labels.indexOf("Breakeven Occupancy");
    expect(r).toBeGreaterThan(0);
    expect((ws.getCell(r + 1, 2).value as { formula: string }).formula).toContain('"not reached at full occupancy"');
    expect(values[r][1]).toBe("not reached at full occupancy");
  });

  it("prints a breakeven under full occupancy as the figure", async () => {
    const { labels, values } = await opsOf(office("1,500,000", "90%"));
    const r = labels.indexOf("Breakeven Occupancy");
    expect(typeof values[r][1]).toBe("number");
    expect(values[r][1] as number).toBeLessThan(1);
  });

  it("leaves the row out with a sentence on a building the model runs 90% vacant or more", async () => {
    const { labels } = await opsOf(office("50,000", "5%"));
    expect(labels).not.toContain("Breakeven Occupancy");
    expect(labels).toContain(
      "Breakeven Occupancy left out: the model runs the building 95% vacant, so its Potential Gross Revenue is its year-1 income grossed up from 5% occupancy, and a breakeven occupancy struck against it is no figure to screen on.",
    );
    expect(labels.some((l) => l.startsWith("Breakeven occupancy ="))).toBe(false);
  });
});
