import "server-only";
import ExcelJS from "exceljs";
import type { UnderwriteInputs } from "./engine";
import { computeUnderwrite } from "./engine";
import { defaultIncrements } from "./sensitivity";
import type { DerivedModel, InputSource } from "./inputs";
import { applyWorkbookBranding, type ExportBranding } from "@/lib/excel-branding";

/**
 * The institutional acquisition-template workbook (Feature 1). Visible tabs:
 * Cover, Deal Summary, Assumptions, Cash Flow (annual), Monthly Cash Flow,
 * Debt Schedule, Sensitivity. The MAIN MODEL is live — every number is an
 * Excel formula off the Assumptions inputs, so changing the exit cap
 * recalculates levered IRR, and the formulas mirror lib/underwrite/engine.ts
 * so the web app's numbers match the workbook.
 *
 * Sensitivity: a veryHidden engine tab holds one live cash-flow block per
 * scenario (3 pairings × 5×5 = 75); the visible Sensitivity tab presents
 * numeric IRR and EM matrices reading those blocks, with color scales. The
 * engine-tab layout (shared rows, scenarios from column C, IRR row 23 / EM
 * row 24) is load-bearing — workbook.test.ts addresses it directly.
 *
 * Conventions (stated on the Cover tab): blue = input, black = formula,
 * green = link, yellow fill = the assumptions most worth flexing. Monthly
 * Cash Flow presents operating lines at the model's ANNUAL convention ÷ 12
 * (with per-year tie-out checks against the annual tab); the Debt Schedule
 * is the exact month-by-month amortization and its exit balance ties to the
 * Deal Summary's Outstanding Debt.
 */

const ARIAL = "Arial";
const BLUE = { argb: "FF0000CC" };
const GREEN = { argb: "FF107C41" };
const INK = { argb: "FF18211F" };
const BRAND = { argb: "FF114E54" };
const MUTED = { argb: "FF5F6B69" };
const WHITE = { argb: "FFFFFFFF" };
const YELLOW = "FFFDF3D0";
const HEADFILL = "FF114E54";
const BANDFILL = "FFF2F1EC"; // light warm band for KPI tiles / zebra
const LINE = "FFE7E4DD";

const FMT = {
  usd: '$#,##0;($#,##0);"-"',
  psf: "$0.00",
  pct1: "0.0%",
  pct2: "0.00%",
  mult: '0.0"x"',
  int: "#,##0",
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
  c.font = { name: ARIAL, size: 10, bold: true, color: WHITE };
  ws.getRow(row).height = 16;
}
function titleRow(ws: ExcelJS.Worksheet, text: string) {
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: ARIAL, size: 16, bold: true, color: BRAND };
  ws.getRow(1).height = 22;
}
function bottomBorder(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let i = fromCol; i <= toCol; i++) {
    ws.getCell(row, i).border = { bottom: { style: "thin", color: { argb: LINE } } };
  }
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
/** Landscape, fit-to-width print setup — every tab prints clean. */
function printSetup(ws: ExcelJS.Worksheet, landscape = true) {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
}

export async function buildUnderwriteWorkbook(
  model: DerivedModel,
  branding?: ExportBranding | null,
): Promise<Buffer> {
  const { inputs } = model;
  const result = computeUnderwrite(inputs);
  const holdYears = result.holdYears;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = new Date(0);

  const wsCover = wb.addWorksheet("Cover", { views: [{ showGridLines: false }] });
  const wsSummary = wb.addWorksheet("Deal Summary", { views: [{ showGridLines: false }] });
  const wsAssum = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  const wsCf = wb.addWorksheet("Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
  });
  const wsMonthly = wb.addWorksheet("Monthly Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3, showGridLines: false }],
  });
  const wsDebt = wb.addWorksheet("Debt Schedule", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false }],
  });
  const wsSens = wb.addWorksheet("Sensitivity", { views: [{ showGridLines: false }] });
  // Hidden tab holding one live cash-flow block per sensitivity scenario.
  const wsEng = wb.addWorksheet("Sensitivity Engine", { state: "veryHidden" });

  // Tab colors: brand for the dashboard, muted sand for detail tabs.
  wsCover.properties.tabColor = { argb: HEADFILL };
  wsSummary.properties.tabColor = { argb: HEADFILL };
  wsSens.properties.tabColor = { argb: "FFA05A1C" };

  buildCover(wsCover, model, branding);
  buildAssumptions(wsAssum, inputs, model.sources);
  const cf = buildCashFlow(wsCf, inputs, holdYears);
  buildDealSummary(wsSummary, model, cf, holdYears);
  buildMonthlyCashFlow(wsMonthly, cf, inputs, holdYears);
  buildDebtSchedule(wsDebt, inputs);
  buildSensitivity(wsSens, wsEng, inputs);

  const visible = [wsCover, wsSummary, wsAssum, wsCf, wsMonthly, wsDebt, wsSens];
  visible.forEach((ws) => printSetup(ws, ws !== wsCover && ws !== wsAssum));
  // Monthly is 60+ columns — fitting it to one page width prints a smear.
  // Paginate across pages instead, repeating the line labels on each page.
  wsMonthly.pageSetup = {
    ...wsMonthly.pageSetup,
    fitToPage: false,
    printTitlesColumn: "A:A",
  };
  // The amortization table spans pages — repeat its header row on each.
  wsDebt.pageSetup = { ...wsDebt.pageSetup, printTitlesRow: "3:3" };

  // Firm branding (Feature 6): file properties + print chrome, plus the
  // Cover's "Prepared by" line (written in buildCover) — additive only, so
  // no formula anchor can shift.
  applyWorkbookBranding(wb, visible, model.meta.dealName, branding);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── COVER ─────────────────────────────────────────────────────────────────────
