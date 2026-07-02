import "server-only";
import ExcelJS from "exceljs";
import type { UnderwritingModel } from "./types";
import { computeModel, type ModelInputs } from "./compute";
import {
  computeSensitivityGrid,
  computeRateStrip,
  computeHoldStrip,
} from "./sensitivity";
import { MODEL_INPUTS } from "./inputs";

/**
 * Build the first-draft underwriting model as a REAL Excel model, not a static
 * report: the Deal Summary carries an editable Inputs block, and every
 * downstream figure — cash flow, debt service, exit, IRR, equity multiple —
 * is a live formula off those inputs. Each formula cell also carries a cached
 * result (from the same deterministic engine the app uses), so the workbook
 * opens showing correct numbers and recalculates the moment an analyst flexes
 * an assumption. The sensitivity grids are app-computed values (they re-run
 * the whole engine per cell), refreshed on every regeneration.
 */

const BRAND = "FF114E54";
const BRAND_SOFT = "FFE7EEEC";
const INPUT_TINT = "FFFDF6E7"; // warm tint marking editable input cells
const INK = "FF18211F";
const MUTED = "FF5F6B69";
const LINE = "FFE7E4DD";
const FAINT = "FFF3F5F4";
const WHITE = "FFFFFFFF";
const PASS = "FF15803D";
const CAUTION = "FFB45309";
const KILL = "FFB3261E";

const USD = "$#,##0;($#,##0)";
const PCT1 = "0.0%";
const PCT2 = "0.00%";
const MULT = '0.00"x"';
const NUM0 = "#,##0";

type WS = ExcelJS.Worksheet;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function columnLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function title(ws: WS, row: number, text: string) {
  const c = ws.getCell(`B${row}`);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: INK } };
}

function subtitle(ws: WS, row: number, text: string) {
  const c = ws.getCell(`B${row}`);
  c.value = text;
  c.font = { size: 10, color: { argb: MUTED }, italic: true };
}

function sectionHeader(ws: WS, row: number, text: string, lastCol = "G") {
  const c = ws.getCell(`B${row}`);
  c.value = text.toUpperCase();
  c.font = { bold: true, size: 10, color: { argb: BRAND } };
  const colNum = ws.getColumn(lastCol).number;
  for (let n = 2; n <= colNum; n++) {
    ws.getRow(row).getCell(n).border = {
      bottom: { style: "medium", color: { argb: BRAND } },
    };
  }
}

type F = { formula: string; result?: number };

function labelCell(ws: WS, row: number, label: string, opts: { bold?: boolean; muted?: boolean } = {}) {
  const l = ws.getCell(`B${row}`);
  l.value = label;
  l.font = {
    size: 10,
    color: { argb: opts.muted === false ? INK : MUTED },
    bold: !!opts.bold,
  };
}

function valueCell(
  ws: WS,
  addr: string,
  value: number | string | F,
  fmt?: string,
  opts: { bold?: boolean; color?: string; input?: boolean } = {},
) {
  const c = ws.getCell(addr);
  c.value = value as ExcelJS.CellValue;
  if (fmt) c.numFmt = fmt;
  c.alignment = { horizontal: "right" };
  c.font = { size: 10, bold: !!opts.bold, color: { argb: opts.color ?? INK } };
  if (opts.input) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_TINT } };
    c.border = { bottom: { style: "thin", color: { argb: LINE } } };
    c.protection = { locked: false };
  }
}

/* ------------------------------------------------------------------ */
/* Input-cell addresses on Deal Summary — the anchor of every formula  */
/* ------------------------------------------------------------------ */

const DS = "'Deal Summary'";
const IN = {
  price: "$C$6",
  closePct: "$C$7",
  feePct: "$C$8",
  ltv: "$C$9",
  rate: "$C$10",
  amort: "$C$11",
  io: "$C$12",
  gpr: "$C$13",
  vac: "$C$14",
  other: "$C$15",
  opex: "$C$16",
  reserve: "$C$17",
  rentG: "$C$18",
  expG: "$C$19",
  otherG: "$C$20",
  exitCap: "$C$21",
  sell: "$C$22",
} as const;
const LOAN_CELL = "$C$28"; // Sources & Uses: loan proceeds
const EQUITY_CELL = "$C$31"; // Sources & Uses: equity required

