// Research pass 40, M2: the workbook's Operating Metrics printed figures
// back-solved from the NOI as the building's rent and opex. The rent line is
// the NOI grossed up through the expense ratio and the vacancy, and on an
// OM-only deal the expense ratio is the class's default — so "Year-1 Rent /
// Unit / Month $1,663.64" and "Year-1 OpEx / Unit $7,965.52", the expense
// ratio, the NOI margin and the breakeven printed nothing but the 42%
// multifamily default. Those rows are left out with a sentence where the
// ratio is a default, and where a T-12's load runs they print under the rent
// line's own name, as the Assumptions tab's rent line is named. The fixture
// is the report's own; every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "./inputs";
import { RENT_LINE_LABEL, buildUnderwriteWorkbook } from "./workbook";
import { sampleDerivedInputs } from "@/lib/sample-derive";

const row = (label: string, value: string, page: string) => ({ label, value, flagged: false, page });
const FIXTURE: ExtractionResult = {
  dealName: "Fixture",
  assetClass: "multifamily",
  market: "X",
  address: "1 Main St, Town, PA",
  metrics: [
    row("Asking price", "$40,000,000", "p. 5"),
    row("Going-in cap rate", "5.5%", "p. 6"),
    row("NOI (in-place)", "$2,200,000", "p. 7"),
    row("Units", "200", "p. 4"),
    row("Occupancy", "95%", "p. 4"),
  ],
};

async function labelsOf(model: Parameters<typeof buildUnderwriteWorkbook>[0], sheet: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(model)) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(sheet)!;
  const out: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) out.push(String(ws.getCell(r, 1).value ?? ""));
  return out;
}

describe("the workbook's operating metrics on a default expense ratio (research pass 40, M2)", () => {
  it("leaves the rows struck on the class's default ratio out, with a sentence a block", async () => {
    const model = deriveUnderwriteInputs(FIXTURE, "x");
    expect(model.meta.defaultExpenseRatio).toEqual({ ratio: 0.42, classWord: "Multifamily" });
    const labels = await labelsOf(model, "Operating Metrics");
    for (const gone of [
      "Expense Ratio (OpEx / EGR)",
      "NOI Margin",
      "Breakeven Occupancy",
      "Year-1 Rent / Unit / Month",
      "Year-1 Potential Gross Revenue / Unit / Month",
      "Year-1 OpEx / Unit",
    ]) {
      expect(labels, gone).not.toContain(gone);
    }
    // What reads the NOI and the debt alone stays.
    for (const stays of ["DSCR (NOI)", "Debt Yield", "Cash-on-Cash (levered)", "Year-1 NOI / Unit", "Price / Unit"]) {
      expect(labels, stays).toContain(stays);
    }
    const why =
      "the expense ratio is the Multifamily default (42% of EGI), not a T-12's, so the operating expenses and the potential gross revenue are the year-1 NOI grossed up through it and the vacancy";
    expect(labels).toContain(
      `Expense Ratio, NOI Margin and Breakeven Occupancy left out: ${why}, and the three would be struck on that default, not on the building's own figures.`,
    );
    // The fixture states no area: the per-SF rows are out for that, and the
    // sentence names only the per-unit rows.
    expect(labels).toContain(
      `Year-1 Potential Gross Revenue / Unit / Month and OpEx / Unit left out: ${why}, and they would be struck on that default, not on the building's own figures.`,
    );
    // The Assumptions tab names the rent line for what it is.
    const assumptions = await labelsOf(model, "Assumptions");
    expect(assumptions).toContain(RENT_LINE_LABEL);
    expect(assumptions).not.toContain("In-Place Rental Revenue (annual)");
  }, 60_000);

  it("prints them on a T-12's load, the rent line named as the potential gross revenue", async () => {
    const sample = sampleDerivedInputs();
    expect(sample.meta.defaultExpenseRatio).toBeUndefined();
    const labels = await labelsOf(sample, "Operating Metrics");
    for (const prints of [
      "Expense Ratio (OpEx / EGR)",
      "NOI Margin",
      "Breakeven Occupancy",
      "Year-1 Potential Gross Revenue / Unit / Month",
      "Year-1 OpEx / Unit",
      "Year-1 Potential Gross Revenue / SF / Year",
    ]) {
      expect(labels, prints).toContain(prints);
    }
    expect(labels.some((l) => /^Year-1 Rent \//.test(l))).toBe(false);
    expect(labels.some((l) => l.includes("left out: the expense ratio"))).toBe(false);
  }, 60_000);
});
