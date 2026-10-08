import { describe, expect, it } from "vitest";
import { compsTableText, perSqftOf, priceTrack, salesByQuarter, SPREAD_FOR_LOG } from "./picture";
import type { RecordComp } from "./core";

const comp = (over: Partial<RecordComp>): RecordComp => ({
  address: "1 Main St",
  lat: 0,
  lng: 0,
  saleDate: "2026-05-01",
  price: 500_000,
  sqft: null,
  propertyType: "RESIDENTIAL",
  distanceKm: 1,
  sourceUrl: "https://example.gov/1",
  ...over,
});

describe("priceTrack", () => {
  it("has no track under two priced sales", () => {
    expect(priceTrack([{ price: 400_000 }], 400_000, null)).toBeNull();
    expect(priceTrack([{ price: 400_000 }, { price: 400_000 }], 400_000, null)).toBeNull();
  });

  it("draws a narrow spread on a linear track from the low end to the high", () => {
    const t = priceTrack([{ price: 400_000 }, { price: 500_000 }, { price: 600_000 }], 500_000, null)!;
    expect(t.log).toBe(false);
    expect(t.dots.map((d) => d.pct)).toEqual([0, 50, 100]);
    expect(t.dots.map((d) => d.n)).toEqual([1, 2, 3]);
    expect(t.medianPct).toBe(50);
    expect([t.lowLabel, t.highLabel]).toEqual(["$400,000", "$600,000"]); // the readout's own writer
  });

  it("draws a wide spread on a log track and says so", () => {
    const t = priceTrack([{ price: 100_000 }, { price: 1_000_000 }, { price: 10_000_000 }], 1_000_000, null)!;
    expect(10_000_000 / 100_000).toBeGreaterThan(SPREAD_FOR_LOG);
    expect(t.log).toBe(true);
    expect(t.dots.map((d) => d.pct)).toEqual([0, 50, 100]);
  });

  it("draws no middle below the median floor", () => {
    const t = priceTrack([{ price: 400_000 }, { price: 600_000 }], 500_000, null)!;
    expect(t.medianPct).toBeNull();
  });

  it("draws the subject only inside the readout's band and the track", () => {
    const comps = [{ price: 400_000 }, { price: 500_000 }, { price: 600_000 }];
    expect(priceTrack(comps, 500_000, 550_000)!.subjectPct).toBe(75);
    // $68M against a $500k middle: outside the band, never at the track's end
    expect(priceTrack(comps, 500_000, 68_000_000)!.subjectPct).toBeNull();
    // inside the band but past the highest sale: off the track, not clamped to its end
    expect(priceTrack(comps, 500_000, 900_000)!.subjectPct).toBeNull();
    expect(priceTrack(comps, 500_000, null)!.subjectPct).toBeNull();
  });

  it("numbers each dot by its place in the list, skipping none", () => {
    const t = priceTrack([{ price: 0 }, { price: 400_000 }, { price: 800_000 }], 600_000, null)!;
    expect(t.dots.map((d) => d.n)).toEqual([2, 3]);
  });
});

describe("salesByQuarter", () => {
  it("counts each quarter from the first sale's to the last's, gaps kept", () => {
    const bars = salesByQuarter([
      comp({ saleDate: "2025-11-03" }),
      comp({ saleDate: "2026-05-20" }),
      comp({ saleDate: "2026-06-01" }),
    ]);
    expect(bars).toEqual([
      { label: "Q4 2025", count: 1 },
      { label: "Q1 2026", count: 0 },
      { label: "Q2 2026", count: 2 },
    ]);
  });

  it("draws nothing under two dated sales or across a malformed year", () => {
    expect(salesByQuarter([comp({ saleDate: "2026-05-20" })])).toEqual([]);
    expect(salesByQuarter([comp({ saleDate: "1900-01-01" }), comp({ saleDate: "2026-01-01" })])).toEqual([]);
    expect(salesByQuarter([comp({ saleDate: "" }), comp({ saleDate: "n/a" })])).toEqual([]);
  });
});

describe("perSqftOf", () => {
  it("divides only an area a building could have", () => {
    expect(perSqftOf({ price: 500_000, sqft: 2_000 })).toBe(250);
    expect(perSqftOf({ price: 500_000, sqft: 150 })).toBeNull();
    expect(perSqftOf({ price: 500_000, sqft: null })).toBeNull();
  });
});

describe("compsTableText", () => {
  it("writes a header and one tab-delimited row a sale, the numbers raw", () => {
    const text = compsTableText({
      comps: [comp({ address: "12 Oak\tSt", price: 1_250_000, sqft: 5_000, distanceKm: 1.609344 })],
    });
    const [head, row] = text.split("\n");
    expect(head.split("\t")).toEqual(["#", "Sold", "Address", "Price", "$/SF", "Type", "Miles", "Source"]);
    expect(row.split("\t")).toEqual([
      "1",
      "2026-05-01",
      "12 Oak St",
      "1250000",
      "250",
      "RESIDENTIAL",
      "1.00",
      "https://example.gov/1",
    ]);
  });
});
