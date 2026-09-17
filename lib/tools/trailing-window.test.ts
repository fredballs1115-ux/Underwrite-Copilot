import { describe, it, expect } from "vitest";
import {
  readTrailing,
  readTrailingText,
  WINDOWS,
  type TrailingInput,
} from "@/lib/tools/trailing-window";

/**
 * Fifteen months of a stabilized apartment building's NOI, oldest first —
 * the seeded column on the card. It is built to be the ordinary case rather
 * than a dramatic one: the building really is growing about 3½% a year, and
 * the last three months are its peak season. Both are true at once, which
 * is precisely the situation the card exists for.
 */
const SEED: number[] = [
  138_000, 140_000, 137_000, // the same quarter, a year earlier
  128_000, 124_000, 121_000,
  119_000, 122_000, 128_000,
  133_000, 137_000, 140_000,
  143_000, 145_000, 142_000, // the last three
];

const noi = (over: Partial<TrailingInput> = {}) =>
  readTrailing({ monthly: SEED, kind: "noi", capPct: 5.5, ...over });

/** Taxes in two instalments, neither of them in the last six months. */
const EXPENSES: number[] = [
  40_000, 40_000, 40_000, 190_000, 41_000, 41_000, 41_000, 41_000,
  195_000, 42_000, 42_000, 42_000, 42_000, 43_000, 43_000,
];

describe("the windows themselves", () => {
  it("offers every window the column is long enough for, longest first", () => {
    const r = noi();
    expect(r.windows.map((w) => w.months)).toEqual([12, 6, 3, 1]);
    expect(r.monthsGiven).toBe(15);
  });

  it("sums T-12 off the END of the column, keeping the earlier months", () => {
    // 15 months in; T-12 is months 4–15, not months 1–12.
    const r = noi();
    expect(r.t12).toBe(1_582_000);
    expect(r.t12).not.toBe(SEED.slice(0, 12).reduce((a, b) => a + b, 0));
  });

  it("annualizes each short window by the year it covers", () => {
    const r = noi();
    const t3 = r.windows.find((w) => w.months === 3)!;
    expect(t3.sum).toBe(430_000);
    expect(t3.annualized).toBe(1_720_000);
    const t1 = r.windows.find((w) => w.months === 1)!;
    expect(t1.sum).toBe(142_000);
    expect(t1.annualized).toBe(142_000 * 12);
  });

  it("labels the full year plainly and every other window as annualized", () => {
    const labels = noi().windows.map((w) => w.label);
    expect(labels).toEqual(["T-12", "T-6 annualized", "T-3 annualized", "T-1 annualized"]);
  });

  it("measures each window against T-12, which measures zero against itself", () => {
    const r = noi();
    expect(r.windows.find((w) => w.months === 12)!.vsT12Pct).toBe(0);
    expect(r.windows.find((w) => w.months === 3)!.vsT12Pct).toBe(8.7);
  });

  it("drops a window the column is too short for", () => {
    const r = readTrailing({ monthly: SEED.slice(-8), kind: "noi" });
    expect(r.windows.map((w) => w.months)).toEqual([6, 3, 1]);
    expect(r.t12).toBeNull();
  });

  it("says so rather than computing when there is no full year to compare against", () => {
    const r = readTrailing({ monthly: SEED.slice(-8), kind: "noi" });
    expect(r.note).toContain("under a full year");
    expect(r.windows.every((w) => w.vsT12Pct === 0)).toBe(true);
  });
});

describe("rule 2 — the window is the argument", () => {
  it("names the window a seller would quote", () => {
    const r = noi();
    expect(r.flattering?.label).toBe("T-3 annualized");
    expect(r.flattering?.annualized).toBe(1_720_000);
  });

  it("names the one they would not", () => {
    expect(noi().unflattering?.label).toBe("T-12");
  });

  it("sizes the claim being made", () => {
    const r = noi();
    expect(r.spread).toBe(138_000);
    expect(r.spreadPct).toBe(8.7);
  });

  it("says the claim in dollars of VALUE at the stated cap", () => {
    // $138,000 of annual NOI at a 5.5% cap. This is the figure the card
    // exists to print and no memorandum ever does.
    expect(noi().valueSpread).toBe(2_509_091);
  });

  it("will not capitalise a revenue column", () => {
    const r = readTrailing({ monthly: SEED, kind: "revenue", capPct: 5.5 });
    expect(r.spread).toBe(138_000);
    expect(r.valueSpread).toBeNull();
  });

  it("will not capitalise an expense column either — neither half is an NOI", () => {
    expect(readTrailing({ monthly: EXPENSES, kind: "expense", capPct: 5.5 }).valueSpread).toBeNull();
  });

  it("has no value read without a cap, and none from a nonsense one", () => {
    expect(noi({ capPct: null }).valueSpread).toBeNull();
    expect(noi({ capPct: 0 }).valueSpread).toBeNull();
    expect(noi({ capPct: -5 }).valueSpread).toBeNull();
  });

  it("has no spread when only one window fits", () => {
    const r = readTrailing({ monthly: [120_000, 121_000], kind: "noi", capPct: 5.5 });
    expect(r.windows.map((w) => w.months)).toEqual([1]);
    expect(r.flattering).toBeNull();
    expect(r.spread).toBeNull();
    expect(r.valueSpread).toBeNull();
  });
});

