// The market a pipeline row names, said once for the row and its CSV (the
// audit of 2026-09-30: the CSV's "Covered market" column was blank for a
// metro area the row itself named, read without a brief or placed there by
// the deal's county).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rowMarketLabel } from "./placed-by";

describe("rowMarketLabel — the market a pipeline row names", () => {
  it("names the briefed market, else the metro area read for the deal and how, else nothing", () => {
    expect(rowMarketLabel({ coveredMarket: "Dallas–Fort Worth", readMarket: null })).toBe("Dallas–Fort Worth");
    expect(rowMarketLabel({ coveredMarket: null, readMarket: "Pittsburgh PA" })).toBe("Pittsburgh PA · read");
    expect(rowMarketLabel({ coveredMarket: null, readMarket: "Dallas–Fort Worth", readCounty: "Collin County, TX" })).toBe(
      "Dallas–Fort Worth · Collin County",
    );
    expect(rowMarketLabel({ coveredMarket: null, readMarket: null, readCounty: null })).toBeNull();
  });

  it("is what the pipeline's CSV writes in its Covered market column, as the row prints it", () => {
    // The CSV is built in the list's click handler, which no render reaches,
    // so its cell is held at its source.
    const src = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    const csv = src.slice(src.indexOf("function exportCsv"), src.indexOf("URL.createObjectURL"));
    expect(csv).toMatch(/d\.market,\s*(?:\/\/[^\n]*\n\s*)*rowMarketLabel\(d\) \?\? "",/);
    expect(csv).not.toMatch(/d\.coveredMarket \?\? ""/);
    // …and the row draws the same words.
    expect(src).toMatch(/\{rowMarketLabel\(d\)\}/);
  });
});
