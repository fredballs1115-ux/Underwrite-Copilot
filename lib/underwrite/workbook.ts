import "server-only";
import ExcelJS from "exceljs";
import type { UnderwriteInputs } from "./engine";
import { computeUnderwrite } from "./engine";
import { buildSensitivityGrids, formatSensCell, type SensGrid } from "./sensitivity";
import type { DerivedModel, InputSource } from "./inputs";

/**
 * The institutional acquisition-template workbook (Feature 1). Visible tabs:
 * Deal Summary, Assumptions, Cash Flow. The MAIN MODEL is live — every Deal
 * Summary and Cash Flow number is an Excel formula off the Assumptions inputs,
 * so changing the exit cap recalculates levered IRR, and the formulas mirror
 * lib/underwrite/engine.ts so the web app's numbers match the workbook.
 *
 * Sensitivity grids: computed at export from the same engine and written as
 * labelled static values ("re-export after changing assumptions"). A fully
 * live 75-scenario engine tab was judged materially fragile (see the feature
 * note); this keeps the ZERO-formula-errors guarantee intact.
 *
 * Font colour convention: blue = input, black = formula, green = link.
 */

const ARIAL = "Arial";
const BLUE = { argb: "FF0000CC" };
const GREEN = { argb: "FF107C41" };
const INK = { argb: "FF18211F" };
const BRAND = { argb: "FF114E54" };
const MUTED = { argb: "FF5F6B69" };
const YELLOW = "FFFDF3D0";
const HEADFILL = "FF114E54";

const FMT = {
  usd: '$#,##0;($#,##0);"-"',
  psf: "$0.00",
  pct1: "0.0%",
  pct2: "0.00%",
  mult: '0.0"x"',
  int: "0",
  ratio: '0.00"x"',
} as const;

