import "server-only";
import ExcelJS from "exceljs";
import type { UnderwritingModel, ReconciledMetric } from "./types";

const BRAND = "FF24406E";
const INK = "FF18211F";
const MUTED = "FF5F6B69";
const HEADER_FILL = "FFF3F5F4";
const CONF_FILL: Record<string, string> = {
  high: "FFE6F4EA",
  medium: "FFFCF0E0",
  low: "FFFBE6E4",
};

const USD = "$#,##0";
const PCT = '0.00"%"';

function headerRow(ws: ExcelJS.Worksheet, cells: string[]) {
  const row = ws.addRow(cells);
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK }, size: 9 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { vertical: "top", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FFE7E4DD" } } };
  });
  return row;
}

/** Build the professional, multi-sheet first-draft workbook. */
export async function buildModelWorkbook(
  model: UnderwritingModel,
  dealName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";

  buildSummary(wb, model, dealName);
  buildAssumptions(wb, model);
  buildCashFlow(wb, model);
  buildConflicts(wb, model);
  buildSources(wb, model);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildSummary(
  wb: ExcelJS.Workbook,
  model: UnderwritingModel,
  dealName: string,
) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 30 }, { width: 22 }, { width: 60 }];

  const banner = ws.addRow([
    "FIRST-DRAFT MODEL — verify every figure before relying on it.",
  ]);
  ws.mergeCells(banner.number, 1, banner.number, 3);
  banner.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  banner.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND },
  };
  ws.addRow([dealName]).getCell(1).font = { bold: true, size: 14 };
  ws.addRow([
    "Conflicts are on the Conflicts sheet; low-confidence assumptions are shaded on the Assumptions sheet.",
  ]).getCell(1).font = { italic: true, color: { argb: MUTED }, size: 9 };
  ws.addRow([]);

  const r = model.returns;
  headerRow(ws, ["Returns", "Value", ""]);
  const rows: [string, number | null, string][] = [
    ["Purchase price", r.purchasePrice, USD],
    ["Loan amount", r.loanAmount, USD],
    ["Equity", r.equity, USD],
    ["Going-in cap", r.goingInCapPct, PCT],
    ["Year-1 NOI", r.year1Noi, USD],
    ["Exit NOI (forward)", r.exitNoi, USD],
    ["Exit value", r.exitValue, USD],
    ["  less selling costs", -(r.exitValue - r.netSaleProceeds - r.exitLoanBalance), USD],
    ["  less loan payoff", -r.exitLoanBalance, USD],
    ["Net sale proceeds", r.netSaleProceeds, USD],
    ["Levered IRR", r.leveredIrrPct, PCT],
    ["Unlevered IRR", r.unleveredIrrPct, PCT],
    ["Cash-on-cash (Yr 1)", r.cashOnCashPct, PCT],
    ["Equity multiple", r.equityMultiple, '0.00"x"'],
    ["Profit", r.profit, USD],
  ];
  for (const [label, value, fmt] of rows) {
    const row = ws.addRow([label, value ?? "n/a"]);
    row.getCell(1).font = { color: { argb: INK } };
    if (typeof value === "number") {
      row.getCell(2).numFmt = fmt;
      row.getCell(2).font = { bold: true };
    }
  }

  ws.addRow([]);
  headerRow(ws, ["How the sources reconciled", "", ""]);
  const sumRow = ws.addRow([model.summary]);
  ws.mergeCells(sumRow.number, 1, sumRow.number, 3);
  sumRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  sumRow.height = 60;
}

function sourceText(m: ReconciledMetric): string {
  return m.sources
    .map(
      (s) =>
        `${s.doc}: ${s.value}${s.basis ? ` (${s.basis})` : ""}${
          s.locator ? ` [${s.locator}]` : ""
        }`,
    )
    .join("\n");
}

function buildAssumptions(wb: ExcelJS.Workbook, model: UnderwritingModel) {
  const ws = wb.addWorksheet("Assumptions");
  ws.columns = [
    { width: 26 },
    { width: 18 },
    { width: 16 },
    { width: 30 },
    { width: 13 },
    { width: 48 },
  ];
  headerRow(ws, [
    "Assumption",
    "Value",
    "Source (winner)",
    "Sources",
    "Confidence",
    "Why this value",
  ]);
  for (const m of model.metrics) {
    const row = ws.addRow([
      m.label,
      m.chosenValue,
      m.authority,
      sourceText(m),
      m.confidence,
      m.rationale,
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true };
    // Every figure traceable: hovering the value shows where it came from.
    row.getCell(2).note = `Chosen from ${m.authority}.\n${sourceText(m)}\n\n${m.rationale}`;
    const conf = row.getCell(5);
    conf.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: CONF_FILL[m.confidence] ?? "FFFFFFFF" },
    };
    if (m.isConflict) {
      row.getCell(1).font = { bold: true, color: { argb: "FFB23A30" } };
    }
  }
}