describe("rule 3 — for an expense, flattering means lowest", () => {
  it("picks the SMALLEST annualized figure on an expense column", () => {
    const r = readTrailing({ monthly: EXPENSES, kind: "expense" });
    expect(r.flattering?.label).toBe("T-6 annualized");
    expect(r.flattering?.annualized).toBe(508_000);
  });

  it("picks the largest on the same column read as revenue — the sign is the kind", () => {
    const asRevenue = readTrailing({ monthly: EXPENSES, kind: "revenue" });
    expect(asRevenue.flattering?.label).toBe("T-12");
    expect(asRevenue.flattering?.annualized).toBe(803_000);
  });

  it("prices the understatement: annualizing a quarter with no tax bill in it", () => {
    const r = readTrailing({ monthly: EXPENSES, kind: "expense" });
    // A real $803,000 of expenses read as $508,000 — a 37% understatement
    // that is arithmetically correct and completely wrong.
    expect(r.spread).toBe(295_000);
    expect(r.spreadPct).toBe(36.7);
  });

  it("finds the lump and says which month it is", () => {
    const r = readTrailing({ monthly: EXPENSES, kind: "expense" });
    expect(r.lumpiestMonth).toBe(9);
    expect(r.lumpiness).toBe(4.64);
    expect(r.lumpOutsideShort).toBe(true);
  });

  it("names it in the note rather than leaving it in a field", () => {
    const r = readTrailing({ monthly: EXPENSES, kind: "expense" });
    expect(r.note).toContain("month 9 of 15");
    expect(r.note).toContain("never carries that bill");
  });

  it("does not call a smooth column lumpy", () => {
    const r = noi();
    expect(r.lumpiness).toBe(1.06);
    expect(r.lumpOutsideShort).toBe(false);
  });

  it("does not flag a lump that IS inside the last three months", () => {
    // Same instalments, but the second one lands in the final quarter — so
    // the short window carries it and the finding does not apply.
    const inside = [...EXPENSES];
    inside[8] = 42_000;
    inside[13] = 195_000;
    const r = readTrailing({ monthly: inside, kind: "expense" });
    expect(r.lumpiestMonth).toBe(14);
    expect(r.lumpOutsideShort).toBe(false);
  });

  it("needs a real lump, not merely the biggest month", () => {
    // Every month within a few percent of the median: the largest one is not
    // a bill, and calling it one would flag every column ever pasted.
    const r = noi();
    expect(r.lumpiness! < 2).toBe(true);
    expect(r.lumpOutsideShort).toBe(false);
  });
});

