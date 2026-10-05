// The meeting workbook, read back cell by cell. What matters is that a plan
// deal's row says what kind of deal it is and shows its yield on cost where a
// stabilized asset shows a cap — and never a dash a reader would take for
// "the OM didn't state one".
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPipelineWorkbook, type PipelineExportRow } from "./pipeline-workbook";
import { PLAN_CAP_NA } from "./cap-slot";

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
  // The plan's own fraction (lib/pipeline-export-row), never a rounded string.
  yieldOnCost: 0.11667,
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
  "Screened",
  "Offers due",
  "Added",
  "Added by",
];

describe("pipeline workbook — the deal's kind is a column", () => {
  it("the header row carries Deal type and Yield on cost, and the yield header explains itself", async () => {
    const ws = (await load([STABILIZED, CONVERSION])).getWorksheet("Pipeline")!;
    const head = HEADERS.map((_, i) => ws.getRow(4).getCell(i + 2).value);
    expect(head).toEqual(HEADERS);
    // Judged on yield on total cost — never "no going-in cap", which a
    // value-add's in-place cap contradicts (research pass 34).
    expect(JSON.stringify(ws.getRow(4).getCell(9).note)).toContain("judged on yield on total cost");
    expect(JSON.stringify(ws.getRow(4).getCell(9).note)).not.toContain("no going-in cap");
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
    // The pipeline CSV's words for the same cell (lib/cap-slot).
    expect(conv.getCell(8).value).toBe(PLAN_CAP_NA);
    // Written raw: the cell's "0.00%" shows 11.67%, the deal header's figure,
    // where "11.7%" read back had shown 11.70%.
    expect(conv.getCell(9).value).toBe(0.11667);
    expect(conv.getCell(9).numFmt).toBe("0.00%");
    // The columns after the new pair still land where the headers say.
    expect(conv.getCell(11).value).toBe("Caution");
    expect(conv.getCell(14).value).toBe("2026-09-08");
  });

  it("says the day each call was written, after the call — and no day at all with no call (research pass 42)", async () => {
    const ws = (
      await load([
        { ...STABILIZED, screenedAt: "2025-12-02" },
        { ...CONVERSION, screenedAt: null },
        { ...LEGACY, verdict: null, screenedAt: null },
      ])
    ).getWorksheet("Pipeline")!;
    expect(ws.getRow(4).getCell(12).value).toBe("Screened");
    expect(ws.getRow(6).getCell(12).value).toBe("2025-12-02");
    // A call saved before the pipeline dated one, and no call at all: a dash,
    // never the day the deal was added (column 14).
    expect(ws.getRow(7).getCell(12).value).toBe("—");
    expect(ws.getRow(8).getCell(12).value).toBe("—");
    expect(ws.getRow(8).getCell(14).value).toBe("2026-09-08");
  });

  it("a call the latest screen has not re-run says so beside the call it shows", async () => {
    const ws = (
      await load([
        { ...STABILIZED, verdictBehind: "running" },
        { ...CONVERSION, verdictBehind: "failed" },
        { ...LEGACY, verdict: null, verdictBehind: "running" },
      ])
    ).getWorksheet("Pipeline")!;
    const cells = [6, 7, 8].map((r) => ws.getRow(r).getCell(11).value);
    expect(cells).toContain("Re-screening (was Caution)");
    expect(cells).toContain("Screen failed (was Caution)");
    // No call on file: a first screen running prints no invented call.
    expect(cells).toContain("—");
    // A run that stopped making progress is said as stalled, never as a
    // re-screen still running (lib/screen-run `isStalled`, research pass 30).
    const stalled = (await load([{ ...STABILIZED, verdictBehind: "stalled" }])).getWorksheet("Pipeline")!;
    const stalledCell = [6, 7, 8].map((r) => stalled.getRow(r).getCell(11).value).find((v) => typeof v === "string" && v !== "—");
    expect(stalledCell).toBe("Screen stalled (was Caution)");
  });

  it("a buy-box fit judged on the first signal says so on its cell, as the pipeline card's \"First read\" does", async () => {
    const ws = (
      await load([
        { ...STABILIZED, fit: "near", fitFirstRead: true },
        { ...CONVERSION, fit: "fits" },
        { ...LEGACY, fit: null, fitFirstRead: true },
      ])
    ).getWorksheet("Pipeline")!;
    const cells = [6, 7, 8].map((r) => ws.getRow(r).getCell(10));
    const first = cells.find((c) => String(c.value).startsWith("Near"))!;
    expect(first.value).toBe("Near (first read)");
    expect(first.font?.italic).toBe(true);
    expect(JSON.stringify(first.note)).toContain("judged on the first pass over the memorandum");
    // The full screen's fit stands as it was, unmarked and with no note.
    const full = cells.find((c) => String(c.value).startsWith("Fits"))!;
    expect(full.value).toBe("Fits");
    expect(full.note).toBeUndefined();
    // No fit at all is a dash, never a mark on nothing.
    expect(cells.map((c) => c.value)).toContain("—");
  });

  it("a fit that stands on part of the box says on how much, names the rest in its note, and is never green while the price went unjudged (research pass 35)", async () => {
    const note = { checked: 2, total: 4, unchecked: ["Going-in cap", "Target return"], priceUnchecked: true };
    const place = { checked: 3, total: 4, unchecked: ["Geography"], priceUnchecked: false };
    const ws = (
      await load([
        { ...STABILIZED, fit: "fits", fitCoverage: note },
        { ...CONVERSION, fit: "near", fitCoverage: note, fitFirstRead: true },
        { ...LEGACY, fit: "fits", fitCoverage: place },
      ])
    ).getWorksheet("Pipeline")!;
    const [fits, near, placeOnly] = [6, 7, 8].map((r) => ws.getRow(r).getCell(10));
    expect(fits.value).toBe("Fits (2 of 4)");
    // Muted, not the pass green: the box's cap and return were never judged.
    expect(fits.font?.color?.argb).toBe("FF5F6B69");
    expect(JSON.stringify(fits.note)).toContain("going-in cap and target return could not be checked");
    // A near miss keeps its amber, and a first read is marked beside the count.
    expect(near.value).toBe("Near (2 of 4, first read)");
    expect(near.font?.color?.argb).toBe("FFA05A1C");
    expect(near.font?.italic).toBe(true);
    expect(JSON.stringify(near.note)).toContain("judged on the first pass over the memorandum");
    // Only the place unknown: the count, and the fit's own green.
    expect(placeOnly.value).toBe("Fits (3 of 4)");
    expect(placeOnly.font?.color?.argb).toBe("FF1B7A5E");
    // The column holds "Outside (3 of 4)" on a line, and a first read's
    // longer words wrap rather than run under the verdict beside them.
    expect(ws.getColumn(10).width).toBeGreaterThanOrEqual(16);
    expect(near.alignment?.wrapText).toBe(true);
  });

  it("a share's price keeps its figure and carries what it buys as the cell's note; a building's has none (#415)", async () => {
    const ws = (await load([{ ...STABILIZED, interest: "49% share" }, CONVERSION])).getWorksheet("Pipeline")!;
    const share = ws.getRow(6).getCell(7);
    expect(share.value).toBe(50_000_000);
    expect(JSON.stringify(share.note)).toContain("49% share: the price does not buy the building outright");
    expect(ws.getRow(7).getCell(7).note).toBeUndefined();
  });

  it("the seller's loan offered for assumption rides in the same note, beside what the price buys (#419)", async () => {
    const ws = (await load([{ ...STABILIZED, interest: "49% share", debt: "Assumable 3.45%" }, { ...CONVERSION, debt: "Assumable loan" }])).getWorksheet("Pipeline")!;
    const both = JSON.stringify(ws.getRow(6).getCell(7).note);
    expect(both).toContain("49% share: the price does not buy the building outright");
    expect(both).toContain("Assumable 3.45%: the seller's loan is offered for assumption");
    expect(JSON.stringify(ws.getRow(7).getCell(7).note)).toContain("Assumable loan: the seller's loan is offered for assumption");
  });

  it("a row with nothing to read shows dashes — never a guessed kind or a zero", async () => {
    const ws = (await load([LEGACY])).getWorksheet("Pipeline")!;
    const row = ws.getRow(6);
    expect(row.getCell(5).value).toBe("—");
    expect(row.getCell(7).value).toBe("—");
    expect(row.getCell(8).value).toBe("—");
    expect(row.getCell(9).value).toBe("—");
  });

  it("price, cap and yield on cost carry data bars Excel draws itself, over the deal rows only, each from zero", async () => {
    const ws = (await load([STABILIZED, CONVERSION, LEGACY])).getWorksheet("Pipeline")!;
    const cfs = (
      ws as unknown as {
        conditionalFormattings: { ref: string; rules: { type: string; cfvo?: { type: string; value?: number | string }[] }[] }[];
      }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    // Three deals under one stage band: rows 5 (band) through 8.
    expect(bars.map((cf) => cf.ref).sort()).toEqual(["G5:G8", "H5:H8", "I5:I8"]);
    // From zero to the column's largest, as the underwrite workbook's
    // portfolio tab draws its shares (research pass 35): from the column's
    // smallest, the cheapest deal drew no bar and the lowest cap the same
    // empty cell as "n/a — note". A text cell in the range draws none.
    for (const cf of bars) {
      const rule = cf.rules.find((r) => r.type === "dataBar")!;
      expect(rule.cfvo?.map((c) => (c.type === "num" ? [c.type, Number(c.value)] : [c.type]))).toEqual([["num", 0], ["max"]]);
    }
  });

  it("prints one landscape page wide with its header on every page, and scrolls with the Deal column frozen (research pass 35)", async () => {
    const wb = await load([
      { ...STABILIZED, name: "Harbor Point — Performing First Mortgage", market: "Brewerytown, Philadelphia, PA", verdictBehind: "running" },
      { ...CONVERSION, verdictBehind: "stalled" },
      LEGACY,
    ]);
    const ws = wb.getWorksheet("Pipeline")!;
    // With no page setup the sheet printed over five portrait pages, the
    // deal names on the first alone.
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" });
    // Frozen through the Deal column as well as under the header.
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 4 });
    // No cell merged over the frozen column's edge: the stage band is its
    // words in the Deal column and its fill across the row.
    expect((ws as unknown as { model: { merges?: string[] } }).model.merges ?? []).toEqual([]);
    const band = ws.getRow(5);
    expect(band.getCell(2).value).toBe("Screening  ·  3");
    for (let c = 2; c <= HEADERS.length + 1; c++) expect((band.getCell(c).fill as ExcelJS.FillPattern)?.fgColor?.argb, `band col ${c}`).toBe("FFE7EEEC");
    // Wide enough for the words they hold: LibreOffice prints "Brewerytown,
    // Philadelphia, PA" 23 units wide at 10 pt, a little under 0.8 of a
    // unit a character; the Verdict column had cut "(was Caution)" at 10,
    // and the Market column the "A" of "PA" at 22.
    const fits = (col: number, words: string) => expect(ws.getColumn(col).width ?? 0, words).toBeGreaterThanOrEqual(Math.ceil(words.length * 0.8));
    const verdicts = [6, 7].map((r) => String(ws.getRow(r).getCell(11).value));
    expect(verdicts).toEqual(["Re-screening (was Caution)", "Screen stalled (was Caution)"]);
    for (const v of verdicts) fits(11, v);
    fits(6, "Brewerytown, Philadelphia, PA");
    // A name longer than the frozen column wraps rather than losing its end.
    expect(ws.getRow(6).getCell(2).alignment?.wrapText).toBe(true);

    // The Summary prints one page wide too, and its asking value holds a
    // team's pipeline past $1,000,000,000 in $#,##0 without "###".
    const sum = wb.getWorksheet("Summary")!;
    expect(sum.pageSetup).toMatchObject({ fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(sum.getColumn(3).width ?? 0).toBeGreaterThanOrEqual("$10,000,000,000".length + 2);
  });

  it("an empty pipeline writes no data-bar rule", async () => {
    const ws = (await load([])).getWorksheet("Pipeline")!;
    const cfs = (ws as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings;
    expect(cfs).toEqual([]);
  });

  it("the live pipeline is the deals still in play: a closed deal is neither live nor dead", async () => {
    const sum = (
      await load([
        STABILIZED,
        { ...STABILIZED, name: "Closed deal", stage: "closed", price: "$30,000,000" },
        { ...CONVERSION, name: "Closed conversion", stage: "closed" },
        { ...STABILIZED, name: "Dead deal", stage: "dead", price: "$10,000,000" },
      ])
    ).getWorksheet("Summary")!;
    const byLabel = new Map<string, unknown>();
    sum.eachRow((row) => {
      const label = row.getCell(2).value;
      if (typeof label === "string") byLabel.set(label, row.getCell(3).value);
    });
    expect(byLabel.get("Deals (Closed and Dead excluded)")).toBe(1);
    // The asking value is the one open deal's, never the closed deals' too.
    const asking = [...byLabel.keys()].filter((l) => l.startsWith("Asking value"));
    expect(asking).toEqual(["Asking value (1 with a stated price)"]);
    expect(byLabel.get(asking[0])).toBe(50_000_000);
    // A closed plan deal is no live plan deal.
    expect(byLabel.get("Plan deals (judged on yield on cost)")).toBe(0);
    // The stage table still counts the closed, under their own name.
    expect(byLabel.get("Closed")).toBe(2);
    expect(byLabel.get("Dead")).toBe(1);
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
