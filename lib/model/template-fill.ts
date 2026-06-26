import "server-only";
import { promises as fs } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import type { UnderwritingModel } from "./types";
import { MODEL_INPUTS, MODEL_PASTES } from "./inputs";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "lib",
  "model",
  "assets",
  "template.xlsx",
);

const C = {
  brand: "FF114E54",
  ink: "FF18211F",
  caution: "FFB45309",
  pass: "FF15803D",
  faint: "FFF3F5F4",
  white: "FFFFFFFF",
};

function findMetricNum(model: UnderwritingModel, re: RegExp): number | null {
  for (const m of model.metrics) {
    if (re.test(m.key) || re.test(m.label)) {
      const n = Number(String(m.chosenValue).replace(/[^0-9.]/g, ""));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Populate the cleaned master template with a deal's reconciled inputs. */
export async function fillModelTemplate(
  model: UnderwritingModel,
  dealName: string,
  providedKinds: string[],
): Promise<Buffer> {
  const fileBuf = await fs.readFile(TEMPLATE_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuf as unknown as ArrayBuffer);

  const cf = wb.getWorksheet("Cash Flow");
  const i = model.inputs;
  const setNum = (addr: string, val: number | null | undefined) => {
    if (cf && val != null && isFinite(val)) cf.getCell(addr).value = val;
  };

  if (cf) {
    cf.getCell("D4").value = dealName;
    setNum("D12", i.purchasePrice);
    setNum("E23", i.loan.ltvPct / 100);
    setNum("D34", i.holdYears);
    setNum("D35", i.exitCapPct / 100);
    setNum("E45", i.vacancyPct / 100);
    setNum("E50", i.otherIncomeGrowthPct / 100);
    setNum("E51", i.rentGrowthPct / 100);
    setNum("E52", i.expenseGrowthPct / 100);
    setNum("E53", i.expenseGrowthPct / 100);
    const sf = findMetricNum(model, /\b(sf|rsf|square|rentable)\b/i);
    if (sf) setNum("D8", sf);
    const yr = findMetricNum(model, /year built|vintage/i);
    if (yr) setNum("D6", yr);
  }

  // Annotate the paste regions with exactly what to provide.
  annotate(wb, "Cash Flow", "C61", "◀ PASTE your ARGUS cash-flow export here — drives the monthly projection & returns");
  annotate(wb, "Rent Roll", "C28", "◀ UPLOAD the rent roll (or paste the ARGUS Tenant Rent Roll) — populates tenants & in-place rents");
  annotate(wb, "MLAs", "F18", "◀ PASTE the ARGUS Market Leasing Assumptions report here");
  annotate(wb, "Lease-Up", "C20", "◀ PASTE the ARGUS Leasing Activity report here");
  annotate(wb, "Argus (Lease Audit)", "A2", "◀ PASTE the ARGUS Lease Audit report here");

  buildStartHere(wb, dealName, providedKinds);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function annotate(
  wb: ExcelJS.Workbook,
  sheet: string,
  addr: string,
  text: string,
) {
  const ws = wb.getWorksheet(sheet);
  if (!ws) return;
  const cell = ws.getCell(addr);
  cell.value = text;
  cell.font = { bold: true, color: { argb: C.caution }, size: 10 };
}

function buildStartHere(
  wb: ExcelJS.Workbook,
  dealName: string,
  providedKinds: string[],
) {
  const ws = wb.addWorksheet("▶ Start Here", {
    properties: { tabColor: { argb: C.brand } },
  });
  ws.columns = [{ width: 30 }, { width: 14 }, { width: 78 }];

  const banner = ws.addRow([
    "FIRST-DRAFT MODEL — assumptions populated from your documents. Provide the items below to complete it.",
  ]);
  ws.mergeCells(banner.number, 1, banner.number, 3);
  banner.getCell(1).font = { bold: true, color: { argb: C.white } };
  banner.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.brand },
  };
  ws.addRow([dealName]).getCell(1).font = { bold: true, size: 14 };
  ws.addRow([]);

  const head = ws.addRow(["Input", "Status", "What it fills / what to do"]);
  head.eachCell((c) => {
    c.font = { bold: true, size: 9 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.faint } };
  });

  for (const inp of MODEL_INPUTS) {
    const provided = providedKinds.includes(inp.kind);
    const row = ws.addRow([
      inp.label,
      provided ? "✓ Provided" : "✗ Needed",
      inp.fills,
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = {
      bold: true,
      color: { argb: provided ? C.pass : C.caution },
    };
  }
  for (const p of MODEL_PASTES) {
    const row = ws.addRow([p.label, "Action", p.fills]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true, color: { argb: C.brand } };
  }

  ws.addRow([]);
  const note = ws.addRow([
    "Assumption cells are filled from the reconciliation on the Cash Flow tab. Anything marked “Needed” is blank with a note where it belongs — nothing is guessed.",
  ]);
  ws.mergeCells(note.number, 1, note.number, 3);
  note.getCell(1).font = { italic: true, color: { argb: "FF5F6B69" }, size: 9 };
  note.getCell(1).alignment = { wrapText: true };

  // Make Start Here the first tab. exceljs has no public reorder API, so set
  // the (untyped) orderNo the writer reads.
  wb.worksheets.forEach((sheet, idx) => {
    (sheet as { orderNo?: number }).orderNo = idx + 1;
  });
  (ws as { orderNo?: number }).orderNo = 0;
}
