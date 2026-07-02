/* TEMP — verify the formula workbook. Delete after. */
import { buildModelWorkbook } from "@/lib/model/excel-build";
import { computeModel, type ModelInputs } from "@/lib/model/compute";
import type { UnderwritingModel } from "@/lib/model/types";

export const runtime = "nodejs";

export async function GET() {
  const inputs: ModelInputs = {
    units: 248,
    purchasePrice: 68000000,
    closingCostPct: 2,
    loanFeePct: 1,
    year1Gpr: 7150000,
    vacancyPct: 9,
    otherIncomeAnnual: 300000,
    year1Opex: 3100000,
    capexReserveAnnual: 74400,
    rentGrowthPct: 3,
    expenseGrowthPct: 3,
    otherIncomeGrowthPct: 3,
    exitCapPct: 5.5,
    sellingCostPct: 2,
    holdYears: 5,
    loan: { ltvPct: 60, ratePct: 6.0, amortYears: 30, ioYears: 1 },
  };
  const { cashFlow, returns } = computeModel(inputs);
  const model: UnderwritingModel = {
    generatedFrom: ["OM", "Rent roll", "T-12"],
    holdYears: 5,
    metrics: [],
    conflicts: [],
    inputs,
    cashFlow,
    returns,
    summary: "",
    caveats: ["Straight-line growth — verify."],
  };
  const buf = await buildModelWorkbook(model, "Formula Test", ["om"]);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
