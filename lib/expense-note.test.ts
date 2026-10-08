// Research pass 38, item 13: a building whose stated occupancy is under half
// ran on its class's expense ratio — a share of the income a mostly empty
// building collects — while its taxes and insurance are owed on the whole
// building, and the expense line's SOURCE note said only "break out from a
// T-12". The note says what the ratio is struck on now, and asks for the
// T-12's expenses; the figure the model runs is the owner's. Every name is
// invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { ex, m } from "@/lib/pass38.fixture";

const office = (occupancy: string) =>
  ex({
    assetClass: "Office",
    dealName: "Meridian Center",
    metrics: [m("Asking price", "12,000,000"), m("NOI (in-place)", "300,000", "in_place"), m("Total SF", "88,000 SF"), m("Occupancy", occupancy, "in_place")],
  });

const SAID =
  "Total opex to tie NOI (45% of EGI Office default) — the class's ratio struck on a mostly empty building's income (22% occupied as stated), though its taxes and insurance do not fall with occupancy — enter the T-12's expenses";

describe("the expense line's note on a mostly empty building (research pass 38, item 13)", () => {
  it("says what the class's ratio is struck on, and asks for the T-12's expenses", async () => {
    const d = deriveUnderwriteInputs(office("22%"), "x");
    expect(d.sources.expenseLines?.note).toBe(SAID);
    // The figure the model runs is unchanged: the ratio on the income.
    const egi = d.inputs.inPlaceRentAnnual * (1 - d.inputs.vacancyPct);
    expect(d.inputs.expenseLines[0].annual).toBeCloseTo(egi * 0.45, 0);

    // The workbook's Assumptions tab prints it beside the expense line.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
    const said: string[] = [];
    wb.getWorksheet("Assumptions")!.eachRow((row) => said.push(String(row.getCell(3).value ?? "")));
    expect(said.some((s) => s.endsWith(SAID)), said.join("\n")).toBe(true);
  });

  it("says nothing new at half occupied or more", () => {
    expect(deriveUnderwriteInputs(office("50%"), "x").sources.expenseLines?.note).toBe(
      "Total opex to tie NOI (45% of EGI Office default) — break out from a T-12",
    );
    expect(deriveUnderwriteInputs(office("92%"), "x").sources.expenseLines?.note).toBe(
      "Total opex to tie NOI (45% of EGI Office default) — break out from a T-12",
    );
  });
});
