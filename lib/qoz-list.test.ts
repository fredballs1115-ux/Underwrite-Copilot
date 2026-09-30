import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readQozList as read } from "../scripts/fetch-qoz-tracts.mjs";

// The script is plain JavaScript; its result, as the test reads it.
const readQozList = read as (bytes: Buffer) => Promise<{
  lic: string[];
  contiguous: string[];
  states: Map<string, Set<string>>;
}>;

// The CDFI Fund's workbook as the runner printed it (zori.yml probe_url, run
// 36752260808): a title and three notes, the header in row 5, one row a
// designated tract.
async function workbook(rows: (string | number)[][], header = ["State", "County", "Census Tract Number", "Tract Type", "ACS Data Source"]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("QOZs 14Jun");
  sheet.addRow(["", "Designated Qualified Opportunity Zones"]);
  sheet.addRow(["This document was updated December 14, 2018, to reflect the final Qualified Opportunity Zone designations for all States."]);
  sheet.addRow(["Please note that the below list of designated tracts is not the official list.   The official list will be published in the Internal Revenue"]);
  sheet.addRow(["Bulletin at a later date."]);
  sheet.addRow(header);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("the CDFI Fund's designated Opportunity Zone tracts, read (#473)", () => {
  it("keeps every tract by its eleven-digit 2010 number, in the list its type names", async () => {
    const bytes = await workbook([
      ["Alabama", "Autauga", "01001020700", "Low-Income Community", "2011-2015"],
      ["Alabama", "Baldwin", "01003010400", "Non-LIC Contiguous", "2011-2015"],
      ["Maryland", "Baltimore", "24510040100", "Low-Income Community", "2011-2015"],
      // A number the workbook stores as one keeps its leading zero.
      ["Alabama", "Baldwin", 1003010200, "Low-Income Community", "2011-2015"],
    ]);
    const { lic, contiguous, states } = await readQozList(bytes);
    expect(lic).toEqual(["01001020700", "01003010200", "24510040100"]);
    expect(contiguous).toEqual(["01003010400"]);
    expect([...states.get("Alabama")!]).toEqual(["01"]);
  });

  it("fails loudly on a moved header, a type the list does not use, or a tract listed twice", async () => {
    await expect(readQozList(await workbook([["Alabama", "Autauga", "01001020700", "Low-Income Community", "2011-2015"]], ["State", "County", "Tract", "Type", "ACS"]))).rejects.toThrow(/no header row/);
    await expect(readQozList(await workbook([["Alabama", "Autauga", "01001020700", "Rural", "2011-2015"]]))).rejects.toThrow(/type the list does not use/);
    await expect(
      readQozList(
        await workbook([
          ["Alabama", "Autauga", "01001020700", "Low-Income Community", "2011-2015"],
          ["Alabama", "Autauga", "01001020700", "Low-Income Community", "2011-2015"],
        ]),
      ),
    ).rejects.toThrow(/listed twice/);
    await expect(readQozList(await workbook([]))).rejects.toThrow(/no tract after it/);
  });
});
