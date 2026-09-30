import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readDelineation as read } from "../scripts/fetch-cbsa-counties.mjs";

// The script is plain JavaScript; its result, as the test reads it.
const readDelineation = read as (bytes: Buffer) => Promise<{
  counties: Record<string, { cbsa: string; division?: string; county: string; state: string }>;
  titles: Record<string, string>;
}>;

// The Census Bureau's List 1 as the runner printed it (zori.yml probe_url,
// run 36655654711): two title rows, the header in row 3, one row a county,
// a source line after the last.
const HEADER = [
  "CBSA Code",
  "Metropolitan Division Code",
  "CSA Code",
  "CBSA Title",
  "Metropolitan/Micropolitan Statistical Area",
  "Metropolitan Division Title",
  "CSA Title",
  "County/County Equivalent",
  "State Name",
  "FIPS State Code",
  "FIPS County Code",
  "Central/Outlying County",
];

async function workbook(rows: (string | number)[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("List 1");
  sheet.addRow(Array(12).fill("Table with row headers in column A and column headers in row 3"));
  sheet.addRow(Array(12).fill("List 1. CORE BASED STATISTICAL AREAS (CBSAs), METROPOLITAN DIVISIONS, AND COMBINED STATISTICAL AREAS (CSAs), JULY 2023"));
  sheet.addRow(HEADER);
  for (const r of rows) sheet.addRow(r);
  sheet.addRow(Array(12).fill("Source: File prepared by U.S. Census Bureau, Population Division"));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("the metro-area delineation, read (#447)", () => {
  it("keeps every metropolitan county by its five-digit code, with its division where it has one", async () => {
    const bytes = await workbook([
      ["10100", "", "", "Aberdeen, SD", "Micropolitan Statistical Area", "", "", "Brown County", "South Dakota", "46", "013", "Central"],
      ["38300", "", "430", "Pittsburgh, PA", "Metropolitan Statistical Area", "", "Pittsburgh-Weirton-Steubenville, PA-OH-WV", "Butler County", "Pennsylvania", "42", "019", "Central"],
      ["19100", "19124", "206", "Dallas-Fort Worth-Arlington, TX", "Metropolitan Statistical Area", "Dallas-Plano-Irving, TX", "Dallas-Fort Worth, TX-OK", "Collin County", "Texas", "48", "085", "Central"],
      // A code the workbook stores as a number keeps its leading zero.
      ["47900", "11694", "548", "Washington-Arlington-Alexandria, DC-VA-MD-WV", "Metropolitan Statistical Area", "Arlington-Alexandria-Reston, VA-WV", "", "Arlington County", "Virginia", 51, 13, "Central"],
    ]);
    const { counties, titles } = await readDelineation(bytes);
    expect(counties).toEqual({
      "42019": { cbsa: "38300", county: "Butler County", state: "Pennsylvania" },
      "48085": { cbsa: "19100", division: "19124", county: "Collin County", state: "Texas" },
      "51013": { cbsa: "47900", division: "11694", county: "Arlington County", state: "Virginia" },
    });
    // No micropolitan area: the site reads none.
    expect(titles["10100"]).toBeUndefined();
    expect(titles["38300"]).toBe("Pittsburgh, PA");
  });

  it("fails loudly on a file whose header has moved or whose rows are gone", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("List 1").addRow(["CBSA", "County", "State"]);
    await expect(readDelineation(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow(/no header row/);
    await expect(readDelineation(await workbook([]))).rejects.toThrow(/no metropolitan county/);
  });
});
