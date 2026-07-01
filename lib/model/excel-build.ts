import "server-only";
import ExcelJS from "exceljs";
import type { UnderwritingModel } from "./types";
import { computeModel, type ModelInputs } from "./compute";
import { MODEL_INPUTS } from "./inputs";

/**
 * Build the first-draft underwriting model as a polished, multi-tab .xlsx —
 * generated entirely from the deal's reconciled data (no bundled template, no
 * third-party data). Structure is modeled on an institutional workbook: a Deal
 * Summary with sources & uses, returns, and an exit-cap × price sensitivity
 * grid; a year-by-year Cash Flow; sourced Assumptions; and a Conflicts audit.
 */

const BRAND = "FF114E54";
const BRAND_SOFT = "FFE7EEEC";
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

function sectionHeader(ws: WS, row: number, text: string, lastCol = "F") {
  const c = ws.getCell(`B${row}`);
  c.value = text.toUpperCase();
  c.font = { bold: true, size: 10, color: { argb: BRAND } };
  // brand underline across the section width
  const colNum = ws.getColumn(lastCol).number;
  for (let n = 2; n <= colNum; n++) {
    ws.getRow(row).getCell(n).border = {
      bottom: { style: "medium", color: { argb: BRAND } },
    };
  }
}

function kv(
  ws: WS,
  row: number,
  label: string,
  value: ExcelJS.CellValue,
  fmt?: string,
  opts: { bold?: boolean; color?: string } = {},
) {
  const l = ws.getCell(`B${row}`);
  l.value = label;
  l.font = { size: 10, color: { argb: MUTED }, bold: !!opts.bold };
  const v = ws.getCell(`C${row}`);
  v.value = value;
  if (fmt) v.numFmt = fmt;
  v.alignment = { horizontal: "right" };
  v.font = {
    size: 10,
    bold: !!opts.bold,
    color: { argb: opts.color ?? INK },
  };
}

function pctFrac(n: number | null | undefined): number | string {
  return n == null || !isFinite(n) ? "—" : n / 100;
}
function num(n: number | null | undefined): number | string {
  return n == null || !isFinite(n) ? "—" : n;
}

/* ------------------------------------------------------------------ */

