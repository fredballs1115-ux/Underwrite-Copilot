import "server-only";
import ExcelJS from "exceljs";
import { applyWorkbookBranding, type ExportBranding } from "@/lib/excel-branding";
import { STAGES, STAGE_LABEL, normalizeStage, type Stage } from "@/lib/stages";
import { parseMoney, parsePct } from "@/lib/criteria";

/**
 * The whole pipeline as one meeting-ready Excel workbook: a stage-grouped
 * deal sheet with verdict/buy-box markers, plus a summary sheet with the
 * counts a pipeline meeting opens with. Same visual language as the
 * underwriting workbook (lib/underwrite/workbook.ts).
 */

const BRAND = "FF114E54";
const BRAND_SOFT = "FFE7EEEC";
const INK = "FF18211F";
const MUTED = "FF5F6B69";
const FAINT = "FFF3F5F4";
const WHITE = "FFFFFFFF";
const PASS = "FF1B7A5E";
const CAUTION = "FFA05A1C";
const KILL = "FFB23A30";

const USD = "$#,##0";
const PCT2 = "0.00%";

export interface PipelineExportRow {
  name: string;
  stage: string;
  assetClass: string;
  market: string;
  /** raw extracted strings — parsed for number cells, kept verbatim otherwise */
  price: string | null;
  cap: string | null;
  fit: "fits" | "near" | "outside" | null;
  verdict: string | null; // pass | caution | pass_on
  offersDue: string | null; // YYYY-MM-DD
  createdAt: string; // ISO
  addedBy: string | null;
}

const FIT_LABEL: Record<string, { label: string; color: string }> = {
  fits: { label: "Fits", color: PASS },
  near: { label: "Near", color: CAUTION },
  outside: { label: "Outside", color: KILL },
};

const VERDICT_LABEL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: PASS },
  caution: { label: "Caution", color: CAUTION },
  pass_on: { label: "No-go", color: KILL },
};

