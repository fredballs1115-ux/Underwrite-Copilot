import { describe, expect, it } from "vitest";
import { readRates } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import {
  CONSTRUCTION_SPREAD_BPS,
  NO_DEBT_SEEDS,
  allInPct,
  constructionSeed,
  datedLong,
  debtRateNote,
  debtSeeds,
  indexName,
} from "./debt-index";

// The runner's own table, figure for figure (lib/live-rates.fixture.ts).
const rates = readRates(REAL_ROWS, FIXTURE_NOW);

describe("debtSeeds — the index a loan is quoted over, off today's table", () => {
  it("a five-year hold prices off the 5-year Treasury, dated", () => {
    const s = debtSeeds(rates, 60);
    expect(s.permanent).toEqual({ id: "DGS5", short: "5-yr", pct: 4.78, asOf: "2026-09-17", kind: "treasury" });
  });

  it("the tenor follows the hold: seven years the 7-yr, ten the 10-yr", () => {
    expect(debtSeeds(rates, 84).permanent?.id).toBe("DGS7");
    expect(debtSeeds(rates, 120).permanent?.id).toBe("DGS10");
    expect(debtSeeds(rates, 120).permanent?.pct).toBe(4.94);
  });

  it("the floating index is 30-day average SOFR, dated its own day", () => {
    const f = debtSeeds(rates, 60).floating;
    expect(f?.id).toBe("SOFR30DAYAVG");
    expect(f?.short).toBe("30-day avg SOFR");
    expect(f?.pct).toBeCloseTo(3.67623, 5);
    expect(f?.asOf).toBe("2026-09-21");
    expect(f?.kind).toBe("sofr");
  });

  it("overnight SOFR stands in only where the average is not fresh", () => {
    const withoutAvg = readRates(
      REAL_ROWS.filter((r) => r.series_id !== "SOFR30DAYAVG"),
      FIXTURE_NOW,
    );
    expect(debtSeeds(withoutAvg, 60).floating?.id).toBe("SOFR");
    expect(debtSeeds(withoutAvg, 60).floating?.pct).toBe(3.85);
  });

  it("the 10-year rides beside the tenor, whatever the hold, as the benchmark a cap spread is quoted over", () => {
    expect(debtSeeds(rates, 60).tenYear).toEqual({ id: "DGS10", short: "10-yr Treasury", pct: 4.94, asOf: "2026-09-17", kind: "treasury" });
    expect(debtSeeds(rates, 120).tenYear?.pct).toBe(4.94);
  });

  it("a stale table seeds nothing — a benchmark that cannot be backed is not made", () => {
    const stale = readRates(REAL_ROWS, new Date("2027-03-01T00:00:00Z"));
    expect(debtSeeds(stale, 60)).toEqual(NO_DEBT_SEEDS);
  });

  it("an empty table seeds nothing", () => {
    expect(debtSeeds(readRates([], FIXTURE_NOW), 60)).toEqual(NO_DEBT_SEEDS);
  });

  it("no hold, no tenor to name", () => {
    expect(debtSeeds(rates, 0).permanent).toBeNull();
  });
});

describe("the all-in rate and its note", () => {
  const five = debtSeeds(rates, 60).permanent!;

  it("index plus spread, to two places", () => {
    expect(allInPct(five, 200)).toBe(6.78);
    expect(allInPct(five, 225)).toBe(7.03);
    expect(allInPct({ ...five, pct: 4.781 }, 200)).toBe(6.78);
  });

  it("names the index, its figure, its date with the year, and the spread as the assumption", () => {
    expect(debtRateNote(five, 200, "multifamily spread")).toBe(
      "5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps multifamily spread, a screening default — enter your quote",
    );
  });

  it("does not say Treasury twice where the strip's own short already does", () => {
    const ten = debtSeeds(rates, 120).permanent!;
    expect(indexName(ten)).toBe("10-yr Treasury");
    expect(indexName(five)).toBe("5-yr Treasury");
    expect(indexName(debtSeeds(rates, 60).floating!)).toBe("30-day avg SOFR");
  });

  it("the construction seed is the floating index plus the construction spread", () => {
    const c = constructionSeed(debtSeeds(rates, 60));
    expect(c?.pct).toBe(Math.round((3.67623 + CONSTRUCTION_SPREAD_BPS / 100) * 100) / 100);
    expect(c?.pct).toBe(7.18);
    expect(c?.note).toBe(
      "30-day avg SOFR 3.68% (FRED, Sep 21, 2026) + 350 bps construction spread, a screening default — enter your quote",
    );
    expect(constructionSeed(NO_DEBT_SEEDS)).toBeNull();
  });

  it("a date is printed with its year, and an unreadable one as it came", () => {
    expect(datedLong("2026-09-17")).toBe("Sep 17, 2026");
    expect(datedLong("not a date")).toBe("not a date");
  });
});