function buildDealSummary(ws: WS, model: UnderwritingModel, dealName: string) {
  ws.columns = [
    { width: 2 },
    { width: 34 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  const r = model.returns;
  const i = model.inputs;

  title(ws, 2, dealName || "Untitled deal");
  subtitle(
    ws,
    3,
    `First-draft underwriting model · ${i.holdYears}-yr hold · generated from ${
      model.generatedFrom.join(", ") || "your documents"
    }`,
  );

  let row = 5;
  sectionHeader(ws, row, "Sources & Uses");
  row++;
  kv(ws, row++, "Purchase price", num(r.purchasePrice), USD);
  kv(ws, row++, "Loan proceeds", num(r.loanAmount), USD);
  kv(ws, row++, "Equity required", num(r.equity), USD, { bold: true });
  kv(ws, row++, "Loan-to-value", pctFrac(i.loan.ltvPct), PCT1);

  row++;
  sectionHeader(ws, row, "Loan assumptions");
  row++;
  kv(ws, row++, "Loan amount", num(r.loanAmount), USD);
  kv(ws, row++, "Interest rate", pctFrac(i.loan.ratePct), PCT2);
  kv(ws, row++, "Amortization (yrs)", num(i.loan.amortYears), NUM0);
  kv(ws, row++, "Interest-only (yrs)", num(i.loan.ioYears), NUM0);

  row++;
  sectionHeader(ws, row, "Return summary");
  row++;
  kv(ws, row++, "Going-in cap", pctFrac(r.goingInCapPct), PCT2, {
    bold: true,
  });
  kv(ws, row++, "Year-1 NOI", num(r.year1Noi), USD);
  kv(ws, row++, "Levered IRR", pctFrac(r.leveredIrrPct), PCT1, {
    bold: true,
    color: BRAND,
  });
  kv(ws, row++, "Unlevered IRR", pctFrac(r.unleveredIrrPct), PCT1);
  kv(ws, row++, "Cash-on-cash (Yr 1)", pctFrac(r.cashOnCashPct), PCT1);
  kv(ws, row++, "Equity multiple", num(r.equityMultiple), MULT, {
    bold: true,
    color: BRAND,
  });
  kv(ws, row++, "Profit", num(r.profit), USD);

  row++;
  sectionHeader(ws, row, "Residual / exit");
  row++;
  kv(ws, row++, "Exit cap", pctFrac(i.exitCapPct), PCT2);
  kv(ws, row++, "Exit NOI (forward)", num(r.exitNoi), USD);
  kv(ws, row++, "Gross sale value", num(r.exitValue), USD);
  kv(ws, row++, "Selling costs", pctFrac(i.sellingCostPct), PCT1);
  kv(ws, row++, "Exit loan balance", num(r.exitLoanBalance), USD);
  kv(ws, row++, "Net sale proceeds", num(r.netSaleProceeds), USD, {
    bold: true,
  });

  // ---- Sensitivity grid: levered IRR over exit cap × purchase price -------
  row += 2;
  sectionHeader(ws, row, "Sensitivity — levered IRR (exit cap × price)");
  row++;
  buildSensitivity(ws, model, row);
}

function buildSensitivity(ws: WS, model: UnderwritingModel, startRow: number) {
  const base = model.inputs;
  const baseExit = base.exitCapPct;
  const basePrice = base.purchasePrice;
  if (!baseExit || !basePrice) return;

  const priceFactors = [0.9, 0.95, 1.0, 1.05, 1.1];
  const exitDeltas = [-0.5, -0.25, 0, 0.25, 0.5]; // percentage points

  // Corner + price headers (row = startRow)
  const corner = ws.getCell(`B${startRow}`);
  corner.value = "Exit cap ↓ / Price →";
  corner.font = { italic: true, size: 9, color: { argb: MUTED } };
  corner.alignment = { horizontal: "left" };

  priceFactors.forEach((pf, ci) => {
    const cell = ws.getRow(startRow).getCell(3 + ci);
    cell.value = basePrice * pf;
    cell.numFmt = USD;
    cell.font = { bold: true, size: 9, color: { argb: INK } };
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAINT } };
    if (pf === 1) cell.fill.fgColor = { argb: BRAND_SOFT };
  });

  exitDeltas.forEach((ed, ri) => {
    const rowNum = startRow + 1 + ri;
    const exit = baseExit + ed;
    const label = ws.getRow(rowNum).getCell(2);
    label.value = exit / 100;
    label.numFmt = PCT2;
    label.font = { bold: true, size: 9, color: { argb: INK } };
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAINT } };
    if (ed === 0) label.fill.fgColor = { argb: BRAND_SOFT };

    priceFactors.forEach((pf, ci) => {
      const inp: ModelInputs = {
        ...base,
        exitCapPct: exit,
        purchasePrice: basePrice * pf,
        loan: { ...base.loan },
      };
      const out = computeModel(inp);
      const irrPct = out.returns.leveredIrrPct;
      const cell = ws.getRow(rowNum).getCell(3 + ci);
      cell.value = irrPct == null || !isFinite(irrPct) ? "—" : irrPct / 100;
      cell.numFmt = PCT1;
      cell.alignment = { horizontal: "right" };
      const isBase = ed === 0 && pf === 1;
      cell.font = {
        size: 9,
        bold: isBase,
        color: { argb: isBase ? BRAND : INK },
      };
      if (isBase)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BRAND_SOFT },
        };
    });
  });
}

/* ------------------------------------------------------------------ */

