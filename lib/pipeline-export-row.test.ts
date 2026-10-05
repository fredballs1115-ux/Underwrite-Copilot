// The meeting workbook's row as the route builds it (lib/pipeline-export-row):
// a deal read through the same readers the pipeline card, the deal page and
// the compare table read it through, so the meeting's sheet never says a
// different thing about the same deal.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractedMetric, ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { BuyBox } from "./criteria";
import { buildPipelineWorkbook } from "./pipeline-workbook";
import { pickSlots } from "./pipeline-slots";
import { pipelineExportRow, type ExportDeal, type ExportRowContext } from "./pipeline-export-row";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

const deal = (over: Partial<ExportDeal> = {}): ExportDeal => ({
  name: "Harbor View Apartments",
  asset_class: "auto",
  created_at: "2026-09-08T00:00:00Z",
  verdict: { verdict: "caution" },
  extraction: {
    dealName: "Harbor View Apartments",
    assetClass: "multifamily",
    market: "Baltimore, MD",
    address: "",
    metrics: [m("Asking price", "$41,250,000"), m("Going-in cap rate", "5.90%")],
  },
  stage: "screening",
  ...over,
});

const ctx: ExportRowContext = { box: null, job: null, offersDue: null, addedBy: null, today: "2026-09-08" };

