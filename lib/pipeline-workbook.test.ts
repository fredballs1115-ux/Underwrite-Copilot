// The meeting workbook, read back cell by cell. What matters is that a plan
// deal's row says what kind of deal it is and shows its yield on cost where a
// stabilized asset shows a cap — and never a dash a reader would take for
// "the OM didn't state one".
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPipelineWorkbook, type PipelineExportRow } from "./pipeline-workbook";

const base: Omit<PipelineExportRow, "name" | "dealType" | "planDeal" | "cap" | "yieldOnCost"> = {
  stage: "screening",
  assetClass: "multifamily",
  market: "Washington, DC",
  price: "$20,000,000",
  fit: null,
  verdict: "caution",
  offersDue: null,
  createdAt: "2026-09-08T00:00:00Z",
  addedBy: null,
};

const STABILIZED: PipelineExportRow = {
  ...base,
  name: "Maddox Apartments",
  dealType: "Stabilized",
  planDeal: false,
  price: "$50,000,000",
  cap: "5.70%",
  yieldOnCost: null,
};

const CONVERSION: PipelineExportRow = {
  ...base,
  name: "1200 K Street",
  dealType: "Conversion",
  planDeal: true,
  cap: null,
  yieldOnCost: "11.7%",
};

const LEGACY: PipelineExportRow = {
  ...base,
  name: "Old row",
  dealType: null,
  planDeal: false,
  price: null,
  cap: null,
  yieldOnCost: null,
};

async function load(rows: PipelineExportRow[]): Promise<ExcelJS.Workbook> {
  const buf = await buildPipelineWorkbook(rows, new Date("2026-09-08T12:00:00Z"), null);
  const wb = new ExcelJS.Workbook();
  // ExcelJS accepts a Node Buffer here despite the ArrayBuffer-ish typing.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

const HEADERS = [
  "Deal",
  "Stage",
  "Asset class",
  "Deal type",
  "Market",
  "Price",
  "Cap rate",
  "Yield on cost",
  "Buy box",
  "Verdict",
  "Offers due",
  "Added",
  "Added by",
];

describe("pipeline workbook — the deal's kind is a column", () => {
  it("the header row carries Deal type and Yield on cost, and the yield header explains itself", async () => {
    const ws = (await load([STABILIZED, CONVERSION])).getWorksheet("Pipeline")!;
    const head = HEADERS.map((_, i) => ws.getRow(4).getCell(i + 2).value);
    expect(head).toEqual(HEADERS);
    expect(JSON.stringify(ws.getRow(4).getCell(9).note)).toContain("no going-in cap");
  });

  it("a stabilized asset shows its cap and no yield; a conversion says n/a — plan and shows its yield on cost", async () => {
    const ws = (await load([STABILIZED, CONVERSION])).getWorksheet("Pipeline")!;
    // Row 5 is the stage band; the deals follow in input order.
    const stab = ws.getRow(6);
    const conv = ws.getRow(7);
    expect(stab.getCell(2).value).toBe("Maddox Apartments");
    expect(stab.getCell(5).value).toBe("Stabilized");
    expect(stab.getCell(8).value).toBeCloseTo(0.057, 6);
    expect(stab.getCell(8).numFmt).toBe("0.00%");
    expect(stab.getCell(9).value).toBe("—");

    expect(conv.getCell(2).value).toBe("1200 K Street");
    expect(conv.getCell(5).value).toBe("Conversion");
    expect(conv.getCell(8).value).toBe("n/a — plan");
    expect(conv.getCell(9).value).toBeCloseTo(0.117, 6);
    expect(conv.getCell(9).numFmt).toBe("0.00%");
    // The columns after the new pair still land where the headers say.
    expect(conv.getCell(11).value).toBe("Caution");
    expect(conv.getCell(13).value).toBe("2026-09-08");
  });

  it("a row with nothing to read shows dashes — never a guessed kind or a zero", async () => {
    const ws = (await load([LEGACY])).getWorksheet("Pipeline")!;
    const row = ws.getRow(6);
    expect(row.getCell(5).value).toBe("—");
    expect(row.getCell(7).value).toBe("—");
    expect(row.getCell(8).value).toBe("—");
    expect(row.getCell(9).value).toBe("—");
  });

  it("the summary counts the live plan deals, dead ones excluded", async () => {
    const sum = (
      await load([STABILIZED, CONVERSION, { ...CONVERSION, name: "Dead conversion", stage: "dead" }])
    ).getWorksheet("Summary")!;
    let count: unknown = null;
    sum.eachRow((row) => {
      if (row.getCell(2).value === "Plan deals (judged on yield on cost)") count = row.getCell(3).value;
    });
    expect(count).toBe(1);
  });
});
