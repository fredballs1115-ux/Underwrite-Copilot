import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { basePosition, firstNumber, rangeInOrder } from "./verdict-range";

describe("verdict ranges read in numeric order (research pass 18)", () => {
  it("reads the first number of a display string", () => {
    expect(firstNumber("$1,495")).toBe(1495);
    expect(firstNumber("5.25%")).toBe(5.25);
    expect(firstNumber("-2.5% a year")).toBe(-2.5);
    expect(firstNumber("not stated")).toBeNull();
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
