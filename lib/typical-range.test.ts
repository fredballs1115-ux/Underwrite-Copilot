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
