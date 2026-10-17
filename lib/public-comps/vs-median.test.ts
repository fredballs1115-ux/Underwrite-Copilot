import { describe, expect, it } from "vitest";
import { filterClassKey, vsMedianRead, vsMedianSentence, type SubjectForCall } from "./vs-median";
import type { RecordCompsStats } from "./core";

const stats: RecordCompsStats = {
  count: 8,
  medianPrice: 2_000_000,
  medianPerSqft: 200,
  perSqftCount: 4,
  low: 900_000,
  high: 4_000_000,
};

const office = (over: Partial<SubjectForCall> = {}): SubjectForCall => ({
  price: 2_400_000,
  perSf: 250,
  classKey: "office",
  classLabel: "Office",
  portfolio: false,
  planOrLand: false,
  ...over,
});

describe("the call against the recorded median", () => {
  it("reads a filter's class", () => {
    expect(filterClassKey("all sales")).toBeNull();
    expect(filterClassKey("multifamily/mixed")).toBe("multifamily");
    expect(filterClassKey("mixed use")).toBe("mixed_use");
  });

  it("is withheld where the sales are not the deal's kind", () => {
    expect(vsMedianRead(stats, "all sales", office())).toMatchObject({ kind: "withheld" });
    expect(vsMedianRead(stats, "multifamily", office())).toMatchObject({ kind: "withheld" });
  });

  it("is withheld for a portfolio, a plan and land", () => {
    expect(vsMedianRead(stats, "office", office({ portfolio: true }))).toMatchObject({ kind: "withheld" });
    expect(vsMedianRead(stats, "office", office({ planOrLand: true }))).toMatchObject({ kind: "withheld" });
  });

  it("compares price a square foot first, with its own count", () => {
    const read = vsMedianRead(stats, "office", office());
    expect(read).toEqual({ kind: "call", pct: 25, on: "per_sf", count: 4 });
    if (read?.kind === "call") {
      expect(vsMedianSentence(read, "$250/SF")).toBe("This deal's $250/SF is 25% above the median of the 4 sales that state an area.");
    }
  });

  it("falls to the whole price where the $/SF middle rests on under three sales", () => {
    const read = vsMedianRead({ ...stats, medianPerSqft: null, perSqftCount: 2 }, "office", office());
    expect(read).toEqual({ kind: "call", pct: 20, on: "price", count: 8 });
  });

  it("makes no call on two sales", () => {
    expect(vsMedianRead({ ...stats, count: 2, medianPerSqft: null, perSqftCount: 0 }, "office", office())).toBeNull();
  });
});
