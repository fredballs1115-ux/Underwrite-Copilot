import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { buildUnderwriteWorkbook } from "./workbook";
import { deriveUnderwriteInputs } from "./inputs";
import { computeUnderwrite } from "./engine";
import { buildSensitivityGrids } from "./sensitivity";
import type { UnderwriteInputs } from "./engine";
import { PLAN_RETURNS_CAVEAT_WORKBOOK } from "./plan-caveat";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { regulationForDeal } from "@/lib/rent-regulation";
import { STRATEGY_READING } from "@/lib/deal-strategy";

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
  it("every live scenario block computes the engine's IRR/EM", async () => {
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
          // To HyperFormula's own IRR precision, and the multiple exactly: a
          // price scenario's closing costs struck at the base price had left
          // the price grid 1.5 bps off, inside the 15 bps this once allowed.
          expect(Math.abs(Number(irr) - eng.irrPct), `grid ${gi} [${ri}][${ci}] irr`).toBeLessThan(1e-8);
          expect(Math.abs(Number(em) - eng.emx), `grid ${gi} [${ri}][${ci}] em`).toBeLessThan(1e-9);
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

// ── The Sensitivity tab's axes are live ─────────────────────────────────────
// The research pass changed one input at a time in a recalculated workbook:
// the Deal Summary moved and every grid stayed centred on the inputs as
// exported, its bold "base scenario" still the old IRR, because each axis
// value and each scenario's override was a number written at export. Each
// axis cell is now a formula off its named input, every scenario reads its
// axis cells, and a price scenario strikes its closing costs at its own
// price, as the engine does — so a cell is the engine's run at the values
// the tab shows, whatever has been typed into the file since.
describe("the Sensitivity tab stays centred on the inputs as they stand", () => {
  type Hf = ReturnType<typeof HyperFormula.buildFromSheets>;
  type At = { sheet: number; row: number; col: number };
  type Key = "exitCapPct" | "holdMonths" | "purchasePrice" | "ltc" | "allInRatePct";

  /** A defined name's cell, as HyperFormula addresses it. */
  function namedAt(book: ExcelJS.Workbook, h: Hf, name: string): At {
    const dn = (book.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model.find((d) => d.name === name)!;
    const m = dn.ranges[0].match(/(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)/)!;
    return {
      sheet: h.getSheetId(m[1] ?? m[2])!,
      row: Number(m[4]) - 1,
      col: m[3].split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1,
    };
  }

  /** The three grids by their titles, with the input each axis varies. */
  const GRIDS: { title: string; row: Key; col: Key }[] = [
    { title: "EXIT CAP × HOLD PERIOD", row: "holdMonths", col: "exitCapPct" },
    { title: "EXIT CAP × PURCHASE PRICE", row: "purchasePrice", col: "exitCapPct" },
    { title: "LEVERAGE × RATE", row: "allInRatePct", col: "ltc" },
  ];

  /** A grid as the visible tab shows it: under its title a row of matrix
   *  labels, the column axis, then five rows — the row axis in column A,
   *  the IRR matrix in B..F and the equity multiple in H..L. */
  function gridAt(book: ExcelJS.Workbook, h: Hf, title: string) {
    const ws = book.getWorksheet("Sensitivity")!;
    const top = findRow(ws, 1, title);
    const sheet = h.getSheetId("Sensitivity")!;
    const v = (row: number, col: number) => h.getCellValue({ sheet, row: row - 1, col: col - 1 });
    const five = [0, 1, 2, 3, 4];
    return {
      colAxis: five.map((ci) => Number(v(top + 2, 2 + ci))),
      emColAxis: five.map((ci) => Number(v(top + 2, 8 + ci))),
      rowAxis: five.map((ri) => Number(v(top + 3 + ri, 1))),
      irr: five.map((ri) => five.map((ci) => v(top + 3 + ri, 2 + ci))),
      em: five.map((ri) => five.map((ci) => v(top + 3 + ri, 8 + ci))),
    };
  }

  /** Every cell of every grid against computeUnderwrite at the axis values
   *  the tab shows: the IRR to HyperFormula's own precision, the multiple
   *  exactly — a closing cost struck at the wrong price moves the multiple
   *  in its seventh figure. */
  function expectEngineAgrees(book: ExcelJS.Workbook, h: Hf, base: UnderwriteInputs) {
    for (const g of GRIDS) {
      const v = gridAt(book, h, g.title);
      expect(v.emColAxis, `${g.title} EM axis`).toEqual(v.colAxis);
      for (let ri = 0; ri < 5; ri++) {
        for (let ci = 0; ci < 5; ci++) {
          const r = computeUnderwrite({ ...base, [g.row]: v.rowAxis[ri], [g.col]: v.colAxis[ci] }).returns;
          const at = `${g.title} [${ri}][${ci}]`;
          expect(Math.abs(Number(v.irr[ri][ci]) - r.leveredIrrPct!), `${at} irr`).toBeLessThan(1e-8);
          expect(Math.abs(Number(v.em[ri][ci]) - r.leveredEquityMultiple!), `${at} em`).toBeLessThan(1e-9);
        }
      }
    }
  }

  it("re-centres every grid on an input changed in the file: its centre is the Deal Summary's levered IRR", async () => {
    const { hf, wb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    const changes: [string, Key, number][] = [
      ["ExitCap", "exitCapPct", 0.07],
      ["PurchasePrice", "purchasePrice", 45_000_000],
      ["AllInRate", "allInRatePct", 0.07],
      ["LTC", "ltc", 0.65],
    ];
    for (const [name, key, value] of changes) {
      const at = namedAt(wb, hf, name);
      const before = hf.getCellValue(at);
      hf.setCellContents(at, value);
      const irr = Number(named(hf, "LeveredIRR"));
      const em = Number(named(hf, "LeveredEM"));
      // The Deal Summary moved to the engine's run at the new input...
      expect(Math.abs(irr - computeUnderwrite({ ...model.inputs, [key]: value }).returns.leveredIrrPct!), name).toBeLessThan(1e-8);
      for (const g of GRIDS) {
        const v = gridAt(wb, hf, g.title);
        // ...and every grid's bold centre moved with it.
        expect(Math.abs(Number(v.irr[2][2]) - irr), `${name}: ${g.title} centre IRR`).toBeLessThan(1e-8);
        expect(Math.abs(Number(v.em[2][2]) - em), `${name}: ${g.title} centre EM`).toBeLessThan(1e-9);
        // The axis that varies the input is centred on the value typed in.
        if (g.row === key) expect(v.rowAxis[2], `${name}: ${g.title} row axis`).toBeCloseTo(value, 12);
        if (g.col === key) expect(v.colAxis[2], `${name}: ${g.title} column axis`).toBeCloseTo(value, 12);
      }
      hf.setCellContents(at, before as number);
    }
  });

  it("runs every scenario as the engine does at the values its axes show, closing costs struck at the scenario's own price", async () => {
    const { hf, wb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expectEngineAgrees(wb, hf, model.inputs);
    // A price typed into the file: the price grid's scenarios run at the
    // new axis, each with its closing costs and fee at its own price.
    const at = namedAt(wb, hf, "PurchasePrice");
    hf.setCellContents(at, 45_000_000);
    const v = gridAt(wb, hf, "EXIT CAP × PURCHASE PRICE");
    expect(v.rowAxis[2]).toBe(45_000_000);
    expect(v.rowAxis[4] - v.rowAxis[2]).toBeGreaterThan(0);
    expectEngineAgrees(wb, hf, { ...model.inputs, purchasePrice: 45_000_000 });
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
    expect(() => findRow(summary, 4, "Going-In Cap (Yr-1 NOI / Price)")).toThrow();
    expect(() => findRow(summary, 4, "Year-1 Yield on Total Cost")).toThrow();
    findRow(summary, 4, "Cap on Yr-1 Income (as modelled)");
    findRow(summary, 4, "Yield on Cost (OM stabilized NOI / uses + capital plan)");
    const noiRow = findRow(summary, 1, "OM Stabilized NOI (pro forma)");
    expect(summary.getCell(noiRow, 2).value).toBe(21_000_000);
    expect(String(summary.getCell(noiRow, 3).value)).toBe("OM p. 12");
    expect(summary.getCell(noiRow, 4).value).toBe("Total Cost (uses + capital plan)");
    expect(Number(named(hf, "StabilizedNOI"))).toBe(21_000_000);
    const totalCost = Number(named(hf, "TotalCost"));
    expect(totalCost).toBeCloseTo(planEngine.sourcesUses.totalUses + 160_000_000, 0);
    expect(Number(named(hf, "YieldOnCost"))).toBeCloseTo(21_000_000 / totalCost, 6);
    // Live: the yield reads through the named cells, not a pasted number.
    const yocRow = findRow(summary, 4, "Yield on Cost (OM stabilized NOI / uses + capital plan)");
    expect(String((summary.getCell(yocRow, 5).value as { formula?: string }).formula)).toMatch(/StabilizedNOI\/TotalCost/);
  });

  it("says under the headline tiles that a plan deal's returns are the screening model's — the deal page's own sentence", () => {
    // The tiles lead with a levered IRR, a multiple and a year-1
    // cash-on-cash struck with the whole budget in year 1; the deal page
    // prints its caveat over the same returns, and the full report leaves
    // them out. The sentence sits on the row under the tiles' values.
    const summary = wb.getWorksheet("Deal Summary")!;
    const tiles = findRow(summary, 1, "PURCHASE PRICE");
    expect(summary.getCell(tiles + 1, 2).value).toMatchObject({ formula: expect.stringContaining("IRR(") });
    expect(summary.getCell(tiles + 2, 1).value).toBe(PLAN_RETURNS_CAVEAT_WORKBOOK);
    // The workbook solves no bid, so its caveat says nothing of one.
    expect(PLAN_RETURNS_CAVEAT_WORKBOOK).not.toMatch(/bid/);
    expect(summary.getCell(tiles + 2, 1).alignment?.wrapText).toBe(true);
  });

  it("says under Sources how the capital plan is paid: out of year-1 cash flow, not the loan or the equity", () => {
    // The loan is sized on the acquisition cost and the equity is the plug
    // on uses that leave the budget out — the engine spends the budget in
    // year 1's cash flow — so Sources says where it is.
    const summary = wb.getWorksheet("Deal Summary")!;
    const row = findRow(summary, 1, "Capital Plan (yr 1)");
    expect(row).toBe(findRow(summary, 1, "Sources = Uses") + 1);
    expect(summary.getCell(row, 2).value).toMatchObject({ formula: "CapImprovements" });
    expect(summary.getCell(row, 2).font?.color?.argb).toBe("FF107C41"); // a link, green
    expect(summary.getCell(row + 1, 1).value).toBe("paid from year-1 cash flow, not these sources");
    const id = hf.getSheetId("Deal Summary")!;
    expect(hf.getCellValue({ sheet: id, row: row - 1, col: 1 })).toBe(160_000_000);
    // What the line says is what the engine does: the budget is year 1's
    // capital, outside the loan and the equity.
    expect(planEngine.cashFlow[0].capitalImprovements).toBe(160_000_000);
    expect(Number(named(hf, "LoanAmount"))).toBeCloseTo(planEngine.sourcesUses.loanAmount, 0);
    expect(Number(named(hf, "Equity"))).toBeCloseTo(planEngine.sourcesUses.totalUses - planEngine.sourcesUses.loanAmount, 0);
    // And the LTC input says what it is struck on.
    const assum = wb.getWorksheet("Assumptions")!;
    expect(assum.getCell(findRow(assum, 1, "Loan to Cost (acquisition cost)"), 2).value).toBe(plan.inputs.ltc);
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
    // No plan caveat over a stabilized deal's returns; the capital plan's
    // line under Sources stands on every deal, since any deal can carry one.
    summary.eachRow((row) => row.eachCell((cell) => expect(cell.value).not.toBe(PLAN_RETURNS_CAVEAT_WORKBOOK)));
    findRow(summary, 1, "Capital Plan (yr 1)");
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

// Research pass 34: on a note, a 49% share beside its entity's loan and a
// preferred equity position, the book printed "Going-In Cap (Yr-1 NOI /
// Price)" and "Price / Unit" struck on a price that did not buy the
// building — the equity's whole over 200 units read $210,000 — while the
// compare table and the deal page withhold them (`buildingPriceOf` answers
// none). The caveat the cover prints now sits under the tiles too.
describe("where the price did not buy the building, no building basis or cap is struck on it", () => {
  const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
  const withUnits = (over: Partial<ExtractionResult>, rows: ExtractionResult["metrics"] = []): ExtractionResult => ({
    ...extraction,
    ...over,
    metrics: [...extraction.metrics, { label: "Units", value: "200", flagged: false, page: "p. 4" }, ...rows],
  });
  const opsLabels = (w: ExcelJS.Workbook): string[] => {
    const ops = w.getWorksheet("Operating Metrics")!;
    const out: string[] = [];
    ops.eachRow((row) => out.push(String(row.getCell(1).value ?? "")));
    return out;
  };
  const noErrors = (h: ReturnType<typeof HyperFormula.buildFromSheets>) => {
    const errors: string[] = [];
    for (const name of h.getSheetNames()) {
      (h.getSheetValues(h.getSheetId(name)!) as unknown[][]).forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]`);
        }),
      );
    }
    expect(errors).toEqual([]);
  };

  it("a note: its caveat under the tiles, n/a where the cap, the yield and the per-unit and per-SF prices stood", async () => {
    const m = deriveUnderwriteInputs(withUnits({ interest: { ...blank, kind: "note" } }), "fallback");
    expect(m.meta.interest?.basisWithheld).toEqual({ word: "note", why: "the price buys a note secured by the building, not the building" });
    const { hf: h, wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(m));
    const summary = w.getWorksheet("Deal Summary")!;
    const tiles = findRow(summary, 1, "PURCHASE PRICE");
    expect(summary.getCell(tiles + 2, 1).value).toBe(m.meta.interest!.modelCaveat);
    expect(String(summary.getCell(tiles + 2, 1).value)).toContain("not the note's return");
    expect(summary.getCell(findRow(summary, 4, "Going-In Cap (Yr-1 NOI / Price)"), 5).value).toBe("n/a — note");
    expect(summary.getCell(findRow(summary, 4, "Year-1 Yield on Total Cost"), 5).value).toBe("n/a — note");
    const labels = opsLabels(w);
    expect(labels).not.toContain("Price / Unit");
    expect(labels).not.toContain("Price / SF");
    expect(labels).not.toContain("All-in Basis / SF (price + capital plan)");
    expect(labels).toContain(
      "Price / Unit and All-in Basis / Unit left out: the price buys a note secured by the building, not the building, so no building basis is struck on it.",
    );
    // The building's own income per unit and per foot stays.
    expect(labels).toContain("Year-1 NOI / Unit");
    expect(labels).toContain("Year-1 NOI / SF");
    // The returns stay live; nothing is left pointing at a withheld cell.
    expect(Number(named(h, "LeveredIRR"))).toBeCloseTo(computeUnderwrite(m.inputs).returns.leveredIrrPct!, 3);
    noErrors(h);
  }, 30000);

  it("a share beside its entity's loan and a preferred equity position say n/a; a share of a stated percentage keeps its cap on the whole", async () => {
    const loan = deriveUnderwriteInputs(
      withUnits({ interest: { ...blank, kind: "partial_interest", share: "A 49% limited partnership interest" } }, [
        { label: "Entity loan balance", value: "$56,500,000", flagged: false, page: "p. 9" },
      ]),
      "fallback",
    );
    expect(loan.meta.interest?.basisWithheld?.word).toBe("share");
    const position = deriveUnderwriteInputs(
      withUnits({ interest: { ...blank, kind: "preferred_equity" } }, [
        { label: "Preferred equity amount", value: "$8,000,000", flagged: false, page: "p. 2" },
        { label: "Preferred return", value: "12%", flagged: false, page: "p. 2" },
      ]),
      "fallback",
    );
    expect(position.meta.interest?.basisWithheld?.word).toBe("position");
    // The price tile names what the figure is: beside the entity's loan, the
    // share's price grossed up is the equity's whole (the plan's own words);
    // a position's price is the position's, as stated.
    for (const [m, word, tile] of [
      [loan, "share", "EQUITY'S WHOLE (49% SHARE GROSSED UP)"],
      [position, "position", "PURCHASE PRICE"],
    ] as const) {
      const { hf: h, wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(m));
      const summary = w.getWorksheet("Deal Summary")!;
      expect(summary.getCell(findRow(summary, 4, "Going-In Cap (Yr-1 NOI / Price)"), 5).value).toBe(`n/a — ${word}`);
      expect(opsLabels(w)).not.toContain("Price / Unit");
      const tiles = findRow(summary, 1, tile);
      expect(summary.getCell(tiles + 2, 1).value).toBe(m.meta.interest!.modelCaveat);
      noErrors(h);
    }
    // A 49% share with no entity loan: the model runs at the whole the
    // price implies, a building's price, so its cap and basis stand.
    const share = deriveUnderwriteInputs(withUnits({ interest: { ...blank, kind: "partial_interest", share: "A 49% limited partnership interest" } }), "fallback");
    expect(share.meta.interest?.basisWithheld ?? null).toBeNull();
    const { wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(share));
    const summary = w.getWorksheet("Deal Summary")!;
    expect(summary.getCell(findRow(summary, 4, "Going-In Cap (Yr-1 NOI / Price)"), 5).value).toMatchObject({ formula: expect.stringContaining("/PurchasePrice") });
    expect(opsLabels(w)).toContain("Price / Unit");
  }, 60000);

  // Research pass 35 (F4): a 49% share's tab led with "PURCHASE PRICE
  // $68,000,000" — the share costs $33,320,000; $68M is the whole grossed up
  // — and the IRR, multiple and coverage beside it are the whole building's.
  it("names a share's grossed-up price as the whole on the tile, wrapped, with the caveat under the band", async () => {
    const share = deriveUnderwriteInputs(
      withUnits({ interest: { ...blank, kind: "partial_interest", share: "A 49% limited partnership interest" } }),
      "fallback",
    );
    expect(share.meta.priceLabel).toBe("Whole Price (49% share grossed up)");
    const { wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(share));
    const summary = w.getWorksheet("Deal Summary")!;
    const tiles = findRow(summary, 1, "WHOLE PRICE (49% SHARE GROSSED UP)");
    expect(() => findRow(summary, 1, "PURCHASE PRICE")).toThrow();
    // Live as before: the tile reads the one price cell the model runs at.
    expect(summary.getCell(tiles + 1, 1).value).toMatchObject({ formula: "PurchasePrice" });
    expect(summary.getCell(tiles, 1).alignment?.wrapText).toBe(true);
    expect(summary.getRow(tiles).height).toBeGreaterThan(14);
    // Whose returns the tiles' are, under them.
    expect(summary.getCell(tiles + 2, 1).value).toBe(share.meta.interest!.modelCaveat);
    expect(String(summary.getCell(tiles + 2, 1).value)).toContain("the share earns its 49% of those cash flows");
    // All of the entity's interests beside its loan: the equity's whole.
    const all = deriveUnderwriteInputs(
      withUnits({ interest: { ...blank, kind: "partial_interest", share: "100% of the membership interests" } }, [
        { label: "Entity loan balance", value: "$30,000,000", flagged: false, page: "p. 9" },
      ]),
      "fallback",
    );
    expect(all.meta.priceLabel).toBe("Equity's Whole (all the entity's interests)");
    // A price as stated keeps its name: the fixture's own fee simple, and a
    // note, whose price is the note's.
    expect(model.meta.priceLabel ?? null).toBeNull();
    expect(deriveUnderwriteInputs(withUnits({ interest: { ...blank, kind: "note" } }), "fallback").meta.priceLabel ?? null).toBeNull();
  }, 30000);
});

// ── Labels and colours that say what their cells are ──────────────────────
describe("the workbook's labels and colours say what their cells are", () => {
  /** Units and an occupancy, no size: the RSF is the count × a typical
   *  unit, an assumption. */
  const counted: ExtractionResult = {
    ...extraction,
    metrics: [
      ...extraction.metrics.filter((m) => !/square feet/i.test(m.label)),
      { label: "Units", value: "240", flagged: false, page: "p. 4" },
      { label: "Occupancy", value: "93%", flagged: false, page: "p. 4" },
    ],
  };
  const countedModel = deriveUnderwriteInputs(counted, "fallback");

  async function book(m: typeof model, read?: Parameters<typeof buildUnderwriteWorkbook>[2]): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(m, null, read)) as unknown as ArrayBuffer);
    return wb;
  }

  it("the hold says it is fixed and why, and never offers a re-export that gives the same hold", async () => {
    const assum = (await book(model)).getWorksheet("Assumptions")!;
    const row = findRow(assum, 1, "Hold Period (months) — fixed");
    expect(assum.getCell(row, 2).value).toBe(model.inputs.holdMonths);
    expect(String(assum.getCell(row, 3).value)).toContain(
      "Fixed: the Cash Flow tab's years and the sale year are built for this hold, so typing over it recalculates only part of the model.",
    );
    assum.eachRow((r) => r.eachCell((c) => expect(String(c.value ?? "")).not.toMatch(/re-export/i)));
  });

  it("the Contents list every visible tab after the Cover, in the order the tabs sit — Operating Metrics included", async () => {
    const read = {
      readOn: "2026-09-21",
      metro: "Washington DC",
      checks: [
        {
          key: "exit_cap" as const,
          title: "Exit cap",
          model: "6.00%",
          modelSource: "derived from the documents",
          published: [{ label: "10-year Treasury", text: "4.94% on Sep 17, 2026", value: 4.94, asOf: "2026-09-17", publisher: "FRED" }],
          tone: "widens" as const,
          toneLabel: "spread widens at the exit",
          scope: "national" as const,
          read: "The exit cap 6.00% is 106 bps over the latest 10-year.",
        },
      ],
    };
    for (const wb of [await book(model), await book(model, read)]) {
      const cover = wb.getWorksheet("Cover")!;
      const listed: string[] = [];
      for (let r = findRow(cover, 2, "CONTENTS") + 1; cover.getCell(r, 2).value; r++) listed.push(String(cover.getCell(r, 2).value));
      const tabs = wb.worksheets.filter((ws) => ws.state === "visible" && ws.name !== "Cover").map((ws) => ws.name);
      expect(listed).toEqual(tabs);
      expect(listed).toContain("Operating Metrics");
    }
  });

  // Research pass 34: an unpriced memorandum's book led with "PURCHASE PRICE
  // $10,000,000 | LEVERED IRR 73.0%" and nothing under it, while the report
  // left those returns out as the placeholder's; only the Assumptions tab's
  // SOURCE said to enter the price.
  it("marks a placeholder price on the headline tiles and says under them whose returns they are, the live model untouched", async () => {
    const unpriced: ExtractionResult = {
      ...extraction,
      metrics: [
        { label: "Asking price", value: "Call for offers", flagged: false, page: "p. 5" },
        { label: "Net operating income", value: "$2,000,000", flagged: false, page: "p. 7" },
        { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
      ],
    };
    const m = deriveUnderwriteInputs(unpriced, "fallback");
    expect(m.sources.purchasePrice?.provenance).toBe("assumption");
    const { hf: h, wb: w } = await loadIntoHf(await buildUnderwriteWorkbook(m));
    const summary = w.getWorksheet("Deal Summary")!;
    const tiles = findRow(summary, 1, "PURCHASE PRICE (ASSUMED)");
    expect(summary.getCell(tiles + 1, 1).value).toMatchObject({ formula: "PurchasePrice" });
    expect(summary.getCell(tiles + 2, 1).value).toBe(
      "No price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns are the placeholder's. Enter the price you would pay as the Purchase Price on the Assumptions tab.",
    );
    expect(summary.getCell(tiles + 2, 1).alignment?.wrapText).toBe(true);
    // The returns stay live formulas: the book is still a model to fill in.
    expect(summary.getCell(tiles + 1, 2).value).toMatchObject({ formula: expect.stringContaining("IRR(") });
    expect(Number(named(h, "LeveredIRR"))).toBeCloseTo(computeUnderwrite(m.inputs).returns.leveredIrrPct!, 3);
    const errors: string[] = [];
    for (const name of h.getSheetNames()) {
      (h.getSheetValues(h.getSheetId(name)!) as unknown[][]).forEach((row, ri) =>
        row.forEach((v, ci) => {
          if (isErr(v)) errors.push(`${name}[${ri},${ci}]`);
        }),
      );
    }
    expect(errors).toEqual([]);
    // A priced book's tile is plain, with nothing under it.
    const priced = (await book(model)).getWorksheet("Deal Summary")!;
    const plain = findRow(priced, 1, "PURCHASE PRICE");
    expect(priced.getCell(plain + 2, 1).value ?? null).toBeNull();
    expect(() => findRow(priced, 1, "PURCHASE PRICE (ASSUMED)")).toThrow();
  }, 30000);

  it("the Deal Summary marks a rentable SF that is an assumption, as the Operating Metrics tab does", async () => {
    expect(countedModel.sources.rsf?.provenance).toBe("assumption");
    const assumed = (await book(countedModel)).getWorksheet("Deal Summary")!;
    expect(assumed.getCell(findRow(assumed, 1, "Rentable SF (assumed)"), 2).value).toMatchObject({ formula: "RSF" });
    const stated = (await book(model)).getWorksheet("Deal Summary")!;
    expect(model.sources.rsf?.provenance).toBe("extracted");
    expect(stated.getCell(findRow(stated, 1, "Rentable SF"), 2).value).toMatchObject({ formula: "RSF" });
  });

  // The row is "General Vacancy & Credit Loss %", but read off a stated
  // occupancy it holds 1 − that occupancy and nothing for credit loss; the
  // SOURCE says so, the row and its name unchanged (research pass 27).
  it("the vacancy read off a stated occupancy says it carries no credit or collection loss", async () => {
    const assum = (await book(countedModel)).getWorksheet("Assumptions")!;
    const row = findRow(assum, 1, "General Vacancy & Credit Loss %");
    expect(assum.getCell(row, 2).name).toBe("VacancyPct");
    expect(assum.getCell(row, 2).value).toBeCloseTo(0.07, 10);
    expect(String(assum.getCell(row, 3).value)).toBe(
      "OM p. 4 — OM in-place occupancy 93% — the vacancy is what it leaves and carries no credit or collection loss",
    );
    // The rent roll's occupancy is the same reading.
    const rolled = deriveUnderwriteInputs(extraction, "fallback", {
      rentRoll: {
        summary: {
          unitCount: 40,
          occupiedUnits: 36,
          totalSf: 300_000,
          occupiedSf: 270_000,
          sfWeightedOccupancy: 0.9,
          waltYears: 3.2,
          weightedAvgRentPsf: 14,
          expiryBuckets: null,
          expiryCoveredSf: 0,
          truncated: false,
        },
        asOf: "2026-05-01",
      },
    });
    const rr = (await book(rolled)).getWorksheet("Assumptions")!;
    // …and is the rent roll's, never the OM's: the SOURCE writer had put
    // "OM" before every extracted figure, the rent roll's included.
    expect(String(rr.getCell(findRow(rr, 1, "General Vacancy & Credit Loss %"), 3).value)).toBe(
      "Rent roll actual — 90.0% SF-weighted occupancy as of 2026-05-01 — the vacancy is what it leaves and carries no credit or collection loss",
    );
    expect(rolled.sources.rsf?.doc).toBe("Rent roll");
    expect(String(rr.getCell(findRow(rr, 1, "Rentable SF"), 3).value)).toBe("Rent roll total SF (as of 2026-05-01)");
    // A class default is an allowance, not a reading of the building: it
    // claims nothing about credit loss either way.
    const fallback = (await book(model)).getWorksheet("Assumptions")!;
    expect(String(fallback.getCell(findRow(fallback, 1, "General Vacancy & Credit Loss %"), 3).value)).not.toMatch(/credit/);
  });

  // A default of none is a claim: these rows printed $0 or 0.00% with an
  // empty SOURCE (research pass 27), and the transfer taxes' "Enter your
  // jurisdiction's transfer-tax rate" read as if every jurisdiction levied
  // one. Each now says what its zero is; every value is unchanged.
  it("every zero the model holds by default says what it is in its SOURCE", async () => {
    const assum = (await book(model)).getWorksheet("Assumptions")!;
    const row = (label: string) => {
      const r = findRow(assum, 1, label);
      return { value: assum.getCell(r, 2).value, source: String(assum.getCell(r, 3).value ?? "") };
    };
    const itemized = "Assumption — None itemized — the general hold stands in for it; enter it to itemize";
    const folded = "Assumption — Folded into the in-place rental revenue — split it out of that line, never add it on top";
    expect(row("Acquisition Fee %")).toEqual({
      value: 0,
      source: "Assumption — None modelled — enter it with its cap: the fee is the lesser of the two",
    });
    expect(row("Acquisition Fee Cap")).toEqual({
      value: 0,
      source: "Assumption — None modelled — the fee is the lesser of its % of the price and this cap, so enter both",
    });
    expect(row("Transfer Tax % of price")).toEqual({
      value: 0,
      source: "Assumption — None modelled — enter the jurisdiction's transfer-tax rate where it levies one",
    });
    expect(row("Recordation Tax % of price")).toEqual({
      value: 0,
      source: "Assumption — None modelled — enter the jurisdiction's recordation-tax rate where it levies one",
    });
    for (const label of ["Buyer Legal", "Lender Legal", "Appraisal / PCA / Phase I", "3rd Party / Misc."]) {
      expect(row(label), label).toEqual({ value: 0, source: itemized });
    }
    for (const label of ["Expense Recoveries (annual)", "Other Revenue (annual)"]) {
      expect(row(label), label).toEqual({ value: 0, source: folded });
    }
    // The named ranges the formulas read are where they were.
    for (const [label, name] of [
      ["Acquisition Fee %", "AcqFeePct"],
      ["Acquisition Fee Cap", "AcqFeeCap"],
      ["Transfer Tax % of price", "TransferTaxPct"],
      ["Buyer Legal", "BuyerLegal"],
      ["Expense Recoveries (annual)", "Recoveries"],
      ["Other Revenue (annual)", "OtherRev"],
    ]) {
      expect(assum.getCell(findRow(assum, 1, label), 2).name, label).toBe(name);
    }
  });

  it("the TI input says it is charged on the whole building's SF every year, never a per-lease allowance", async () => {
    const wb = await book(model);
    const assum = wb.getWorksheet("Assumptions")!;
    const row = findRow(assum, 1, "TI $/SF/yr, whole building");
    expect(assum.getCell(row, 2).name).toBe("TIPSF");
    expect(String(assum.getCell(row, 3).value)).toBe("Charged on every SF of the building, every year — not a per-lease allowance");
    // What the label says is what the ladder does: TI × RSF in every year.
    const cf = wb.getWorksheet("Cash Flow")!;
    const ti = findRow(cf, 1, "Tenant Improvements");
    for (let y = 1; y <= engine.holdYears; y++) expect(cf.getCell(ti, 2 + y).value).toMatchObject({ formula: "-TIPSF*RSF" });
  });

  it("heads the forward year as the NOI the exit capitalises, the one the Deal Summary's sale reads", async () => {
    const { hf, wb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    const cf = wb.getWorksheet("Cash Flow")!;
    const fwd = 3 + engine.holdYears; // the column after the last year owned
    const cfId = hf.getSheetId("Cash Flow")!;
    expect(hf.getCellValue({ sheet: cfId, row: 1, col: fwd - 1 })).toBe(`Yr ${engine.holdYears + 1} (exit NOI)`);
    expect(hf.getCellValue({ sheet: cfId, row: 1, col: fwd - 2 })).toBe(`Yr ${engine.holdYears}`);
    const summary = wb.getWorksheet("Deal Summary")!;
    const residual = summary.getCell(findRow(summary, 1, "Residual NOI (forward)"), 2).value as { formula: string };
    const noiRow = findRow(cf, 1, "Net Operating Income");
    expect(residual.formula).toBe(`'Cash Flow'!${String.fromCharCode(64 + fwd)}${noiRow}`);
    expect(hf.getCellValue({ sheet: cfId, row: noiRow - 1, col: fwd - 1 }) as number).toBeCloseTo(engine.residual.residualNoi, 2);
  });

  it("says what the breakeven occupancy covers — the expenses and the debt service, before reserves, capital and the fee", async () => {
    const ws = (await book(model)).getWorksheet("Operating Metrics")!;
    let note = "";
    ws.eachRow((row) => {
      const v = String(row.getCell(1).value ?? "");
      if (v.startsWith("Breakeven occupancy =")) note = v;
    });
    expect(note).toBe(
      "Breakeven occupancy = (OpEx + Debt Service) ÷ Potential Gross Revenue — the occupancy at which revenue covers the year's operating expenses and debt service, before reserves, capital costs and the asset management fee. Screen it against the market's actual vacancy, not the pro forma's.",
    );
  });

  it("styles a cell green only where it links another tab, and blue only where it is a typed value", async () => {
    const plan = deriveUnderwriteInputs(conversion, "fallback");
    for (const m of [model, plan, countedModel]) {
      const wb = await book(m);
      const nameSheet = new Map(
        (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model.map((d) => [
          d.name,
          (d.ranges[0].match(/^(?:'([^']+)'|([^!]+))!/) ?? [])[1] ?? (d.ranges[0].match(/^(?:'([^']+)'|([^!]+))!/) ?? [])[2],
        ]),
      );
      wb.eachSheet((ws) => {
        // The Cover's legend draws each colour on its own name.
        if (ws.name === "Cover") return;
        ws.eachRow((row) =>
          row.eachCell((cell) => {
            const where = `${ws.name}!${cell.address}`;
            const color = cell.font?.color?.argb;
            const v = cell.value as { formula?: string } | number | string | null;
            const formula = v && typeof v === "object" && "formula" in v ? v.formula : undefined;
            if (color === "FF107C41") {
              expect(formula, `${where} is green and holds no formula`).toBeTruthy();
              const readsOtherTab =
                formula!.includes("!") ||
                [...nameSheet].some(([n, sheet]) => sheet !== ws.name && new RegExp(`\\b${n}\\b`).test(formula!));
              expect(readsOtherTab, `${where} is green and reads no other tab: =${formula}`).toBe(true);
            }
            if (color === "FF0000CC") expect(formula, `${where} is blue and holds a formula`).toBeUndefined();
          }),
        );
      });
    }
    // The three typed values the research pass found styled as links are
    // inputs: the OM's stabilized NOI, the unit count, the in-place occupancy.
    const planBook = await book(plan);
    const summary = planBook.getWorksheet("Deal Summary")!;
    expect(summary.getCell(findRow(summary, 1, "OM Stabilized NOI (pro forma)"), 2).font?.color?.argb).toBe("FF0000CC");
    const countedBook = await book(countedModel);
    const ops = countedBook.getWorksheet("Operating Metrics")!;
    expect(ops.getCell(findRow(ops, 1, "Units"), 2).font?.color?.argb).toBe("FF0000CC");
    const cs = countedBook.getWorksheet("Deal Summary")!;
    const occ = findRow(cs, 4, "In-Place Occupancy");
    expect(cs.getCell(occ, 5).value).toBeCloseTo(0.93, 10);
    expect(cs.getCell(occ, 5).font?.color?.argb).toBe("FF0000CC");
  }, 30000);
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

  // Audit A, L2: a class with no noun of its own read its count as "units"
  // whatever the memorandum called it.
  it("names a count in the memorandum's own noun: a care home's beds, a marina's slips", async () => {
    for (const [label, cls, one, many, title] of [
      ["Licensed beds", "senior_housing", "bed", "beds", "Bed"],
      ["Wet slips", "other", "slip", "slips", "Slip"],
    ] as const) {
      const ex: ExtractionResult = {
        ...extraction,
        assetClass: cls,
        metrics: [...extraction.metrics.filter((x) => !/unit|sf|square/i.test(x.label)), { label, value: "120", flagged: false, page: "p. 4" }],
      };
      const m = deriveUnderwriteInputs(ex, "fallback");
      expect(m.meta.units, label).toBe(120);
      expect(m.meta.unitNoun, label).toEqual({ one, many });
      const buf = await buildUnderwriteWorkbook(m);
      const { wb } = await loadIntoHf(buf);
      const ws = wb.getWorksheet("Operating Metrics")!;
      const labels: string[] = [];
      for (let r = 1; r <= ws.rowCount; r++) labels.push(String(ws.getCell(r, 1).value ?? ""));
      expect(labels, label).toContain(`Price / ${title}`);
      expect(labels.some((l) => /\/ Unit\b|^Units$/.test(l)), label).toBe(false);
    }
  });
});

// ── The Market Read tab ─────────────────────────────────────────────────────
import type { ModelVsMarket } from "@/lib/model-vs-market";
import { BLS_NOTICE, FRED_NOTICE } from "@/lib/data-notices";

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
        read: "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year unchanged — the conservative direction.",
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
    // The day in the deal page's own words (lib/debt-index `datedLong`).
    expect(String(ws.getCell(2, 1).value)).toBe(
      "The model's rent growth and exit cap, set against the published figures for the Washington DC market and the nation, read on Sep 21, 2026.",
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
    // The figure raw, so it sorts and computes, shown in its unit — every
    // published figure is a percent (lib/model-vs-market's PublishedFigure).
    expect(ws.getCell(6, 5).value).toBe(2.3);
    expect(ws.getCell(6, 5).numFmt).toBe('0.00"%"');
    // A dated figure's day is a date, so the column sorts by it.
    expect(ws.getCell(6, 6).value).toEqual(new Date(Date.UTC(2026, 7, 31)));
    expect(ws.getCell(6, 6).numFmt).toBe("mmm d, yyyy");
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
    expect(ws.getCell(8, 5).numFmt).toBe('0.00"%"');
    expect(ws.getCell(8, 8).value).toBe("spread widens at the exit");
    // The providers' own notices under the figures (the batch-2 audit,
    // LOW-7): FRED's for the 10-year, the BLS's for the rent index its own
    // API answered — a row apart from the last check.
    expect(ws.getCell(10, 1).value).toBe(FRED_NOTICE);
    expect(ws.getCell(11, 1).value).toBe(BLS_NOTICE);
    // A data tab: nothing on it is a formula.
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        expect(v && typeof v === "object" && "formula" in v, cell.address).toBe(false);
      });
    });
  });

  it("keeps a research figure's period as the file states it: a quarter, or undated, is not a day", async () => {
    const tracked: ModelVsMarket = {
      ...read,
      checks: [
        {
          ...read.checks[1],
          published: [
            { label: "Office cap (research tracker), low end", text: "6.50% (Q1 2026)", value: 6.5, asOf: "Q1 2026", publisher: "research tracker: CBRE" },
            { label: "Office cap (research tracker), high end", text: "7.25% (undated)", value: 7.25, asOf: "undated", publisher: "research tracker" },
          ],
        },
      ],
    };
    const ws = (await load(await buildUnderwriteWorkbook(model, null, tracked))).getWorksheet("Market Read")!;
    expect(ws.getCell(6, 6).value).toBe("Q1 2026");
    expect(ws.getCell(7, 6).value).toBe("undated");
    expect(ws.getCell(6, 5).value).toBe(6.5);
    expect(ws.getCell(7, 5).numFmt).toBe('0.00"%"');
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
    // Excel's own data bars on the three shares, from zero to the whole: a
    // share fills its share of the cell, never its length against the
    // column's largest (a 53% share had filled 97% of it).
    const cfs = (
      ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string; cfvo?: { type: string; value?: number }[] }[] }[] }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    expect(bars.map((cf) => cf.ref).sort()).toEqual([`L${first}:L${first + 2}`, `M${first}:M${first + 2}`, `N${first}:N${first + 2}`]);
    for (const cf of bars) {
      expect(cf.rules[0].cfvo?.map((c) => [c.type, Number(c.value)])).toEqual([
        ["num", 0],
        ["num", 1],
      ]);
    }
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

// ── On paper (research pass 35, F13) ──────────────────────────────────────
// Labels and formats only: the cover's labels sat at the foot of their tall
// rows, a plan's yield-on-cost label was cut at its column's edge, a year-1
// figure was called stabilized, multiples printed one place where the report
// prints two, the Market Read printed some 300 characters wide at a few
// points' type, and the Debt Schedule repeated the monthly header over the
// annual rollup.
describe("the workbook reads on paper", () => {
  const read: ModelVsMarket = {
    readOn: "2026-09-21",
    metro: "Washington DC",
    checks: [
      {
        key: "exit_cap",
        title: "Exit cap",
        model: "6.00%",
        modelSource: "derived from the documents",
        published: [{ label: "10-year Treasury", text: "4.94% on Sep 17, 2026", value: 4.94, asOf: "2026-09-17", publisher: "FRED" }],
        tone: "widens",
        toneLabel: "spread widens at the exit",
        scope: "national",
        read: "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year unchanged — the conservative direction.",
      },
    ],
  };
  const load = async (m: typeof model, mr?: ModelVsMarket) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(m, null, mr)) as unknown as ArrayBuffer);
    return wb;
  };

  it("sets the cover's labels at the top of their rows and wraps what runs past the band", async () => {
    const note = deriveUnderwriteInputs(
      {
        ...extraction,
        interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
        metrics: [...extraction.metrics, { label: "Unpaid principal balance", value: "$62,500,000", flagged: false, page: "p. 3" }],
      },
      "fallback",
    );
    const cover = (await load(note)).getWorksheet("Cover")!;
    for (const lab of ["Asset class", "Prepared", "What is being sold"]) {
      const row = findRow(cover, 2, lab);
      expect(cover.getCell(row, 2).alignment?.vertical, lab).toBe("top");
      expect(cover.getCell(row, 3).alignment?.vertical, lab).toBe("top");
    }
    // The note's line is longer than the column: wrapped, with its lines.
    const sold = findRow(cover, 2, "What is being sold");
    expect(String(cover.getCell(sold, 3).value).length).toBeGreaterThan(80);
    expect(cover.getCell(sold, 3).alignment?.wrapText).toBe(true);
    expect(cover.getRow(sold).height).toBeGreaterThanOrEqual(28);
    // The Contents: a description longer than the column wraps inside the band.
    const ops = findRow(cover, 2, "Operating Metrics");
    expect(cover.getCell(ops, 3).alignment?.wrapText).toBe(true);
    expect(cover.getRow(ops).height).toBeGreaterThanOrEqual(28);
    // A short one is left on its line.
    const summaryRow = findRow(cover, 2, "Deal Summary");
    expect(cover.getCell(summaryRow, 3).alignment?.wrapText ?? false).toBe(false);
  });

  it("wraps the plan's yield-on-cost label whole, and names a stabilized deal's year-1 yield for what it is", async () => {
    const plan = (await load(deriveUnderwriteInputs(conversion, "fallback"))).getWorksheet("Deal Summary")!;
    const yoc = findRow(plan, 4, "Yield on Cost (OM stabilized NOI / uses + capital plan)");
    expect(plan.getCell(yoc, 4).alignment?.wrapText).toBe(true);
    expect(plan.getRow(yoc).height).toBe(26);
    // The row's cells sit at its top, both blocks, beside the label's first line.
    for (const c of [1, 2, 4, 5]) expect(plan.getCell(yoc, c).alignment?.vertical).toBe("top");
    const stab = (await load(model)).getWorksheet("Deal Summary")!;
    const y1 = findRow(stab, 4, "Year-1 Yield on Total Cost");
    expect(stab.getCell(y1, 5).value).toMatchObject({ formula: expect.stringContaining("/TotalUses") });
    expect(() => findRow(stab, 4, "Stabilized Yield (on cost)")).toThrow();
  });

  it("prints a multiple to two places, as the report does, on the tiles, the return block and the sensitivity grids", async () => {
    const wb = await load(model);
    const summary = wb.getWorksheet("Deal Summary")!;
    const tiles = findRow(summary, 1, "PURCHASE PRICE");
    expect(summary.getCell(tiles, 3).value).toBe("EQUITY MULTIPLE");
    expect(summary.getCell(tiles + 1, 3).numFmt).toBe('0.00"x"');
    for (const lab of ["Unlevered Equity Multiple", "Levered Equity Multiple"]) {
      expect(summary.getCell(findRow(summary, 4, lab), 5).numFmt, lab).toBe('0.00"x"');
    }
    const sens = wb.getWorksheet("Sensitivity")!;
    let em = 0;
    sens.eachRow((row) =>
      row.eachCell((c) => {
        const col = Number(c.col);
        const formula = c.value && typeof c.value === "object" && "formula" in c.value ? String(c.value.formula) : "";
        if (col >= 8 && col <= 12 && /Sensitivity Engine/.test(formula)) {
          expect(c.numFmt).toBe('0.00"x"');
          em++;
        }
      }),
    );
    expect(em).toBe(75);
  });

  it("prints the Market Read one page wide at a readable size, its words wrapped in their columns", async () => {
    const ws = (await load(model, read)).getWorksheet("Market Read")!;
    const widths = Array.from({ length: 9 }, (_, i) => ws.getColumn(i + 1).width ?? 0);
    expect(widths.reduce((s, w) => s + w, 0)).toBeLessThanOrEqual(150);
    expect(Math.max(...widths)).toBeLessThanOrEqual(44);
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.fitToWidth).toBe(1);
    // The sentence wraps in its column, its row as tall as its lines.
    expect(ws.getCell(6, 9).alignment?.wrapText).toBe(true);
    expect(ws.getRow(6).height).toBeGreaterThan(24);
    // The lines across the top and the notices under the figures span the
    // tab, wrapped, rather than running off its last column.
    for (const row of [2, 3, 8]) {
      expect(ws.getCell(row, 1).alignment?.wrapText, `row ${row}`).toBe(true);
      expect(ws.getCell(row, 9).isMerged, `row ${row}`).toBe(true);
    }
    expect(ws.getCell(8, 1).value).toBe(FRED_NOTICE);
  });

  it("puts the Debt Schedule's annual rollup above the monthly table, whose header alone repeats on each page", async () => {
    const { hf, wb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    const ws = wb.getWorksheet("Debt Schedule")!;
    const rollup = findRow(ws, 1, "ANNUAL ROLLUP");
    const head = findRow(ws, 1, "Month");
    expect(rollup).toBeLessThan(head);
    expect(ws.pageSetup.printTitlesRow).toBe(`${head}:${head}`);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: head });
    // Nothing follows the months but the tie check, so no page prints the
    // monthly header over another block's rows.
    const lastMonth = head + model.inputs.holdMonths;
    expect(ws.getCell(lastMonth, 1).value).toBe(model.inputs.holdMonths);
    for (let r = lastMonth + 1; r <= ws.rowCount; r++) {
      expect(ws.getCell(r, 1).value ?? null, `row ${r}`).toBeNull();
    }
    // The same arithmetic: year 1's interest is its twelve months', and the
    // exit balance still ties to the Deal Summary.
    const id = hf.getSheetId("Debt Schedule")!;
    const v = (row: number, col: number) => Number(hf.getCellValue({ sheet: id, row: row - 1, col: col - 1 }));
    const months = Array.from({ length: 12 }, (_, i) => v(head + 1 + i, 5)).reduce((s, x) => s + x, 0);
    expect(v(rollup + 2, 5)).toBeCloseTo(months, 2);
    expect(named(hf, "CheckDebtTie")).toBe(true);
  });
});

// ── When it was built ─────────────────────────────────────────────────────
describe("the workbook says the day it was built, which its \"from today\" lines count from", () => {
  it("prints the build day on the cover and stamps the file's created and modified time with it, never 1970", async () => {
    const builtAt = new Date(Date.UTC(2026, 8, 30, 15, 4));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(model, null, null, null, builtAt)) as unknown as ArrayBuffer);
    const cover = wb.getWorksheet("Cover")!;
    // "Prepared": under the address, "Built" read as the year the building
    // was built (research pass 35).
    expect(cover.getCell(findRow(cover, 2, "Prepared"), 3).value).toBe("Sep 30, 2026");
    expect(() => findRow(cover, 2, "Built")).toThrow();
    expect(wb.created?.toISOString()).toBe(builtAt.toISOString());
    expect(wb.modified?.toISOString()).toBe(builtAt.toISOString());
    // A caller that passes no time is stamped now, not with the epoch.
    const now = new ExcelJS.Workbook();
    await now.xlsx.load((await buildUnderwriteWorkbook(model)) as unknown as ArrayBuffer);
    expect(now.created!.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
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

  it("says whose strategy the deal type is on a note or a leased fee — on the Cover, the Assumptions tab and the Deal Summary alike", async () => {
    const sold = (kind: "note" | "leased_fee" | "fee_simple") =>
      deriveUnderwriteInputs(
        {
          ...extraction,
          strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
          interest: { kind, summary: "", share: "", groundLease: "", loan: "", page: "" },
          metrics: [
            ...extraction.metrics,
            ...(kind === "note" ? [{ label: "Unpaid principal balance", value: "$62,500,000", flagged: false, page: "p. 3" }] : []),
          ],
        },
        "fallback",
      );
    const labels = async (m: ReturnType<typeof sold>) => {
      const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(m));
      const cover = wb.getWorksheet("Cover")!;
      const assum = wb.getWorksheet("Assumptions")!;
      const summary = wb.getWorksheet("Deal Summary")!;
      return [
        cover.getCell(findRow(cover, 2, "Deal type"), 3).value,
        assum.getCell(findRow(assum, 1, "Deal Type"), 2).value,
        summary.getCell(findRow(summary, 1, "Deal Type"), 2).value,
      ];
    };
    expect(await labels(sold("note"))).toEqual(Array(3).fill("Stabilized (the collateral)"));
    expect(await labels(sold("leased_fee"))).toEqual(Array(3).fill("Stabilized (the leaseholder's building)"));
    // Under a tower no building reverts: the lessee's equipment, as the
    // deal header says it (research pass 23).
    const tower = deriveUnderwriteInputs(
      {
        ...extraction,
        strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
        interest: {
          kind: "leased_fee",
          summary: "Sale of the fee interest in a cell tower site",
          share: "",
          groundLease: "Ground lease to a tower company for a 150-foot monopole",
          loan: "",
          page: "",
        },
      },
      "fallback",
    );
    expect(await labels(tower)).toEqual(Array(3).fill("Stabilized (the lessee's wireless tower)"));
    // The land under an office building whose lessee keeps its rooftop
    // antenna licenses is a building's leased fee: the three cells had read
    // the lessee's wireless tower.
    const office = deriveUnderwriteInputs(
      {
        ...extraction,
        strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
        interest: {
          kind: "leased_fee",
          summary: "Sale of the fee interest in the land beneath a 12-story office building",
          share: "",
          groundLease: "Ground lease through 2080; rooftop antenna licenses are retained by the ground lessee",
          loan: "",
          page: "",
        },
      },
      "fallback",
    );
    expect(await labels(office)).toEqual(Array(3).fill("Stabilized (the leaseholder's building)"));
    // A price that buys the building keeps the label as it stands.
    expect(await labels(sold("fee_simple"))).toEqual(Array(3).fill("Stabilized"));
  });

  // Research pass 35 (F4): a note's cover read "Deal type  Stabilized (the
  // collateral)", then "An operating asset bought for its in-place income;
  // NOI ÷ price is the going-in cap.", and two lines on that its cap rate
  // and IRR "are not figures this buyer earns".
  it("leaves the strategy's reading out where the deal type is the collateral's, and keeps it where the price buys the building", async () => {
    const sold = (kind: "note" | "leased_fee" | "fee_simple", strategy: "stabilized" | "value_add" = "stabilized") =>
      deriveUnderwriteInputs(
        {
          ...extraction,
          strategy: { kind: strategy, summary: "", capitalBudget: "", timeline: "" },
          interest: { kind, summary: "", share: "", groundLease: "", loan: "", page: "" },
          metrics: [
            ...extraction.metrics,
            ...(kind === "note" ? [{ label: "Unpaid principal balance", value: "$62,500,000", flagged: false, page: "p. 3" }] : []),
          ],
        },
        "fallback",
      );
    const read = async (m: ReturnType<typeof sold>) => {
      const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(m));
      const cover = wb.getWorksheet("Cover")!;
      const assum = wb.getWorksheet("Assumptions")!;
      const cr = findRow(cover, 2, "Deal type");
      const cells: string[] = [];
      for (const ws of [cover, assum]) ws.eachRow((row) => row.eachCell((c) => cells.push(String(c.value ?? ""))));
      return { cover, cr, under: cover.getCell(cr + 1, 3).value, assumNote: assum.getCell(findRow(assum, 1, "Deal Type"), 3).value ?? null, cells };
    };
    const STABILIZED_READING = STRATEGY_READING.stabilized;
    for (const kind of ["note", "leased_fee"] as const) {
      const r = await read(sold(kind));
      expect(r.cells.some((c) => c.includes(STABILIZED_READING)), kind).toBe(false);
      expect(r.assumNote, kind).toBeNull();
      // What is being sold follows the deal type, its caveat under it.
      expect(findRow(r.cover, 2, "What is being sold"), kind).toBe(r.cr + 1);
    }
    // A plan on the collateral keeps what this model books, without the
    // strategy's reading of a price over the building.
    const plan = await read(sold("note", "value_add"));
    expect(String(plan.under)).toMatch(/^This annual model books the capital budget in year 1/);
    expect(plan.cells.some((c) => c.includes(STRATEGY_READING.value_add))).toBe(false);
    expect(plan.assumNote).toBe("Year-1 income below is in-place or assumed — never the OM's stabilized pro forma.");
    // A price that buys the building reads as before, on both tabs.
    const fee = await read(sold("fee_simple"));
    expect(fee.under).toBe(STABILIZED_READING);
    expect(fee.assumNote).toBe(STABILIZED_READING);
  }, 60000);

  it("a covenant on the rents (#453): the restriction, then what the model's one growth rate is not on it", async () => {
    const units = extraction.metrics.find((m) => m.label === "Units")?.value;
    const restricted = deriveUnderwriteInputs(
      {
        ...extraction,
        affordable: { programs: ["lihtc"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
        metrics: [
          ...extraction.metrics,
          { label: "Restricted units", value: String(units ? Math.round(Number(units.replace(/,/g, "")) / 2) : 100), flagged: false, page: "p. 3" },
          { label: "Affordability expiration", value: "December 31, 2054", flagged: false, page: "p. 3" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(restricted));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "Affordability");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Affordable housing: .*rent-restricted under LIHTC until Dec 2054$/);
    expect(String(cover.getCell(r + 1, 3).value)).toContain("The screening model grows every unit's rent at one rate");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "Affordability")).toThrow();
  });

  it("a shopping center (#457): the listed tenants, then the leasing capital the model does not carry", async () => {
    const y = new Date().getUTCFullYear();
    const t = (name: string, over: Record<string, string>) => ({
      name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const center = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "retail",
        tenants: [
          t("Staples", { sf: "10,000 SF", rent: "$300,000", leaseExpiration: String(y + 2) }),
          t("Kroger", { sf: "40,000 SF", rent: "$600,000", leaseExpiration: String(y + 30) }),
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(center));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The tenants");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Two tenants listed on \d+% of the building; 33% of their rent expires before year 5/);
    expect(String(cover.getCell(r + 1, 3).value)).toContain("The model carries no leasing capital");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The tenants")).toThrow();
  });

  it("a value-add program (#460): the program, then what a door is worth and the premium the model does not carry", async () => {
    const withProgram = deriveUnderwriteInputs(
      {
        ...extraction,
        strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" },
        metrics: [
          ...extraction.metrics,
          { label: "Units to renovate", value: "192", flagged: false, page: "p. 14" },
          { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "p. 14" },
          { label: "Renovation premium", value: "$250", flagged: false, page: "p. 14" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(withProgram));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The value-add program");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Value-add program: 192 doors to renovate; \$15,000 a door; \$250 a month premium \(20% on cost\)/);
    expect(String(cover.getCell(r + 1, 3).value)).toContain("the premium breaks even at");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The value-add program")).toThrow();
  });

  it("a student building (#468): its pre-leasing, beds and walk, then the model's vacancy against the beds to sign", async () => {
    const student = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "student_housing",
        metrics: [
          ...extraction.metrics,
          { label: "Beds", value: "612", flagged: false, page: "p. 6" },
          { label: "Pre-leased", value: "87% for Fall 2026", flagged: false, page: "p. 6" },
          { label: "Distance to campus", value: "0.3 miles", flagged: false, page: "p. 6" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(student));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "Student housing");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Student housing: 87% pre-leased for Fall 2026; 612 beds at \$\d+k a bed; 0\.3 miles to campus \(pedestrian\)$/);
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model's /);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "Student housing")).toThrow();
  });

  it("a manufactured-housing park (#470): its pads, lot rent, homes and utilities, then what the model does with each", async () => {
    const park = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "manufactured_housing",
        metrics: [
          ...extraction.metrics,
          { label: "Pads", value: "150", flagged: false, page: "p. 4" },
          { label: "Occupied pads", value: "132", flagged: false, page: "p. 4" },
          { label: "Lot rent", value: "$430", flagged: false, page: "p. 4" },
          { label: "Market lot rent", value: "$525", flagged: true, page: "p. 4" },
          { label: "Water and sewer", value: "Private well and septic", flagged: false, page: "p. 4" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(park));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The park");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Manufactured housing: 150 pads at \$[\d.,]+[kM] a pad, 88% occupied; lot rent \$430 \(market \$525\); private water & sewer$/);
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^Closed by the sale, the gap to the memorandum's market lot rent is \$150k a year of income/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The park")).toThrow();
  });

  it("a forward purchase (lib/forward-purchase): the price at delivery and the clock, then the model's year-one NOI beside the memorandum's at delivery", async () => {
    const forward = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "industrial",
        strategy: { kind: "development", summary: "Forward purchase of a build-to-suit distribution center at completion", capitalBudget: "", timeline: "" },
        metrics: [
          { label: "Purchase price", value: "$48,000,000", flagged: false, page: "p. 2" },
          { label: "NOI (Year 1)", value: "$2,880,000", flagged: false, page: "p. 4" },
          { label: "Delivery cap rate", value: "6.00%", flagged: false, page: "p. 4" },
          { label: "Delivery date", value: "Q3 2027", flagged: false, page: "p. 4" },
          { label: "Outside date", value: "March 31, 2028", flagged: false, page: "p. 4" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(forward));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The forward purchase");
    expect(String(cover.getCell(r, 3).value)).toBe(
      "Build-to-suit: $48.0M paid at delivery (Q3 2027), the works the developer's; 6.00% at delivery; outside date Mar 31, 2028",
    );
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(
      /^The model runs the price as paid at closing with income from its first year: on a forward purchase that day is delivery, Q3 2027\./,
    );
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The forward purchase")).toThrow();
  });

  it("a mixed-use building (lib/mixed-use): its two incomes, then the one exit cap and growth rate the model runs both at", async () => {
    const mixed = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "Retail / Multifamily",
        metrics: [
          ...extraction.metrics,
          { label: "Residential income", value: "$1,520,000", flagged: false, page: "p. 9" },
          { label: "Commercial income", value: "$610,000", flagged: false, page: "p. 9" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(mixed));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The two incomes");
    expect(String(cover.getCell(r, 3).value)).toBe("Mixed-use: $1.52M residential and $610k commercial income (28.6% commercial)");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model capitalises the \$610k of commercial income at the same [\d.]+% exit cap as the residential/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The two incomes")).toThrow();
  });

  it("an operating business (lib/going-concern): what is sold and whose earnings, then the income the model capitalises as rent", async () => {
    const station = deriveUnderwriteInputs(
      {
        ...extraction,
        dealName: "Route 9 Fuel & Market",
        assetClass: "Gas Station / Convenience Store",
        strategy: { kind: "stabilized", summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
        metrics: [
          { label: "Asking price", value: "$3,200,000", flagged: false, page: "p. 2" },
          { label: "NOI (in-place)", value: "$256,000", flagged: false, page: "p. 5" },
          { label: "EBITDA (T-12)", value: "$410,000", flagged: false, page: "p. 5" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(station));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The operating business");
    expect(String(cover.getCell(r, 3).value)).toBe("Fuel station and its store: sold with the business; EBITDA (T-12) $410k");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model capitalises its \$256k year-one income at a [\d.]+% exit cap as if it were rent/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The operating business")).toThrow();
  });

  it("condominium units (lib/condo): the units offered of the condominium's and a year of the dues, then the model's one building", async () => {
    const bulk = deriveUnderwriteInputs(
      {
        ...extraction,
        dealName: "Harbor View",
        assetClass: "Condominium Units (bulk sale)",
        metrics: [
          { label: "Asking price", value: "$16,800,000", flagged: false, page: "p. 2" },
          { label: "Units", value: "42", flagged: false, page: "p. 4" },
          { label: "NOI (in-place)", value: "$840,000", flagged: false, page: "p. 9" },
          { label: "HOA dues", value: "$650 per unit per month", flagged: false, page: "p. 11" },
          { label: "Units in building", value: "120", flagged: false, page: "p. 4" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(bulk));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The condominium units");
    expect(String(cover.getCell(r, 3).value)).toBe("Condominium units: 42 of 120 units; dues $328k a year");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model sells the 42 units as one building at its [\d.]+% exit cap/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The condominium units")).toThrow();
  });

  it("a sandwich position (lib/sandwich-lease): the two rents and the master lease's end, then the model's perpetuity against the lease", async () => {
    const position = deriveUnderwriteInputs(
      {
        ...extraction,
        dealName: "Founders Plaza",
        assetClass: "Office",
        interest: {
          kind: "leasehold",
          summary: "Leasehold interest under a master lease of the building, sublet to 14 office tenants",
          share: "",
          groundLease: "Master lease of the building from its owner",
          loan: "",
          page: "",
        },
        metrics: [
          { label: "Asking price", value: "$6,500,000", flagged: false, page: "p. 2" },
          { label: "Master lease rent", value: "$1,100,000 a year", flagged: false, page: "p. 6" },
          { label: "Sublease income", value: "$1,820,000", flagged: false, page: "p. 6" },
          { label: "NOI (T-12)", value: "$720,000", flagged: false, page: "p. 9" },
          { label: "Master lease expiration", value: "December 31, 2091", flagged: false, page: "p. 6" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(position));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The sandwich position");
    expect(String(cover.getCell(r, 3).value)).toBe("Sandwich position: subleases $1.82M against a $1.10M master rent (1.65×); the master lease ends Dec 2091");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(
      /^The model capitalises the position's income at its sale as if it ran forever; the master lease ends Dec 2091, [\d.]+ years after the model's sale/,
    );
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The sandwich position")).toThrow();
  });

  it("a self-storage facility (#471): its occupancies and rates, then what the model does with the premium over street", async () => {
    const storage = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "self_storage",
        metrics: [
          ...extraction.metrics,
          { label: "Economic occupancy", value: "84%", flagged: false, page: "p. 5" },
          { label: "In-place rent", value: "$1.38/SF/month", flagged: false, page: "p. 5" },
          { label: "Street rate", value: "$1.14/SF/month", flagged: false, page: "p. 5" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(storage));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The facility");
    expect(String(cover.getCell(r, 3).value)).toMatch(/84% economic; in-place \$1\.38\/SF a month against street \$1\.14\/SF a month \(\+21\.1%\)$/);
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model grows today's rent, the rate increases' premium included/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The facility")).toThrow();
  });

  it("the rent rules (lib/rent-regulation): the regime, the regulated share and the allowance in force, then the model's growth beside it", async () => {
    const walkUp: ExtractionResult = {
      ...extraction,
      assetClass: "multifamily",
      metrics: [
        ...extraction.metrics,
        { label: "Units", value: "48", flagged: false, page: "p. 3" },
        { label: "Year built", value: "1931", flagged: false, page: "p. 3" },
        { label: "Rent-regulated units", value: "41", flagged: false, page: "p. 9" },
      ],
    };
    const regulation = regulationForDeal(
      { extraction: walkUp, address: { state: "NY", city: "Brooklyn", county: "Kings County" }, siteFlags: null, assetClass: "multifamily" },
      "2026-10-05",
    );
    const regulated = deriveUnderwriteInputs(walkUp, "fallback", undefined, undefined, { regulation });
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(regulated));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The rent rules");
    expect(String(cover.getCell(r, 3).value)).toBe(
      "Rent regulation: NYC rent stabilization applies; 41 of the 48 units rent-regulated as stated (85%); 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027",
    );
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The model grows every rent [\d.]+% a year; NYC rent stabilization allows 0% on a one-year lease/);
    expect(String(cover.getCell(r + 1, 3).value)).toContain("The model's one growth rate is the market-rate units', not the regulated ones'.");
    // The model's Rent Growth input is the same with the rules read or not.
    expect(regulated.inputs.rentGrowthPct).toBe(deriveUnderwriteInputs(walkUp, "fallback").inputs.rentGrowthPct);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The rent rules")).toThrow();
  });

  it("the third-party reports (#465): what they found, then what the model does with the immediate repairs", async () => {
    const reported = deriveUnderwriteInputs(
      {
        ...extraction,
        metrics: [
          ...extraction.metrics,
          { label: "Phase I ESA findings", value: "No RECs", flagged: false, page: "p. 9" },
          { label: "PCA immediate repairs", value: "$630,000", flagged: false, page: "p. 9" },
          { label: "Seismic PML", value: "14%", flagged: false, page: "p. 9" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(reported));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The reports");
    expect(String(cover.getCell(r, 3).value)).toBe(
      "Reports: Phase I, no recognized environmental conditions; PCA immediate repairs $630,000; seismic PML 14%",
    );
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/immediate repairs/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The reports")).toThrow();
  });

  it("a tax abatement (#461): the abatement, then where it ends against the model's sale and the step-up at its exit cap", async () => {
    const abated = deriveUnderwriteInputs(
      {
        ...extraction,
        metrics: [
          ...extraction.metrics,
          { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false, page: "p. 9" },
          { label: "Tax abatement expiration", value: "2099", flagged: false, page: "p. 9" },
          { label: "Abated real estate taxes", value: "$70,000", flagged: false, page: "p. 9" },
          { label: "Unabated real estate taxes", value: "$520,000", flagged: false, page: "p. 9" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(abated));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The tax abatement");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Tax abatement: 10-year Philadelphia tax abatement; ends 2099, [\d.]+ years from today; \$450,000 a year more once it ends/);
    expect(String(cover.getCell(r + 1, 3).value)).toContain("after its sale, so the next buyer takes the step-up and prices it");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The tax abatement")).toThrow();
  });

  it("a seller's note (#462): the note as stated, then what it is worth against the model's new loan", async () => {
    const withNote = deriveUnderwriteInputs(
      {
        ...extraction,
        metrics: [
          ...extraction.metrics,
          { label: "Seller financing amount", value: "$14,000,000", flagged: false, page: "p. 9" },
          { label: "Seller financing rate", value: "5.00%", flagged: false, page: "p. 9" },
          { label: "Seller financing term", value: "5 years", flagged: false, page: "p. 9" },
          { label: "Seller financing amortization", value: "25 years", flagged: false, page: "p. 9" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(withNote));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The seller's note");
    expect(String(cover.getCell(r, 3).value)).toBe("The seller offers to carry financing: $14.0M at 5.00% for 5 years, amortizing over 25 years");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/^The seller's note (is worth|returns)/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The seller's note")).toThrow();
  });

  it("an auction (#456): how it is sold, then the ceiling bid at the screening hurdle", async () => {
    const auction = deriveUnderwriteInputs(
      {
        ...extraction,
        sale: { method: "auction", terms: "", condition: "", page: "" },
        metrics: [
          ...extraction.metrics.filter((m) => !/price|cap rate/i.test(m.label)),
          { label: "Starting bid", value: "$2,500,000", flagged: false, page: "p. 3" },
          { label: "Buyer's premium", value: "5%", flagged: false, page: "p. 3" },
        ],
      },
      "fallback",
    );
    expect(auction.inputs.purchasePrice).toBe(2_625_000);
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(auction));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "How it is sold");
    expect(String(cover.getCell(r, 3).value)).toBe("Sold at auction: bidding opens at $2.5M; a 5% buyer's premium ($2.63M all-in at the opening bid)");
    expect(String(cover.getCell(r + 1, 3).value)).toMatch(/15% levered IRR/);
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "How it is sold")).toThrow();
  });

  it("a hotel (#455): what it is sold with, then the PIP against the model's capital line", async () => {
    const withHotel = deriveUnderwriteInputs(
      {
        ...extraction,
        assetClass: "hospitality_str",
        hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "unencumbered", pip: "", page: "" },
        metrics: [
          ...extraction.metrics.filter((m) => !/^(units|keys)$/i.test(m.label)),
          { label: "Keys", value: "120", flagged: false, page: "p. 2" },
          { label: "PIP cost", value: "$4,200,000", flagged: false, page: "p. 6" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(withHotel));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The hotel");
    expect(String(cover.getCell(r, 3).value)).toBe("Hotel: flagged Courtyard by Marriott, sold unencumbered; PIP $4.2M ($35k a key)");
    expect(String(cover.getCell(r + 1, 3).value)).toContain("The model carries the $4.2M PIP as its first year's capital");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The hotel")).toThrow();
  });

  it("a single tenant (#454): the lease, then the years left at the sale and its increases against the Rent Growth input", async () => {
    const leased = deriveUnderwriteInputs(
      {
        ...extraction,
        singleTenant: { tenant: "Walgreens Co.", guarantor: "", leaseType: "NNN", landlordObligations: "", tenantRights: "", page: "" },
        metrics: [
          ...extraction.metrics,
          // Far enough out that the lease outlasts the model's sale whatever day this runs.
          { label: "Lease expiration", value: "December 31, 2046", flagged: false, page: "p. 4" },
          { label: "Rent increases", value: "Flat", flagged: false, page: "p. 4" },
        ],
      },
      "fallback",
    );
    const { wb } = await loadIntoHf(await buildUnderwriteWorkbook(leased));
    const cover = wb.getWorksheet("Cover")!;
    const r = findRow(cover, 2, "The single tenant");
    expect(String(cover.getCell(r, 3).value)).toMatch(/^Single tenant: Walgreens Co\., NNN; the lease ends Dec 2046, [\d.]+ years from today; the rent is flat$/);
    const read = String(cover.getCell(r + 1, 3).value);
    expect(read).toContain("At the model's sale in 5 years the lease has");
    expect(read).toContain("enter 0% as the rent growth to run the model on the lease");
    const { wb: plainWb } = await loadIntoHf(await buildUnderwriteWorkbook(model));
    expect(() => findRow(plainWb.getWorksheet("Cover")!, 2, "The single tenant")).toThrow();
  });
});
