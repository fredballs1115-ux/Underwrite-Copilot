// The document agent's leftover from research pass 38: the underwriting
// workbook's Deal Summary printed a long market name in its last column,
// where it ran past the tab's edge. It wraps inside its column now, the row
// tall enough for its lines. Every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildUnderwriteWorkbook } from "./workbook";
import { deriveUnderwriteInputs } from "./inputs";
import { ex, m } from "@/lib/pass38.fixture";

const summaryRow = async (market: string) => {
  const d = deriveUnderwriteInputs(
    ex({ assetClass: "Office", dealName: "Kestrel Point", market, metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "1,300,000", "in_place"), m("Total SF", "90,000 SF")] }),
    "x",
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Deal Summary")!;
  let found = -1;
  ws.eachRow((row, n) => {
    if (String(row.getCell(4).value ?? "") === "Market") found = n;
  });
  return { ws, row: found };
};

describe("the Deal Summary's market (research pass 38)", () => {
  it("wraps a long market name inside its column", async () => {
    const { ws, row } = await summaryRow("Washington-Arlington-Alexandria, DC-VA-MD-WV");
    expect(row).toBeGreaterThan(0);
    expect(ws.getCell(row, 5).value).toBe("Washington-Arlington-Alexandria, DC-VA-MD-WV");
    expect(ws.getCell(row, 5).alignment).toMatchObject({ wrapText: true, vertical: "top" });
    expect(ws.getRow(row).height).toBeGreaterThan(15);
  });

  it("leaves a short one on its one line", async () => {
    const { ws, row } = await summaryRow("Austin, TX");
    expect(ws.getCell(row, 5).alignment?.wrapText).toBeFalsy();
  });
});