function buildCover(ws: ExcelJS.Worksheet, model: DerivedModel, branding?: ExportBranding | null) {
  const { meta } = model;
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 64;
  ws.getColumn(4).width = 3;

  // Brand banner.
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 4; c++) {
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    }
  }
  const firm = branding?.firmName?.trim();
  const banner = ws.getCell(2, 2);
  banner.value = firm ? firm.toUpperCase() : "UNDERWRITE COPILOT";
  banner.font = { name: ARIAL, size: 12, bold: true, color: WHITE };
  if (firm) {
    const by = ws.getCell(3, 2);
    by.value = "Powered by Underwrite Copilot";
    by.font = { name: ARIAL, size: 8, color: { argb: "FFB8CFCf".toUpperCase() } };
  }

  let r = 6;
  const title = ws.getCell(r, 2);
  title.value = meta.dealName;
  title.font = { name: ARIAL, size: 22, bold: true, color: BRAND };
  ws.getRow(r).height = 30;
  r++;
  label(ws.getCell(r, 2), "Acquisition screening model", { size: 12, color: MUTED });
  r += 2;

  const fact = (lab: string, val: string | null | undefined) => {
    label(ws.getCell(r, 2), lab, { bold: true, size: 10, color: MUTED });
    label(ws.getCell(r, 3), val || "—", { size: 10 });
    r++;
  };
  fact("Asset class", meta.assetClass);
  fact("Market", meta.market);
  fact("Address", meta.address);
  r++;

  sectionHeader(ws, r, "Contents", 2, 3);
  r++;
  const toc: [string, string][] = [
    ["Deal Summary", "KPIs, sources & uses, residual value, and return summary"],
    ["Assumptions", "Every input with its source (OM page, derived, or assumption)"],
    ["Cash Flow", "Annual property and investment cash flow through exit"],
    ["Monthly Cash Flow", "Monthly operating detail with per-year ties to the annual tab"],
    ["Debt Schedule", "Month-by-month amortization; exit payoff ties to Deal Summary"],
    ["Sensitivity", "Live IRR and equity-multiple matrices across 75 scenarios"],
  ];
  for (const [name, desc] of toc) {
    label(ws.getCell(r, 2), name, { bold: true, size: 10 });
    label(ws.getCell(r, 3), desc, { size: 10, color: MUTED });
    r++;
  }
  r++;

  sectionHeader(ws, r, "How to read this model", 2, 3);
  r++;
  const legend: [string, { argb: string }, string][] = [
    ["Blue", BLUE, "input — type over it and the model recalculates"],
    ["Black", INK, "formula — computed from the inputs"],
    ["Green", GREEN, "link — pulled from another tab"],
  ];
  for (const [name, color, desc] of legend) {
    const c = ws.getCell(r, 2);
    c.value = name;
    c.font = { name: ARIAL, size: 10, bold: true, color };
    label(ws.getCell(r, 3), desc, { size: 10, color: MUTED });
    r++;
  }
  const flexCell = ws.getCell(r, 2);
  flexCell.value = "Yellow fill";
  flexCell.font = { name: ARIAL, size: 10, bold: true, color: INK };
  flexCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  label(ws.getCell(r, 3), "the assumptions most worth flexing first", { size: 10, color: MUTED });
  r += 2;

  label(
    ws.getCell(r, 2),
    "Screening tool — verify against source documents before relying on any figure. Not investment advice.",
    { size: 8, color: MUTED },
  );
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
  // to change it.
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