/* ------------------------------------------------------------------ */
/* Deal Summary                                                        */
/* ------------------------------------------------------------------ */

function buildDealSummary(ws: WS, model: UnderwritingModel, dealName: string) {
  ws.columns = [
    { width: 2 },
    { width: 34 },
    { width: 17 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
  ];
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const i = model.inputs;
  const r = model.returns;
  const closePct = i.closingCostPct ?? 0;
  const feePct = i.loanFeePct ?? 0;
  const closingCosts = i.purchasePrice * (closePct / 100);
  const loanFees = r.loanAmount * (feePct / 100);

  title(ws, 2, dealName || "Untitled deal");
  subtitle(
    ws,
    3,
    `First-draft underwriting model · ${i.holdYears}-yr hold · generated from ${
      model.generatedFrom.join(", ") || "your documents"
    }`,
  );

  // ---- Inputs -------------------------------------------------------------
  sectionHeader(ws, 5, "Inputs — edit the tinted cells to flex the model", "C");
  const inputRows: [string, number, string | undefined][] = [
    ["Purchase price", i.purchasePrice, USD],
    ["Closing costs (% of price)", closePct / 100, PCT2],
    ["Loan fee (% of loan)", feePct / 100, PCT2],
    ["Loan-to-value", i.loan.ltvPct / 100, PCT1],
    ["Interest rate", i.loan.ratePct / 100, PCT2],
    ["Amortization (yrs)", i.loan.amortYears, NUM0],
    ["Interest-only (yrs)", i.loan.ioYears, NUM0],
    ["Gross potential rent (yr 1)", i.year1Gpr, USD],
    ["Vacancy", i.vacancyPct / 100, PCT1],
    ["Other income (yr 1)", i.otherIncomeAnnual, USD],
    ["Operating expenses (yr 1)", i.year1Opex, USD],
    ["Capital reserve (yr 1)", i.capexReserveAnnual ?? 0, USD],
    ["Rent growth (/yr)", i.rentGrowthPct / 100, PCT1],
    ["Expense growth (/yr)", i.expenseGrowthPct / 100, PCT1],
    ["Other income growth (/yr)", i.otherIncomeGrowthPct / 100, PCT1],
    ["Exit cap", i.exitCapPct / 100, PCT2],
    ["Selling costs (% of sale)", i.sellingCostPct / 100, PCT1],
  ];
  inputRows.forEach(([label, value, fmt], idx) => {
    const row = 6 + idx;
    labelCell(ws, row, label);
    valueCell(ws, `C${row}`, value, fmt, { input: true });
  });
  labelCell(ws, 23, "Hold period (yrs)");
  valueCell(ws, `C23`, i.holdYears, NUM0);
  ws.getCell("D23").value =
    "fixed — the year columns are built for this hold; regenerate to change";
  ws.getCell("D23").font = { size: 8, italic: true, color: { argb: MUTED } };

  ws.getCell("B25").value =
    "Tinted cells are inputs. Everything below — cash flow, debt service, exit, IRR — recalculates live.";
  ws.getCell("B25").font = { size: 9, italic: true, color: { argb: MUTED } };

  // ---- Sources & Uses (formulas) ------------------------------------------
  sectionHeader(ws, 27, "Sources & Uses", "C");
  labelCell(ws, 28, "Loan proceeds");
  valueCell(ws, "C28", { formula: `C6*C9`, result: r.loanAmount }, USD);
  labelCell(ws, 29, "Closing costs");
  valueCell(ws, "C29", { formula: `C6*C7`, result: closingCosts }, USD);
  labelCell(ws, 30, "Loan fees");
  valueCell(ws, "C30", { formula: `C28*C8`, result: loanFees }, USD);
  labelCell(ws, 31, "Equity required", { bold: true });
  valueCell(
    ws,
    "C31",
    { formula: `C6+C29+C30-C28`, result: r.equity },
    USD,
    { bold: true },
  );

  // ---- Return summary (formulas referencing Cash Flow) --------------------
  const N = model.cashFlow.length;
  const cfLastOp = columnLetter(3 + N - 1); // last operating-year column
  const flowsLast = columnLetter(3 + N); // levered-flows block includes year 0
  sectionHeader(ws, 33, "Return summary", "C");
  const ret: [string, F, string, boolean, string?][] = [
    [
      "Going-in cap",
      { formula: `'Cash Flow'!C11/C6`, result: r.goingInCapPct / 100 },
      PCT2,
      true,
      undefined,
    ],
    [
      "Year-1 NOI",
      { formula: `'Cash Flow'!C11`, result: r.year1Noi },
      USD,
      false,
      undefined,
    ],
    [
      "Levered IRR",
      {
        formula: `IRR('Cash Flow'!C24:${flowsLast}24)`,
        result: r.leveredIrrPct != null ? r.leveredIrrPct / 100 : undefined,
      },
      PCT1,
      true,
      BRAND,
    ],
    [
      "Unlevered IRR",
      {
        formula: `IRR('Cash Flow'!C25:${flowsLast}25)`,
        result: r.unleveredIrrPct != null ? r.unleveredIrrPct / 100 : undefined,
      },
      PCT1,
      false,
      undefined,
    ],
    [
      "Cash-on-cash (Yr 1)",
      {
        formula: `'Cash Flow'!C14/C31`,
        result: r.cashOnCashPct != null ? r.cashOnCashPct / 100 : undefined,
      },
      PCT1,
      false,
      undefined,
    ],
    [
      "Equity multiple",
      {
        formula: `'Cash Flow'!C26/C31`,
        result: r.equityMultiple ?? undefined,
      },
      MULT,
      true,
      BRAND,
    ],
    [
      "Profit",
      { formula: `'Cash Flow'!C26-C31`, result: r.profit },
      USD,
      false,
      undefined,
    ],
  ];
  ret.forEach(([label, f, fmt, bold, color], idx) => {
    const row = 34 + idx;
    labelCell(ws, row, label, { bold });
    valueCell(ws, `C${row}`, f, fmt, { bold, color });
  });

  // ---- Residual / exit (references the Cash Flow exit block) --------------
  sectionHeader(ws, 42, "Residual / exit", "C");
  const sellingCosts = r.exitValue * (i.sellingCostPct / 100);
  const exitRows: [string, F, string, boolean?][] = [
    ["Exit NOI (forward)", { formula: `'Cash Flow'!C17`, result: r.exitNoi }, USD],
    ["Gross sale value", { formula: `'Cash Flow'!C18`, result: r.exitValue }, USD],
    [
      "Selling costs",
      { formula: `'Cash Flow'!C19`, result: -sellingCosts },
      USD,
    ],
    [
      "Loan balance repaid",
      { formula: `'Cash Flow'!C20`, result: -r.exitLoanBalance },
      USD,
    ],
    [
      "Net sale proceeds",
      { formula: `'Cash Flow'!C21`, result: r.netSaleProceeds },
      USD,
      true,
    ],
  ];
  exitRows.forEach(([label, f, fmt, bold], idx) => {
    const row = 43 + idx;
    labelCell(ws, row, label, { bold });
    valueCell(ws, `C${row}`, f, fmt, { bold });
  });

  // ---- Sensitivity: exit cap × price (app-computed values) ----------------
  let row = 49;
  sectionHeader(ws, row, "Sensitivity — levered IRR (exit cap × price)", "H");
  row++;
  const grid = computeSensitivityGrid(i);
  const corner = ws.getCell(`B${row}`);
  corner.value = "Exit cap ↓ / Price →";
  corner.font = { italic: true, size: 9, color: { argb: MUTED } };
  grid[0].cells.forEach((cell, ci) => {
    const c = ws.getRow(row).getCell(3 + ci);
    c.value = cell.price;
    c.numFmt = USD;
    c.font = { bold: true, size: 9, color: { argb: INK } };
    c.alignment = { horizontal: "right" };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: cell.isBase || grid.find((g) => g.isBaseRow)?.cells[ci].isBase ? BRAND_SOFT : FAINT },
    };
  });
  grid.forEach((g) => {
    row++;
    const label = ws.getRow(row).getCell(2);
    label.value = g.exitCapPct / 100;
    label.numFmt = PCT2;
    label.font = { bold: true, size: 9, color: { argb: INK } };
    label.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: g.isBaseRow ? BRAND_SOFT : FAINT },
    };
    g.cells.forEach((cell, ci) => {
      const c = ws.getRow(row).getCell(3 + ci);
      c.value = cell.irrPct == null ? "—" : cell.irrPct / 100;
      c.numFmt = PCT1;
      c.alignment = { horizontal: "right" };
      c.font = {
        size: 9,
        bold: cell.isBase,
        color: { argb: cell.isBase ? BRAND : INK },
      };
      if (cell.isBase)
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
    });
  });

  // ---- Debt strip — the third deal-killer ---------------------------------
  row += 2;
  sectionHeader(ws, row, "Debt — levered IRR at rate −50 to +50 bps", "H");
  row++;
  const rateStrip = computeRateStrip(i);
  rateStrip.forEach((s, ci) => {
    const head = ws.getRow(row).getCell(3 + ci);
    head.value = s.deltaBps === 0 ? "base" : `${s.deltaBps > 0 ? "+" : ""}${s.deltaBps} bp`;
    head.font = { bold: true, size: 9, color: { argb: s.isBase ? BRAND : INK } };
    head.alignment = { horizontal: "right" };
    const val = ws.getRow(row + 1).getCell(3 + ci);
    val.value = s.irrPct == null ? "—" : s.irrPct / 100;
    val.numFmt = PCT1;
    val.alignment = { horizontal: "right" };
    val.font = { size: 9, bold: s.isBase, color: { argb: s.isBase ? BRAND : INK } };
  });
  labelCell(ws, row + 1, "Levered IRR");

  // ---- Hold strip ----------------------------------------------------------
  row += 3;
  sectionHeader(ws, row, "Hold period — IRR / equity multiple", "H");
  row++;
  const holdStrip = computeHoldStrip(i);
  holdStrip.forEach((s, ci) => {
    const head = ws.getRow(row).getCell(3 + ci);
    head.value = `${s.holdYears} yrs`;
    head.font = { bold: true, size: 9, color: { argb: s.isBase ? BRAND : INK } };
    head.alignment = { horizontal: "right" };
    const val = ws.getRow(row + 1).getCell(3 + ci);
    val.value =
      s.irrPct == null || s.equityMultiple == null
        ? "—"
        : `${s.irrPct.toFixed(1)}% / ${s.equityMultiple.toFixed(2)}x`;
    val.alignment = { horizontal: "right" };
    val.font = { size: 9, bold: s.isBase, color: { argb: s.isBase ? BRAND : INK } };
  });
  labelCell(ws, row + 1, "IRR / multiple");

  row += 3;
  ws.getCell(`B${row}`).value =
    "Grids are computed by the app at generation time (each cell re-runs the full engine). The rows above them are live formulas.";
  ws.getCell(`B${row}`).font = { size: 8, italic: true, color: { argb: MUTED } };
}

