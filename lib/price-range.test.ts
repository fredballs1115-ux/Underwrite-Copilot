// A price the memorandum states as a range (#466) — pricing guidance, a
// whisper — read at its top everywhere a price is read: the end that does
// not flatter a return. Before, every reader took "$40,000,000 –
// $42,000,000" for $40M, which lifted every cap and return struck on it.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { evaluateBuyBox, parseMoney, parsePrice, priceRange, priceRangeShort } from "@/lib/criteria";
import { askingPriceOf } from "@/lib/deal-strategy";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildPipelineWorkbook, type PipelineExportRow } from "@/lib/pipeline-workbook";
import { computeScreenDiff } from "@/lib/screen-diff";

const m = (label: string, value: string, page = "p. 3") => ({ label, value, page, flagged: false });
const ex = (metrics: ReturnType<typeof m>[]): ExtractionResult =>
  ({ dealName: "The Maddox", assetClass: "multifamily", metrics, totalPages: 60 }) as unknown as ExtractionResult;

describe("a price stated as a range (#466)", () => {
  it("reads both ends, carrying the second figure's scale to a first written without one", () => {
    const cases: [string, { low: number; high: number } | null][] = [
      ["$40,000,000 – $42,000,000", { low: 40e6, high: 42e6 }],
      ["$40,000,000 - $42,000,000", { low: 40e6, high: 42e6 }],
      ["$40M-$42M", { low: 40e6, high: 42e6 }],
      ["$40–42M", { low: 40e6, high: 42e6 }],
      ["$40 to $42 million", { low: 40e6, high: 42e6 }],
      ["Between $40M and $42M", { low: 40e6, high: 42e6 }],
      ["~$40–42MM (guidance)", { low: 40e6, high: 42e6 }],
      ["$40.5M – $41.25M", { low: 40.5e6, high: 41.25e6 }],
      ["$950,000 – $1.1M", { low: 950_000, high: 1.1e6 }],
      // Not ranges: one figure, a credit after the price, a cap after it, a
      // spread no guidance quotes, a word.
      ["$42,000,000", null],
      ["$42,000,000 - $500,000 seller credit", null],
      ["$42,000,000 – 5.25% cap", null],
      ["$20M – $60M", null],
      ["Call for offers", null],
    ];
    for (const [raw, want] of cases) expect(priceRange(raw), raw).toEqual(want);
  });

  it("reads a price at the top of its range and every other price as before", () => {
    expect(parsePrice("$40,000,000 – $42,000,000")).toBe(42e6);
    expect(parsePrice("$40–42M")).toBe(42e6);
    expect(parsePrice("$42,000,000")).toBe(42e6);
    expect(parsePrice("$42,000,000 - $500,000 seller credit")).toBe(42e6);
    expect(parsePrice("Unpriced")).toBeNull();
    // parseMoney keeps its own reading for every other figure.
    expect(parseMoney("$40,000,000 – $42,000,000")).toBe(40e6);
  });

  it("shows a range as one short figure for a slot that shows one price", () => {
    expect(priceRangeShort({ low: 40e6, high: 42e6 })).toBe("$40–42M");
    expect(priceRangeShort({ low: 40.5e6, high: 41.25e6 })).toBe("$40.5–41.3M");
    expect(priceRangeShort({ low: 950_000, high: 1.1e6 })).toBe("$950k–$1.1M");
    expect(priceRangeShort({ low: 400_000, high: 450_000 })).toBe("$400–450k");
  });

  it("is the ask every reader takes, the model's price and its note", () => {
    const deal = ex([m("Pricing guidance", "$40,000,000 – $42,000,000"), m("NOI (T-12)", "$2,300,000"), m("Units", "240")]);
    expect(askingPriceOf(deal)).toBe(42e6);
    const derived = deriveUnderwriteInputs(deal, "The Maddox");
    expect(derived.inputs.purchasePrice).toBe(42e6);
    expect(derived.sources.purchasePrice?.note).toContain(
      "$42,000,000, the top of the $40,000,000–$42,000,000 range the OM states, the end that does not flatter the returns; enter the price you would pay",
    );
    // A single price reads exactly as before.
    const single = deriveUnderwriteInputs(ex([m("Asking price", "$42,000,000"), m("NOI (T-12)", "$2,300,000")]), "x");
    expect(single.sources.purchasePrice?.note).toBe("OM asking / purchase price");
  });

  it("holds a range to a buy box by the end that tests the band", () => {
    const over = evaluateBuyBox("multifamily", ex([m("Pricing guidance", "$40,000,000 – $42,000,000")]), { priceMaxM: 41 });
    const price = over.find((c) => c.label === "Price")!;
    // The bottom sits inside a $41M ceiling; the top does not.
    expect(price.status).toBe("near");
    expect(price.detail).toBe(
      "Mandate is $41.0M max — the ask is $40.0M–$42.0M, its top 2% over. Close enough to price; a retrade could land it inside.",
    );
    const under = evaluateBuyBox("multifamily", ex([m("Pricing guidance", "$40M – $42M")]), { priceMinM: 41 });
    expect(under.find((c) => c.label === "Price")!.detail).toContain("its bottom 2% under");
    const inside = evaluateBuyBox("multifamily", ex([m("Pricing guidance", "$40M – $42M")]), { priceMinM: 30, priceMaxM: 50 });
    expect(inside.find((c) => c.label === "Price")!.detail).toBe("Mandate is $30.0M min, $50.0M max — the ask is $40.0M–$42.0M. Inside the band.");
  });

  it("writes the top into the meeting workbook's price cell, the range in its note", async () => {
    const row: PipelineExportRow = {
      name: "The Maddox",
      stage: "screening",
      assetClass: "multifamily",
      dealType: "Stabilized",
      planDeal: false,
      market: "Philadelphia, PA",
      price: "$40,000,000 – $42,000,000",
      cap: "5.50%",
      yieldOnCost: null,
      fit: null,
      verdict: "caution",
      offersDue: null,
      createdAt: "2026-09-30T00:00:00Z",
      addedBy: null,
    };
    const buf = await buildPipelineWorkbook([row], new Date("2026-09-30T12:00:00Z"), null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const cell = wb.getWorksheet("Pipeline")!.getRow(6).getCell(7);
    expect(cell.value).toBe(42e6);
    expect(JSON.stringify(cell.note)).toContain(
      "The memorandum states a range, $40,000,000 – $42,000,000: the cell is its top, the end that does not flatter the returns.",
    );
  });

  it("compares a re-screen's price against the range's top", () => {
    const diff = computeScreenDiff(
      { at: "2026-09-01T00:00:00Z", extraction: { metrics: [m("Asking price", "$40,000,000 – $42,000,000")] }, verdict: null },
      { metrics: [m("Asking price", "$41,000,000")] },
      null,
    )!;
    const price = diff.rows.find((r) => r.label === "Asking price")!;
    // $42M → $41M is a cut, good news for the buyer, where the bottom of
    // the range would have read it as a rise.
    expect(price.direction).toBe("better");
    expect(price.delta).toMatch(/^[−-]\$1\.0M/);
  });
});