async function classCell(d: ExportDeal): Promise<unknown> {
  const buf = await buildPipelineWorkbook([pipelineExportRow(d, ctx)], new Date("2026-09-08T12:00:00Z"), null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Row 5 is the stage band; the deal is row 6, its class column 4.
  return wb.getWorksheet("Pipeline")!.getRow(6).getCell(4).value;
}

describe("pipelineExportRow — the meeting workbook reads a deal as every surface does", () => {
  it("says the rent rules that reach the building, read on the route's day, and carries them in the price cell's note (lib/rent-regulation)", async () => {
    const walkUp = {
      dealName: "The Walk-up",
      assetClass: "multifamily",
      market: "Brooklyn, NY",
      address: "",
      metrics: [m("Asking price", "$14,000,000"), m("Units", "48"), m("Year built", "1931"), m("Rent-regulated units", "41")],
    } as ExtractionResult;
    const brooklyn = { label: "100 Walk-up St, Brooklyn, NY 11215", street: "100 Walk-up St", city: "Brooklyn", state: "NY", zip: "11215", county: "Kings County", submarket: "" };
    const row = pipelineExportRow(deal({ extraction: walkUp, address: brooklyn }), { ...ctx, today: "2026-10-05" });
    // The pipeline card's own slot, for the same deal on the same day.
    expect(row.regulation).toBe("Rent-stabilized, 41 of 48");
    expect(row.regulation).toBe(pickSlots(walkUp, null, "auto", { address: brooklyn, siteFlags: null, today: "2026-10-05" }).regulation);
    const buf = await buildPipelineWorkbook([row], new Date("2026-10-05T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    // Row 6 is the deal; column 7 its price.
    expect(JSON.stringify(wb.getWorksheet("Pipeline")!.getRow(6).getCell(7).note)).toContain(
      "Rent-stabilized, 41 of 48: the rent rules that reach the building",
    );
    // A deal no rule reaches carries none.
    expect(pipelineExportRow(deal(), ctx).regulation).toBeNull();
  });

  it("prints the deal's one class: the deck's on a deal filed Auto, the analyst's where they filed one", async () => {
    expect(pipelineExportRow(deal(), ctx).assetClass).toBe("multifamily");
    expect(pipelineExportRow(deal({ asset_class: "office" }), ctx).assetClass).toBe("office");
    // Nothing has read the deck yet: no class, never "auto".
    expect(pipelineExportRow(deal({ extraction: null }), ctx).assetClass).toBe("");
    // The sheet's cell says it, where it printed a dash for every Auto deal.
    expect(await classCell(deal())).toBe("Multifamily");
    expect(await classCell(deal({ extraction: null }))).toBe("—");
  });

  // Nothing in the extraction names a plan; the first signal names the
  // conversion (the audit of 2026-09-30). The budget is a whole one — a
  // "Hard costs" line alone is no stated total.
  const wexley = {
    dealName: "The Wexley",
    assetClass: "multifamily",
    market: "Bethesda, MD",
    address: "",
    metrics: [
      m("Asking price", "$20,000,000"),
      m("In-place NOI", "$900,000"),
      m("Construction budget", "$18,000,000"),
      m("Stabilized NOI", "$2,660,000"),
      m("Units", "180"),
    ],
  } as ExtractionResult;
  const SIGNAL: FirstSignal = {
    dealName: "The Wexley",
    assetClass: "multifamily",
    market: "Bethesda, MD",
    askPrice: "$20,000,000",
    size: "180 units",
    goingInCap: "",
    perUnit: "",
    take: "An office-to-residential conversion of a 1962 tower, sold vacant.",
  };

  it("reads the deal's kind as the pipeline card does, from the extraction and the first signal", () => {
    const row = pipelineExportRow(deal({ extraction: wexley, first_signal: SIGNAL }), ctx);
    expect(row.dealType).toBe("Conversion");
    expect(row.planDeal).toBe(true);
    expect(row.cap).toBeNull();
    expect(row.yieldOnCost).toBe("7.0%");
    // The card's own slots say the same.
    expect(row.yieldOnCost).toBe(pickSlots(wexley, SIGNAL).yoc);
    expect(row.cap).toBe(pickSlots(wexley, SIGNAL).cap);
    // A row screened before the first signal existed reads as before.
    const before = pipelineExportRow(deal({ extraction: wexley }), ctx);
    expect(before.dealType).toBe("Stabilized");
    expect(before.planDeal).toBe(false);
  });

  it("withholds a note's collateral cap, as the pipeline card does, and the sheet says so (the audit of 2026-09-30)", async () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    const note = {
      dealName: "Harbor Point note",
      assetClass: "multifamily",
      market: "Baltimore, MD",
      address: "",
      interest: { ...blank, kind: "note" },
      metrics: [
        m("Asking price", "$20,000,000"),
        m("Going-in cap rate", "9.50%"),
        m("Unpaid principal balance", "$24,400,000"),
        m("Note rate", "5.25%"),
        m("Maturity date", "March 31, 2060"),
        m("Payment status", "Performing"),
      ],
    } as ExtractionResult;
    const row = pipelineExportRow(deal({ extraction: note }), ctx);
    expect(row.cap).toBeNull();
    expect(row.capWithheld).toBe("note");
    expect(row.cap).toBe(pickSlots(note, null).cap);
    const buf = await buildPipelineWorkbook([row], new Date("2026-09-08T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    // Row 6 is the deal; column 8 the cap — never the collateral's 9.50%.
    expect(wb.getWorksheet("Pipeline")!.getRow(6).getCell(8).value).toBe("n/a — note");
    // A building's cap stands.
    expect(pipelineExportRow(deal(), ctx)).toMatchObject({ cap: "5.90%", capWithheld: null });
  });

  it("says whose strategy the deal type is on a note or a leased fee, as the deal header does", async () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    const sold = (kind: "note" | "leased_fee" | "fee_simple") =>
      ({
        dealName: "Harbor Point",
        assetClass: "multifamily",
        market: "Baltimore, MD",
        address: "",
        interest: { ...blank, kind },
        metrics: [m("Asking price", "$20,000,000"), m("Going-in cap rate", "6.00%")],
      }) as ExtractionResult;
    const note = pipelineExportRow(deal({ extraction: sold("note") }), ctx);
    expect(note.dealType).toBe("Stabilized (the collateral)");
    expect(pipelineExportRow(deal({ extraction: sold("leased_fee") }), ctx).dealType).toBe("Stabilized (the leaseholder's building)");
    expect(pipelineExportRow(deal({ extraction: sold("fee_simple") }), ctx).dealType).toBe("Stabilized");
    // The sheet prints it whole: the column is narrow, so the cell wraps.
    const buf = await buildPipelineWorkbook([note], new Date("2026-09-08T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const cell = wb.getWorksheet("Pipeline")!.getRow(6).getCell(5);
    expect(cell.value).toBe("Stabilized (the collateral)");
    expect(cell.alignment?.wrapText).toBe(true);
  });

  it("judges the buy box on the pipeline page's inputs: the address widens the geography", () => {
    const box: BuyBox = { markets: "Montgomery County" };
    const address = {
      label: "7501 Wisconsin Ave, Bethesda, MD 20814",
      street: "7501 Wisconsin Ave",
      city: "Bethesda",
      state: "MD",
      zip: "20814",
      county: "Montgomery County",
      submarket: "",
    };
    // The memorandum names the city, the address its county: in the box.
    expect(pipelineExportRow(deal({ extraction: wexley, address }), { ...ctx, box }).fit).toBe("fits");
    expect(pipelineExportRow(deal({ extraction: wexley }), { ...ctx, box }).fit).toBe("outside");
    // Before the extraction lands the first signal stands in, as on the card…
    const early = pipelineExportRow(deal({ extraction: null, first_signal: SIGNAL, address }), { ...ctx, box });
    expect(early.fit).toBe("fits");
    // …and the row marks it the card's "First read", as the pipeline page
    // does, so the sheet never passes it off as the screen's own fit.
    expect(early.fitFirstRead).toBe(true);
    expect(pipelineExportRow(deal({ extraction: wexley, first_signal: SIGNAL, address }), { ...ctx, box }).fitFirstRead).toBe(false);
    // No buy box, no fit: nothing to mark.
    expect(pipelineExportRow(deal({ extraction: null, first_signal: SIGNAL, address }), ctx).fitFirstRead).toBe(false);
  });
});