function sourceText(s: InputSource | undefined): string {
  if (!s) return "";
  const tag = s.provenance === "extracted" ? "OM" : s.provenance === "derived" ? "Derived" : "Assumption";
  const page = s.provenance === "extracted" && s.page ? ` ${s.page}` : "";
  return `${tag}${page} — ${s.note}`;
}
function provColor(p: InputSource["provenance"] | undefined) {
  if (p === "extracted") return INK;
  if (p === "derived") return BRAND;
  return MUTED;
}
function styleInput(cell: ExcelJS.Cell, fmt: string, flex = false) {
  cell.font = { name: ARIAL, size: 10, color: BLUE };
  cell.numFmt = fmt;
  if (flex) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
}
function styleFormula(cell: ExcelJS.Cell, fmt: string, color = INK, bold = false) {
  cell.font = { name: ARIAL, size: 10, color, bold };
  cell.numFmt = fmt;
}
function styleLink(cell: ExcelJS.Cell, fmt: string) {
  cell.font = { name: ARIAL, size: 10, color: GREEN };
  cell.numFmt = fmt;
}
function label(cell: ExcelJS.Cell, text: string | number, opts: { bold?: boolean; color?: { argb: string }; indent?: number; size?: number } = {}) {
  cell.value = text;
  cell.font = { name: ARIAL, size: opts.size ?? 10, bold: opts.bold, color: opts.color ?? INK };
  if (opts.indent) cell.alignment = { indent: opts.indent };
}
function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, fromCol: number, toCol: number) {
  for (let i = fromCol; i <= toCol; i++) {
    ws.getCell(row, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
  }
  const c = ws.getCell(row, fromCol);
  c.value = text.toUpperCase();
  c.font = { name: ARIAL, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
}
function titleRow(ws: ExcelJS.Worksheet, text: string) {
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: ARIAL, size: 16, bold: true, color: BRAND };
  ws.getRow(1).height = 22;
}
/** A1 address from 1-based row/col. */
function cellA1(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return `${s}${row}`;
}

export async function buildUnderwriteWorkbook(model: DerivedModel): Promise<Buffer> {
  const { inputs } = model;
  const result = computeUnderwrite(inputs);
  const holdYears = result.holdYears;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = new Date(0);

  const wsSummary = wb.addWorksheet("Deal Summary", { views: [{ showGridLines: false }] });
  const wsAssum = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  const wsCf = wb.addWorksheet("Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
  });

  buildAssumptions(wsAssum, inputs, model.sources);
  const cf = buildCashFlow(wsCf, inputs, holdYears);
  buildDealSummary(wsSummary, model, cf, holdYears);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── ASSUMPTIONS ───────────────────────────────────────────────────────────────
function buildAssumptions(ws: ExcelJS.Worksheet, inp: UnderwriteInputs, sources: DerivedModel["sources"]) {
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 64;
  titleRow(ws, "Assumptions");
  label(ws.getCell(1, 3), "SOURCE", { bold: true, color: MUTED, size: 9 });

  let r = 3;
  const src = (row: number, key: keyof UnderwriteInputs | "expenseLines") => {
    const s = sources[key as keyof typeof sources];
    if (!s) return;
    const sc = ws.getCell(row, 3);
    sc.value = sourceText(s);
    sc.font = { name: ARIAL, size: 9, color: provColor(s.provenance) };
  };
  const input = (lab: string, value: number, name: string, fmt: string, key?: keyof UnderwriteInputs, flex = false) => {
    label(ws.getCell(r, 1), lab, { indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = value;
    c.name = name;
    styleInput(c, fmt, flex);
    if (key) src(r, key);
    r++;
  };
  const derived = (lab: string, formula: string, name: string, fmt: string, bold = false) => {
    label(ws.getCell(r, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    c.name = name;
    styleFormula(c, fmt, bold ? INK : GREEN, bold);
    r++;
  };
  const header = (t: string) => { sectionHeader(ws, r, t, 1, 3); r++; };

  header("Deal");
  input("Purchase Price", inp.purchasePrice, "PurchasePrice", FMT.usd, "purchasePrice", true);
  // Hold is STRUCTURAL: it sets the number of cash-flow years and the sale
  // year, which are baked at export. Not a flex input — editing it in the file
  // would only partially recalc (a longer-hold IRR would be wrong). Re-export
  // to change it. Mirrors the sister model.xlsx convention.
  input("Hold Period (months) — fixed; re-export to change", inp.holdMonths, "HoldMonths", FMT.int, "holdMonths", false);
  ws.getCell(r - 1, 2).font = { name: ARIAL, size: 10, color: INK }; // black (formula-like), not blue input
  input("Acquisition Fee %", inp.acqFeePct, "AcqFeePct", FMT.pct2, "acqFeePct");
  input("Acquisition Fee Cap", inp.acqFeeCap, "AcqFeeCap", FMT.usd);

  header("Closing Cost Detail");
  input("Transfer Tax % of price", inp.transferTaxPct, "TransferTaxPct", FMT.pct2);
  label(ws.getCell(r - 1, 3), "Enter your jurisdiction's transfer-tax rate", { color: MUTED, size: 9 });
  input("Recordation Tax % of price", inp.recordationTaxPct, "RecordationTaxPct", FMT.pct2);
  label(ws.getCell(r - 1, 3), "Enter your jurisdiction's recordation-tax rate", { color: MUTED, size: 9 });
  input("General Hold % of price", inp.generalHoldPct, "GeneralHoldPct", FMT.pct2, "generalHoldPct");
  input("Buyer Legal", inp.buyerLegal, "BuyerLegal", FMT.usd);
  input("Lender Legal", inp.lenderLegal, "LenderLegal", FMT.usd);
  input("Appraisal / PCA / Phase I", inp.thirdPartyReports, "ThirdPartyReports", FMT.usd);
  input("3rd Party / Misc.", inp.miscClosing, "MiscClosing", FMT.usd);
  derived("Total Closing Costs", "PurchasePrice*(TransferTaxPct+RecordationTaxPct+GeneralHoldPct)+BuyerLegal+LenderLegal+ThirdPartyReports+MiscClosing", "ClosingCostsTotal", FMT.usd, true);
  derived("Closing Costs % of price", "ClosingCostsTotal/PurchasePrice", "ClosingCostPct_Buy", FMT.pct2);

  header("Income");
  input("In-Place Rental Revenue (annual)", inp.inPlaceRentAnnual, "InPlaceRent", FMT.usd, "inPlaceRentAnnual");
  input("Expense Recoveries (annual)", inp.expenseRecoveriesAnnual, "Recoveries", FMT.usd);
  input("Other Revenue (annual)", inp.otherRevenueAnnual, "OtherRev", FMT.usd);
  input("General Vacancy & Credit Loss %", inp.vacancyPct, "VacancyPct", FMT.pct1, "vacancyPct", true);
  input("Rent Growth %", inp.rentGrowthPct, "RentGrowth", FMT.pct1, "rentGrowthPct", true);

  header("Expenses");
  const opexStart = r;
  inp.expenseLines.forEach((line, i) => {
    label(ws.getCell(r, 1), line.label, { indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = line.annual;
    styleInput(c, FMT.usd);
    if (i === 0) src(r, "expenseLines");
    r++;
  });
  derived("Total Operating Expenses (yr 1)", `SUM(${cellA1(opexStart, 2)}:${cellA1(r - 1, 2)})`, "TotalBaseOpex", FMT.usd, true);
  input("Management Fee % of EGI", inp.mgmtFeePct, "MgmtFeePct", FMT.pct1, "mgmtFeePct");
  input("Expense Growth %", inp.expenseGrowthPct, "ExpGrowth", FMT.pct1, "expenseGrowthPct", true);

  header("Capital");
  input("Rentable SF", inp.rsf, "RSF", FMT.int, "rsf");
  input("Capital Reserves $/SF/yr", inp.reservesPsf, "ReservesPSF", FMT.psf, "reservesPsf");
  input("Capital Improvements (yr 1)", inp.capitalImprovementsYr1, "CapImprovements", FMT.usd);
  input("Tenant Improvements $/SF", inp.tiPsf, "TIPSF", FMT.psf);
  input("Leasing Commission % of rent", inp.lcPct, "LCPct", FMT.pct1);

  header("Fees");
  input("Asset Management Fee % of equity/yr", inp.amFeePctEquity, "AMFeePctEquity", FMT.pct2, "amFeePctEquity");

  header("Financing");
  input("Loan to Cost", inp.ltc, "LTC", FMT.pct1, "ltc", true);
  input("All-in Rate (index + spread)", inp.allInRatePct, "AllInRate", FMT.pct2, "allInRatePct", true);
  input("Interest-Only Period (months; 999 = full)", inp.ioMonths, "IOMonths", FMT.int, "ioMonths");
  input("Amortization (months)", inp.amortMonths, "AmortMonths", FMT.int, "amortMonths");
  input("Financing Costs % of loan", inp.financingCostPct, "FinCostPct", FMT.pct2, "financingCostPct");

  header("Exit");
  input("Exit Cap", inp.exitCapPct, "ExitCap", FMT.pct2, "exitCapPct", true);
  input("Sale Costs % of price", inp.saleCostPct, "SaleCostPct", FMT.pct1, "saleCostPct");
}

// ── CASH FLOW ─────────────────────────────────────────────────────────────────
interface CfMap {
  firstOpCol: number;
  lastOpCol: number;
  fwdCol: number;
  y0Col: number;
  rows: Record<string, number>;
}

function buildCashFlow(ws: ExcelJS.Worksheet, inp: UnderwriteInputs, holdYears: number): CfMap {
  ws.getColumn(1).width = 36;
  const y0Col = 2;
  const firstOpCol = 3;
  const lastOpCol = firstOpCol + holdYears - 1;
  const fwdCol = lastOpCol + 1;
  for (let c = y0Col; c <= fwdCol; c++) ws.getColumn(c).width = 14;

  titleRow(ws, "Cash Flow");
  for (let y = 0; y <= holdYears + 1; y++) {
    const c = ws.getCell(1, y0Col + y);
    c.value = y;
    c.font = { name: ARIAL, size: 10, bold: true, color: INK };
    c.alignment = { horizontal: "right" };
  }
  label(ws.getCell(2, 1), "Year", { bold: true });
  for (let y = 0; y <= holdYears + 1; y++) {
    const c = ws.getCell(2, y0Col + y);
    c.value = { formula: `"Yr "&${y}` } as ExcelJS.CellFormulaValue;
    c.font = { name: ARIAL, size: 8, color: MUTED };
    c.alignment = { horizontal: "right" };
  }

  const rows: Record<string, number> = {};
  let r = 4;
  const at = (key: string, col: number) => cellA1(rows[key], col);
  const prev = (col: number) => cellA1(r, col - 1);

  const line = (
    key: string,
    text: string,
    formulaFor: (col: number, y: number) => string | null,
    fmt: string,
    opts: { bold?: boolean; y0?: string; fwd?: boolean } = {},
  ) => {
    rows[key] = r;
    label(ws.getCell(r, 1), text, { bold: opts.bold });
    if (opts.y0) {
      ws.getCell(r, y0Col).value = { formula: opts.y0 } as ExcelJS.CellFormulaValue;
      styleFormula(ws.getCell(r, y0Col), fmt, INK, opts.bold);
    }
    for (let y = 1; y <= holdYears; y++) {
      const col = firstOpCol + (y - 1);
      const f = formulaFor(col, y);
      if (f == null) continue;
      ws.getCell(r, col).value = { formula: f } as ExcelJS.CellFormulaValue;
      styleFormula(ws.getCell(r, col), fmt, INK, opts.bold);
    }
    if (opts.fwd) {
      const f = formulaFor(fwdCol, holdYears + 1);
      if (f != null) {
        ws.getCell(r, fwdCol).value = { formula: f } as ExcelJS.CellFormulaValue;
        styleFormula(ws.getCell(r, fwdCol), fmt, INK, opts.bold);
      }
    }
    r++;
  };

  sectionHeader(ws, r, "Property Cash Flow", 1, fwdCol);
  r++;
  line("rent", "Rental Revenue", (col, y) => (y === 1 ? "InPlaceRent" : `${prev(col)}*(1+RentGrowth)`), FMT.usd, { fwd: true });
  line("recoveries", "Expense Recoveries", (col, y) => (y === 1 ? "Recoveries" : `${prev(col)}*(1+ExpGrowth)`), FMT.usd, { fwd: true });
  line("other", "Other Revenue", (col, y) => (y === 1 ? "OtherRev" : `${prev(col)}*(1+RentGrowth)`), FMT.usd, { fwd: true });
  line("pgr", "Potential Gross Revenue", (col) => `${at("rent", col)}+${at("recoveries", col)}+${at("other", col)}`, FMT.usd, { bold: true, fwd: true });
  line("vacancy", "General Vacancy & Credit Loss", (col) => `-${at("pgr", col)}*VacancyPct`, FMT.usd, { fwd: true });
  line("egr", "Effective Gross Revenue", (col) => `${at("pgr", col)}+${at("vacancy", col)}`, FMT.usd, { bold: true, fwd: true });
  line("opex", "Operating Expenses (incl. mgmt fee)", (col, y) => `-(TotalBaseOpex*(1+ExpGrowth)^(${y}-1)+${at("egr", col)}*MgmtFeePct)`, FMT.usd, { fwd: true });
  line("noi", "Net Operating Income", (col) => `${at("egr", col)}+${at("opex", col)}`, FMT.usd, { bold: true, fwd: true });
  line("ti", "Tenant Improvements", () => `-TIPSF*RSF`, FMT.usd);
  line("lc", "Leasing Commissions", (col) => `-LCPct*${at("rent", col)}`, FMT.usd);
  line("reserves", "Capital Reserves", (col, y) => `-ReservesPSF*RSF*(1+ExpGrowth)^(${y}-1)`, FMT.usd);
  line("capimp", "Capital Improvements", (col, y) => (y === 1 ? "-CapImprovements" : "0"), FMT.usd);
  line("totalcapex", "Total Capital Expenditures", (col) => `${at("ti", col)}+${at("lc", col)}+${at("reserves", col)}+${at("capimp", col)}`, FMT.usd, { bold: true });
  line("amfee", "Asset Management Fees", () => `-Equity*AMFeePctEquity`, FMT.usd);
  line("pcf", "Property Cash Flow Before Debt", (col) => `${at("noi", col)}+${at("totalcapex", col)}+${at("amfee", col)}`, FMT.usd, { bold: true });
  line("debt", "Debt Service Payments", (col, y) => `-IF(${y}<=IOMonths/12,LoanAmount*AllInRate,MonthlyPmt*12)`, FMT.usd);
  line("levcf", "Levered Cash Flow", (col) => `${at("pcf", col)}+${at("debt", col)}`, FMT.usd, { bold: true });

  r++;
  sectionHeader(ws, r, "Metrics", 1, fwdCol);
  r++;
  line("dscr", "DSCR (NOI)", (col) => `IF(${at("debt", col)}=0,"n/a",${at("noi", col)}/-${at("debt", col)})`, FMT.ratio);
  line("debtyield", "Debt Yield", (col) => `IF(LoanAmount=0,"n/a",${at("noi", col)}/LoanAmount)`, FMT.pct1);

  r++;
  sectionHeader(ws, r, "Investment Cash Flow", 1, fwdCol);
  r++;
  line("unlev", "Unlevered Investment Cash Flow",
    (col, y) => {
      const base = `${at("noi", col)}+${at("totalcapex", col)}`;
      return y === holdYears ? `${base}+(GrossSale-GrossSale*SaleCostPct)` : base;
    },
    FMT.usd, { bold: true, y0: "-(PurchasePrice+ClosingCostsTotal+AcqFee)" });
  line("lev", "Levered Investment Cash Flow",
    (col, y) => (y === holdYears ? `${at("levcf", col)}+NetSaleProceeds` : `${at("levcf", col)}`),
    FMT.usd, { bold: true, y0: "-Equity" });

  return { firstOpCol, lastOpCol, fwdCol, y0Col, rows };
}

// ── DEAL SUMMARY ────────────────────────────────────────────────────────────
function buildDealSummary(ws: ExcelJS.Worksheet, model: DerivedModel, cf: CfMap, holdYears: number) {
  const { meta, inputs } = model;
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 3;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 18;
  titleRow(ws, meta.dealName);

  const cfAddr = (row: number, col: number) => `'Cash Flow'!${cellA1(row, col)}`;
  const noiY1 = cfAddr(cf.rows.noi, cf.firstOpCol);
  const noiFwd = cfAddr(cf.rows.noi, cf.fwdCol);
  const unlevRange = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.y0Col)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levRange = `'Cash Flow'!${cellA1(cf.rows.lev, cf.y0Col)}:${cellA1(cf.rows.lev, cf.lastOpCol)}`;
  const unlevOps = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.firstOpCol)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levcfRange = `'Cash Flow'!${cellA1(cf.rows.levcf, cf.firstOpCol)}:${cellA1(cf.rows.levcf, cf.lastOpCol)}`;

  let r = 3;

  // ── PROJECT OVERVIEW ──
  sectionHeader(ws, r, "Project Overview", 1, 5); r++;
  label(ws.getCell(r, 1), "Building Name"); label(ws.getCell(r, 2), meta.dealName, { color: GREEN });
  label(ws.getCell(r, 4), "Asset Class"); label(ws.getCell(r, 5), meta.assetClass, { color: GREEN }); r++;
  label(ws.getCell(r, 1), "Address"); label(ws.getCell(r, 2), meta.address || "—", { color: GREEN });
  label(ws.getCell(r, 4), "Market"); label(ws.getCell(r, 5), meta.market || "—", { color: GREEN }); r++;
  label(ws.getCell(r, 1), "Rentable SF");
  ws.getCell(r, 2).value = { formula: "RSF" } as ExcelJS.CellFormulaValue; styleLink(ws.getCell(r, 2), FMT.int);
  label(ws.getCell(r, 4), "In-Place Occupancy");
  if (meta.occupancyPct != null) { ws.getCell(r, 5).value = meta.occupancyPct; styleLink(ws.getCell(r, 5), FMT.pct1); }
  else label(ws.getCell(r, 5), "n/a", { color: MUTED });
  r += 2;

  // ── SOURCES & USES ──
  sectionHeader(ws, r, "Sources", 1, 2);
  sectionHeader(ws, r, "Uses", 4, 5); r++;
  const rowStart = r;
  const usesRow = (rr: number, lab: string, formula: string, name?: string, bold = false) => {
    label(ws.getCell(rr, 4), lab, { bold, indent: 1 });
    const c = ws.getCell(rr, 5);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, FMT.usd, INK, bold);
  };
  // Uses = acquisition cost + financing. Capital improvements / TI / LC are
  // OPERATING outflows in the Cash Flow ladder, not capitalized here — folding
  // them into uses AND the ladder would double-count them.
  usesRow(r, "Purchase Price", "PurchasePrice"); r++;
  usesRow(r, "DD / Closing Costs", "ClosingCostsTotal"); r++;
  usesRow(r, "Acquisition Fee", "MIN(AcqFeePct*PurchasePrice,AcqFeeCap)", "AcqFee"); r++;
  usesRow(r, "Loan Basis (acquisition cost)", `SUM(${cellA1(rowStart, 5)}:${cellA1(r - 1, 5)})`, "LoanBasis"); r++;
  usesRow(r, "Financing Costs", "FinCostPct*LoanAmount", "FinancingCosts"); r++;
  usesRow(r, "TOTAL USES", "LoanBasis+FinancingCosts", "TotalUses", true);
  r++;

  // Sources block (rows aligned to Uses start)
  let sr = rowStart;
  const srcRow = (lab: string, formula: string, name?: string, bold = false) => {
    label(ws.getCell(sr, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(sr, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, FMT.usd, INK, bold);
    sr++;
  };
  srcRow("Initial Loan Proceeds", "LTC*LoanBasis", "LoanAmount");
  srcRow("Sponsor Equity", "TotalUses-LoanAmount", "Equity");
  srcRow("TOTAL SOURCES", "LoanAmount+Equity", "TotalSources", true);
  label(ws.getCell(sr, 1), "Sources = Uses", { bold: true });
  const chk = ws.getCell(sr, 2);
  chk.value = { formula: "ROUND(TotalSources,0)=ROUND(TotalUses,0)" } as ExcelJS.CellFormulaValue;
  chk.name = "CheckSU";
  chk.font = { name: ARIAL, size: 10, bold: true };
  ws.addConditionalFormatting({
    ref: chk.address,
    rules: [
      { type: "cellIs", operator: "equal", priority: 1, formulae: ['FALSE'], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 2, formulae: ['TRUE'], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
    ],
  });
  r = Math.max(r, sr) + 2;

  // Monthly payment helper (named), mirrors engine.monthlyPayment.
  label(ws.getCell(r, 1), "Monthly Debt Payment", { indent: 1 });
  ws.getCell(r, 2).value = { formula: "IF(AllInRate=0,LoanAmount/AmortMonths,LoanAmount*(AllInRate/12)/(1-(1+AllInRate/12)^(-AmortMonths)))" } as ExcelJS.CellFormulaValue;
  ws.getCell(r, 2).name = "MonthlyPmt";
  styleFormula(ws.getCell(r, 2), FMT.usd);
  r += 2;

  // ── RESIDUAL + RETURN SUMMARY ──
  sectionHeader(ws, r, "Residual Sale Value", 1, 2);
  sectionHeader(ws, r, "Return Summary", 4, 5); r++;
  const resTop = r;
  const resRow = (lab: string, formula: string, fmt: string, name?: string, link = false, bold = false) => {
    label(ws.getCell(r, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    if (link) styleLink(c, fmt);
    else styleFormula(c, fmt, INK, bold);
    r++;
  };
  resRow("Residual NOI (forward)", noiFwd, FMT.usd, undefined, true);
  resRow("Exit Cap", "ExitCap", FMT.pct2, undefined, true);
  resRow("Gross Sale Proceeds", `IF(ExitCap=0,0,${noiFwd}/ExitCap)`, FMT.usd, "GrossSale");
  resRow("Sale Costs", "GrossSale*SaleCostPct", FMT.usd, "SaleCosts");
  // Guard rate=0 (interest-free) so the amortization closed form never divides
  // by zero — mirrors engine.loanBalanceAtExit's r===0 branch.
  resRow("Outstanding Debt", "IF(HoldMonths<=IOMonths,LoanAmount,IF(AllInRate=0,MAX(0,LoanAmount-MonthlyPmt*(HoldMonths-IOMonths)),LoanAmount*(1+AllInRate/12)^(HoldMonths-IOMonths)-MonthlyPmt*(((1+AllInRate/12)^(HoldMonths-IOMonths)-1)/(AllInRate/12))))", FMT.usd, "OutstandingDebt");
  resRow("Net Sale Proceeds", "GrossSale-SaleCosts-OutstandingDebt", FMT.usd, "NetSaleProceeds", false, true);

  let rr = resTop;
  const ret = (lab: string, formula: string, fmt: string, name?: string) => {
    label(ws.getCell(rr, 4), lab, { indent: 1 });
    const c = ws.getCell(rr, 5);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, fmt);
    rr++;
  };
  ret("Going-In Cap", `IF(PurchasePrice=0,"n/a",${noiY1}/PurchasePrice)`, FMT.pct2);
  ret("Stabilized Yield (on cost)", `IF(TotalUses=0,"n/a",${noiY1}/TotalUses)`, FMT.pct2);
  ret("Unlevered IRR", `IFERROR(IRR(${unlevRange}),"check inputs")`, FMT.pct1);
  ret("Levered IRR", `IFERROR(IRR(${levRange}),"check inputs")`, FMT.pct1, "LeveredIRR");
  ret("Unlevered Equity Multiple", `IF((PurchasePrice+ClosingCostsTotal+AcqFee)=0,"n/a",(SUM(${unlevOps}))/(PurchasePrice+ClosingCostsTotal+AcqFee))`, FMT.mult);
  ret("Levered Equity Multiple", `IF(Equity=0,"n/a",(SUM(${levcfRange})+NetSaleProceeds)/Equity)`, FMT.mult, "LeveredEM");
  r = Math.max(r, rr) + 2;

  // ── SENSITIVITY (computed at export; labelled static) ──
  buildSensitivityStatic(ws, r, inputs);
  void holdYears;
}

/**
 * Sensitivity grids computed at export from the (unit-tested) engine and
 * written as labelled static "IRR / EM" strings. NOT live formulas — see the
 * feature note on the fully-live-engine tradeoff. The center cell of each grid
 * equals the base case by construction (same engine).
 */
function buildSensitivityStatic(ws: ExcelJS.Worksheet, startRow: number, inp: UnderwriteInputs) {
  const grids = buildSensitivityGrids(inp);
  let r = startRow;
  sectionHeader(ws, r, "Sensitivity — Levered IRR / Equity Multiple", 1, 6); r++;
  label(ws.getCell(r, 1), "Computed at export from the assumptions above — re-export after changing them.", { color: MUTED, size: 9 });
  r++;

  const axisFmt = (vals: number[]) => (vals.every((v) => v < 1) ? FMT.pct2 : vals.every((v) => v < 1000) ? FMT.int : FMT.usd);
  for (const g of grids as SensGrid[]) {
    label(ws.getCell(r, 1), g.title, { bold: true, color: BRAND }); r++;
    // column header row
    g.colAxis.values.forEach((cv, ci) => {
      const c = ws.getCell(r, 2 + ci);
      c.value = cv;
      c.numFmt = axisFmt(g.colAxis.values);
      c.alignment = { horizontal: "center" };
      c.font = { name: ARIAL, size: 9, bold: ci === g.colAxis.baseIndex, color: MUTED };
    });
    r++;
    g.rowAxis.values.forEach((rv, ri) => {
      const rl = ws.getCell(r, 1);
      rl.value = rv;
      rl.numFmt = axisFmt(g.rowAxis.values);
      rl.font = { name: ARIAL, size: 9, bold: ri === g.rowAxis.baseIndex, color: MUTED };
      g.colAxis.values.forEach((_cv, ci) => {
        const c = ws.getCell(r, 2 + ci);
        c.value = formatSensCell(g.cells[ri][ci]);
        c.alignment = { horizontal: "center" };
        const isCenter = ri === g.rowAxis.baseIndex && ci === g.colAxis.baseIndex;
        c.font = { name: ARIAL, size: 9, bold: isCenter, color: INK };
      });
      r++;
    });
    r++;
  }
}
