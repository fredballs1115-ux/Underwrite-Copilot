// The sales an analyst leaves out of the comps readout (lib/public-comps/kept):
// the link's reading, held to the list; and the figures recomputed on the kept
// set through the readout's own functions, the floors on the kept count.
import { describe, expect, it } from "vitest";
import { compEvidence, compStats, medianLabel, type RecordComp } from "./core";
import { perSfBars, priceTrack, sharedDeedCounts } from "./picture";
import {
  LEAVE_OUT_REASONS,
  SALES_OUT_PARAM,
  barsOnList,
  keptLine,
  keptSales,
  leftOutPhrase,
  readSalesOut,
  trackOnList,
  withSaleOut,
  writeSalesOut,
} from "./kept";

const sale = (i: number, over: Partial<RecordComp> = {}): RecordComp => ({
  address: `${100 + i} Walnut St`,
  lat: 0,
  lng: 0,
  saleDate: `2026-0${(i % 6) + 1}-15`,
  price: 400_000 + i * 100_000,
  sqft: 2_000,
  propertyType: "RESIDENTIAL",
  distanceKm: 0.1 * (i + 1),
  sourceUrl: `https://example.gov/${i}`,
  ...over,
});

describe("reading the set a link leaves out", () => {
  it("reads each pin with its reason, held to the list, the unknown dropped", () => {
    expect(SALES_OUT_PARAM).toBe("out");
    const out = readSalesOut("3nc, 1wc,5sd,6ot", 6);
    expect([...out.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, "wrong_class"],
      [2, "not_comparable"],
      [4, "shared_deed"],
      [5, "other"],
    ]);
    // A pin with no reason names none: "Other".
    expect(readSalesOut("2", 6).get(1)).toBe("other");
    // Outside the list, a code no reason carries, a pin of zero, junk: dropped.
    expect(readSalesOut("7nc,0nc,2zz,abc,-1,2.5,,", 6).size).toBe(0);
    // A pin named twice keeps its first reason; a repeated parameter reads its first.
    expect(readSalesOut("2nc,2wc", 6).get(1)).toBe("not_comparable");
    expect(readSalesOut(["4wc", "5nc"], 6)).toEqual(new Map([[3, "wrong_class"]]));
    expect(readSalesOut(null, 6).size).toBe(0);
    expect(readSalesOut("1nc", 0).size).toBe(0);
  });

  it("writes the set in pin order with every reason's code, and reads its own writing back", () => {
    const out = withSaleOut(withSaleOut(new Map(), 4, "other"), 1, "not_comparable");
    expect(writeSalesOut(out)).toBe("2nc,5ot");
    expect(readSalesOut(writeSalesOut(out), 6)).toEqual(out);
    expect(writeSalesOut(withSaleOut(out, 4, null))).toBe("2nc");
    expect(writeSalesOut(new Map())).toBe("");
    // every reason round-trips
    for (const r of LEAVE_OUT_REASONS) expect(readSalesOut(writeSalesOut(new Map([[0, r.key]])), 1).get(0)).toBe(r.key);
  });

  it("says the kept count and what was left out, by reason", () => {
    expect(keptLine(4, 6)).toBe("4 of 6 sales kept");
    expect(keptLine(6, 6)).toBe("");
    expect(leftOutPhrase(new Map([[0, "wrong_class"], [3, "not_comparable"], [4, "not_comparable"]]))).toBe("not comparable (2), wrong class (1)");
    expect(leftOutPhrase(new Map([[1, "other"]]))).toBe("other (1)");
    expect(leftOutPhrase(new Map())).toBe("");
  });
});

describe("the readout recomputed on the kept set", () => {
  const comps = Array.from({ length: 6 }, (_, i) => sale(i));

  it("counts, takes the median and the range of the kept sales only", () => {
    const all = compStats(comps)!;
    expect(all.count).toBe(6);
    // leave out the dearest and the cheapest
    const kept = keptSales(comps, new Map([[0, "not_comparable"], [5, "wrong_class"]]));
    expect(kept.at).toEqual([1, 2, 3, 4]);
    const s = compStats(kept.comps)!;
    expect(s.count).toBe(4);
    expect(s.low).toBe(500_000);
    expect(s.high).toBe(800_000);
    expect(s.medianPrice).toBe(650_000);
    // nothing kept: no figures
    expect(compStats(keptSales(comps, new Map(comps.map((_, i) => [i, "other" as const]))).comps)).toBeUndefined();
  });

  it("holds the floors to the kept count: five sales usable, four thin, two no median", () => {
    expect(compEvidence(compStats(keptSales(comps, new Map([[0, "other"]])).comps)!.count)).toBe("usable");
    const thin = compStats(keptSales(comps, new Map([[0, "other"], [1, "other"]])).comps)!;
    expect(compEvidence(thin.count)).toBe("thin");
    const two = compStats(keptSales(comps, new Map([[0, "other"], [1, "other"], [2, "other"], [3, "other"]])).comps)!;
    expect(two.count).toBe(2);
    expect(compEvidence(two.count)).toBe("individual");
    expect(medianLabel(two.count)).toBe("midpoint of the two");
    // and the $/SF median takes none under three kept sales stating an area
    expect(two.medianPerSqft).toBeNull();
    // the price track draws no middle for the two kept
    const k = keptSales(comps, new Map([[0, "other"], [1, "other"], [2, "other"], [3, "other"]]));
    expect(priceTrack(k.comps, two.medianPrice, null, two.count)?.medianPct).toBeNull();
  });

  it("puts the kept set's price track back on its pins", () => {
    const k = keptSales(comps, new Map([[1, "other"], [3, "other"]]));
    const s = compStats(k.comps)!;
    const track = trackOnList(priceTrack(k.comps, s.medianPrice, null, s.count), k.at)!;
    expect(track.dots.map((d) => d.n)).toEqual([1, 3, 5, 6]);
    expect(track.lowLabel).toBe("$400,000");
    expect(track.highLabel).toBe("$900,000");
  });

  it("draws the $/SF bars on the kept set, a sale left out drawing none", () => {
    const k = keptSales(comps, new Map([[5, "not_comparable"]]));
    const s = compStats(k.comps)!;
    const bars = barsOnList(perSfBars(k.comps, s.medianPerSqft, sharedDeedCounts(k.comps)), k.at, comps.length)!;
    expect(bars.shares).toHaveLength(6);
    expect(bars.shares[5]).toBeNull();
    // the scale is the widest KEPT sale's: $800,000 / 2,000 SF
    expect(bars.max).toBe(400);
    expect(bars.shares[4]).toBe(1);
    expect(bars.drawn).toBe(5);
    expect(barsOnList(null, [], 0)).toBeNull();
  });

  it("reads a deed across parcels on the kept rows: one of its two rows left out is a sale of its own", () => {
    const deed = { buyer: "Acme LLC", saleDate: "2026-01-15", price: 9_000_000 };
    const set = [sale(0, deed), sale(1, deed), sale(2), sale(3), sale(4)];
    expect(compStats(set)!.sharedDeeds).toEqual({ rows: 2, deeds: 1 });
    const kept = keptSales(set, new Map([[1, "shared_deed"]]));
    const s = compStats(kept.comps)!;
    expect(s.sharedDeeds).toBeUndefined();
    expect(s.count).toBe(4);
  });
});