function buildCashFlow(ws: WS, model: UnderwritingModel) {
  const cf = model.cashFlow;
  const cols: Partial<ExcelJS.Column>[] = [{ width: 2 }, { width: 30 }];
  for (let k = 0; k < cf.length; k++) cols.push({ width: 15 });
  ws.columns = cols;

  title(ws, 2, "Operating cash flow");
  subtitle(ws, 3, "Levered, before sale. Straight-line growth — a first draft.");

  const headRow = 5;
  ws.getRow(headRow).getCell(2).value = "Line item";
  cf.forEach((c, idx) => {
    const cell = ws.getRow(headRow).getCell(3 + idx);
    cell.value = `Year ${c.year}`;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });
  const hc = ws.getRow(headRow).getCell(2);
  hc.font = { bold: true, size: 10, color: { argb: WHITE } };
  hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };

  const lines: {
    label: string;
    pick: (c: (typeof cf)[number]) => number;
    bold?: boolean;
    neg?: boolean;
  }[] = [
    { label: "Gross potential rent", pick: (c) => c.gpr },
    { label: "Less: vacancy loss", pick: (c) => -c.vacancyLoss, neg: true },
    { label: "Other income", pick: (c) => c.otherIncome },
    { label: "Effective gross income", pick: (c) => c.egi, bold: true },
    { label: "Operating expenses", pick: (c) => -c.opex, neg: true },
    { label: "Net operating income", pick: (c) => c.noi, bold: true },
    { label: "Capital reserve", pick: (c) => -(c.capexReserve ?? 0), neg: true },
    { label: "Debt service", pick: (c) => -c.debtService, neg: true },
    { label: "Levered cash flow", pick: (c) => c.cashFlow, bold: true },
  ];

  let row = headRow + 1;
  for (const ln of lines) {
    const lc = ws.getRow(row).getCell(2);
    lc.value = ln.label;
    lc.font = {
      size: 10,
      bold: !!ln.bold,
      color: { argb: ln.bold ? INK : MUTED },
    };
    cf.forEach((c, idx) => {
      const cell = ws.getRow(row).getCell(3 + idx);
      cell.value = Math.round(ln.pick(c));
      cell.numFmt = USD;
      cell.alignment = { horizontal: "right" };
      cell.font = {
        size: 10,
        bold: !!ln.bold,
        color: { argb: ln.neg ? MUTED : INK },
      };
    });
    if (ln.bold) {
      for (let n = 2; n <= cf.length + 2; n++)
        ws.getRow(row).getCell(n).border = {
          top: { style: "thin", color: { argb: LINE } },
        };
    }
    row++;
  }

  // Returns recap under the cash flow
  row += 1;
  sectionHeader(ws, row, "Returns", `${columnLetter(cf.length + 2)}`);
  row++;
  const r = model.returns;
  kv(ws, row++, "Levered IRR", pctFrac(r.leveredIrrPct), PCT1, {
    bold: true,
    color: BRAND,
  });
  kv(ws, row++, "Equity multiple", num(r.equityMultiple), MULT, { bold: true });
  kv(ws, row++, "Net sale proceeds", num(r.netSaleProceeds), USD);
}

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
      m.confidence === "high"
        ? PASS
        : m.confidence === "low"
          ? KILL
          : CAUTION;
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

/* ------------------------------------------------------------------ */

function buildConflicts(ws: WS, model: UnderwritingModel) {
  ws.columns = [{ width: 2 }, { width: 26 }, { width: 64 }];
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

/* ------------------------------------------------------------------ */

function buildStartHere(
  ws: WS,
  model: UnderwritingModel,
  dealName: string,
  providedKinds: string[],
) {
  ws.columns = [{ width: 2 }, { width: 30 }, { width: 14 }, { width: 64 }];

  const banner = ws.getRow(2);
  ws.mergeCells("B2:E2");
  banner.getCell(2).value =
    "FIRST-DRAFT MODEL — built from what you uploaded. Verify before relying on it; add more documents anytime to deepen it.";
  banner.getCell(2).font = { bold: true, color: { argb: WHITE }, size: 10 };
  banner.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND },
  };
  banner.getCell(2).alignment = { wrapText: true, vertical: "middle" };
  banner.height = 30;

  ws.getCell("B4").value = dealName || "Untitled deal";
  ws.getCell("B4").font = { bold: true, size: 15 };
  ws.getCell("B5").value = `Built from: ${model.generatedFrom.join(", ") || "your documents"}`;
  ws.getCell("B5").font = { size: 10, color: { argb: MUTED } };

  let row = 7;
  sectionHeader(ws, row, "What's in this workbook", "E");
  row++;
  const tabs = [
    ["Deal Summary", "Sources & uses, returns, and an exit-cap × price IRR sensitivity grid"],
    ["Cash Flow", "Year-by-year operating proforma to your exit"],
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
