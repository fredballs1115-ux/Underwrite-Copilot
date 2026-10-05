import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { basePosition, firstNumber, rangeFigure, rangeInOrder, sameScale } from "./verdict-range";

describe("verdict ranges read in numeric order (research pass 18)", () => {
  it("reads the first number of a display string", () => {
    expect(firstNumber("$1,495")).toBe(1495);
    expect(firstNumber("5.25%")).toBe(5.25);
    expect(firstNumber("-2.5% a year")).toBe(-2.5);
    expect(firstNumber("not stated")).toBeNull();
  });

  it("reads a figure's scale and its minus in either form (audit c66)", () => {
    // It took the first run of digits: "$950k" read 950 and "$1.2M" 1.2, and
    // the minus sign (U+2212) was no sign at all.
    expect(rangeFigure("$950k")).toEqual({ value: 950_000, unit: "usd" });
    expect(rangeFigure("$1.05M")).toEqual({ value: 1_050_000, unit: "usd" });
    expect(rangeFigure("$1.2 million")).toEqual({ value: 1_200_000, unit: "usd" });
    expect(rangeFigure("$2bn")).toEqual({ value: 2_000_000_000, unit: "usd" });
    expect(rangeFigure("−3.0%")).toEqual({ value: -3, unit: "pct" });
    expect(rangeFigure("–3.0%")).toEqual({ value: -3, unit: "pct" });
    expect(rangeFigure("-3.0%")).toEqual({ value: -3, unit: "pct" });
    expect(rangeFigure("−$1.2M")).toEqual({ value: -1_200_000, unit: "usd" });
    expect(rangeFigure("$-30,000")).toEqual({ value: -30_000, unit: "usd" });
    expect(rangeFigure("25 bps")).toEqual({ value: 25, unit: "bps" });
    expect(rangeFigure("1.25x")).toEqual({ value: 1.25, unit: "x" });
    expect(rangeFigure("350 a door")).toEqual({ value: 350, unit: "plain" });
    // A scale ends at a word, and a hyphen inside a word is no minus.
    expect(rangeFigure("5 months")).toEqual({ value: 5, unit: "plain" });
    expect(firstNumber("Year-2 5%")).toBe(2);
    expect(firstNumber("$1.2M")).toBe(1_200_000);
    expect(firstNumber("−2.5%")).toBe(-2.5);
  });

  it("holds two figures to one scale: one unit, or a bare figure beside either", () => {
    const pct = rangeFigure("5.25%")!;
    expect(sameScale(pct, rangeFigure("5.75%")!)).toBe(true);
    expect(sameScale(pct, rangeFigure("5.75")!)).toBe(true);
    expect(sameScale(pct, rangeFigure("$1.2M")!)).toBe(false);
    expect(sameScale(rangeFigure("$950k")!, rangeFigure("$1.2M")!)).toBe(true);
  });

  it("never prints a range high to low over a scale or a minus sign it did not read", () => {
    // The audit's two: "Low $1.2M · High $950k" with the base's dot at the
    // start, and the falling rent growth swapped end for end.
    const land = { label: "Residual land value", low: "$950k", base: "$1.05M", high: "$1.2M", source: "x" };
    expect(rangeInOrder(land)).toBe(land);
    expect(basePosition(land)).toBeCloseTo(0.4, 10);
    const falling = { label: "Rent growth", low: "−3.0%", base: "−2.0%", high: "−1.0%", source: "x" };
    expect(rangeInOrder(falling)).toBe(falling);
    expect(basePosition(falling)).toBeCloseTo(0.5, 10);
    // Stored the other way up, both are put in order.
    expect(rangeInOrder({ low: "$1.2M", base: "$1.05M", high: "$950k" })).toEqual({ low: "$950k", base: "$1.05M", high: "$1.2M" });
    expect(rangeInOrder({ low: "−1.0%", base: "−2.0%", high: "−3.0%" })).toEqual({ low: "−3.0%", base: "−2.0%", high: "−1.0%" });
    // Ends on two scales are left as written, and draw no track.
    const mixed = { low: "5.75%", base: "$1.0M", high: "$1.2M" };
    expect(rangeInOrder({ low: "5.75%", high: "$1.2M" })).toEqual({ low: "5.75%", high: "$1.2M" });
    expect(basePosition(mixed)).toBeNull();
    expect(basePosition({ low: "5%", base: "$5", high: "6%" })).toBeNull();
  });

  it("swaps a pair stored with the larger figure as low, and leaves the rest as written", () => {
    // The old prompt asked for the conservative end first; an exit cap's
    // conservative end is its larger figure.
    const stored = { label: "Exit cap", low: "5.75%", base: "5.50%", high: "5.25%", source: "x" };
    expect(rangeInOrder(stored)).toEqual({ label: "Exit cap", low: "5.25%", base: "5.50%", high: "5.75%", source: "x" });
    const inOrder = { low: "3.0%", base: "3.5%", high: "4.0%" };
    expect(rangeInOrder(inOrder)).toBe(inOrder);
    // Ends that are not both numbers are left as the verdict wrote them.
    const words = { low: "about 6%", base: "6.5%", high: "not stated" };
    expect(rangeInOrder(words)).toBe(words);
  });

  it("places the base on the range read in order, and draws nothing it cannot place", () => {
    expect(basePosition({ low: "5.75%", base: "5.50%", high: "5.25%" })).toBeCloseTo(0.5, 10);
    expect(basePosition({ low: "$1,400", base: "$1,450", high: "$1,600" })).toBeCloseTo(0.25, 10);
    expect(basePosition({ low: "5%", base: "5%", high: "5%" })).toBeNull();
    expect(basePosition({ low: "n/a", base: "5%", high: "6%" })).toBeNull();
    // A base outside the range sits at the end it passed.
    expect(basePosition({ low: "4%", base: "7%", high: "6%" })).toBe(1);
  });

  it("is the one reader every surface draws a verdict range through", () => {
    // The deal page, the shared screen and the memo each kept a copy of the
    // number reader and the position, so a fix to one missed the others.
    for (const file of [
      "app/(app)/deals/[id]/deal-sections.tsx",
      "app/share/[token]/share-view.tsx",
      "lib/memo/memo-document.tsx",
      "lib/memo/report-document.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/function firstNum\b|function basePosition\b/);
      expect(src, file).toMatch(/rangeInOrder/);
    }
  });
});
