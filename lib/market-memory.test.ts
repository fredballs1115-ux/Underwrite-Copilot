import { describe, it, expect } from "vitest";
import {
  buildComps,
  summarizeMarkets,
  marketMemoryFor,
  median,
  normalizeMarketKey,
  fmtCapRange,
  fmtBasisRange,
} from "./market-memory";

function deal(
  id: string,
  opts: {
    assetClass?: string;
    market?: string;
    metrics?: Array<[string, string]>;
    verdict?: string;
    isSample?: boolean;
    createdAt?: string;
  } = {},
) {
  return {
    id,
    name: id,
    asset_class: opts.assetClass ?? "multifamily",
    created_at: opts.createdAt ?? "2026-01-01T00:00:00.000Z",
    is_sample: opts.isSample ?? false,
    verdict: opts.verdict ? { verdict: opts.verdict } : null,
    extraction:
      opts.metrics === undefined
        ? null
        : {
            market: opts.market ?? "",
            metrics: opts.metrics.map(([label, value]) => ({ label, value })),
          },
  };
}

describe("median", () => {
  it("odd count → middle", () => expect(median([3, 1, 2])).toBe(2));
  it("even count → mean of middles", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});

describe("buildComps", () => {
  const rows = [
    deal("d1", {
      market: "Dallas, TX",
      verdict: "pass",
      metrics: [["Going-in cap rate", "5.0%"], ["Purchase price", "$50,000,000"], ["Units", "200"]],
    }),
    deal("d2", {
      market: "Dallas, TX",
      verdict: "caution",
      metrics: [["Going-in cap rate", "5.4%"], ["Purchase price", "$60,000,000"], ["Units", "200"]],
    }),
    deal("d3", {
      assetClass: "office",
      market: "Austin, TX",
      verdict: "pass",
      metrics: [["Cap rate", "6.0%"], ["Purchase price", "$30,000,000"], ["Total SF", "150,000 SF"]],
    }),
    deal("sample", { isSample: true, market: "Dallas, TX", metrics: [["Going-in cap rate", "5.0%"]] }),
    deal("nometrics", { market: "Dallas, TX" }), // extraction null
    deal("useless", { market: "Dallas, TX", metrics: [["Year built", "1985"]] }), // no cap/price
  ];
  const comps = buildComps(rows);

  it("keeps only deals with a usable cap or basis, never the sample", () => {
    expect(comps.map((c) => c.dealId).sort()).toEqual(["d1", "d2", "d3"]);
  });
  it("derives $/unit for multifamily", () => {
    const c = comps.find((c) => c.dealId === "d1")!;
    expect(c.capPct).toBe(5.0);
    expect(c.perUnit).toBe(250_000);
    expect(c.perUnitBasis).toBe("unit");
  });
  it("derives $/SF for non-multifamily", () => {
    const c = comps.find((c) => c.dealId === "d3")!;
    expect(c.perUnit).toBe(200);
    expect(c.perUnitBasis).toBe("sf");
  });
});

describe("summarizeMarkets", () => {
  const comps = buildComps([
    deal("d1", { market: "Dallas, TX", verdict: "pass", metrics: [["Going-in cap rate", "5.0%"], ["Purchase price", "$50,000,000"], ["Units", "200"]] }),
    deal("d2", { market: "Dallas, TX", verdict: "caution", metrics: [["Going-in cap rate", "5.4%"], ["Purchase price", "$60,000,000"], ["Units", "200"]] }),
    deal("d3", { assetClass: "office", market: "Austin, TX", verdict: "pass", metrics: [["Cap rate", "6.0%"], ["Purchase price", "$30,000,000"], ["Total SF", "150,000 SF"]] }),
  ]);
  const groups = summarizeMarkets(comps);

  it("groups by asset class × market, most-screened first", () => {
    expect(groups).toHaveLength(2);
    expect(groups[0].assetClass).toBe("multifamily");
    expect(groups[0].market).toBe("Dallas, TX");
    expect(groups[0].count).toBe(2);
  });
  it("computes cap and basis ranges over the members that carry them", () => {
    const g = groups[0];
    expect(g.cap).toEqual({ min: 5.0, median: 5.2, max: 5.4 });
    expect(g.perUnit).toEqual({ min: 250_000, median: 275_000, max: 300_000, basis: "unit" });
  });
  it("tallies the verdict calls", () => {
    expect(groups[0].calls).toEqual({ pass: 1, caution: 1, pass_on: 0 });
  });
});

describe("marketMemoryFor — the deal-page strip", () => {
  const comps = buildComps([
    deal("d1", { market: "Dallas, TX", metrics: [["Going-in cap rate", "5.0%"], ["Purchase price", "$50,000,000"], ["Units", "200"]] }),
    deal("d2", { market: "Dallas, TX", metrics: [["Going-in cap rate", "5.4%"], ["Purchase price", "$60,000,000"], ["Units", "200"]] }),
    deal("d3", { assetClass: "office", market: "Austin, TX", metrics: [["Cap rate", "6.0%"], ["Purchase price", "$30,000,000"], ["Total SF", "150,000 SF"]] }),
  ]);

  it("aggregates the account's OTHER screens of the same class × market", () => {
    const g = marketMemoryFor(comps, "d1", "multifamily", "Dallas, TX")!;
    expect(g.count).toBe(1); // excludes d1 itself
    expect(g.dealIds).toEqual(["d2"]);
    expect(g.cap).toEqual({ min: 5.4, median: 5.4, max: 5.4 });
  });
  it("is null when there's no comparable prior screen", () => {
    expect(marketMemoryFor(comps, "d3", "office", "Austin, TX")).toBeNull();
    expect(marketMemoryFor(comps, "d1", "multifamily", "Phoenix, AZ")).toBeNull();
  });
  it("normalizes the market key (case / whitespace)", () => {
    expect(normalizeMarketKey("  North  Dallas, TX ")).toBe("north dallas, tx");
    expect(marketMemoryFor(comps, "d1", "MULTIFAMILY", "dallas,  tx")).not.toBeNull();
  });
});

describe("range formatting", () => {
  it("cap range collapses when the ends coincide", () => {
    expect(fmtCapRange({ min: 5.0, median: 5.2, max: 5.4 })).toBe("5.0–5.4%");
    expect(fmtCapRange({ min: 5.2, median: 5.2, max: 5.2 })).toBe("5.2%");
  });
  it("basis range shares the unit suffix", () => {
    expect(fmtBasisRange({ min: 250_000, median: 275_000, max: 300_000, basis: "unit" })).toBe("$250–300k/unit");
    expect(fmtBasisRange({ min: 200, median: 200, max: 200, basis: "sf" })).toBe("$200/SF");
  });
});
