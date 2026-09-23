import { describe, expect, it } from "vitest";
import { readMetroRates, type RateRow } from "./live-rates";
import { metroSupply, supplySentence } from "./metro-supply";

// Twenty-four months of Philadelphia's permits, ending Jul 2026: the total
// runs 1,200 a month in the last year and 1,000 the year before; the
// single-family units 500 a month throughout — so the multi-unit remainder
// is 700 a month against 500.
const NOW = new Date("2026-09-21T20:00:00Z");
const monthsBack = (n: number): string => {
  const d = new Date(Date.UTC(2026, 6 - n, 1));
  return d.toISOString().slice(0, 10);
};
const rows = (total: (i: number) => number, single: (i: number) => number, n = 24): RateRow[] => [
  ...Array.from({ length: n }, (_, i) => ({ series_id: "PHIL942BPPRIV", obs_date: monthsBack(i), value: total(i) })),
  ...Array.from({ length: n }, (_, i) => ({ series_id: "PHIL942BP1FH", obs_date: monthsBack(i), value: single(i) })),
];

describe("metroSupply — the units permitted in buildings of two or more, the total less the single-family series", () => {
  it("sums twelve months against the twelve before, month by month, and says the share", () => {
    const s = metroSupply(readMetroRates("philadelphia", rows((i) => (i < 12 ? 1200 : 1000), () => 500), NOW))!;
    expect(s.area).toBe("Philadelphia MSA");
    expect(s.toMonth).toBe("Jul 2026");
    expect(s.to).toBe("2026-07-01");
    expect(s.total).toBe(14_400);
    expect(s.totalPrior).toBe(12_000);
    expect(s.totalChangePct).toBe(20);
    expect(s.single).toBe(6_000);
    expect(s.singlePrior).toBe(6_000);
    expect(s.multi).toBe(8_400);
    expect(s.multiPrior).toBe(6_000);
    expect(s.multiChangePct).toBe(40);
    expect(s.multiSharePct).toBe(58.3);
    expect(s.hrefTotal).toBe("https://fred.stlouisfed.org/series/PHIL942BPPRIV");
    expect(s.hrefSingle).toBe("https://fred.stlouisfed.org/series/PHIL942BP1FH");
    expect(s.fresh).toBe(true);
    expect(s.months).toHaveLength(24);
    expect(s.months[23]).toEqual({ obsDate: "2026-07-01", total: 1200, single: 500, multi: 700 });
    expect(supplySentence(s)).toBe(
      "8,400 units in buildings of two or more, twelve months to Jul 2026 (+40.0% on the twelve months before), 58.3% of the 14,400 permitted",
    );
  });

  it("aligns the two series by date: a month one of them lacks is left out of both sums", () => {
    const r = rows((i) => (i < 12 ? 1200 : 1000), () => 500, 25).filter(
      (x) => !(x.series_id === "PHIL942BP1FH" && x.obs_date === "2025-07-01"),
    );
    const s = metroSupply(readMetroRates("philadelphia", r, NOW))!;
    // Twenty-five months of totals, twenty-four of single-family: the
    // aligned set is twenty-four, and the window is still the last twelve.
    expect(s.months).toHaveLength(24);
    expect(s.months.some((m) => m.obsDate === "2025-07-01")).toBe(false);
    expect(s.multi).toBe(8_400);
    // The year before is the twelve aligned months before those, Jul 2025 excluded.
    expect(s.multiPrior).toBe(6_000);
  });

  it("answers null without both series, or without a whole year of them, and never scales a partial year", () => {
    const totalOnly = rows((i) => (i < 12 ? 1200 : 1000), () => 500).filter((x) => x.series_id === "PHIL942BPPRIV");
    expect(metroSupply(readMetroRates("philadelphia", totalOnly, NOW))).toBeNull();
    expect(metroSupply(readMetroRates("philadelphia", rows(() => 1200, () => 500, 11), NOW))).toBeNull();
    expect(metroSupply([])).toBeNull();
    // A year with no year before it has a figure and no change.
    const one = metroSupply(readMetroRates("philadelphia", rows(() => 1200, () => 500, 12), NOW))!;
    expect(one.multi).toBe(8_400);
    expect(one.multiPrior).toBeNull();
    expect(one.multiChangePct).toBeNull();
    expect(one.singlePrior).toBeNull();
    expect(supplySentence(one)).toBe("8,400 units in buildings of two or more, twelve months to Jul 2026, 58.3% of the 14,400 permitted");
  });

  it("a stale series makes the read stale, and a suburb reads its metro area's counts", () => {
    const old = new Date("2027-03-01T00:00:00Z");
    expect(metroSupply(readMetroRates("philadelphia", rows(() => 1200, () => 500), old))!.fresh).toBe(false);
    const dcRows = rows(() => 1200, () => 500).map((x) => ({
      ...x,
      series_id: x.series_id === "PHIL942BPPRIV" ? "WASH911BPPRIV" : "WASH911BP1FH",
    }));
    const pg = metroSupply(readMetroRates("pg_county", dcRows, NOW))!;
    expect(pg.area).toBe("Washington MSA");
    expect(pg.multi).toBe(8_400);
  });
});
