import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { typicalRange, typicalRangeParts } from "./typical-range";

describe("a market check's typical range, read one way on every surface", () => {
  it("reads a hyphen as a range's dash, never a minus sign", () => {
    expect(typicalRange("5.25%-5.75%")).toEqual([5.25, 5.75]);
    expect(typicalRange("5.25-5.75%")).toEqual([5.25, 5.75]);
    expect(typicalRange("5.25–5.75%")).toEqual([5.25, 5.75]);
    expect(typicalRange("2.5 to 3.5%")).toEqual([2.5, 3.5]);
    expect(typicalRange("$2,150–$2,450/mo")).toEqual([2150, 2450]);
    expect(typicalRangeParts("$2,150–$2,450/mo")).toEqual(["$2,150", "$2,450"]);
  });

  it("reads an end's own minus in each of its forms (audit c66)", () => {
    // "−0.5%–1.0%" (the minus sign, U+2212) read as 0.5 to 1.
    expect(typicalRange("−0.5%–1.0%")).toEqual([-0.5, 1]);
    expect(typicalRange("-0.5%–1.0%")).toEqual([-0.5, 1]);
    expect(typicalRange("–0.5%–1.0%")).toEqual([-0.5, 1]);
    expect(typicalRange("−1.0% to −0.5%")).toEqual([-1, -0.5]);
    expect(typicalRange("-1%–-0.5%")).toEqual([-1, -0.5]);
  });

  it("reads an end's scale, the second's carried to a first written without one", () => {
    // The OM's figure is read with its scale on the deal page and in the
    // report (lib/verdict-range), so the range's ends must be too.
    expect(typicalRange("$180k–$220k/unit")).toEqual([180_000, 220_000]);
    expect(typicalRangeParts("$180–$220k/unit")).toEqual(["$180k", "$220k"]);
    expect(typicalRange("$180–$220k/unit")).toEqual([180_000, 220_000]);
    expect(typicalRange("$950k–$1.2M")).toEqual([950_000, 1_200_000]);
    expect(typicalRange("$1.0–1.5M")).toEqual([1_000_000, 1_500_000]);
    expect(typicalRange("2.5 million to 3.5 million")).toEqual([2_500_000, 3_500_000]);
    // A word that merely starts with a scale's letter is no scale.
    expect(typicalRange("1–2 months")).toEqual([1, 2]);
  });

  // "$950–$1.2M" read as $950 to $1,200,000 — a track 1,263 times its low
  // end, the OM's figure drawn somewhere on it. The scale is carried as
  // lib/criteria's \`priceRange\` carries a price's: to a first figure that,
  // so scaled, lies within a range's reach below the second (at or over its
  // half); where it carries to neither reading, a second end more than twice
  // the first is no range, as \`priceRange\` refuses one.
  it("carries the second's scale as a price range does, and reads no range where neither reading is one", () => {
    expect(typicalRangeParts("$950–$1.2M")).toBeNull();
    expect(typicalRange("$950–$1.2M")).toBeNull();
    expect(typicalRange("$100–$220k")).toBeNull();
    // A first figure written in full is its own scale, and a range.
    expect(typicalRange("$950,000–$1.2M")).toEqual([950_000, 1_200_000]);
    // Within reach, the scale carries, as before.
    expect(typicalRange("$110–$220k")).toEqual([110_000, 220_000]);
    expect(typicalRange("$40–42M")).toEqual([40_000_000, 42_000_000]);
    // Two ends on one scale are read as written, however wide, and an end
    // at or under zero too: the refusal is the scale's question, never a
    // rate's width.
    expect(typicalRange("3–8%")).toEqual([3, 8]);
    expect(typicalRange("0–2%")).toEqual([0, 2]);
    expect(typicalRange("$950k–$5M")).toEqual([950_000, 5_000_000]);
  });

  it("reads no range from one figure, words, or ends that do not rise", () => {
    expect(typicalRange("about 5.5%")).toBeNull();
    expect(typicalRange("in line with the metro")).toBeNull();
    expect(typicalRange("5.75%–5.25%")).toBeNull();
  });

  it("the deal page's position bar and the report read through it", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-sections.tsx"), "utf8");
    expect(page).toContain("readTypicalRange(typicalRange)");
    const report = readFileSync(join(process.cwd(), "lib/memo/report-document.tsx"), "utf8");
    expect(report).toContain("typicalRangeParts(typicalRange)");
  });
});