// ── CASH FLOW (ANNUAL) ────────────────────────────────────────────────────────
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
    if (opts.bold) bottomBorder(ws, r, 1, fwdCol);
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
  const { meta } = model;
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 3;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 18;
  titleRow(ws, meta.dealName);

  const cfAddr = (row: number, col: number) => `'Cash Flow'!${cellA1(row, col)}`;
  const noiY1 = cfAddr(cf.rows.noi, cf.firstOpCol);
  const noiFwd = cfAddr(cf.rows.noi, cf.fwdCol);
  const dscrY1 = cfAddr(cf.rows.dscr, cf.firstOpCol);
  const unlevRange = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.y0Col)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levRange = `'Cash Flow'!${cellA1(cf.rows.lev, cf.y0Col)}:${cellA1(cf.rows.lev, cf.lastOpCol)}`;
  const unlevOps = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.firstOpCol)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levcfRange = `'Cash Flow'!${cellA1(cf.rows.levcf, cf.firstOpCol)}:${cellA1(cf.rows.levcf, cf.lastOpCol)}`;
  const levcfY1 = cfAddr(cf.rows.levcf, cf.firstOpCol);

  // ── KPI BAND ── five headline tiles the IC reads first. Values are live
  // formulas over the same named cells the rest of the book uses.
  let r = 3;
  const kpis: [string, string, string][] = [
    ["Purchase Price", "PurchasePrice", FMT.usd],
    ["Levered IRR", `IFERROR(IRR(${levRange}),"—")`, FMT.pct1],
    ["Equity Multiple", `IF(Equity=0,"n/a",(SUM(${levcfRange})+NetSaleProceeds)/Equity)`, FMT.mult],
    ["Year-1 Cash-on-Cash", `IF(Equity=0,"n/a",${levcfY1}/Equity)`, FMT.pct1],
    ["Year-1 DSCR", dscrY1, FMT.ratio],
  ];
  // Tiles live in columns 1,2,4,5 + one merged pair — keep it simple: five
  // tiles across columns 1..5 with the spacer col 3 carrying the middle tile.
  ws.getColumn(3).width = 18;
  kpis.forEach(([lab, formula, fmt], i) => {
    const col = 1 + i;
    const l = ws.getCell(r, col);
    l.value = lab.toUpperCase();
    l.font = { name: ARIAL, size: 8, bold: true, color: MUTED };
    l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
    l.alignment = { horizontal: "center", vertical: "middle" };
    const v = ws.getCell(r + 1, col);
    v.value = { formula } as ExcelJS.CellFormulaValue;
    v.font = { name: ARIAL, size: 13, bold: true, color: BRAND };
    v.numFmt = fmt;
    v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
    v.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(r).height = 14;
  ws.getRow(r + 1).height = 24;
  r += 3;

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
  r = Math.max(r, rr) + 1;

  label(ws.getCell(r, 1), "Sensitivity matrices live on the Sensitivity tab; monthly detail and the amortization table on their own tabs.", { color: MUTED, size: 9 });
  void holdYears;
}

// ── MONTHLY CASH FLOW ─────────────────────────────────────────────────────────
/**
 * Monthly operating detail at the model's ANNUAL convention ÷ 12 — every
 * month of operating year y shows one-twelfth of that year's annual line, and
 * debt service follows the annual IO-by-operating-year convention, so each
 * year's twelve months SUM EXACTLY to the annual tab (the tie row proves it
 * in-sheet). The Debt Schedule tab carries the exact month-by-month
 * amortization for balances and payoff.
 */
function buildMonthlyCashFlow(ws: ExcelJS.Worksheet, cf: CfMap, inp: UnderwriteInputs, holdYears: number) {
  const holdMonths = holdYears * 12;
  ws.getColumn(1).width = 34;
  const firstCol = 2;
  for (let m = 1; m <= holdMonths; m++) ws.getColumn(firstCol + m - 1).width = 12;

  titleRow(ws, "Monthly Cash Flow");
  label(ws.getCell(1, 3), "annual convention ÷ 12 — each year ties to the Cash Flow tab", { color: MUTED, size: 9 });
  label(ws.getCell(2, 1), "Month", { bold: true });
  label(ws.getCell(3, 1), "Operating Year", { bold: true, color: MUTED, size: 9 });
  for (let m = 1; m <= holdMonths; m++) {
    const col = firstCol + m - 1;
    const mc = ws.getCell(2, col);
    mc.value = m;
    mc.font = { name: ARIAL, size: 9, bold: true, color: INK };
    mc.alignment = { horizontal: "right" };
    const yc = ws.getCell(3, col);
    yc.value = `Yr ${Math.ceil(m / 12)}`;
    yc.font = { name: ARIAL, size: 8, color: MUTED };
    yc.alignment = { horizontal: "right" };
  }

  const annual = (key: string, y: number) => `'Cash Flow'!${cellA1(cf.rows[key], cf.firstOpCol + y - 1)}`;

  let r = 5;
  const rows: Record<string, number> = {};
  const line = (
    key: string,
    text: string,
    monthly: (m: number, y: number) => string,
    opts: { bold?: boolean } = {},
  ) => {
    rows[key] = r;
    label(ws.getCell(r, 1), text, { bold: opts.bold });
    for (let m = 1; m <= holdMonths; m++) {
      const y = Math.ceil(m / 12);
      const c = ws.getCell(r, firstCol + m - 1);
      c.value = { formula: monthly(m, y) } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd, INK, opts.bold);
      c.font = { ...c.font, size: 9 };
    }
    if (opts.bold) bottomBorder(ws, r, 1, firstCol + holdMonths - 1);
    r++;
  };

  sectionHeader(ws, r, "Property Cash Flow (monthly)", 1, Math.min(firstCol + holdMonths - 1, 14));
  r++;
  line("rent", "Rental Revenue", (_m, y) => `${annual("rent", y)}/12`);
  line("recoveries", "Expense Recoveries", (_m, y) => `${annual("recoveries", y)}/12`);
  line("other", "Other Revenue", (_m, y) => `${annual("other", y)}/12`);
  line("pgr", "Potential Gross Revenue", (_m, y) => `${annual("pgr", y)}/12`, { bold: true });
  line("vacancy", "General Vacancy & Credit Loss", (_m, y) => `${annual("vacancy", y)}/12`);
  line("egr", "Effective Gross Revenue", (_m, y) => `${annual("egr", y)}/12`, { bold: true });
  line("opex", "Operating Expenses (incl. mgmt fee)", (_m, y) => `${annual("opex", y)}/12`);
  line("noi", "Net Operating Income", (_m, y) => `${annual("noi", y)}/12`, { bold: true });
  line("capex", "Total Capital Expenditures", (_m, y) => `${annual("totalcapex", y)}/12`);
  line("amfee", "Asset Management Fees", (_m, y) => `${annual("amfee", y)}/12`);
  line("pcf", "Property Cash Flow Before Debt", (_m, y) => `${annual("pcf", y)}/12`, { bold: true });
  // Debt at the annual convention (IO by operating year) so the tie holds for
  // every input; the exact split lives on the Debt Schedule tab.
  line("debt", "Debt Service (annual convention)", (_m, y) => `-IF(${y}<=IOMonths/12,LoanAmount*AllInRate/12,MonthlyPmt)`);
  line("levcf", "Levered Cash Flow", (_m, y) => `(${annual("pcf", y)}/12)-IF(${y}<=IOMonths/12,LoanAmount*AllInRate/12,MonthlyPmt)`, { bold: true });

  // Tie row: at each year's December column, TRUE iff the year's 12 months sum
  // to the annual tab's levered cash flow (rounded to the dollar).
  r++;
  rows.tie = r;
  label(ws.getCell(r, 1), "Ties to annual Cash Flow", { bold: true, color: MUTED, size: 9 });
  for (let y = 1; y <= holdYears; y++) {
    const decCol = firstCol + y * 12 - 1;
    const from = cellA1(rows.levcf, firstCol + (y - 1) * 12);
    const to = cellA1(rows.levcf, decCol);
    const c = ws.getCell(r, decCol);
    c.value = { formula: `ROUND(SUM(${from}:${to})-${annual("levcf", y)},0)=0` } as ExcelJS.CellFormulaValue;
    c.font = { name: ARIAL, size: 9, bold: true };
    c.alignment = { horizontal: "right" };
    ws.addConditionalFormatting({
      ref: c.address,
      rules: [
        { type: "cellIs", operator: "equal", priority: 1, formulae: ["FALSE"], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
        { type: "cellIs", operator: "equal", priority: 2, formulae: ["TRUE"], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
      ],
    });
  }
  void inp;
}

// ── DEBT SCHEDULE ─────────────────────────────────────────────────────────────
/**
 * Exact month-by-month amortization: interest-only through IOMonths, then the
 * fixed payment splits into interest + principal off the running balance. The
 * exit-month balance ties to the Deal Summary's closed-form Outstanding Debt
 * (CheckDebtTie) — same math, iterated vs closed form.
 */
function buildDebtSchedule(ws: ExcelJS.Worksheet, inp: UnderwriteInputs) {
  const holdMonths = Math.max(1, inp.holdMonths);
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 10;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  titleRow(ws, "Debt Schedule");
  label(ws.getCell(1, 3), "exact monthly amortization — exit payoff ties to Deal Summary", { color: MUTED, size: 9 });

  const headRow = 3;
  const heads = ["Month", "Op Year", "Beginning Balance", "Payment", "Interest", "Principal", "Ending Balance"];
  heads.forEach((h, i) => {
    const c = ws.getCell(headRow, 1 + i);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: WHITE };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    c.alignment = { horizontal: i < 2 ? "center" : "right" };
  });

  const first = headRow + 1;
  for (let m = 1; m <= holdMonths; m++) {
    const r = first + m - 1;
    const y = Math.ceil(m / 12);
    const begin = m === 1 ? "LoanAmount" : cellA1(r - 1, 7);
    const mc = ws.getCell(r, 1);
    mc.value = m;
    mc.font = { name: ARIAL, size: 9, color: MUTED };
    mc.alignment = { horizontal: "center" };
    const yc = ws.getCell(r, 2);
    yc.value = y;
    yc.font = { name: ARIAL, size: 9, color: MUTED };
    yc.alignment = { horizontal: "center" };

    const put = (col: number, formula: string, bold = false) => {
      const c = ws.getCell(r, col);
      c.value = { formula } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd, INK, bold);
      c.font = { ...c.font, size: 9 };
    };
    put(3, begin);
    put(4, `IF(${m}<=IOMonths,${cellA1(r, 3)}*AllInRate/12,MonthlyPmt)`);
    put(5, `${cellA1(r, 3)}*AllInRate/12`);
    put(6, `${cellA1(r, 4)}-${cellA1(r, 5)}`);
    put(7, `MAX(0,${cellA1(r, 3)}-${cellA1(r, 6)})`);
    if (m % 12 === 0) bottomBorder(ws, r, 1, 7);
  }
  const lastRow = first + holdMonths - 1;

  // Tie check: iterated ending balance == the closed-form Outstanding Debt.
  const tieRow = lastRow + 2;
  label(ws.getCell(tieRow, 3), "Exit balance ties to Deal Summary", { bold: true, color: MUTED, size: 9 });
  const tie = ws.getCell(tieRow, 7);
  tie.value = { formula: `ROUND(${cellA1(lastRow, 7)}-OutstandingDebt,0)=0` } as ExcelJS.CellFormulaValue;
  tie.name = "CheckDebtTie";
  tie.font = { name: ARIAL, size: 9, bold: true };
  tie.alignment = { horizontal: "right" };
  ws.addConditionalFormatting({
    ref: tie.address,
    rules: [
      { type: "cellIs", operator: "equal", priority: 1, formulae: ["FALSE"], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 2, formulae: ["TRUE"], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
    ],
  });

  // Annual rollup: interest / principal / total by operating year.
  let r = tieRow + 2;
  sectionHeader(ws, r, "Annual Rollup", 1, 7);
  r++;
  ["Op Year", "", "", "Payments", "Interest", "Principal", "Year-End Balance"].forEach((h, i) => {
    if (!h) return;
    const c = ws.getCell(r, 1 + i);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: MUTED };
    c.alignment = { horizontal: i === 0 ? "center" : "right" };
  });
  r++;
  const years = Math.ceil(holdMonths / 12);
  for (let y = 1; y <= years; y++) {
    const from = first + (y - 1) * 12;
    const to = Math.min(first + y * 12 - 1, lastRow);
    const yc = ws.getCell(r, 1);
    yc.value = y;
    yc.font = { name: ARIAL, size: 9, color: MUTED };
    yc.alignment = { horizontal: "center" };
    const put = (col: number, formula: string) => {
      const c = ws.getCell(r, col);
      c.value = { formula } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd);
      c.font = { ...c.font, size: 9 };
    };
    put(4, `SUM(${cellA1(from, 4)}:${cellA1(to, 4)})`);
    put(5, `SUM(${cellA1(from, 5)}:${cellA1(to, 5)})`);
    put(6, `SUM(${cellA1(from, 6)}:${cellA1(to, 6)})`);
    put(7, cellA1(to, 7));
    r++;
  }
}

