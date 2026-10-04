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
    // A first figure that, so scaled, would pass the second keeps its own.
    expect(typicalRangeParts("$950–$1.2M")).toEqual(["$950", "$1.2M"]);
    // A word that merely starts with a scale's letter is no scale.
    expect(typicalRange("1–2 months")).toEqual([1, 2]);
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