export async function buildPipelineWorkbook(
  rows: PipelineExportRow[],
  exportedAt: Date,
  branding?: ExportBranding | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = exportedAt;

  /* ------------------------------ Pipeline ------------------------------ */
  const ws = wb.addWorksheet("Pipeline", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  ws.columns = [
    { width: 2 },
    { width: 34 }, // Deal
    { width: 20 }, // Stage
    { width: 13 }, // Asset
    { width: 22 }, // Market
    { width: 14 }, // Price
    { width: 10 }, // Cap
    { width: 10 }, // Buy box
    { width: 10 }, // Verdict
    { width: 12 }, // Offers due
    { width: 12 }, // Added
    { width: 18 }, // Added by
  ];

  const t = ws.getCell("B2");
  t.value = "Pipeline";
  t.font = { bold: true, size: 16, color: { argb: INK } };
  const st = ws.getCell("D2");
  st.value = `${rows.length} deal${rows.length === 1 ? "" : "s"} · exported ${exportedAt.toISOString().slice(0, 10)} · Underwrite Copilot`;
  st.font = { size: 10, color: { argb: MUTED }, italic: true };

  const HEADERS = [
    "Deal",
    "Stage",
    "Asset class",
    "Market",
    "Price",
    "Cap rate",
    "Buy box",
    "Verdict",
    "Offers due",
    "Added",
    "Added by",
  ];
  const headRow = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = headRow.getCell(i + 2);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.alignment = {
      horizontal: i >= 4 && i <= 5 ? "right" : "left",
      vertical: "middle",
    };
  });
  headRow.height = 18;

  // Group rows by normalized stage, in ladder order.
  const byStage = new Map<Stage, PipelineExportRow[]>(
    STAGES.map((s) => [s, []]),
  );
  for (const r of rows) byStage.get(normalizeStage(r.stage))!.push(r);

  let rowN = 5;
  const today = exportedAt.toISOString().slice(0, 10);
  for (const stage of STAGES) {
    const group = byStage.get(stage)!;
    if (!group.length) continue;
    const isDead = stage === "dead";

    // Stage band.
    ws.mergeCells(`B${rowN}:L${rowN}`);
    const band = ws.getCell(`B${rowN}`);
    band.value = `${STAGE_LABEL[stage]}  ·  ${group.length}`;
    band.font = { bold: true, size: 10, color: { argb: isDead ? MUTED : BRAND } };
    band.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isDead ? FAINT : BRAND_SOFT },
    };
    ws.getRow(rowN).height = 16;
    rowN++;

    for (const d of group) {
      const row = ws.getRow(rowN);
      const baseFont = { size: 10, color: { argb: isDead ? MUTED : INK } };

      row.getCell(2).value = d.name;
      row.getCell(2).font = { ...baseFont, bold: !isDead };
      row.getCell(3).value = STAGE_LABEL[normalizeStage(d.stage)];
      row.getCell(3).font = baseFont;
      row.getCell(4).value = d.assetClass === "auto" ? "—" : d.assetClass;
      row.getCell(4).font = baseFont;
      row.getCell(5).value = d.market || "—";
      row.getCell(5).font = baseFont;

      const priceNum = d.price ? parseMoney(d.price) : null;
      const priceCell = row.getCell(6);
      if (priceNum != null) {
        priceCell.value = priceNum;
        priceCell.numFmt = USD;
      } else {
        priceCell.value = d.price ?? "—";
      }
      priceCell.font = baseFont;
      priceCell.alignment = { horizontal: "right" };

      const capNum = d.cap ? parsePct(d.cap) : null;
      const capCell = row.getCell(7);
      if (capNum != null) {
        capCell.value = capNum / 100;
        capCell.numFmt = PCT2;
      } else {
        capCell.value = d.cap ?? "—";
      }
      capCell.font = baseFont;
      capCell.alignment = { horizontal: "right" };

      const fit = d.fit ? FIT_LABEL[d.fit] : null;
      row.getCell(8).value = fit?.label ?? "—";
      row.getCell(8).font = fit
        ? { size: 10, bold: true, color: { argb: fit.color } }
        : baseFont;

      const v = d.verdict ? VERDICT_LABEL[d.verdict] : null;
      row.getCell(9).value = v?.label ?? "—";
      row.getCell(9).font = v
        ? { size: 10, bold: true, color: { argb: v.color } }
        : baseFont;

      const dueCell = row.getCell(10);
      dueCell.value = d.offersDue ?? "—";
      dueCell.font =
        d.offersDue && d.offersDue < today && !isDead
          ? { size: 10, bold: true, color: { argb: KILL } }
          : baseFont;

      row.getCell(11).value = d.createdAt.slice(0, 10);
      row.getCell(11).font = baseFont;
      row.getCell(12).value = d.addedBy ?? "";
      row.getCell(12).font = baseFont;
      rowN++;
    }
    rowN++; // breathing room between stages
  }

  /* ------------------------------ Summary ------------------------------- */
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 2 }, { width: 30 }, { width: 12 }, { width: 4 }, { width: 30 }, { width: 12 }];
  const ts = sum.getCell("B2");
  ts.value = "Pipeline summary";
  ts.font = { bold: true, size: 16, color: { argb: INK } };
  const tss = sum.getCell("B3");
  tss.value = `Exported ${exportedAt.toISOString().slice(0, 10)} — figures as extracted from each OM.`;
  tss.font = { size: 10, color: { argb: MUTED }, italic: true };

  const header = (cell: string, text: string) => {
    const c = sum.getCell(cell);
    c.value = text.toUpperCase();
    c.font = { bold: true, size: 10, color: { argb: BRAND } };
  };

  header("B5", "By stage");
  let r = 6;
  for (const stage of STAGES) {
    const n = byStage.get(stage)!.length;
    sum.getCell(`B${r}`).value = STAGE_LABEL[stage];
    sum.getCell(`B${r}`).font = { size: 10, color: { argb: INK } };
    sum.getCell(`C${r}`).value = n;
    sum.getCell(`C${r}`).font = { size: 10, bold: true, color: { argb: n ? INK : MUTED } };
    r++;
  }

  header("E5", "By verdict");
  const verdicts: [string, string, string][] = [
    ["pass", "Go", PASS],
    ["caution", "Caution", CAUTION],
    ["pass_on", "No-go", KILL],
  ];
  let vr = 6;
  for (const [key, label, color] of verdicts) {
    const n = rows.filter((d) => d.verdict === key).length;
    sum.getCell(`E${vr}`).value = label;
    sum.getCell(`E${vr}`).font = { size: 10, bold: true, color: { argb: color } };
    sum.getCell(`F${vr}`).value = n;
    sum.getCell(`F${vr}`).font = { size: 10, bold: true, color: { argb: INK } };
    vr++;
  }
  sum.getCell(`E${vr}`).value = "Not screened yet";
  sum.getCell(`E${vr}`).font = { size: 10, color: { argb: MUTED } };
  sum.getCell(`F${vr}`).value = rows.filter((d) => !d.verdict).length;
  sum.getCell(`F${vr}`).font = { size: 10, bold: true, color: { argb: INK } };

  // Live-pipeline value: sum of parsed asking prices, dead excluded.
  const live = rows.filter((d) => normalizeStage(d.stage) !== "dead");
  const prices = live
    .map((d) => (d.price ? parseMoney(d.price) : null))
    .filter((n): n is number => n != null && n > 0);
  const totalRow = r + 1;
  header(`B${totalRow}`, "Live pipeline");
  sum.getCell(`B${totalRow + 1}`).value = "Deals (Dead excluded)";
  sum.getCell(`B${totalRow + 1}`).font = { size: 10, color: { argb: INK } };
  sum.getCell(`C${totalRow + 1}`).value = live.length;
  sum.getCell(`C${totalRow + 1}`).font = { size: 10, bold: true, color: { argb: INK } };
  sum.getCell(`B${totalRow + 2}`).value = `Asking value (${prices.length} with a stated price)`;
  sum.getCell(`B${totalRow + 2}`).font = { size: 10, color: { argb: INK } };
  sum.getCell(`C${totalRow + 2}`).value = prices.reduce((a, b) => a + b, 0);
  sum.getCell(`C${totalRow + 2}`).numFmt = USD;
  sum.getCell(`C${totalRow + 2}`).font = { size: 10, bold: true, color: { argb: INK } };

  // Firm branding (Feature 6): file properties + print chrome only — the
  // meeting workbook is the artifact most likely to be projected, so it
  // carries the same identity as every other export.
  applyWorkbookBranding(wb, wb.worksheets, "Pipeline", branding);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
