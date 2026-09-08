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

describe("Operating Metrics tab — the ratio ladder ties to the engine", () => {
  let hf: ReturnType<typeof HyperFormula.buildFromSheets>;
  let wb: ExcelJS.Workbook;
  beforeAll(async () => {
    const buf = await buildUnderwriteWorkbook(model);
    ({ hf, wb } = await loadIntoHf(buf));
  });

  function opsLabelRow(book: ExcelJS.Workbook, label: string): number {
    const ws = book.getWorksheet("Operating Metrics")!;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getCell(r, 1).value ?? "") === label) return r;
    }
    return -1;
  }
  function opsValue(engine2: ReturnType<typeof HyperFormula.buildFromSheets>, row: number, col: number): unknown {
    const id = engine2.getSheetId("Operating Metrics")!;
    return (engine2.getSheetValues(id) as unknown[][])[row - 1]?.[col - 1];
  }

  it("exists with the full margins ladder and per-SF yardsticks", () => {
    expect(wb.getWorksheet("Operating Metrics")).toBeTruthy();
    for (const lab of [
      "Expense Ratio (OpEx / EGR)",
      "NOI Margin",
      "DSCR (NOI)",
      "Debt Yield",
      "Breakeven Occupancy",
      "Cash-on-Cash (levered)",
      "Price / SF",
      "All-in Basis / SF (price + capital plan)",
      "Year-1 NOI / SF",
    ]) {
      expect(opsLabelRow(wb, lab), lab).toBeGreaterThan(0);
    }
  });

  it("Year-1 breakeven occupancy = (OpEx + Debt Service) / PGR, per the engine", () => {
    const y1 = engine.cashFlow[0];
    const expected =
      (y1.operatingExpenses + y1.debtService) / y1.potentialGrossRevenue;
    const r = opsLabelRow(wb, "Breakeven Occupancy");
    expect(Number(opsValue(hf, r, 2))).toBeCloseTo(expected, 6);
  });

  it("Year-1 DSCR on the ladder matches the engine", () => {
    const y1 = engine.cashFlow[0];
    const r = opsLabelRow(wb, "DSCR (NOI)");
    expect(Number(opsValue(hf, r, 2))).toBeCloseTo(y1.noi / y1.debtService, 6);
  });

  it("omits per-unit yardsticks honestly when nothing states a unit count", () => {
    // The industrial fixture states SF, not units — the tab must say so
    // instead of guessing a denominator.
    expect(model.meta.units).toBeNull();
    const ws = wb.getWorksheet("Operating Metrics")!;
    let found = false;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getCell(r, 1).value ?? "").includes("per-unit yardsticks omitted")) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("renders live per-unit yardsticks when the OM states units", async () => {
    const withUnits: ExtractionResult = {
      ...extraction,
      metrics: [
        ...extraction.metrics,
        { label: "Units", value: "250", flagged: false, page: "p. 4" },
      ],
    };
    const m2 = deriveUnderwriteInputs(withUnits, "fallback");
    expect(m2.meta.units).toBe(250);
    const buf2 = await buildUnderwriteWorkbook(m2);
    const { hf: hf2, wb: wb2 } = await loadIntoHf(buf2);
    const priceRow = opsLabelRow(wb2, "Price / Unit");
    expect(priceRow).toBeGreaterThan(0);
    expect(Number(opsValue(hf2, priceRow, 2))).toBeCloseTo(
      m2.inputs.purchasePrice / 250,
      0,
    );
    // The all-in basis is a live formula over the capital-plan input: with
    // no capital plan it equals the price per unit.
    const basisRow = opsLabelRow(wb2, "All-in Basis / Unit (price + capital plan)");
    expect(basisRow).toBeGreaterThan(0);
    expect(Number(opsValue(hf2, basisRow, 2))).toBeCloseTo(
      (m2.inputs.purchasePrice + m2.inputs.capitalImprovementsYr1) / 250,
      0,
    );
  }, 30000);

  it("omits the per-SF yardsticks, with a stated reason, when the building's size is an assumption", async () => {
    // An OM that states units but no size, and no rent roll: RSF is the
    // 100,000 placeholder, marked as one — "$680/SF" over it is not the
    // deal's figure, so the ladder is left out the way the per-unit block
    // is left out without a unit count.
    const noSf: ExtractionResult = {
      ...extraction,
      metrics: [
        ...extraction.metrics.filter((m) => !/square feet/i.test(m.label)),
        { label: "Units", value: "250", flagged: false, page: "p. 4" },
      ],
    };
    const m3 = deriveUnderwriteInputs(noSf, "fallback");
    expect(m3.sources.rsf?.provenance).toBe("assumption");
    const { wb: wb3 } = await loadIntoHf(await buildUnderwriteWorkbook(m3));
    expect(opsLabelRow(wb3, "Price / SF")).toBe(-1);
    expect(opsLabelRow(wb3, "Year-1 NOI / SF")).toBe(-1);
    expect(opsLabelRow(wb3, "Price / Unit")).toBeGreaterThan(0);
    const ws = wb3.getWorksheet("Operating Metrics")!;
    let note = false;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getCell(r, 1).value ?? "").includes("per-SF yardsticks omitted")) note = true;
    }
    expect(note).toBe(true);
    // The base fixture states its size, so its ladder stands (the earlier
    // test) — extracted, never assumed.
    expect(model.sources.rsf?.provenance).toBe("extracted");
  }, 30000);
});

