import { describe, expect, it } from "vitest";
import { analyzeStrip, readStrip } from "./cashflow-math";

describe("reading a pasted column", () => {
  it("takes what Excel's clipboard actually puts on it", () => {
    // Tab- and newline-separated, with the thousands commas left alone.
    const r = readStrip("-10,000,000\n650,000\n700,000\n750,000\n15,200,000");
    expect(r.values).toEqual([-10_000_000, 650_000, 700_000, 750_000, 15_200_000]);
    expect(r.skipped).toEqual([]);
  });

  it("does not mistake a thousands comma for a separator", () => {
    // The bug this exists for: split on commas first and "1,200,000"
    // becomes three years of one, two hundred and nothing.
    expect(readStrip("-1,200,000\n300,000").values).toEqual([-1_200_000, 300_000]);
    // …and with no line break or tab, a comma IS the separator.
    expect(readStrip("-100,50,60").values).toEqual([-100, 50, 60]);
  });

  it("reads the accounting negative a spreadsheet writes", () => {
    expect(readStrip("(1,200,000)\n300,000").values).toEqual([-1_200_000, 300_000]);
    expect(readStrip("($2.5M)\n$1M").values).toEqual([-2_500_000, 1_000_000]);
  });

  it("takes the shorthand every other field takes", () => {
    expect(readStrip("-10M\n650k\n15.2M").values).toEqual([-10_000_000, 650_000, 15_200_000]);
  });

  it("says what it could not read rather than silently dropping it", () => {
    const r = readStrip("-1000\nYear 2 TBD\n500");
    expect(r.values).toEqual([-1000, 500]);
    expect(r.skipped).toEqual(["Year 2 TBD"]);
  });

  it("reads nothing out of nothing", () => {
    expect(readStrip("").values).toEqual([]);
    expect(readStrip("   \n \n ").values).toEqual([]);
  });
});

describe("what the strip is worth", () => {
  // −10M, four years of cash flow, a 15.2M year five.
  const DEAL = [-10_000_000, 650_000, 700_000, 750_000, 800_000, 15_200_000];

  it("computes the rate, the multiple and the profit", () => {
    const r = analyzeStrip(DEAL);
    expect(r.irrPct).not.toBeNull();
    // Checked against the arithmetic: NPV at this rate is ~0.
    const rate = r.irrPct! / 100;
    const npvAtIrr = DEAL.reduce((a, cf, t) => a + cf / (1 + rate) ** t, 0);
    expect(Math.abs(npvAtIrr)).toBeLessThan(1);
    expect(r.invested).toBe(10_000_000);
    expect(r.returned).toBe(18_100_000);
    expect(r.equityMultiple).toBeCloseTo(1.81, 2);
    expect(r.profit).toBe(8_100_000);
  });

  it("discounts to an NPV at the rate asked for, and to none without one", () => {
    const at10 = analyzeStrip(DEAL, { discountPct: 10 })!.npv!;
    const hand = DEAL.reduce((a, cf, t) => a + cf / 1.1 ** t, 0);
    expect(at10).toBeCloseTo(hand, 6);
    expect(analyzeStrip(DEAL).npv).toBeNull();
    expect(analyzeStrip(DEAL, { discountPct: null }).npv).toBeNull();
    // A zero discount rate is a real question (undiscounted profit), not a
    // missing one — so it must not be swallowed by a falsy check.
    expect(analyzeStrip(DEAL, { discountPct: 0 })!.npv).toBeCloseTo(8_100_000, 6);
  });

  it("says when the money comes back, inside the year", () => {
    // Cumulative after year 4 is −7.1M; year 5 brings 15.2M, so the
    // crossing is 7.1/15.2 of the way into year five.
    const r = analyzeStrip(DEAL);
    expect(r.paybackYears).toBeCloseTo(4 + 7_100_000 / 15_200_000, 6);
    // …and "year 5" alone would be a worse answer than 4.47.
    expect(r.paybackYears).toBeLessThan(5);
    expect(r.paybackYears).toBeGreaterThan(4);
  });

  it("never claims a payback that has not happened", () => {
    const r = analyzeStrip([-10_000_000, 100_000, 100_000]);
    expect(r.paybackYears).toBeNull();
    expect(r.equityMultiple).toBeCloseTo(0.02, 4);
  });

  it("carries the running total, which is what makes payback visible", () => {
    const r = analyzeStrip([-100, 40, 40, 40]);
    expect(r.rows.map((x) => x.cumulative)).toEqual([-100, -60, -20, 20]);
    expect(r.rows.map((x) => x.year)).toEqual([0, 1, 2, 3]);
  });
});