/* ------------------------------------------------------------------ */
/* Cash Flow — live formulas off the Deal Summary inputs               */
/* ------------------------------------------------------------------ */

function buildCashFlow(ws: WS, model: UnderwritingModel) {
  const cf = model.cashFlow;
  const N = cf.length;
  const i = model.inputs;
  const r = model.returns;

  const cols: Partial<ExcelJS.Column>[] = [{ width: 2 }, { width: 30 }];
  for (let k = 0; k <= N; k++) cols.push({ width: 15 });
  ws.columns = cols;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }];
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  title(ws, 2, "Operating cash flow");
  subtitle(
    ws,
    3,
    "Live formulas off the Deal Summary inputs — flex an assumption there and every line recalculates.",
  );

  // Header row
  const headRow = 5;
  const hc = ws.getRow(headRow).getCell(2);
  hc.value = "Line item";
  hc.font = { bold: true, size: 10, color: { argb: WHITE } };
  hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  for (let y = 1; y <= N; y++) {
    const c = ws.getRow(headRow).getCell(2 + y);
    c.value = `Year ${y}`;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.alignment = { horizontal: "right" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  }

  // Operating rows 6..14 — formula per year column, cached result per year.
  type Line = {
    row: number;
    label: string;
    bold?: boolean;
    muted?: boolean;
    formula: (col: string, k: number, y: number) => string;
    result: (c: (typeof cf)[number]) => number;
  };
  const lines: Line[] = [
    {
      row: 6,
      label: "Gross potential rent",
      formula: (_c, k) => `${DS}!${IN.gpr}*(1+${DS}!${IN.rentG})^${k}`,
      result: (c) => c.gpr,
    },
    {
      row: 7,
      label: "Less: vacancy",
      muted: true,
      formula: (col) => `-${col}6*${DS}!${IN.vac}`,
      result: (c) => -c.vacancyLoss,
    },
    {
      row: 8,
      label: "Other income",
      formula: (_c, k) => `${DS}!${IN.other}*(1+${DS}!${IN.otherG})^${k}`,
      result: (c) => c.otherIncome,
    },
    {
      row: 9,
      label: "Effective gross income",
      bold: true,
      formula: (col) => `${col}6+${col}7+${col}8`,
      result: (c) => c.egi,
    },
    {
      row: 10,
      label: "Operating expenses",
      muted: true,
      formula: (_c, k) => `-${DS}!${IN.opex}*(1+${DS}!${IN.expG})^${k}`,
      result: (c) => -c.opex,
    },
    {
      row: 11,
      label: "Net operating income",
      bold: true,
      formula: (col) => `${col}9+${col}10`,
      result: (c) => c.noi,
    },
    {
      row: 12,
      label: "Capital reserve",
      muted: true,
      formula: (_c, k) => `-${DS}!${IN.reserve}*(1+${DS}!${IN.expG})^${k}`,
      result: (c) => -(c.capexReserve ?? 0),
    },
    {
      row: 13,
      label: "Debt service",
      muted: true,
      formula: (_c, _k, y) =>
        `IF(${y}<=${DS}!${IN.io},-${DS}!${LOAN_CELL}*${DS}!${IN.rate},PMT(${DS}!${IN.rate}/12,${DS}!${IN.amort}*12,${DS}!${LOAN_CELL})*12)`,
      result: (c) => -c.debtService,
    },
    {
      row: 14,
      label: "Levered cash flow",
      bold: true,
      formula: (col) => `${col}11+${col}12+${col}13`,
      result: (c) => c.cashFlow,
    },
  ];

  for (const ln of lines) {
    labelCell(ws, ln.row, ln.label, { bold: ln.bold, muted: ln.muted !== false });
    ws.getCell(`B${ln.row}`).font = {
      size: 10,
      bold: !!ln.bold,
      color: { argb: ln.bold ? INK : MUTED },
    };
    for (let y = 1; y <= N; y++) {
      const col = columnLetter(2 + y);
      const k = y - 1;
      valueCell(
        ws,
        `${col}${ln.row}`,
        { formula: ln.formula(col, k, y), result: Math.round(ln.result(cf[y - 1])) },
        USD,
        { bold: ln.bold },
      );
    }
    if (ln.bold) {
      for (let n = 2; n <= 2 + N; n++)
        ws.getRow(ln.row).getCell(n).border = {
          top: { style: "thin", color: { argb: LINE } },
        };
    }
  }

  // Exit block (single column of formulas)
  sectionHeader(ws, 16, `Exit — sale at end of year ${N}`, "C");
  const sellingCosts = r.exitValue * (i.sellingCostPct / 100);
  const exitNoiFormula =
    `${DS}!${IN.gpr}*(1+${DS}!${IN.rentG})^${N}*(1-${DS}!${IN.vac})` +
    `+${DS}!${IN.other}*(1+${DS}!${IN.otherG})^${N}` +
    `-${DS}!${IN.opex}*(1+${DS}!${IN.expG})^${N}`;
  const balanceFormula =
    `-MAX(0,IF(${N}-${DS}!${IN.io}<=0,${DS}!${LOAN_CELL},` +
    `-FV(${DS}!${IN.rate}/12,(${N}-${DS}!${IN.io})*12,` +
    `PMT(${DS}!${IN.rate}/12,${DS}!${IN.amort}*12,${DS}!${LOAN_CELL}),${DS}!${LOAN_CELL})))`;
  const exitRows: [number, string, F, boolean?][] = [
    [17, "Exit NOI (forward year)", { formula: exitNoiFormula, result: r.exitNoi }],
    [18, "Gross sale value", { formula: `C17/${DS}!${IN.exitCap}`, result: r.exitValue }],
    [19, "Selling costs", { formula: `-C18*${DS}!${IN.sell}`, result: -sellingCosts }],
    [20, "Loan balance repaid", { formula: balanceFormula, result: -r.exitLoanBalance }],
    [21, "Net sale proceeds", { formula: `C18+C19+C20`, result: r.netSaleProceeds }, true],
  ];
  for (const [row, label, f, bold] of exitRows) {
    labelCell(ws, row, label, { bold });
    valueCell(ws, `C${row}`, f, USD, { bold });
  }

  // Return flows for IRR (year 0..N)
  sectionHeader(ws, 23, "Return flows (feeds the IRR)", columnLetter(3 + N));
  for (let y = 0; y <= N; y++) {
    const c = ws.getRow(23).getCell(3 + y);
    c.value = `Yr ${y}`;
    c.font = { bold: true, size: 8, color: { argb: MUTED } };
    c.alignment = { horizontal: "right" };
  }
  labelCell(ws, 24, "Levered flows");
  labelCell(ws, 25, "Unlevered flows");
  labelCell(ws, 26, "Total levered distributions");

  // Year 0
  valueCell(ws, `C24`, { formula: `-${DS}!${EQUITY_CELL}`, result: -r.equity }, USD);
  const closingCosts = i.purchasePrice * ((i.closingCostPct ?? 0) / 100);
  valueCell(
    ws,
    `C25`,
    {
      formula: `-(${DS}!${IN.price}+${DS}!$C$29)`,
      result: -(i.purchasePrice + closingCosts),
    },
    USD,
  );
  // Years 1..N
  for (let y = 1; y <= N; y++) {
    const flowCol = columnLetter(3 + y);
    const opCol = columnLetter(2 + y);
    const last = y === N;
    const cfy = cf[y - 1];
    valueCell(
      ws,
      `${flowCol}24`,
      {
        formula: `${opCol}14${last ? "+$C$21" : ""}`,
        result: Math.round(cfy.cashFlow + (last ? r.netSaleProceeds : 0)),
      },
      USD,
    );
    valueCell(
      ws,
      `${flowCol}25`,
      {
        formula: `${opCol}11+${opCol}12${last ? "+$C$18+$C$19" : ""}`,
        result: Math.round(
          cfy.noi -
            (cfy.capexReserve ?? 0) +
            (last ? r.exitValue - sellingCosts : 0),
        ),
      },
      USD,
    );
  }
  const flowsLast = columnLetter(3 + N);
  const totalDistributions =
    cf.reduce((a, c) => a + c.cashFlow, 0) + r.netSaleProceeds;
  valueCell(
    ws,
    `C26`,
    { formula: `SUM(D24:${flowsLast}24)`, result: Math.round(totalDistributions) },
    USD,
  );
}