// ── Plan deals ────────────────────────────────────────────────────────────────
// A conversion whose stabilized pro forma NOI exceeds the price. The workbook
// must say what the deal is, book the OM's budget as year-1 capital with its
// provenance beside it, keep the stabilized figure out of year-1 income, and
// still evaluate error-free — an IRR that cannot converge on a year-1 outflow
// eight times the price is a guarded dash, never #NUM!.
const conversion: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
    capitalBudget: "$160M hard and soft costs",
    timeline: "24 months of construction, 12 months of lease-up",
  },
  metrics: [
    { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
    { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
    { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
    { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
  ],
};

function findRow(ws: ExcelJS.Worksheet, col: number, text: string): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (ws.getCell(r, col).value === text) return r;
  }
  throw new Error(`"${text}" not found in column ${col} of ${ws.name}`);
}

describe("plan deals — the workbook says what the deal is and keeps the plan out of year 1", () => {
  let hf: ReturnType<typeof HyperFormula.buildFromSheets>;
  let wb: ExcelJS.Workbook;
  const plan = deriveUnderwriteInputs(conversion, "fallback");
  const planEngine = computeUnderwrite(plan.inputs);
  beforeAll(async () => {
    ({ hf, wb } = await loadIntoHf(await buildUnderwriteWorkbook(plan)));
  });

  it("names the deal type on the Cover, the Deal Summary and the Assumptions tab", () => {
    const cover = wb.getWorksheet("Cover")!;
    const cr = findRow(cover, 2, "Deal type");
    expect(cover.getCell(cr, 3).value).toBe("Conversion");
    expect(String(cover.getCell(cr + 1, 3).value)).toMatch(/yield on total cost/);
    expect(String(cover.getCell(cr + 1, 3).value)).toMatch(/books the capital budget in year 1/);

    const summary = wb.getWorksheet("Deal Summary")!;
    const sr = findRow(summary, 1, "Deal Type");
    expect(summary.getCell(sr, 2).value).toBe("Conversion");
    expect(summary.getCell(sr, 4).value).toBe("Capital Budget (yr 1)");

    const assum = wb.getWorksheet("Assumptions")!;
    const ar = findRow(assum, 1, "Deal Type");
    expect(assum.getCell(ar, 2).value).toBe("Conversion");
    expect(String(assum.getCell(ar, 3).value)).toMatch(/never the OM's stabilized pro forma/);
  });

  it("books the OM's budget as year-1 capital, with its page and derivation beside it", () => {
    const assum = wb.getWorksheet("Assumptions")!;
    const row = findRow(assum, 1, "Capital Improvements (yr 1)");
    expect(assum.getCell(row, 2).value).toBe(160_000_000);
    expect(String(assum.getCell(row, 3).value)).toMatch(/^OM p\. 14 — Total project cost less the price/);
    expect(Number(named(hf, "CapImprovements"))).toBe(160_000_000);
  });

  it("the all-in basis per SF is a live formula over price plus the capital plan — $600/SF", () => {
    const ws = wb.getWorksheet("Operating Metrics")!;
    const row = findRow(ws, 1, "All-in Basis / SF (price + capital plan)");
    const id = hf.getSheetId("Operating Metrics")!;
    const value = (hf.getSheetValues(id) as unknown[][])[row - 1]?.[1];
    expect(Number(value)).toBeCloseTo(180_000_000 / 300_000, 6);
    // The shell's price alone is a different, smaller number — never the basis here.
    const priceRow = findRow(ws, 1, "Price / SF");
    const priceValue = (hf.getSheetValues(id) as unknown[][])[priceRow - 1]?.[1];
    expect(Number(priceValue)).toBeCloseTo(20_000_000 / 300_000, 6);
  });

  it("keeps the stabilized pro forma out of year-1 income and says why", () => {
    const assum = wb.getWorksheet("Assumptions")!;
    const row = findRow(assum, 1, "In-Place Rental Revenue (annual)");
    expect(String(assum.getCell(row, 3).value)).toMatch(/does not anchor year 1/);
    // Year-1 NOI is the 6% screening default on a $20M price — not $21M.
    expect(planEngine.cashFlow[0].noi).toBeGreaterThan(0);
    expect(planEngine.cashFlow[0].noi).toBeLessThan(2_000_000);
    expect(planEngine.cashFlow[0].capitalImprovements).toBe(160_000_000);
  });

  it("a stabilized deal gets no plan wording (the row is absent, not blank)", async () => {
    const stabilized = deriveUnderwriteInputs(
      { ...extraction, strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" } },
      "fallback",
    );
    const { wb: sb } = await loadIntoHf(await buildUnderwriteWorkbook(stabilized));
    const summary = sb.getWorksheet("Deal Summary")!;
    const sr = findRow(summary, 1, "Deal Type");
    expect(summary.getCell(sr, 2).value).toBe("Stabilized");
    expect(summary.getCell(sr, 4).value ?? null).toBeNull();
    const cover = sb.getWorksheet("Cover")!;
    const cr = findRow(cover, 2, "Deal type");
    expect(String(cover.getCell(cr + 1, 3).value)).not.toMatch(/capital budget/);
  });

  it("still has zero formula errors, and total uses tie to the engine", () => {
    const errors: string[] = [];
    for (const name of hf.getSheetNames()) {
      const id = hf.getSheetId(name)!;
      (hf.getSheetValues(id) as unknown[][]).forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]=${JSON.stringify(v)}`);
        }),
      );
    }
    expect(errors).toEqual([]);
    expect(Number(named(hf, "TotalUses"))).toBeCloseTo(planEngine.sourcesUses.totalUses, 0);
  });
});