describe("rule 4 — the honest short-window read is year over year", () => {
  it("finds the same three months a year earlier", () => {
    const r = noi();
    // Months 1–3 of a 15-month column are the same season as months 13–15.
    expect(r.priorYearQuarter).toBe(1_660_000);
  });

  it("is the read that separates growth from season", () => {
    const r = noi();
    // T-3 says the building is 8.7% better than T-12 says. Year over year,
    // the same quarter is up 3.6%. The other five points are the season —
    // and nothing but this comparison can tell them apart.
    expect(r.windows.find((w) => w.months === 3)!.vsT12Pct).toBe(8.7);
    expect(r.yoyQuarterPct).toBe(3.6);
    expect(r.yoyQuarterPct! < r.windows.find((w) => w.months === 3)!.vsT12Pct).toBe(true);
  });

  it("is absent under fifteen months, which is why a memorandum rarely shows it", () => {
    const r = readTrailing({ monthly: SEED.slice(-14), kind: "noi" });
    expect(r.monthsGiven).toBe(14);
    expect(r.t12).not.toBeNull();
    expect(r.priorYearQuarter).toBeNull();
    expect(r.yoyQuarterPct).toBeNull();
  });

  it("appears the moment the fifteenth month does", () => {
    expect(readTrailing({ monthly: SEED.slice(-15), kind: "noi" }).yoyQuarterPct).toBe(3.6);
  });

  it("reads a real decline as a decline", () => {
    const falling = SEED.map((v, i) => (i >= 12 ? v - 30_000 : v));
    const r = readTrailing({ monthly: falling, kind: "noi" });
    expect(r.yoyQuarterPct).toBeLessThan(0);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt on an empty column", () => {
    const r = readTrailing({ monthly: [], kind: "noi" });
    expect(r.windows).toEqual([]);
    expect(r.t12).toBeNull();
    expect(r.note).toContain("oldest first");
  });

  it("drops a value that is not a number rather than summing NaN", () => {
    const r = readTrailing({
      monthly: [1, 2, Number.NaN, 4, Number.POSITIVE_INFINITY] as number[],
      kind: "noi",
    });
    expect(r.monthsGiven).toBe(3);
    expect(r.windows.find((w) => w.months === 3)!.sum).toBe(7);
  });

  it("does not divide by a zero T-12", () => {
    const r = readTrailing({ monthly: new Array(13).fill(0), kind: "noi", capPct: 5.5 });
    expect(r.t12).toBe(0);
    expect(r.windows.every((w) => Number.isFinite(w.vsT12Pct))).toBe(true);
    expect(r.spread).toBe(0);
    expect(r.spreadPct).toBeNull();
  });

  it("does not divide by a zero median when every month is nothing", () => {
    const r = readTrailing({ monthly: new Array(13).fill(0), kind: "expense" });
    expect(r.lumpiness).toBeNull();
    expect(r.lumpiestMonth).toBeNull();
    expect(r.lumpOutsideShort).toBe(false);
  });

  it("reads a single month as a single month and says nothing more", () => {
    const r = readTrailing({ monthly: [131_000], kind: "noi", capPct: 5.5 });
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0].annualized).toBe(1_572_000);
    expect(r.flattering).toBeNull();
  });

  it("runs a negative month rather than refusing it — a bad month is a fact", () => {
    const bad = [...SEED];
    bad[13] = -20_000;
    const r = readTrailing({ monthly: bad, kind: "noi", capPct: 5.5 });
    expect(r.windows.find((w) => w.months === 3)!.sum).toBe(143_000 - 20_000 + 142_000);
    // One month of casualty expense, and the window that EXCLUDES it becomes
    // the seller's figure by a distance: $1.70M against a real $1.42M. The
    // shortest window is the most flattering precisely because it is short
    // enough to step over the bad month — which is the whole point.
    expect(r.flattering?.label).toBe("T-1 annualized");
    expect(r.flattering?.annualized).toBe(1_704_000);
    expect(r.t12).toBe(1_417_000);
    // And the least flattering window is T-3, which lands ON the bad month
    // and annualizes it four times over — $1.06M. Same column, two honest
    // readings, $11.7M apart at a 5.5% cap.
    expect(r.unflattering?.label).toBe("T-3 annualized");
    expect(r.unflattering?.annualized).toBe(1_060_000);
    expect(r.valueSpread).toBe(11_709_091);
  });
});

describe("the pasted column", () => {
  it("reads what a spreadsheet's clipboard puts on it", () => {
    const pasted = SEED.map((v) => v.toLocaleString("en-US")).join("\n");
    const r = readTrailingText(pasted, "noi", 5.5);
    expect(r.monthsGiven).toBe(15);
    expect(r.t12).toBe(1_582_000);
    expect(r.skipped).toEqual([]);
  });

  it("does not read a thousands mark as a month boundary", () => {
    // The trap readStrip exists for: "138,000" is one month, not two.
    const r = readTrailingText("138,000\n140,000\n137,000", "noi");
    expect(r.monthsGiven).toBe(3);
  });

  it("keeps what it could not read so the card can say what it ignored", () => {
    const r = readTrailingText("Jan\t120000\nFeb\t121000", "noi");
    expect(r.monthsGiven).toBe(2);
    expect(r.skipped).toEqual(["Jan", "Feb"]);
  });

  it("takes an accounting negative the way a statement writes one", () => {
    const r = readTrailingText("120000\n(20000)\n121000", "noi");
    expect(r.windows.find((w) => w.months === 3)!.sum).toBe(221_000);
  });
});

describe("the constants are the ones stated", () => {
  it("offers the four windows a memorandum actually quotes", () => {
    expect([...WINDOWS]).toEqual([12, 6, 3, 1]);
  });

  it("holds the seeded column to the shape the card's copy describes", () => {
    expect(SEED).toHaveLength(15);
    expect(SEED.slice(0, 3)).toEqual(SEED.slice(12).map((v, i) => [138_000, 140_000, 137_000][i]));
  });
});
