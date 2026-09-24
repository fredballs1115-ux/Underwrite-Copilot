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

  it("the Cash Flow tab's NOI and levered cash-flow rows carry data bars over the operating years only", () => {
    const ws = wb.getWorksheet("Cash Flow")!;
    const rowOf = (text: string) => {
      let found = 0;
      ws.eachRow((row, n) => {
        if (row.getCell(1).value === text) found = n;
      });
      return found;
    };
    const noi = rowOf("Net Operating Income");
    const levcf = rowOf("Levered Cash Flow");
    expect(noi).toBeGreaterThan(0);
    expect(levcf).toBeGreaterThan(noi);
    // Operating years sit in C..(C + hold − 1); the forward column and the
    // investment vectors (which carry the sale) draw no bar.
    const lastOp = String.fromCharCode(64 + 3 + engine.holdYears - 1);
    const cfs = (
      ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string; cfvo?: { type: string }[] }[] }[] }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    expect(bars.map((cf) => cf.ref).sort()).toEqual([`C${noi}:${lastOp}${noi}`, `C${levcf}:${lastOp}${levcf}`].sort());
    for (const cf of bars) {
      expect(cf.rules.find((r) => r.type === "dataBar")!.cfvo?.map((c) => c.type)).toEqual(["min", "max"]);
    }
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

  it("the Deal Summary's return block names the year-1 cap for what it is and puts the OM's stabilized NOI over total cost", () => {
    // The eighth review: "Stabilized Yield (on cost)" was year-1 NOI over
    // uses that left the $160M budget out — 5.91% where every other surface
    // says 11.7%. On a plan deal the block now reads the OM's stabilized
    // figure over uses plus the capital plan, and the year-1 cap says it is
    // the cap on modelled year-1 income.
    const summary = wb.getWorksheet("Deal Summary")!;
    expect(() => findRow(summary, 4, "Going-In Cap")).toThrow();
    expect(() => findRow(summary, 4, "Stabilized Yield (on cost)")).toThrow();
    findRow(summary, 4, "Cap on Yr-1 Income (as modelled)");
    findRow(summary, 4, "Yield on Cost (OM stabilized NOI / total cost)");
    const noiRow = findRow(summary, 1, "OM Stabilized NOI (pro forma)");
    expect(summary.getCell(noiRow, 2).value).toBe(21_000_000);
    expect(String(summary.getCell(noiRow, 3).value)).toBe("OM p. 12");
    expect(summary.getCell(noiRow, 4).value).toBe("Total Cost (uses + capital plan)");
    expect(Number(named(hf, "StabilizedNOI"))).toBe(21_000_000);
    const totalCost = Number(named(hf, "TotalCost"));
    expect(totalCost).toBeCloseTo(planEngine.sourcesUses.totalUses + 160_000_000, 0);
    expect(Number(named(hf, "YieldOnCost"))).toBeCloseTo(21_000_000 / totalCost, 6);
    // Live: the yield reads through the named cells, not a pasted number.
    const yocRow = findRow(summary, 4, "Yield on Cost (OM stabilized NOI / total cost)");
    expect(String((summary.getCell(yocRow, 5).value as { formula?: string }).formula)).toMatch(/StabilizedNOI\/TotalCost/);
  });

  it("a plan deal whose OM states no stabilized NOI says so, and the yield cell reads n/a rather than erroring", async () => {
    const noNoi = deriveUnderwriteInputs(
      { ...conversion, metrics: conversion.metrics.filter((m) => !/NOI/.test(m.label)) },
      "fallback",
    );
    expect(noNoi.meta.stabilizedNoi).toBeNull();
    const { hf: h, wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(noNoi));
    const summary = w.getWorksheet("Deal Summary")!;
    const noiRow = findRow(summary, 1, "OM Stabilized NOI (pro forma)");
    expect(summary.getCell(noiRow, 2).value).toBe("not stated");
    expect(named(h, "YieldOnCost")).toBe("n/a");
  }, 30000);

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