describe("how much of the return is the exit", () => {
  const DEAL = [-10_000_000, 650_000, 700_000, 750_000, 800_000, 15_200_000];

  it("splits the return between the cash flow and the sale", () => {
    // 14.4M of the 15.2M final year is the sale; 800k is operations.
    const r = analyzeStrip(DEAL, { residual: 14_400_000 });
    expect(r.fromResidualPct).not.toBeNull();
    expect(r.fromCashFlowPct).not.toBeNull();
    expect(r.fromResidualPct! + r.fromCashFlowPct!).toBeCloseTo(100, 6);
    // A deal with four thin years and a big sale IS mostly the sale, and
    // saying so is the whole point of the split.
    expect(r.fromResidualPct!).toBeGreaterThan(70);
  });

  it("discounts at the IRR, not at nothing", () => {
    // The naive split — raw residual over raw inflows — over-credits a sale
    // five years out. The standard partition discounts every inflow at the
    // deal's own IRR, so the residual's share is always the smaller,
    // honest number.
    const r = analyzeStrip(DEAL, { residual: 14_400_000 })!;
    const naive = (14_400_000 / 18_100_000) * 100;
    expect(r.fromResidualPct!).toBeLessThan(naive);
  });

  it("asks rather than guesses when the sale is not stated", () => {
    // Nothing in a bare column says where the building was sold.
    const r = analyzeStrip(DEAL);
    expect(r.fromResidualPct).toBeNull();
    expect(r.fromCashFlowPct).toBeNull();
    expect(analyzeStrip(DEAL, { residual: 0 }).fromResidualPct).toBeNull();
  });

  it("refuses a residual bigger than the year it sits in", () => {
    const r = analyzeStrip(DEAL, { residual: 20_000_000 });
    expect(r.fromResidualPct).toBeNull();
    expect(r.note).toContain("larger than the final year");
  });

  it("credits the whole return to the sale when there is no interim cash", () => {
    const r = analyzeStrip([-1_000_000, 0, 0, 2_000_000], { residual: 2_000_000 });
    expect(r.fromResidualPct).toBeCloseTo(100, 6);
    expect(r.fromCashFlowPct).toBeCloseTo(0, 6);
  });
});

describe("the strips that have no answer, said out loud", () => {
  it("refuses a single figure", () => {
    const r = analyzeStrip([-1_000_000]);
    expect(r.irrPct).toBeNull();
    expect(r.note).toContain("at least two");
  });

  it("refuses an all-positive column, rather than reporting the scan floor", () => {
    // irr()'s scan starts at −90%; a column with nothing invested would
    // otherwise report a number that looks like an answer.
    const r = analyzeStrip([100, 200, 300]);
    expect(r.irrPct).toBeNull();
    expect(r.note).toContain("nothing invested");
    expect(r.profit).toBe(600);
  });

  it("refuses an all-negative column", () => {
    const r = analyzeStrip([-100, -200]);
    expect(r.irrPct).toBeNull();
    expect(r.note).toContain("nothing comes back");
  });

  it("says so when no single rate solves the strip", () => {
    // Two sign changes: the classic multiple-IRR shape. Reporting one root
    // of several as "the" IRR is the wrong answer, not a rounding issue.
    const r = analyzeStrip([-1000, 5000, -6000]);
    if (r.irrPct === null) expect(r.note).toContain("ambiguous");
    // Either way the multiple and profit are still true and still shown.
    expect(r.profit).toBe(-2000);
  });

  it("every note it can produce is a sentence", () => {
    for (const values of [[-1_000_000], [100, 200], [-100, -200]]) {
      const note = analyzeStrip(values).note;
      expect(note.length, JSON.stringify(values)).toBeGreaterThan(10);
      expect(note.endsWith("."), note).toBe(true);
    }
  });
});
