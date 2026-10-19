import { describe, expect, it } from "vitest";
import { compsTableText, evidenceThrough, perSfBars, perSfSortOffered, perSqftOf, perUnitOf, readSalesSort, salesHeading, salesOrder, sharedDeedCounts, priceTrack, salesByQuarter, SPREAD_FOR_LOG } from "./picture";
import { pulledLine, type RecordComp } from "./core";
import { compGridHref } from "./picture";
import { MAX_COMPS, readGrid, readGridText } from "@/lib/tools/comp-grid";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("holds the middle to the readout's count of sales, not the rows drawn", () => {
    // One sale and one deed on two parcels: three dots, two sales — no median.
    const rows = [{ price: 400_000 }, { price: 900_000 }, { price: 900_000 }];
    expect(priceTrack(rows, 650_000, null)!.medianPct).not.toBeNull();
    expect(priceTrack(rows, 650_000, null, 2)!.medianPct).toBeNull();
    expect(priceTrack(rows, 650_000, null, 2)!.dots).toHaveLength(3);
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

describe("the quarter bars, read through the evidence's own day", () => {
  it("run from the window's first quarter to the day's, never to the last sale alone", () => {
    const bars = salesByQuarter([{ saleDate: "2025-02-10" }, { saleDate: "2025-05-03" }], {
      through: "2026-10-08",
      monthsBack: 24,
    });
    expect(bars[0].label).toBe("Q4 2024");
    expect(bars[bars.length - 1].label).toBe("Q4 2026");
    expect(bars.filter((b) => b.count > 0)).toHaveLength(2);
  });

  it("run through the database's last ingest where it is earlier than the search", () => {
    expect(evidenceThrough({ retrievedAt: "2026-10-08T12:00:00Z", ingestedThrough: "2026-07-31" })).toBe("2026-07-31");
    expect(evidenceThrough({ retrievedAt: "2026-10-08T12:00:00Z" })).toBe("2026-10-08");
  });
});

describe("a stored pull's day", () => {
  it("is said, and past thirty days asks for a refresh", () => {
    expect(pulledLine("2026-10-01T09:00:00Z", "2026-10-11")).toEqual({ stale: false, text: "Pulled Oct 1, 2026." });
    expect(pulledLine("2026-08-02T09:00:00Z", "2026-10-11")).toEqual({
      stale: true,
      text: "Pulled Aug 2, 2026, over 30 days ago — refresh for the sales recorded since.",
    });
    expect(pulledLine("", "2026-10-11")).toBeNull();
  });
});

describe("what a record states beyond its price", () => {
  it("gives a price a unit only past one unit", () => {
    expect(perUnitOf({ price: 1_200_000, units: 12 })).toBe(100_000);
    expect(perUnitOf({ price: 1_200_000, units: 1 })).toBeNull();
    expect(perUnitOf({ price: 1_200_000 })).toBeNull();
  });

  it("flags rows of one day, buyer and price, exactly, and nothing else", () => {
    const rows = [
      { saleDate: "2026-03-01", buyer: "Acme LLC", price: 9_000_000 },
      { saleDate: "2026-03-01", buyer: "ACME LLC ", price: 9_000_000 },
      { saleDate: "2026-03-01", buyer: "Acme LLC", price: 9_000_001 },
      { saleDate: "2026-03-01", buyer: null, price: 9_000_000 },
      { saleDate: "2026-03-01", buyer: null, price: 9_000_000 },
    ];
    expect(sharedDeedCounts(rows)).toEqual([2, 2, 0, 0, 0]);
  });
});

describe("the hand-off to /tools' comp grid", () => {
  const sales = [
    comp({ address: "1 A St", price: 2_000_000, sqft: 10_000, saleDate: "2026-04-20" }),
    comp({ address: "2 B St", price: 3_000_000, sqft: 12_000, saleDate: "2025-10-08" }),
    comp({ address: "3 C St", price: 900_000, sqft: null, saleDate: "2026-01-01" }),
    comp({ address: "4 D St", price: 1_500_000, sqft: 6_000, saleDate: "2026-09-30" }),
  ];

  it("carries the sales that state an area through the card's own keys, every adjustment at 0", () => {
    const href = compGridHref({ comps: sales, retrievedAt: "2026-10-08T12:00:00Z" })!;
    expect(href.startsWith("/tools?")).toBe(true);
    expect(href.endsWith("#comp-grid")).toBe(true);
    const q = new URLSearchParams(href.slice("/tools?".length, href.indexOf("#")));
    expect(q.get("cgu")).toBe("SF");
    expect(q.get("cgg")).toBe("0");
    expect(q.get("cgs")).toBe("");
    expect(q.get("cga")).toBe("");
    const parsed = readGridText(q.get("cgr")!, ["Location", "Size", "Condition"]);
    expect(parsed.unreadable).toEqual([]);
    expect(parsed.comps.map((c) => [c.name, c.price, c.size, c.monthsAgo])).toEqual([
      ["1 A St", 2_000_000, 10_000, 5],
      ["2 B St", 3_000_000, 12_000, 12],
      ["4 D St", 1_500_000, 6_000, 0],
    ]);
    expect(parsed.comps.every((c) => c.adjustments.every((a) => a.pct === 0))).toBe(true);
  });

  it("reads keys the card itself reads", () => {
    const tools = readFileSync(join(__dirname, "..", "..", "app", "tools", "deal-math-tools.tsx"), "utf8");
    for (const key of ["cgr", "cgs", "cga", "cgg", "cgu"]) expect(tools).toContain(`"${key}"`);
    expect(tools).toContain('id="comp-grid"');
  });

  it("carries no more than the card adjusts, the nearest first", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      comp({ address: `${i} E St`, price: 1_000_000 + i, sqft: 5_000, saleDate: "2026-05-01" }),
    );
    const href = compGridHref({ comps: many, retrievedAt: "2026-10-08T12:00:00Z" })!;
    const q = new URLSearchParams(href.slice("/tools?".length, href.indexOf("#")));
    const parsed = readGridText(q.get("cgr")!);
    expect(parsed.comps).toHaveLength(MAX_COMPS);
    expect(parsed.comps[0].name).toBe("0 E St");
    const read = readGrid({ subjectSize: null, unitLabel: "SF", marketGrowthPct: 0, askingPrice: null, comps: parsed.comps });
    expect(read.indicatedBasis).toBe(200);
  });

  it("offers nothing under three sales that state an area", () => {
    expect(compGridHref({ comps: sales.slice(0, 3), retrievedAt: "2026-10-08T12:00:00Z" })).toBeNull();
  });
});