describe("the per-unit rows in the class's own noun (lib/asset-words)", () => {
  it("a hotel's workbook prices per key, off its Keys row, and never says unit", async () => {
    const hotel: ExtractionResult = {
      ...extraction,
      assetClass: "hospitality_str",
      metrics: [...extraction.metrics, { label: "Keys", value: "120", flagged: false, page: "p. 4" }],
    };
    const m = deriveUnderwriteInputs(hotel, "fallback");
    expect(m.meta.units).toBe(120);
    expect(m.meta.unitNoun).toEqual({ one: "key", many: "keys" });
    expect(m.meta.assetClass).toBe("Hospitality / STR");
    const buf = await buildUnderwriteWorkbook(m);
    const { wb } = await loadIntoHf(buf);
    const ws = wb.getWorksheet("Operating Metrics")!;
    const labels: string[] = [];
    for (let r = 1; r <= ws.rowCount; r++) labels.push(String(ws.getCell(r, 1).value ?? ""));
    expect(labels).toContain("Keys");
    expect(labels).toContain("Price / Key");
    expect(labels).toContain("All-in Basis / Key (price + capital plan)");
    expect(labels).toContain("Year-1 Rent / Key / Month");
    expect(labels.some((l) => /\/ Unit\b|^Units$/.test(l))).toBe(false);
  });
});

// ── The Market Read tab ─────────────────────────────────────────────────────
import type { ModelVsMarket } from "@/lib/model-vs-market";