/* ------------------------------------------------------------------ */
/* Assumptions / Conflicts / Start Here (report sheets)                */
/* ------------------------------------------------------------------ */

function buildAssumptions(ws: WS, model: UnderwritingModel) {
  ws.columns = [
    { width: 2 },
    { width: 28 },
    { width: 16 },
    { width: 18 },
    { width: 30 },
    { width: 12 },
  ];
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 5, showGridLines: false }];
  title(ws, 2, "Assumptions");
  subtitle(ws, 3, "Every value sourced. Conflicts flagged and reconciled.");

  const headRow = 5;
  const heads = ["Assumption", "Value", "Source", "Basis / rationale", "Conf."];
  heads.forEach((h, idx) => {
    const cell = ws.getRow(headRow).getCell(2 + idx);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });

  let row = headRow + 1;
  for (const m of model.metrics) {
    const conf =
      m.confidence === "high" ? PASS : m.confidence === "low" ? KILL : CAUTION;
    ws.getRow(row).getCell(2).value = m.label;
    ws.getRow(row).getCell(2).font = {
      size: 10,
      bold: true,
      color: { argb: m.isConflict ? KILL : INK },
    };
    ws.getRow(row).getCell(3).value = m.chosenValue;
    ws.getRow(row).getCell(3).font = { size: 10, color: { argb: INK } };
    ws.getRow(row).getCell(4).value = m.authority || "—";
    ws.getRow(row).getCell(4).font = { size: 10, color: { argb: MUTED } };
    ws.getRow(row).getCell(5).value = m.rationale || m.sources?.[0]?.basis || "";
    ws.getRow(row).getCell(5).font = { size: 9, color: { argb: MUTED } };
    ws.getRow(row).getCell(5).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(row).getCell(6).value = m.confidence;
    ws.getRow(row).getCell(6).font = { size: 9, bold: true, color: { argb: conf } };
    row++;
  }
}