function buildCashFlow(wb: ExcelJS.Workbook, model: UnderwritingModel) {
  const ws = wb.addWorksheet("Cash Flow");
  const years = model.cashFlow.map((c) => `Year ${c.year}`);
  ws.columns = [
    { width: 24 },
    ...years.map(() => ({ width: 15 })),
  ];
  headerRow(ws, ["", ...years]);

  // Income/expense rows store values; EGI / NOI / Cash flow are live formulas.
  const colLetter = (i: number) => ws.getColumn(i + 2).letter;
  const addValues = (
    label: string,
    pick: (c: (typeof model.cashFlow)[number]) => number,
    sign = 1,
  ) => {
    const row = ws.addRow([label, ...model.cashFlow.map((c) => sign * pick(c))]);
    row.eachCell((c, col) => {
      if (col > 1) c.numFmt = USD;
    });
    row.getCell(1).font = { color: { argb: INK } };
    return row.number;
  };

  const rGpr = addValues("Gross potential rent", (c) => c.gpr);
  const rVac = addValues("Vacancy loss", (c) => c.vacancyLoss, -1);
  const rOther = addValues("Other income", (c) => c.otherIncome);
  const egiRow = ws.addRow(["Effective gross income"]);
  egiRow.getCell(1).font = { bold: true };
  model.cashFlow.forEach((_, i) => {
    const L = colLetter(i);
    egiRow.getCell(i + 2).value = {
      formula: `${L}${rGpr}+${L}${rVac}+${L}${rOther}`,
    };
    egiRow.getCell(i + 2).numFmt = USD;
    egiRow.getCell(i + 2).font = { bold: true };
  });
  const rEgi = egiRow.number;
  const rOpexRow = addValues("Operating expenses", (c) => c.opex, -1);
  const noiRow = ws.addRow(["Net operating income"]);
  noiRow.getCell(1).font = { bold: true };
  model.cashFlow.forEach((_, i) => {
    const L = colLetter(i);
    noiRow.getCell(i + 2).value = { formula: `${L}${rEgi}+${L}${rOpexRow}` };
    noiRow.getCell(i + 2).numFmt = USD;
    noiRow.getCell(i + 2).font = { bold: true };
  });
  const rNoi = noiRow.number;
  const rDs = addValues("Debt service", (c) => c.debtService, -1);
  const cfRow = ws.addRow(["Levered cash flow"]);
  cfRow.getCell(1).font = { bold: true, color: { argb: BRAND } };
  model.cashFlow.forEach((_, i) => {
    const L = colLetter(i);
    cfRow.getCell(i + 2).value = { formula: `${L}${rNoi}+${L}${rDs}` };
    cfRow.getCell(i + 2).numFmt = USD;
    cfRow.getCell(i + 2).font = { bold: true, color: { argb: BRAND } };
  });

  ws.addRow([]);
  const note = ws.addRow([
    "Vacancy, expenses, and debt service are stored as negatives so EGI / NOI / cash flow are live sums.",
  ]);
  note.getCell(1).font = { italic: true, color: { argb: MUTED }, size: 9 };
}

function buildConflicts(wb: ExcelJS.Workbook, model: UnderwritingModel) {
  const ws = wb.addWorksheet("Conflicts");
  ws.columns = [
    { width: 24 },
    { width: 44 },
    { width: 18 },
    { width: 18 },
    { width: 44 },
  ];
  headerRow(ws, [
    "Metric",
    "What each source said",
    "Chosen",
    "Source (winner)",
    "Why it won",
  ]);
  if (model.conflicts.length === 0) {
    const row = ws.addRow(["No cross-source conflicts found."]);
    row.getCell(1).font = { italic: true, color: { argb: MUTED } };
    return;
  }
  for (const m of model.conflicts) {
    const row = ws.addRow([
      m.label,
      sourceText(m),
      m.chosenValue,
      m.authority,
      m.rationale,
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: "FFB23A30" } };
    row.getCell(3).font = { bold: true };
    row.getCell(3).note = `Chosen from ${m.authority}.\n${sourceText(m)}\n\n${m.rationale}`;
  }
}

function buildSources(wb: ExcelJS.Workbook, model: UnderwritingModel) {
  const ws = wb.addWorksheet("Sources");
  ws.columns = [{ width: 70 }];
  headerRow(ws, ["Documents used"]);
  for (const d of model.generatedFrom) ws.addRow([d]);
  ws.addRow([]);
  headerRow(ws, ["Caveats — verify before relying on this model"]);
  for (const c of model.caveats) {
    const row = ws.addRow([`• ${c}`]);
    row.getCell(1).alignment = { wrapText: true };
  }
}
