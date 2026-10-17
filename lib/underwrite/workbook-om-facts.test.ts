// The underwriting workbook's OM Facts tab (research pass 17, item 13):
// every figure the screen read out of the memorandum, as stated, with its
// page held to the memorandum's length (lib/facts' rule) and the screen's
// flag with its reason — data only, absent where nothing was read. Read
// back from the built file. Every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { OM_FACTS_HEAD_ROW, buildUnderwriteWorkbook } from "./workbook";
import { deriveUnderwriteInputs } from "./inputs";
import { FLAG_RULE, SOURCE_NOT_LOCATED, readOmFacts } from "./om-facts";
import { ex, m } from "@/lib/pass38.fixture";

const flagged = (label: string, value: string, basis: "in_place" | "pro_forma" | "na", page: string) => ({
  ...m(label, value, basis, page),
  flagged: true,
});

const extraction = ex({
  dealName: "Heron Court",
  assetClass: "Multifamily",
  totalPages: 40,
  metrics: [
    m("Asking price", "$20,000,000", "na", "p. 2"),
    m("Units", "120 units", "na", "p. 5"),
    m("NOI (in-place)", "$1,150,000", "in_place", "p. 14"),
    flagged("Pro forma NOI", "$1,420,000", "pro_forma", "p. 15"),
    // A page past the memorandum's end, and one that names no page.
    flagged("Exit cap rate", "5.25%", "na", "p. 412"),
    m("Year built", "1987", "na", ""),
  ],
});

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("readOmFacts — the tab's rows", () => {
  it("keeps every figure as stated, a page only where it falls within the memorandum", () => {
    const f = readOmFacts(extraction)!;
    expect(f.rows.map((r) => r.label)).toEqual(["Asking price", "Units", "NOI (in-place)", "Pro forma NOI", "Exit cap rate", "Year built"]);
    expect(f.rows.map((r) => r.value)).toEqual(["$20,000,000", "120 units", "$1,150,000", "$1,420,000", "5.25%", "1987"]);
    expect(f.rows.map((r) => r.page)).toEqual([2, 5, 14, 15, null, null]);
    expect(f.totalPages).toBe(40);
    expect(f.flaggedCount).toBe(2);
  });

  it("gives a flag the screen's own reason, with the basis where it was read, and none to an unflagged figure", () => {
    const f = readOmFacts(extraction)!;
    expect(f.rows[3]).toMatchObject({ basis: "Pro forma", flagged: true });
    expect(f.rows[3].reason).toMatch(/^A pro forma figure/);
    expect(f.rows[4].reason).toMatch(/^Forward-looking or seller-controlled/);
    expect(f.rows[2]).toMatchObject({ basis: "In place", flagged: false, reason: null });
  });

  it("prints no page at all where the memorandum's length was not read", () => {
    const f = readOmFacts({ ...extraction, totalPages: 0 })!;
    expect(f.totalPages).toBeNull();
    expect(f.rows.every((r) => r.page == null)).toBe(true);
  });

  it("is null where the extraction read no figure", () => {
    expect(readOmFacts(null)).toBeNull();
    expect(readOmFacts({ metrics: [], totalPages: 40 })).toBeNull();
    expect(readOmFacts({ metrics: [m("Price", " ")], totalPages: 40 })).toBeNull();
  });
});

describe("the OM Facts tab", () => {
  const model = deriveUnderwriteInputs(extraction, "x");

  it("sits after the Assumptions (and its Market Read), one row a figure — data, never a formula", async () => {
    const wb = await load(await buildUnderwriteWorkbook(model, null, null, null, undefined, null, null, undefined, readOmFacts(extraction)));
    const names = wb.worksheets.map((w) => w.name);
    expect(names.indexOf("OM Facts")).toBe(names.indexOf("Assumptions") + 1);
    const ws = wb.getWorksheet("OM Facts")!;
    expect(ws.getCell(1, 1).value).toBe("The memorandum's figures, as the screen read them");
    expect(String(ws.getCell(2, 1).value)).toContain("6 figures, 2 flagged.");
    expect(String(ws.getCell(2, 1).value)).toContain("within the memorandum's 40 pages");
    expect(String(ws.getCell(3, 1).value)).toContain(FLAG_RULE);
    const head = [2, 3, 4, 5, 6].map((c) => ws.getCell(OM_FACTS_HEAD_ROW, c).value);
    expect(head).toEqual(["AS STATED", "OM PAGE", "BASIS", "FLAGGED", "WHY FLAGGED"]);
    const row = (i: number) => [1, 2, 3, 4, 5, 6].map((c) => ws.getCell(OM_FACTS_HEAD_ROW + 1 + i, c).value ?? null);
    expect(row(0)).toEqual(["Asking price", "$20,000,000", 2, null, null, null]);
    expect(row(2)).toEqual(["NOI (in-place)", "$1,150,000", 14, "In place", null, null]);
    expect(row(3).slice(0, 5)).toEqual(["Pro forma NOI", "$1,420,000", 15, "Pro forma", "Yes"]);
    // The page past the memorandum's end, and the one never named.
    expect(row(4)[2]).toBe(SOURCE_NOT_LOCATED);
    expect(row(5)[2]).toBe(SOURCE_NOT_LOCATED);
    expect(row(6)[0]).toBeNull();
    // Data only: no cell on the tab holds a formula.
    ws.eachRow((r) =>
      r.eachCell((c) => {
        expect(typeof c.value === "object" && c.value !== null && "formula" in (c.value as object)).toBe(false);
      }),
    );
    // The cover's contents name it.
    let listed = false;
    wb.getWorksheet("Cover")!.eachRow((r) => {
      if (r.getCell(2).value === "OM Facts") listed = true;
    });
    expect(listed).toBe(true);
  });

  it("counts one figure as one (audit C7, L9)", async () => {
    const one = ex({ ...extraction, metrics: [m("Asking price", "$20,000,000", "na", "p. 2")] });
    const wb = await load(await buildUnderwriteWorkbook(model, null, null, null, undefined, null, null, undefined, readOmFacts(one)));
    const line = String(wb.getWorksheet("OM Facts")!.getCell(2, 1).value);
    expect(line).toContain("1 figure, 0 flagged.");
    expect(line).not.toContain("1 figures");
  });

  it("is absent where nothing was read — never an empty tab — and the cover does not list it", async () => {
    for (const facts of [undefined, null, readOmFacts({ metrics: [], totalPages: 40 })]) {
      const wb = await load(await buildUnderwriteWorkbook(model, null, null, null, undefined, null, null, undefined, facts));
      expect(wb.getWorksheet("OM Facts")).toBeUndefined();
      let listed = false;
      wb.getWorksheet("Cover")!.eachRow((r) => {
        if (r.getCell(2).value === "OM Facts") listed = true;
      });
      expect(listed).toBe(false);
    }
  });
});
