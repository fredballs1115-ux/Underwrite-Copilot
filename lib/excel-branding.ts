// Firm branding for the Excel exports (Feature 6 extension): file properties
// plus the print header/footer on every sheet — zero impact on cell layout,
// so the carefully-verified live-formula grids can never shift. Pure and
// shared by both workbook builders.

import type ExcelJS from "exceljs";

export interface ExportBranding {
  firmName?: string | null;
  footerText?: string | null;
}

// & is the header/footer control character — double it so user text can't
// smuggle in format codes; cap length so a 200-char footer can't blow the
// print chrome. Slice BEFORE escaping: slicing after could cut an "&&" pair
// in half, and the surviving lone "&" would swallow the following "&R"
// section marker.
const HF_MAX = 90;
const hf = (s: string) => s.slice(0, HF_MAX).replace(/&/g, "&&");

/** Stamp the firm identity onto a workbook: creator/company properties and a
 *  print header (firm · deal) + footer (custom line · page numbers) on the
 *  given sheets. No-ops back to the default identity when branding is empty. */
export function applyWorkbookBranding(
  wb: ExcelJS.Workbook,
  sheets: ExcelJS.Worksheet[],
  dealName: string,
  branding: ExportBranding | null | undefined,
): void {
  const firm = branding?.firmName?.trim() || null;
  const footer = branding?.footerText?.trim() || null;
  wb.creator = firm ?? "Underwrite Copilot";
  if (firm) wb.company = firm;
  if (!firm && !footer) return;
  for (const ws of sheets) {
    ws.headerFooter = {
      ...ws.headerFooter,
      oddHeader: `&L&9${hf(firm ?? "")}&R&9${hf(dealName)}`,
      oddFooter: `&L&8${hf(footer ?? "")}&R&8Page &P of &N`,
    };
  }
}