describe("compsTableText", () => {
  it("writes a header and one tab-delimited row a sale, the numbers raw", () => {
    const text = compsTableText({
      comps: [comp({ address: "12 Oak\tSt", price: 1_250_000, sqft: 5_000, distanceKm: 1.609344 })],
    });
    const [head, row] = text.split("\n");
    expect(head.split("\t")).toEqual(["#", "Sold", "Address", "Price", "$/SF", "Units", "$/unit", "Type", "Buyer", "Seller", "Deed type", "Miles", "Source", "Left out of the readout"]);
    expect(row.split("\t")).toEqual([
      "1",
      "2026-05-01",
      "12 Oak St",
      "1250000",
      "250",
      "",
      "",
      "RESIDENTIAL",
      "",
      "",
      "",
      "1.00",
      "https://example.gov/1",
      "",
    ]);
  });

  it("keeps a sale left out of the readout as a row, its reason in the last column", () => {
    const text = compsTableText({ comps: [comp({}), comp({ address: "2 Main St" })] }, new Map([[1, "wrong_class" as const]]));
    const rows = text.split("\n").slice(1).map((r) => r.split("\t"));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r[r.length - 1])).toEqual(["", "Wrong class"]);
  });
});

describe("salesOrder, salesHeading and perSfBars", () => {
  const set = [
    comp({ saleDate: "2026-01-10", price: 900_000, sqft: 3_000, distanceKm: 0.1 }),
    comp({ saleDate: "2026-06-01", price: 400_000, sqft: null, distanceKm: 0.2 }),
    comp({ saleDate: "2025-11-20", price: 1_200_000, sqft: 2_000, distanceKm: 0.3 }),
    comp({ saleDate: "2026-06-01", price: 400_000, sqft: 1_000, distanceKm: 0.4 }),
  ];

  it("keeps each sale's nearest-first place, so its pin number stays", () => {
    expect(salesOrder(set, "nearest")).toEqual([0, 1, 2, 3]);
    // the same day keeps the nearer first
    expect(salesOrder(set, "newest")).toEqual([1, 3, 0, 2]);
    expect(salesOrder(set, "price")).toEqual([2, 0, 1, 3]);
    // $1,200,000 / 2,000 = $600; $400,000 / 1,000 = $400; $300; no area last
    expect(salesOrder(set, "perSf")).toEqual([2, 3, 0, 1]);
    // a day that does not parse sorts last
    expect(salesOrder([comp({ saleDate: "" }), comp({ saleDate: "2026-01-01" })], "newest")).toEqual([1, 0]);
  });

  it("reads a link's order, held to the orders offered", () => {
    for (const s of ["nearest", "newest", "price", "perSf"] as const) expect(readSalesSort(s, true)).toBe(s);
    // no order, or one no button offers, opens nearest first
    expect(readSalesSort(null, true)).toBe("nearest");
    expect(readSalesSort(undefined, true)).toBe("nearest");
    expect(readSalesSort("", true)).toBe("nearest");
    expect(readSalesSort("cheapest", true)).toBe("nearest");
    expect(readSalesSort("PRICE", true)).toBe("nearest");
    expect(readSalesSort("toString", true)).toBe("nearest");
    expect(readSalesSort(" price ", true)).toBe("price");
    // a repeated parameter reads its first
    expect(readSalesSort(["newest", "price"], true)).toBe("newest");
    // $/SF stands only where two sales state an area
    expect(readSalesSort("perSf", false)).toBe("nearest");
    expect(readSalesSort("price", false)).toBe("price");
    expect(perSfSortOffered(set)).toBe(true);
    expect(perSfSortOffered([set[0], set[1]])).toBe(false);
    expect(perSfSortOffered([])).toBe(false);
  });

  it("names the fold by the order", () => {
    expect(salesHeading("nearest", 15, 12)).toBe("The 12 nearest");
    expect(salesHeading("newest", 15, 12)).toBe("The 12 most recent");
    expect(salesHeading("price", 4, 12)).toBe("The sales, highest price first");
  });

  it("draws $/SF from zero to the widest, and the median only past the floor", () => {
    const bars = perSfBars(set, 400)!;
    expect(bars.drawn).toBe(3);
    expect(bars.max).toBe(600);
    expect(bars.shares).toEqual([0.5, null, 1, 400 / 600]);
    expect(bars.medianShare).toBeCloseTo(400 / 600);
    // two sales stating an area: bars, but no median tick
    const two = perSfBars([set[0], set[1], set[2]], 450)!;
    expect(two.drawn).toBe(2);
    expect(two.medianShare).toBeNull();
    // one sale stating an area is scaled to itself: no bars
    expect(perSfBars(set.slice(0, 2), 300)).toBeNull();
    expect(bars.leftOut).toBe(0);
  });

  it("leaves a row possibly of one deed across parcels out of the scale, with no bar", () => {
    // The $600 sale shares its day, buyer and price with another row.
    const bars = perSfBars(set, null, [0, 0, 2, 0])!;
    expect(bars.max).toBe(400);
    expect(bars.shares).toEqual([300 / 400, null, null, 1]);
    expect(bars.drawn).toBe(2);
    expect(bars.leftOut).toBe(1);
  });
});
