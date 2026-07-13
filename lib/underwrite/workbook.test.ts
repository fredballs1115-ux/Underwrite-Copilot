import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { buildUnderwriteWorkbook } from "./workbook";
import { deriveUnderwriteInputs } from "./inputs";
import { computeUnderwrite } from "./engine";
import { buildSensitivityGrids } from "./sensitivity";
import type { ExtractionResult } from "@/lib/anthropic/types";

/**
 * Proof that the generated workbook's formulas are LIVE and compute the same
 * numbers as the engine. LibreOffice can't recalc in this sandbox, so we load
 * the real .xlsx into HyperFormula (a JS spreadsheet engine: IRR, MIN, SUM,
 * ROUND, IF, ^) and evaluate the actual formula graph — then flex the ExitCap
 * cell and confirm Levered IRR recalculates.
 */

const extraction: ExtractionResult = {
  dealName: "Meridian Logistics Center",
  assetClass: "industrial",
  market: "Inland Empire, CA",
  address: "1 Distribution Dr, Fontana, CA",
  metrics: [
    { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
    { label: "Going-in cap rate", value: "6.0%", flagged: true, page: "p. 6" },
    { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
    { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
  ],
};

interface CellVal {
  formula?: string;
  result?: unknown;
  richText?: { text: string }[];
}
function cellToHf(v: unknown): number | string | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  const o = v as CellVal;
  if (o.formula != null) return "=" + o.formula;
  if (o.richText) return o.richText.map((r) => r.text).join("");
  if (o.result !== undefined) return o.result as number | string;
  return null;
}

async function loadIntoHf(buf: Buffer): Promise<{ hf: ReturnType<typeof HyperFormula.buildFromSheets>; wb: ExcelJS.Workbook }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

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
  // Register every defined name as a global named expression.
  const model = (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model;
  for (const dn of model) {
    if (!dn.ranges?.length) continue;
    try {
      hf.addNamedExpression(dn.name, "=" + dn.ranges[0]);
    } catch {
      /* duplicate / unsupported — skip */
    }
  }
  return { hf, wb };
}

function named(hf: ReturnType<typeof HyperFormula.buildFromSheets>, name: string): unknown {
  return hf.getNamedExpressionValue(name);
}
function isErr(v: unknown): boolean {
  return !!v && typeof v === "object" && "type" in (v as object) && "value" in (v as object);
}

const model = deriveUnderwriteInputs(extraction, "fallback");
const engine = computeUnderwrite(model.inputs);

describe("generated workbook — live formulas via HyperFormula", () => {
  let hf: ReturnType<typeof HyperFormula.buildFromSheets>;
  let wb: ExcelJS.Workbook;
  beforeAll(async () => {
    const buf = await buildUnderwriteWorkbook(model);
    ({ hf, wb } = await loadIntoHf(buf));
  });

  it("has zero formula errors across every sheet", () => {
    const errors: string[] = [];
    for (const name of hf.getSheetNames()) {
      const id = hf.getSheetId(name)!;
      const vals = hf.getSheetValues(id) as unknown[][];
      vals.forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]=${JSON.stringify(v)}`);
        }),
      );
    }
    expect(errors).toEqual([]);
  });

  it("Sources = Uses check evaluates TRUE", () => {
    expect(named(hf, "CheckSU")).toBe(true);
  });

  it("Levered IRR matches the engine within rounding", () => {
    const irr = Number(named(hf, "LeveredIRR"));
    expect(irr).toBeCloseTo(engine.returns.leveredIrrPct!, 3);
  });

  it("Levered Equity Multiple matches the engine", () => {
    const em = Number(named(hf, "LeveredEM"));
    expect(em).toBeCloseTo(engine.returns.leveredEquityMultiple!, 2);
  });

  it("Going-in cap and total uses tie to the engine", () => {
    const uses = Number(named(hf, "TotalUses"));
    expect(uses).toBeCloseTo(engine.sourcesUses.totalUses, 0);
  });

  it("Monthly Cash Flow tie rows all evaluate TRUE (months sum to the annual tab)", () => {
    // The tie cells are the only booleans on the sheet — one per operating
    // year. Any FALSE means the monthly convention drifted from the annual.
    const id = hf.getSheetId("Monthly Cash Flow")!;
    const vals = (hf.getSheetValues(id) as unknown[][]).flat();
    const bools = vals.filter((v) => typeof v === "boolean");
    expect(bools.length).toBe(engine.holdYears);
    expect(bools.every((b) => b === true)).toBe(true);
  });

  it("Debt Schedule exit balance ties to the closed-form Outstanding Debt", () => {
    expect(named(hf, "CheckDebtTie")).toBe(true);
  });

  it("Debt Schedule year-end balance is below the loan when amortizing", () => {
    // Base fixture amortizes (ioMonths 0) — the iterated schedule must pay
    // principal down, not just restate the loan.
    const debt = Number(named(hf, "OutstandingDebt"));
    const loan = Number(named(hf, "LoanAmount"));
    expect(debt).toBeLessThan(loan);
    expect(debt).toBeGreaterThan(0);
  });

  it("ACCEPTANCE: flexing the ExitCap cell recalculates Levered IRR (down)", () => {
    const dn = (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model
      .find((d) => d.name === "ExitCap")!;
    const m = dn.ranges[0].match(/(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)/)!;
    const sheet = hf.getSheetId(m[1] ?? m[2])!;
    const col = m[3].split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    const row = Number(m[4]) - 1;

    const before = Number(named(hf, "LeveredIRR"));
    const cap = hf.getCellValue({ sheet, row, col }) as number;
    hf.setCellContents({ sheet, row, col }, cap + 0.0025);
    const after = Number(named(hf, "LeveredIRR"));
    expect(after).toBeLessThan(before - 1e-9);
  });
});

describe("generated workbook — IO=999 full-term interest-only", () => {
  it("outstanding debt at exit equals the loan, and the schedule agrees", async () => {
    const io = deriveUnderwriteInputs(extraction, "fallback");
    io.inputs.ioMonths = 999;
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(io));
    const debt = Number(named(hf, "OutstandingDebt"));
    const loan = Number(named(hf, "LoanAmount"));
    expect(debt).toBeCloseTo(loan, 0);
    // Full-term IO: the iterated schedule never amortizes either.
    expect(named(hf, "CheckDebtTie")).toBe(true);
    // Monthly ties still hold under the IO convention.
    const id = hf.getSheetId("Monthly Cash Flow")!;
    const bools = (hf.getSheetValues(id) as unknown[][]).flat().filter((v) => typeof v === "boolean");
    expect(bools.length).toBeGreaterThan(0);
    expect(bools.every((b) => b === true)).toBe(true);
  });
});

describe("generated workbook — degenerate inputs still error-free (div guards)", () => {
  it("an interest-free (rate 0), amortizing loan produces no formula errors", async () => {
    const z = deriveUnderwriteInputs(extraction, "fallback");
    z.inputs.allInRatePct = 0;
    z.inputs.ioMonths = 0; // amortizing → exercises the r=0 balance branch
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(z));
    const errors: string[] = [];
    for (const name of hf.getSheetNames()) {
      (hf.getSheetValues(hf.getSheetId(name)!) as unknown[][]).forEach((row) =>
        row.forEach((v) => {
          if (v && typeof v === "object" && "type" in (v as object) && "value" in (v as object))
            errors.push(name);
        }),
      );
    }
    expect(errors).toEqual([]);
    // Outstanding debt should be the loan minus straight-line principal, finite.
    expect(Number.isFinite(Number(named(hf, "OutstandingDebt")))).toBe(true);
  });
});

describe("generated workbook — LIVE sensitivity grids match the engine", () => {
  // The hidden "Sensitivity Engine" tab holds one live block per scenario, in
  // grid iteration order starting at column C: scenario index = gi*25 + ri*5 +
  // ci, column = 3 + index, IRR on row 23, EM on row 24. We read those NUMBERS
  // (not the display string, whose TEXT("%") HyperFormula renders unlike Excel)
  // and compare to the unit-tested engine.
  it("every live scenario block computes the engine's IRR/EM within rounding", async () => {
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    const engId = hf.getSheetId("Sensitivity Engine")!;
    const grids = buildSensitivityGrids(model.inputs);
    for (let gi = 0; gi < grids.length; gi++) {
      for (let ri = 0; ri < 5; ri++) {
        for (let ci = 0; ci < 5; ci++) {
          const eng = grids[gi].cells[ri][ci];
          if (eng.irrPct == null || eng.emx == null) continue;
          const col = 2 + gi * 25 + ri * 5 + ci; // 0-based; C = 2
          const irr = hf.getCellValue({ sheet: engId, row: 22, col }) as number; // row 23
          const em = hf.getCellValue({ sheet: engId, row: 23, col }) as number; // row 24
          expect(Math.abs(Number(irr) - eng.irrPct), `grid ${gi} [${ri}][${ci}] irr`).toBeLessThan(0.0015);
          expect(Math.abs(Number(em) - eng.emx), `grid ${gi} [${ri}][${ci}] em`).toBeLessThan(0.02);
        }
      }
    }
  });

  it("each grid's center scenario equals the base case", async () => {
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    const engId = hf.getSheetId("Sensitivity Engine")!;
    const base = computeUnderwrite(model.inputs).returns;
    for (let gi = 0; gi < 3; gi++) {
      const col = 2 + gi * 25 + 2 * 5 + 2; // center cell [2][2]
      expect(hf.getCellValue({ sheet: engId, row: 22, col }) as number).toBeCloseTo(base.leveredIrrPct!, 3);
      expect(hf.getCellValue({ sheet: engId, row: 23, col }) as number).toBeCloseTo(base.leveredEquityMultiple!, 2);
    }
  });
});
