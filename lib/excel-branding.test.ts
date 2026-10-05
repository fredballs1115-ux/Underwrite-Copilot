// The print chrome every exported tab carries (lib/excel-branding): a firm's
// header and footer where the account set its branding, and — where it set
// none — a plain footer with the page number, so a printed tab is never an
// unnumbered sheet in a stack of them.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { applyWorkbookBranding } from "./excel-branding";

function book(): { wb: ExcelJS.Workbook; sheets: ExcelJS.Worksheet[] } {
  const wb = new ExcelJS.Workbook();
  return { wb, sheets: [wb.addWorksheet("Cover"), wb.addWorksheet("Deal Summary")] };
}

async function reloaded(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return out;
}

describe("applyWorkbookBranding — what a printed tab carries", () => {
  it("numbers the pages of an unbranded workbook, with no header and no firm", async () => {
    const { wb, sheets } = book();
    applyWorkbookBranding(wb, sheets, "Meridian Logistics Center", null);
    const back = await reloaded(wb);
    for (const name of ["Cover", "Deal Summary"]) {
      const hf = back.getWorksheet(name)!.headerFooter;
      expect(hf.oddFooter, name).toBe("&R&8Page &P of &N");
      expect(hf.oddHeader ?? "", name).toBe("");
    }
    expect(back.creator).toBe("Underwrite Copilot");
    // Empty strings are no branding either.
    const { wb: blank, sheets: blankSheets } = book();
    applyWorkbookBranding(blank, blankSheets, "Deal", { firmName: "  ", footerText: "" });
    expect(blankSheets[0].headerFooter.oddFooter).toBe("&R&8Page &P of &N");
  });

  it("prints a branded workbook's firm and deal over each tab, its own line and the page numbers under it", () => {
    const { wb, sheets } = book();
    applyWorkbookBranding(wb, sheets, "Meridian & Co Center", { firmName: "Harbor & Pine", footerText: "Confidential" });
    expect(sheets[1].headerFooter.oddHeader).toBe("&L&9Harbor && Pine&R&9Meridian && Co Center");
    expect(sheets[1].headerFooter.oddFooter).toBe("&L&8Confidential&R&8Page &P of &N");
    expect(wb.creator).toBe("Harbor & Pine");
    expect(wb.company).toBe("Harbor & Pine");
  });
});