describe("the Market Read tab — the assumptions against the published figures, as built", () => {
  const read: ModelVsMarket = {
    readOn: "2026-09-21",
    metro: "Washington DC",
    checks: [
      {
        key: "rent_growth",
        title: "Rent growth",
        model: "3.0%/yr",
        modelSource: "a screening default",
        published: [
          { label: "Asking rent, all home types", text: "+2.3% over the year to Aug 2026", value: 2.3, asOf: "2026-08-31", publisher: "Zillow Research" },
          { label: "Rent paid by sitting tenants (CPI rent)", text: "+5.0% over the year to Aug 2026", value: 5, asOf: "2026-08-01", publisher: "BLS" },
        ],
        tone: "inside",
        toneLabel: "inside the published range",
        scope: "metro",
        read: "The model grows rents 3.0%/yr. Over the past year the metro's asking rents moved +2.3% over the year to Aug 2026 (Zillow) and sitting tenants' rents +5.0% over the year to Aug 2026 (CPI rent, BLS). The model sits inside the published range. A trailing year is what the assumption is being asked to beat, not a forecast.",
      },
      {
        key: "exit_cap",
        title: "Exit cap",
        model: "6.00%",
        modelSource: "derived from the documents",
        published: [{ label: "10-year Treasury", text: "4.94% on Sep 17, 2026", value: 4.94, asOf: "2026-09-17", publisher: "FRED" }],
        tone: "widens",
        toneLabel: "spread widens at the exit",
        scope: "national",
        read: "The exit cap 6.00% is 106 bps over today's 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year where it is today — the conservative direction.",
      },
    ],
  };

  async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
  }

  it("sits beside Assumptions, one row a published figure, the sentence on the first — data, never a formula", async () => {
    const wb = await load(await buildUnderwriteWorkbook(model, null, read));
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names.indexOf("Market Read")).toBe(names.indexOf("Assumptions") + 1);
    const ws = wb.getWorksheet("Market Read")!;
    expect(ws.getCell(1, 1).value).toBe("Assumptions against the published figures");
    expect(String(ws.getCell(2, 1).value)).toBe(
      "The model's rent growth and exit cap, set against what the Washington DC market and the national series have actually done, read on 2026-09-21.",
    );
    expect(String(ws.getCell(3, 1).value)).toContain("not a forecast");
    expect(ws.getCell(5, 1).value).toBe("ASSUMPTION");
    expect(ws.getCell(5, 9).value).toBe("WHAT THE FIGURES SAY");
    // The first check: its first row carries the assumption and the sentence,
    // its second row the second figure alone.
    expect(ws.getCell(6, 1).value).toBe("Rent growth");
    expect(ws.getCell(6, 2).value).toBe("3.0%/yr");
    expect(ws.getCell(6, 3).value).toBe("a screening default");
    expect(ws.getCell(6, 4).value).toBe("Asking rent, all home types: +2.3% over the year to Aug 2026");
    expect(ws.getCell(6, 5).value).toBe(2.3);
    expect(ws.getCell(6, 6).value).toBe("2026-08-31");
    expect(ws.getCell(6, 7).value).toBe("Zillow Research");
    expect(ws.getCell(6, 8).value).toBe("inside the published range");
    expect(String(ws.getCell(6, 9).value)).toContain("The model grows rents 3.0%/yr.");
    expect(ws.getCell(7, 1).value).toBeNull();
    expect(ws.getCell(7, 4).value).toBe("Rent paid by sitting tenants (CPI rent): +5.0% over the year to Aug 2026");
    expect(ws.getCell(7, 5).value).toBe(5);
    expect(ws.getCell(7, 9).value).toBeNull();
    // The second check starts on the next row.
    expect(ws.getCell(8, 1).value).toBe("Exit cap");
    expect(ws.getCell(8, 5).value).toBe(4.94);
    expect(ws.getCell(8, 8).value).toBe("spread widens at the exit");
    // A data tab: nothing on it is a formula.
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        expect(v && typeof v === "object" && "formula" in v, cell.address).toBe(false);
      });
    });
  });

  it("is absent with nothing read, rather than an empty tab", async () => {
    expect((await load(await buildUnderwriteWorkbook(model))).getWorksheet("Market Read")).toBeUndefined();
    expect(
      (await load(await buildUnderwriteWorkbook(model, null, { readOn: "2026-09-21", metro: null, checks: [] }))).getWorksheet("Market Read"),
    ).toBeUndefined();
  });

  it("leaves the live model as it was: zero formula errors with the tab in the book", async () => {
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(model, null, read));
    const errors: string[] = [];
    for (const name of hf.getSheetNames()) {
      const id = hf.getSheetId(name)!;
      (hf.getSheetValues(id) as unknown[][]).forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]`);
        }),
      );
    }
    expect(errors).toEqual([]);
    expect(named(hf, "CheckSU")).toBe(true);
  });
});

// ── The Portfolio tab (#411) ────────────────────────────────────────────────
import { readPortfolio } from "@/lib/portfolio";
import { PORTFOLIO_HEAD_ROW } from "./workbook";

describe("the Portfolio tab — each property as the memorandum states it, the shares as live formulas", () => {
  const prop = (name: string, address: string, count: string, noi: string, occupancy: string, allocatedPrice: string, page: string) => ({
    name, address, count, area: "", noi, occupancy, yearBuilt: "", allocatedPrice, page,
  });
  const portfolioEx: ExtractionResult = {
    dealName: "Rust Belt Residential Portfolio",
    assetClass: "multifamily",
    address: "1200 Liberty Ave, Pittsburgh, PA 15222",
    metrics: [
      { label: "Asking price", value: "$75,000,000", flagged: false, page: "p. 3" },
      { label: "Units", value: "398", flagged: false, page: "p. 3" },
      { label: "Net operating income", value: "$3,780,000", flagged: false, page: "p. 9" },
    ],
    properties: [
      prop("Liberty Lofts", "1200 Liberty Ave, Pittsburgh, PA 15222", "128", "$1,420,000", "95%", "$28,000,000", "p. 14"),
      prop("Ohio City Commons", "1850 W 25th St, Cleveland, OH 44113", "210", "$2,050,000", "94%", "$38,000,000", "p. 22"),
      prop("Marion Gardens", "400 Barks Rd, Marion, OH 43302", "", "$310,000", "82%", "$4,000,000", "p. 26"),
    ],
    totalPages: 28,
  };
  const pModel = deriveUnderwriteInputs(portfolioEx, "fallback");
  const read = readPortfolio(portfolioEx)!;
  const first = PORTFOLIO_HEAD_ROW + 1;

  it("sits after the Deal Summary, with a row a property, its blanks left blank, and the Contents naming it", async () => {
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(pModel, null, null, read));
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names.indexOf("Portfolio")).toBe(names.indexOf("Deal Summary") + 1);
    const ws = wb.getWorksheet("Portfolio")!;
    expect(ws.getCell(1, 1).value).toBe("The portfolio — 3 properties");
    expect(String(ws.getCell(3, 1).value)).toContain("The allocated prices sum to $70.0M against the $75.0M ask (-6.7%)");
    expect(ws.getCell(PORTFOLIO_HEAD_ROW, 4).value).toBe("UNITS");
    expect(ws.getCell(PORTFOLIO_HEAD_ROW, 12).value).toBe("SHARE OF UNITS");
    expect(ws.getCell(first, 1).value).toBe("Liberty Lofts");
    expect(ws.getCell(first, 3).value).toBe("Pittsburgh PA");
    expect(ws.getCell(first, 4).value).toBe(128);
    expect(ws.getCell(first, 6).value).toBe(1_420_000);
    expect(ws.getCell(first, 7).value).toBeCloseTo(0.95, 10);
    expect(ws.getCell(first, 9).value).toBe(28_000_000);
    expect(ws.getCell(first, 15).value).toBe("p. 14");
    // Marion Gardens states no count: the cell is empty, never a zero.
    expect(ws.getCell(first + 2, 4).value ?? null).toBeNull();
    // The derived columns are formulas, never values.
    for (const c of [10, 11, 12, 13, 14]) {
      const v = ws.getCell(first, c).value as { formula?: string } | null;
      expect(v && typeof v === "object" && typeof v.formula === "string", `col ${c}`).toBe(true);
    }
    const cover = wb.getWorksheet("Cover")!;
    let listed = false;
    cover.eachRow((row) => {
      if (row.getCell(2).value === "Portfolio") listed = true;
    });
    expect(listed).toBe(true);
    // Excel's own data bars on the three shares, from zero.
    const cfs = (
      ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string; cfvo?: { type: string; value?: number }[] }[] }[] }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    expect(bars.map((cf) => cf.ref).sort()).toEqual([`L${first}:L${first + 2}`, `M${first}:M${first + 2}`, `N${first}:N${first + 2}`]);
    expect(bars[0].rules[0].cfvo?.map((c) => c.type)).toEqual(["num", "max"]);
  });

  it("computes what lib/portfolio reads, and draws the count's share the moment the missing count is typed in", async () => {
    const { hf } = await loadIntoHf(await buildUnderwriteWorkbook(pModel, null, null, read));
    const sheet = hf.getSheetId("Portfolio")!;
    const at = (row: number, col: number) => hf.getCellValue({ sheet, row: row - 1, col: col - 1 });
    // Every property states an NOI: the income's shares match the reader's.
    read.noiShares!.forEach((share, i) => expect(Number(at(first + i, 14))).toBeCloseTo(share / 100, 10));
    // Not every property states a count: no share of the units, and no total.
    expect(read.shares).toBeNull();
    for (let i = 0; i < 3; i++) expect(at(first + i, 12)).toBe("");
    const total = first + 3;
    expect(at(total, 4)).toBe("");
    // The allocation per unit and the cap on it, where both are stated.
    expect(Number(at(first, 10))).toBeCloseTo(28_000_000 / 128, 6);
    expect(Number(at(first, 11))).toBeCloseTo(1_420_000 / 28_000_000, 10);
    expect(at(first + 2, 10)).toBe("");
    // The allocations against the ask: the reader's gap, as a fraction.
    expect(Number(at(total, 9))).toBe(70_000_000);
    expect(Number(at(total + 3, 9))).toBeCloseTo(read.allocationGapPct! / 100, 10);
    // Type the missing count in: the shares of the units appear, and match
    // the reader's on the completed set.
    hf.setCellContents({ sheet, row: first + 2 - 1, col: 4 - 1 }, 60);
    const completed = readPortfolio({
      ...portfolioEx,
      properties: portfolioEx.properties!.map((x, i) => (i === 2 ? { ...x, count: "60" } : x)),
    })!;
    completed.shares!.forEach((share, i) => expect(Number(at(first + i, 12))).toBeCloseTo(share / 100, 10));
    expect(Number(at(total, 4))).toBe(398);
    // And the book still has no formula error anywhere.
    const errors: string[] = [];
    for (const name of hf.getSheetNames()) {
      const id = hf.getSheetId(name)!;
      (hf.getSheetValues(id) as unknown[][]).forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]`);
        }),
      );
    }
    expect(errors).toEqual([]);
  });

  it("is absent for a single property", async () => {
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(model, null, null, readPortfolio(extraction)));
    expect(wb.getWorksheet("Portfolio")).toBeUndefined();
  });
});

// ── What is being sold, on the cover (#414) ────────────────────────────────
describe("the cover says what is being sold, and what the model is and is not on it", () => {
  it("a note: the line and the caveat under the deal type; a fee simple: neither", async () => {
    const note = deriveUnderwriteInputs(
      {
        ...extraction,
        interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
        metrics: [...extraction.metrics, { label: "Unpaid principal balance", value: "$62,500,000", flagged: false, page: "p. 3" }],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(note));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "What is being sold");
    expect(r).toBeGreaterThan(0);
    expect(cover.getCell(r, 3).value).toBe("A loan secured by the property, not the property — the $50.0M price is a 20.0% discount to the $62.5M balance");
    expect(String(cover.getCell(r + 1, 3).value)).toContain("not the note's return");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "What is being sold")).toThrow();
  });
});