// ── SENSITIVITY ───────────────────────────────────────────────────────────────
/**
 * LIVE sensitivity: the hidden engine tab holds one compact cash-flow block per
 * scenario cell (3 pairings × 5×5 = 75), and the visible Sensitivity tab
 * presents numeric IRR and EM matrices reading those blocks — edit any
 * assumption and every matrix recomputes with the rest of the model.
 *
 * The de-fragiliser: the sensitivity axes (exit cap, hold, price, LTC, rate)
 * never touch NOI, so NOI-per-year and capex-per-year are IDENTICAL across all
 * scenarios — computed once in shared columns and referenced by every block.
 * Each scenario column is then just its overrides + loan/equity/debt/sale +
 * a levered cash-flow vector. A scenario's hold sets which year the sale lands;
 * years beyond it are 0, and trailing zeros don't change IRR — so a single
 * fixed-height block (tall enough for the longest hold) serves every scenario.
 *
 * LOAD-BEARING LAYOUT: workbook.test.ts reads the engine tab directly —
 * scenarios start at column C in grid order (index = gi*25 + ri*5 + ci), the
 * IRR sits on sheet row 23 and the EM on row 24. Do not add rows to a block.
 */
function buildSensitivity(
  wsSens: ExcelJS.Worksheet,
  eng: ExcelJS.Worksheet,
  inp: UnderwriteInputs,
) {
  const inc = defaultIncrements(inp);
  const steps = [-2, -1, 0, 1, 2];
  const capVals = steps.map((k) => Math.max(0.0025, inp.exitCapPct + k * inc.capStep));
  const holdVals = steps.map((k) => Math.max(12, inp.holdMonths + k * inc.monthsStep));
  const priceVals = steps.map((k) => Math.max(0, inp.purchasePrice + k * inc.priceStep));
  const ltcVals = steps.map((k) => Math.max(0, inp.ltc + k * inc.ltcStep));
  const rateVals = steps.map((k) => Math.max(0.0025, inp.allInRatePct + k * inc.rateStep));
  const maxHoldM = Math.max(...holdVals, inp.holdMonths);
  const maxYears = Math.max(1, Math.ceil(maxHoldM / 12));

  // ── shared rows on the engine tab (column B), referenced by every scenario ──
  // NOI at yearsElapsed e (0..maxYears): operating year y uses e=y-1; the
  // forward exit NOI at hold h uses e=h.
  eng.getColumn(1).width = 22;
  let sr = 1;
  eng.getCell(sr, 1).value = "shared: NOI by years-elapsed"; sr++;
  const noiRow: number[] = []; // noiRow[e] = sheet row of NOI at years-elapsed e
  for (let e = 0; e <= maxYears; e++) {
    const rent = `(InPlaceRent*(1+RentGrowth)^${e})`;
    const rec = `(Recoveries*(1+ExpGrowth)^${e})`;
    const oth = `(OtherRev*(1+RentGrowth)^${e})`;
    const egr = `((${rent}+${rec}+${oth})*(1-VacancyPct))`;
    const opex = `(TotalBaseOpex*(1+ExpGrowth)^${e}+${egr}*MgmtFeePct)`;
    eng.getCell(sr, 1).value = `NOI e=${e}`;
    eng.getCell(sr, 2).value = { formula: `${egr}-${opex}` } as ExcelJS.CellFormulaValue;
    noiRow[e] = sr;
    sr++;
  }
  const capexRow: number[] = []; // capexRow[y] = sheet row of total capex for op year y
  for (let y = 1; y <= maxYears; y++) {
    const rent = `(InPlaceRent*(1+RentGrowth)^${y - 1})`;
    eng.getCell(sr, 1).value = `capex y=${y}`;
    eng.getCell(sr, 2).value = {
      formula: `TIPSF*RSF+LCPct*${rent}+ReservesPSF*RSF*(1+ExpGrowth)^${y - 1}+IF(${y}=1,CapImprovements,0)`,
    } as ExcelJS.CellFormulaValue;
    capexRow[y] = sr;
    sr++;
  }
  const B = (row: number) => `B${row}`;

  // ── one scenario column; returns its IRR / EM cell addresses ──
  let col = 3; // scenarios start at column C
  const scenario = (o: {
    price?: number; ltc?: number; rate?: number; cap?: number; holdM?: number;
  }): { irr: string; em: string } => {
    const c = col++;
    const A1 = (row: number) => `${eng.getCell(row, c).address}`;
    let row = 1;
    const put = (formula: string): string => {
      eng.getCell(row, c).value = { formula } as ExcelJS.CellFormulaValue;
      const a = A1(row);
      row++;
      return a;
    };
    const putN = (n: number): string => {
      eng.getCell(row, c).value = n;
      const a = A1(row);
      row++;
      return a;
    };
    // overrides (a literal when perturbed, else the global named range)
    const price = o.price != null ? putN(o.price) : put("PurchasePrice");
    const ltc = o.ltc != null ? putN(o.ltc) : put("LTC");
    const rate = o.rate != null ? putN(o.rate) : put("AllInRate");
    const cap = o.cap != null ? putN(o.cap) : put("ExitCap");
    const holdM = o.holdM != null ? putN(o.holdM) : put("HoldMonths");
    // derived
    const loanBasis = put(`${price}+ClosingCostsTotal+MIN(AcqFeePct*${price},AcqFeeCap)`);
    const loan = put(`${ltc}*${loanBasis}`);
    const equity = put(`${loanBasis}+FinCostPct*${loan}-${loan}`);
    const mpmt = put(`IF(${rate}=0,${loan}/AmortMonths,${loan}*(${rate}/12)/(1-(1+${rate}/12)^(-AmortMonths)))`);
    const holdY = put(`ROUND(${holdM}/12,0)`);
    // forward NOI at exit = NOI at years-elapsed = holdY → INDEX the shared col
    const fwd = put(`INDEX($B$${noiRow[0]}:$B$${noiRow[maxYears]},${holdY}+1)`);
    const gross = put(`IF(${cap}=0,0,${fwd}/${cap})`);
    const exitDebt = put(
      `IF(${holdM}<=IOMonths,${loan},IF(${rate}=0,MAX(0,${loan}-${mpmt}*(${holdM}-IOMonths)),${loan}*(1+${rate}/12)^(${holdM}-IOMonths)-${mpmt}*(((1+${rate}/12)^(${holdM}-IOMonths)-1)/(${rate}/12))))`,
    );
    const netSale = put(`${gross}-${gross}*SaleCostPct-${exitDebt}`);
    // levered cash-flow vector: year 0 = -equity; years 1..maxYears
    const y0 = put(`-${equity}`);
    const yCells: string[] = [y0];
    for (let y = 1; y <= maxYears; y++) {
      // Interest-only while within the IO PERIOD (IOMonths), not the hold —
      // mirrors engine.annualDebtService (y*12 <= ioMonths).
      const ds = `IF(${y}<=IOMonths/12,${loan}*${rate},${mpmt}*12)`;
      const opCf = `${B(noiRow[y - 1])}-${B(capexRow[y])}-${equity}*AMFeePctEquity-(${ds})`;
      const sale = `IF(${y}=${holdY},${netSale},0)`;
      yCells.push(put(`IF(${y}>${holdY},0,(${opCf})+${sale})`));
    }
    const irr = put(`IFERROR(IRR(${yCells[0]}:${yCells[yCells.length - 1]}),"")`);
    const em = put(`IFERROR(SUM(${yCells[1]}:${yCells[yCells.length - 1]})/${equity},"")`);
    return { irr: `'Sensitivity Engine'!${irr}`, em: `'Sensitivity Engine'!${em}` };
  };

  // ── the visible matrices ──
  interface GridDef { title: string; rowLabel: string; colLabel: string; rowVals: number[]; colVals: number[]; override: (rv: number, cv: number) => Parameters<typeof scenario>[0]; }
  const grids: GridDef[] = [
    { title: "Exit Cap × Hold Period", rowLabel: "Hold (months)", colLabel: "Exit cap", rowVals: holdVals, colVals: capVals, override: (h, cp) => ({ holdM: h, cap: cp }) },
    { title: "Exit Cap × Purchase Price", rowLabel: "Price", colLabel: "Exit cap", rowVals: priceVals, colVals: capVals, override: (p, cp) => ({ price: p, cap: cp }) },
    { title: "Leverage × Rate", rowLabel: "All-in rate", colLabel: "LTC", rowVals: rateVals, colVals: ltcVals, override: (rt, lt) => ({ rate: rt, ltc: lt }) },
  ];
  const axisFmt = (vals: number[]) => (vals.every((v) => v < 1) ? FMT.pct2 : vals.every((v) => v < 1000) ? FMT.int : FMT.usd);

  wsSens.getColumn(1).width = 16;
  for (let c = 2; c <= 13; c++) wsSens.getColumn(c).width = 11;
  titleRow(wsSens, "Sensitivity");
  let r = 2;
  label(wsSens.getCell(r, 1), "Live — every cell is a full re-run of the model. Change any assumption and all 75 scenarios recompute.", { color: MUTED, size: 9 });
  r += 2;

  const IRR_COLS = { from: 2, to: 6 }; // B..F
  const EM_COLS = { from: 8, to: 12 }; // H..L

  for (const g of grids) {
    // One scenario per cell, shared by the IRR matrix and the EM matrix.
    const cells: { irr: string; em: string }[][] = g.rowVals.map((rv) =>
      g.colVals.map((cv) => scenario(g.override(rv, cv))),
    );

    sectionHeader(wsSens, r, g.title, 1, 12);
    r++;
    label(wsSens.getCell(r, IRR_COLS.from), "LEVERED IRR", { bold: true, color: MUTED, size: 8 });
    label(wsSens.getCell(r, EM_COLS.from), "EQUITY MULTIPLE", { bold: true, color: MUTED, size: 8 });
    label(wsSens.getCell(r, 1), `${g.rowLabel} ↓ · ${g.colLabel} →`, { color: MUTED, size: 8 });
    r++;

    // Column axis (shared header row for both matrices).
    g.colVals.forEach((cv, ci) => {
      for (const base of [IRR_COLS.from, EM_COLS.from]) {
        const cell = wsSens.getCell(r, base + ci);
        cell.value = cv;
        cell.numFmt = axisFmt(g.colVals);
        cell.alignment = { horizontal: "center" };
        cell.font = { name: ARIAL, size: 9, bold: ci === 2, color: MUTED };
      }
    });
    r++;

    const bodyTop = r;
    g.rowVals.forEach((rv, ri) => {
      const rl = wsSens.getCell(r, 1);
      rl.value = rv;
      rl.numFmt = axisFmt(g.rowVals);
      rl.font = { name: ARIAL, size: 9, bold: ri === 2, color: MUTED };
      g.colVals.forEach((cv, ci) => {
        void cv;
        const { irr, em } = cells[ri][ci];
        const ic = wsSens.getCell(r, IRR_COLS.from + ci);
        ic.value = { formula: `IF(${irr}="","",${irr})` } as ExcelJS.CellFormulaValue;
        ic.numFmt = FMT.pct1;
        ic.alignment = { horizontal: "center" };
        ic.font = { name: ARIAL, size: 9, bold: ri === 2 && ci === 2, color: INK };
        const ec = wsSens.getCell(r, EM_COLS.from + ci);
        ec.value = { formula: `IF(${em}="","",${em})` } as ExcelJS.CellFormulaValue;
        ec.numFmt = FMT.mult;
        ec.alignment = { horizontal: "center" };
        ec.font = { name: ARIAL, size: 9, bold: ri === 2 && ci === 2, color: INK };
      });
      r++;
    });
    const bodyBottom = r - 1;

    // Color scales: red → white → green, low to high (higher is better for
    // both IRR and EM). Excel renders these; recalc engines just ignore them.
    for (const cols of [IRR_COLS, EM_COLS]) {
      wsSens.addConditionalFormatting({
        ref: `${cellA1(bodyTop, cols.from)}:${cellA1(bodyBottom, cols.to)}`,
        rules: [
          {
            type: "colorScale",
            priority: 1,
            cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
            color: [{ argb: "FFF4CCCC" }, { argb: "FFFFFFFF" }, { argb: "FFCFE7DC" }],
          } as never,
        ],
      });
    }
    r += 2;
  }
  label(wsSens.getCell(r, 1), "Center row/column = the model's base case. Bold cell = base scenario.", { color: MUTED, size: 9 });
}