function buildConflicts(ws: WS, model: UnderwritingModel) {
  ws.columns = [{ width: 2 }, { width: 26 }, { width: 64 }];
  ws.views = [{ showGridLines: false }];
  title(ws, 2, "Source conflicts");
  if (model.conflicts.length === 0) {
    subtitle(ws, 3, "No material disagreements between your documents.");
    return;
  }
  subtitle(
    ws,
    3,
    `${model.conflicts.length} reconciled — actuals beat pro forma; each choice is explained.`,
  );

  let row = 5;
  for (const m of model.conflicts) {
    const head = ws.getRow(row);
    head.getCell(2).value = m.label;
    head.getCell(2).font = { bold: true, size: 11, color: { argb: KILL } };
    head.getCell(3).value = `Chose ${m.chosenValue} (${m.authority})`;
    head.getCell(3).font = { bold: true, size: 10, color: { argb: PASS } };
    row++;
    for (const s of m.sources) {
      ws.getRow(row).getCell(2).value = s.doc;
      ws.getRow(row).getCell(2).font = { size: 9, color: { argb: MUTED } };
      ws.getRow(row).getCell(3).value = `${s.value}${s.basis ? ` — ${s.basis}` : ""}`;
      ws.getRow(row).getCell(3).font = { size: 9, color: { argb: INK } };
      row++;
    }
    if (m.rationale) {
      const rc = ws.getRow(row).getCell(3);
      rc.value = m.rationale;
      rc.font = { italic: true, size: 9, color: { argb: MUTED } };
      rc.alignment = { wrapText: true };
      row++;
    }
    row++;
  }
}

function buildStartHere(
  ws: WS,
  model: UnderwritingModel,
  dealName: string,
  providedKinds: string[],
) {
  ws.columns = [{ width: 2 }, { width: 30 }, { width: 14 }, { width: 64 }];
  ws.views = [{ showGridLines: false }];

  const banner = ws.getRow(2);
  ws.mergeCells("B2:E2");
  banner.getCell(2).value =
    "FIRST-DRAFT MODEL — built from what you uploaded. The tinted Inputs on Deal Summary drive live formulas everywhere. Verify before relying on it; add more documents anytime to deepen it.";
  banner.getCell(2).font = { bold: true, color: { argb: WHITE }, size: 10 };
  banner.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND },
  };
  banner.getCell(2).alignment = { wrapText: true, vertical: "middle" };
  banner.height = 34;

  ws.getCell("B4").value = dealName || "Untitled deal";
  ws.getCell("B4").font = { bold: true, size: 15 };
  ws.getCell("B5").value = `Built from: ${model.generatedFrom.join(", ") || "your documents"}`;
  ws.getCell("B5").font = { size: 10, color: { argb: MUTED } };

  let row = 7;
  sectionHeader(ws, row, "What's in this workbook", "E");
  row++;
  const tabs = [
    [
      "Deal Summary",
      "Editable inputs, sources & uses, live return formulas, and sensitivity grids (exit cap × price, debt, hold)",
    ],
    ["Cash Flow", "Year-by-year operating proforma — every line a formula off the inputs"],
    ["Assumptions", "Every input, with its source and a confidence flag"],
    ["Conflicts", "Where your documents disagreed, and how it was reconciled"],
  ];
  for (const [t, d] of tabs) {
    ws.getRow(row).getCell(2).value = t;
    ws.getRow(row).getCell(2).font = { bold: true, size: 10 };
    ws.mergeCells(`C${row}:E${row}`);
    ws.getRow(row).getCell(3).value = d;
    ws.getRow(row).getCell(3).font = { size: 10, color: { argb: MUTED } };
    ws.getRow(row).getCell(3).alignment = { wrapText: true };
    row++;
  }

  row++;
  sectionHeader(ws, row, "Add more to deepen the model", "E");
  row++;
  ws.mergeCells(`B${row}:E${row}`);
  ws.getRow(row).getCell(2).value =
    "The model is built around whatever you upload. None of these are required — adding them just makes it fuller.";
  ws.getRow(row).getCell(2).font = { italic: true, size: 9, color: { argb: MUTED } };
  ws.getRow(row).getCell(2).alignment = { wrapText: true };
  row++;

  for (const inp of MODEL_INPUTS) {
    const provided = providedKinds.includes(inp.kind);
    ws.getRow(row).getCell(2).value = inp.label;
    ws.getRow(row).getCell(2).font = { bold: true, size: 10 };
    ws.getRow(row).getCell(3).value = provided ? "✓ added" : "optional";
    ws.getRow(row).getCell(3).font = {
      bold: true,
      size: 9,
      color: { argb: provided ? PASS : MUTED },
    };
    ws.mergeCells(`D${row}:E${row}`);
    ws.getRow(row).getCell(4).value = inp.fills;
    ws.getRow(row).getCell(4).font = { size: 9, color: { argb: MUTED } };
    ws.getRow(row).getCell(4).alignment = { wrapText: true };
    row++;
  }

  if (model.caveats.length > 0) {
    row++;
    sectionHeader(ws, row, "Verify before relying on this", "E");
    row++;
    for (const c of model.caveats) {
      ws.mergeCells(`B${row}:E${row}`);
      ws.getRow(row).getCell(2).value = `•  ${c}`;
      ws.getRow(row).getCell(2).font = { size: 9, color: { argb: MUTED } };
      ws.getRow(row).getCell(2).alignment = { wrapText: true };
      row++;
    }
  }
}

/* ------------------------------------------------------------------ */

export async function buildModelWorkbook(
  model: UnderwritingModel,
  dealName: string,
  providedKinds: string[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = new Date();
  // Recalculate on open so the cached results and formulas can never drift.
  wb.calcProperties.fullCalcOnLoad = true;

  buildStartHere(
    wb.addWorksheet("▶ Start Here", {
      properties: { tabColor: { argb: BRAND } },
    }),
    model,
    dealName,
    providedKinds,
  );
  buildDealSummary(wb.addWorksheet("Deal Summary"), model, dealName);
  buildCashFlow(wb.addWorksheet("Cash Flow"), model);
  buildAssumptions(wb.addWorksheet("Assumptions"), model);
  buildConflicts(wb.addWorksheet("Conflicts"), model);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// Re-exported so callers (and tests) can use the same engine that fills the
// cached results.
export { computeModel };
export type { ModelInputs };
