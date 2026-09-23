import { describe, expect, it } from "vitest";
import {
  FLAT_BAND_BPS,
  GROUPS,
  HISTORY_ROWS,
  MIN_CURVE_POINTS,
  NO_SEEDS,
  SERIES,
  WEEK_OBSERVATIONS,
  ageDays,
  formatMove,
  formatValue,
  fredUrl,
  seriesUrl,
  groupRates,
  moveBetween,
  rateSeeds,
  readRates,
  readSeriesTable,
  seedRate,
  seriesMeta,
  shortDate,
  treasuryForTerm,
  yieldCurve,
  type RateRow,
} from "./live-rates";
import { FIXTURE_NOW as NOW, REAL_ROWS as REAL } from "./live-rates.fixture";
import table from "@/data/fred-series.json";
import metrosSeed from "@/data/research/metros.json";
import {
  HVS_RATES_URL,
  METRO_SERIES,
  REGION_SERIES,
  PERMIT_WINDOW_MONTHS,
  SECTOR_JOBS_LABEL,
  SECTOR_JOBS_METRICS,
  isSectorJobsMetric,
  metroSeriesFor,
  permitsTrailingYear,
  readMetroRates,
  yearOverYear,
} from "./live-rates";

const read = readRates(REAL, NOW);
const of = (id: string) => read.find((r) => r.meta.id === id)!;

describe("the series table", () => {
  it("is the one the cron reads, held to its shape", () => {
    // The script requires the same JSON; a malformed entry must fail here
    // rather than silently vanish from the page while the cron writes it.
    expect(() => readSeriesTable(table)).not.toThrow();
    expect(SERIES.length).toBe(table.series.length);
    expect(HISTORY_ROWS).toBe(table.historyRows);
  });

  it("refuses a malformed entry rather than skipping it", () => {
    const good = { historyRows: 40, groups: [{ id: "curve", label: "x" }], series: [] };
    const entry = {
      id: "DGS10", short: "10-yr", label: "l", group: "curve", cadence: "daily",
      freshDays: 6, unit: "pct", contractRate: true,
    };
    expect(() => readSeriesTable({ ...good, series: [entry] })).not.toThrow();
    expect(() => readSeriesTable({ ...good, series: [{ ...entry, cadence: "hourly" }] })).toThrow(/cadence/);
    expect(() => readSeriesTable({ ...good, series: [{ ...entry, unit: "dollars" }] })).toThrow(/unit/);
    expect(() => readSeriesTable({ ...good, series: [{ ...entry, group: "bonds" }] })).toThrow(/group/);
    expect(() => readSeriesTable({ ...good, series: [entry, entry] })).toThrow(/duplicate/);
    expect(() => readSeriesTable({ ...good, series: [{ ...entry, contractRate: "yes" }] })).toThrow(/contractRate/);
    expect(() => readSeriesTable({ ...good, historyRows: 1 })).toThrow(/historyRows/);
  });

  it("makes a transformed series carry its own id", () => {
    // Storing FRED's percent change under FRED's own id is how a reader of
    // the table mistakes 3.4 for an index level.
    const good = { historyRows: 40, groups: [{ id: "inflation", label: "x" }], series: [] };
    const base = {
      id: "CPIAUCSL", short: "CPI", label: "l", group: "inflation", cadence: "monthly",
      freshDays: 100, unit: "pts", contractRate: false, units: "pc1",
    };
    expect(() => readSeriesTable({ ...good, series: [base] })).toThrow(/own id/);
    expect(() =>
      readSeriesTable({ ...good, series: [{ ...base, id: "CPIAUCSL_YOY", fred: "CPIAUCSL" }] }),
    ).not.toThrow();
    for (const s of SERIES) {
      if (s.units) expect(s.id, s.id).not.toBe(s.fred);
      else expect(s.fred).toBe(s.id);
    }
  });

  it("files every series under one of the strip's groups, in the strip's order", () => {
    const ids = GROUPS.map((g) => g.id);
    expect(ids).toEqual(["curve", "money", "credit", "mortgage", "inflation", "economy", "housing"]);
    for (const s of SERIES) expect(ids, s.id).toContain(s.group);
    // And the order of the series follows the order of the groups, so the
    // strip never has to sort.
    const seen = SERIES.map((s) => ids.indexOf(s.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("gives each series a threshold at least its own cadence", () => {
    // The whole point of freshDays is that it clears one publication
    // interval, its release lag and room to spare. A daily series judged
    // at one day would be stale every weekend; a monthly one judged at a
    // month would be stale for the weeks between the month's end and its
    // release — core PCE takes eight of them, and the fixture's July print
    // is 82 days old and current.
    const floor = { daily: 4, weekly: 8, monthly: 90, quarterly: 250 } as const;
    for (const s of SERIES) {
      expect(s.freshDays, s.id).toBeGreaterThanOrEqual(floor[s.cadence]);
    }
  });

  it("calls only the rates a loan document names a contract rate", () => {
    // The mortgage survey is the one that looks seedable and is not: it is
    // an owner-occupier residential rate, and lib/leverage.ts already treats
    // it as a floor rather than a quote for exactly this reason.
    for (const id of ["DGS2", "DGS10", "SOFR", "SOFR30DAYAVG", "DPRIME"]) {
      expect(seriesMeta(id)!.contractRate, id).toBe(true);
    }
    for (const id of ["MORTGAGE30US", "DRCRELEXFACBS", "DFF", "CPIAUCSL_YOY", "HOUST5F", "BAMLC0A0CM"]) {
      expect(seriesMeta(id)!.contractRate, id).toBe(false);
    }
  });

  it("knows the whole curve, each tenor with its maturity", () => {
    const tenors = SERIES.filter((s) => s.tenorMonths !== null).map((s) => s.tenorMonths);
    expect(tenors).toEqual([1, 3, 6, 12, 24, 36, 60, 84, 120, 240, 360]);
  });

  it("does not know a series the cron never pulls", () => {
    expect(seriesMeta("DRTSCLCC")).toBeNull(); // credit-card standards, caught by the dry run
    expect(seriesMeta("DGS4")).toBeNull();
  });
});

describe("how old a figure is", () => {
  it("counts whole days back to the observation", () => {
    expect(ageDays("2026-09-21", NOW)).toBe(0);
    expect(ageDays("2026-09-20", NOW)).toBe(1);
    expect(ageDays("2026-09-17", NOW)).toBe(4);
  });

  it("crosses a month end", () => {
    expect(ageDays("2026-08-31", new Date("2026-09-02T00:00:00Z"))).toBe(2);
  });

  it("treats an observation dated tomorrow as today, not as an error", () => {
    // A timezone edge, not a bad row. Refusing a good figure over it would
    // drop the seed for a few hours a day.
    expect(ageDays("2026-09-22", NOW)).toBe(0);
  });

  it("is infinitely old when the date does not parse", () => {
    expect(ageDays("not a date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("reading the table", () => {
  it("reports every series' newest observation, as the runner printed it", () => {
    expect(read).toHaveLength(SERIES.length);
    expect(of("DGS10").value).toBe(4.94);
    expect(of("DGS10").obsDate).toBe("2026-09-17");
    expect(of("SOFR").value).toBe(3.85);
    expect(of("BAMLH0A0HYM2").value).toBe(2.68);
    expect(of("WPUSI012011_YOY").value).toBeCloseTo(10.089, 3);
    expect(of("HOUST5F").value).toBe(344);
  });

  it("does not depend on the order the query returned", () => {
    // The query asks for obs_date descending. If that ever changes — a new
    // index, a rewritten select — the newest figure must still be the one
    // reported, not whichever row happened to arrive first.
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-10", value: 4.61 },
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.7 },
    ];
    expect(readRates(rows, NOW)[0].value).toBe(4.94);
    expect(readRates([...rows].reverse(), NOW)[0].value).toBe(4.94);
  });

  it("skips a series with no rows rather than inventing one", () => {
    const one = readRates([REAL[0]], NOW);
    expect(one).toHaveLength(1);
    expect(one[0].meta.id).toBe("DGS1MO");
  });

  it("ignores a row whose value is not a number", () => {
    // FRED posts "." for a holiday; the fetcher skips those, but a bad row
    // reaching the table must not become a rate on the page.
    const rows = [
      { series_id: "DGS10", obs_date: "2026-09-18", value: Number.NaN },
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
    ];
    expect(readRates(rows, NOW)[0].value).toBe(4.94);
  });

  it("drops a series the table holds but the table of series does not", () => {
    // Adding a series to the cron without adding it here shows nothing
    // rather than an unlabelled row.
    expect(readRates([{ series_id: "DGS4", obs_date: "2026-09-17", value: 4.7 }], NOW)).toEqual([]);
  });

  it("keeps the path behind each figure, oldest first, one point per date", () => {
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 }, // a duplicate
      { series_id: "DGS10", obs_date: "2026-09-16", value: 4.9 },
      { series_id: "DGS10", obs_date: "2026-09-15", value: 4.88 },
    ];
    const r = readRates(rows, NOW)[0];
    expect(r.history.map((h) => h.value)).toEqual([4.88, 4.9, 4.94]);
    expect(r.history.at(-1)!.obsDate).toBe(r.obsDate);
  });

  it("holds the path to the rows the cron writes", () => {
    const rows: RateRow[] = [];
    for (let i = 0; i < HISTORY_ROWS + 15; i++) {
      const d = new Date(Date.UTC(2026, 8, 21) - i * 86_400_000).toISOString().slice(0, 10);
      rows.push({ series_id: "SOFR", obs_date: d, value: 3.85 });
    }
    expect(readRates(rows, NOW)[0].history).toHaveLength(HISTORY_ROWS);
  });
});

describe("the move since the observation before, in the series' own unit", () => {
  it("is basis points for a rate, signed", () => {
    // The 10-year: 4.97 on Sep 14, 4.94 on Sep 17 — down three.
    expect(of("DGS10").move).toBe(-3);
    expect(of("DGS10").moveUnit).toBe("bps");
    // SOFR: 3.64 to 3.85 — up twenty-one.
    expect(of("SOFR").move).toBe(21);
  });

  it("is basis points for a spread quoted in percent points", () => {
    expect(moveBetween("spread", 0.77, 0.7)).toBe(7);
  });

  it("is points for a share or a change, to one place", () => {
    // "CPI up 10 bps" is a sentence nobody says.
    expect(moveBetween("pts", 3.35302, 3.1)).toBeCloseTo(0.3, 9);
    expect(moveBetween("pts", -5.7, -3.7)).toBeCloseTo(-2, 9);
  });

  it("is percent for a count", () => {
    expect(moveBetween("count", 344, 320)).toBeCloseTo(7.5, 9);
    expect(moveBetween("count", 300, 0)).toBe(0);
  });

  it("is null with only one observation, never zero", () => {
    // Zero would say "unchanged", which is a claim. There is nothing to
    // compare against.
    expect(of("DGS2").move).toBeNull();
    expect(readRates([REAL[0]], NOW)[0].move).toBeNull();
  });

  it("is zero when the rate genuinely did not move", () => {
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
      { series_id: "DGS10", obs_date: "2026-09-16", value: 4.94 },
    ];
    expect(readRates(rows, NOW)[0].move).toBe(0);
  });

  it("compares against a different day, not a re-pull of the same one", () => {
    // The cron upserts on (series_id, obs_date), so a duplicate should be
    // impossible — but if one arrived, comparing a day against itself would
    // report a flat market on every series.
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
      { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
      { series_id: "DGS10", obs_date: "2026-09-16", value: 4.8 },
    ];
    expect(readRates(rows, NOW)[0].move).toBe(14);
  });
});

describe("freshness, per series", () => {
  it("calls the whole Sep 21 pull fresh, every cadence included", () => {
    // Including the quarterly series, whose newest observation is five
    // months old and entirely current, and core PCE, whose July print is
    // eighty-two days old on the day it was pulled.
    expect(read.every((r) => r.fresh)).toBe(true);
    expect(of("DRCRELEXFACBS").ageDays).toBe(173);
    expect(of("PCEPILFE_YOY").ageDays).toBe(82);
  });

  it("would call half the table stale under one uniform threshold", () => {
    // This is the claim the per-series rule exists to make. Judge every
    // series at five days and everything past the daily feeds — half the
    // table on this pull, exactly — reads broken while working perfectly.
    const uniform = read.filter((r) => r.ageDays <= 5);
    expect(uniform.length).toBeLessThanOrEqual(read.length / 2);
    expect(uniform.length).toBeGreaterThan(0);
    expect(uniform.map((r) => r.meta.id)).toContain("DGS10");
    expect(uniform.map((r) => r.meta.id)).not.toContain("CPIAUCSL_YOY");
    expect(uniform.map((r) => r.meta.id)).not.toContain("DRCRELEXFACBS");
  });

  it("holds a daily series fresh across a holiday weekend", () => {
    // The pull runs mid-morning Eastern, before the day's release. Read on
    // the Tuesday after a Monday holiday it returns the previous Thursday's
    // figure — five days old and entirely correct.
    const r = readRates([{ series_id: "DGS10", obs_date: "2026-09-16", value: 4.9 }], NOW);
    expect(r[0].ageDays).toBe(5);
    expect(r[0].fresh).toBe(true);
  });

  it("catches a daily feed that actually stopped", () => {
    const stale = readRates([{ series_id: "DGS10", obs_date: "2026-09-01", value: 4.5 }], NOW);
    expect(stale[0].fresh).toBe(false);
    expect(stale[0].ageDays).toBe(20);
  });

  it("holds a weekly survey fresh across its own week", () => {
    const r = readRates([{ series_id: "MORTGAGE30US", obs_date: "2026-09-14", value: 6.95 }], NOW);
    expect(r[0].ageDays).toBe(7);
    expect(r[0].fresh).toBe(true);
  });

  it("holds a monthly index fresh through its release lag", () => {
    // A monthly figure is dated the first of the month it describes and
    // published two to eight weeks after that month ends. On Sep 21 the
    // newest core PCE is July's, which is right, not late.
    expect(of("PCEPILFE_YOY").fresh).toBe(true);
    const gone = readRates([{ series_id: "PCEPILFE_YOY", obs_date: "2026-05-01", value: 3 }], NOW);
    expect(gone[0].fresh).toBe(false);
  });

  it("holds a quarterly series fresh through its whole publication cycle", () => {
    // Q1, dated Jan 1, is the newest observation available until Q2 is
    // released in late August. At 263 days it is current, not stale.
    const r = readRates([{ series_id: "DRCRELEXFACBS", obs_date: "2026-01-01", value: 1.4 }], NOW);
    expect(r[0].ageDays).toBe(263);
    expect(r[0].fresh).toBe(true);
  });

  it("marks a quarterly series stale once a whole further cycle is missed", () => {
    const r = readRates([{ series_id: "DRCRELEXFACBS", obs_date: "2025-07-01", value: 1.2 }], NOW);
    expect(r[0].ageDays).toBeGreaterThan(300);
    expect(r[0].fresh).toBe(false);
  });
});

describe("how a figure is said", () => {
  it("says a rate to two places", () => {
    expect(formatValue(of("DGS10"))).toBe("4.94%");
    expect(formatValue(of("DPRIME"))).toBe("7.00%");
    // The 30-day average posts five decimals; the strip has room for two.
    expect(formatValue(of("SOFR30DAYAVG"))).toBe("3.68%");
  });

  it("says a spread in basis points, because nobody says 0.77% over", () => {
    expect(formatValue(of("BAMLC0A0CM"))).toBe("77 bps");
    expect(formatValue(of("BAMLH0A0HYM2"))).toBe("268 bps");
  });

  it("says a share or a change to one place, signed", () => {
    // A net share of banks EASING is negative and must read so — the
    // multifamily standards line is the finding, not a formatting edge.
    expect(formatValue(of("CPIAUCSL_YOY"))).toBe("3.4%");
    expect(formatValue(of("SUBLPDRCSM"))).toBe("−5.7%");
    expect(formatValue(of("TLNRESCONS_YOY"))).toBe("−1.3%");
  });

  it("says a count with its thousands", () => {
    expect(formatValue(of("HOUST5F"))).toBe("344k");
    expect(formatValue(of("HOUST"))).toBe("1,275k");
  });

  it("says a move with its unit, as a magnitude the arrow signs", () => {
    expect(formatMove(of("DGS10"))).toBe("3 bps");
    expect(formatMove({ move: 0.3, moveUnit: "pt" })).toBe("0.3 pt");
    expect(formatMove({ move: -7.5, moveUnit: "pct" })).toBe("7.5%");
    expect(formatMove({ move: null, moveUnit: "bps" })).toBeNull();
  });

  it("writes a short date with no year", () => {
    expect(shortDate("2026-09-17")).toBe("Sep 17");
    expect(shortDate("2026-04-01")).toBe("Apr 1");
  });

  it("reads the date in UTC, so it never slips a day", () => {
    // Formatting in the server's local zone would render "Dec 31" for a
    // Jan 1 observation anywhere west of Greenwich.
    expect(shortDate("2026-01-01")).toBe("Jan 1");
  });

  it("hands back an unparseable date rather than inventing one", () => {
    expect(shortDate("whenever")).toBe("whenever");
  });

  it("links each series to its own FRED page — the level's page for a transform", () => {
    expect(fredUrl("DGS10")).toBe("https://fred.stlouisfed.org/series/DGS10");
    // The y/y figure is FRED's own transform of the index; the page to
    // link is the index's, which is the only one that exists.
    expect(fredUrl("CPIAUCSL_YOY")).toBe("https://fred.stlouisfed.org/series/CPIAUCSL");
    expect(fredUrl("unknown")).toBe("https://fred.stlouisfed.org/series/unknown");
  });
});

describe("the strip's groups", () => {
  it("files the read into the groups, in order, leaving empty ones out", () => {
    const g = groupRates(read);
    expect(g.map((x) => x.group.id)).toEqual(["curve", "money", "credit", "mortgage", "inflation", "economy", "housing"]);
    expect(g.find((x) => x.group.id === "money")!.rates.map((r) => r.meta.id)).toEqual([
      "SOFR", "SOFR30DAYAVG", "DFF", "DPRIME",
    ]);
    expect(groupRates([of("SOFR")]).map((x) => x.group.id)).toEqual(["money"]);
  });
});

describe("the curve", () => {
  it("draws every fresh tenor in tenor order, as of the newest of them", () => {
    const c = yieldCurve(read)!;
    expect(c.points.map((p) => p.short)).toEqual([
      "1-mo", "3-mo", "6-mo", "1-yr", "2-yr", "3-yr", "5-yr", "7-yr", "10-yr Treasury", "20-yr", "30-yr",
    ]);
    expect(c.points.map((p) => p.value)).toEqual([3.97, 4.12, 4.2, 4.4, 4.67, 4.75, 4.78, 4.86, 4.94, 5.32, 5.29]);
    expect(c.asOf).toBe("2026-09-17");
  });

  it("takes its slope from the drawn points and names the shape", () => {
    // 4.94 less 4.67: twenty-seven basis points, a normal curve — from
    // the tenors themselves, never FRED's own spread series, which posts a
    // day apart from them and would put two slopes on one card.
    const c = yieldCurve(read)!;
    expect(c.slopeBps).toBe(27);
    expect(c.shape).toBe("normal");
  });

  it("calls a curve inside the band flat, and one the other way inverted", () => {
    const at = (two: number, ten: number) =>
      yieldCurve(
        readRates(
          [
            { series_id: "DGS1", obs_date: "2026-09-17", value: 4 },
            { series_id: "DGS2", obs_date: "2026-09-17", value: two },
            { series_id: "DGS5", obs_date: "2026-09-17", value: 4 },
            { series_id: "DGS10", obs_date: "2026-09-17", value: ten },
          ],
          NOW,
        ),
      )!;
    expect(at(4.5, 4.5 + FLAT_BAND_BPS / 100).shape).toBe("flat");
    expect(at(4.5, 4.5 + (FLAT_BAND_BPS + 1) / 100).shape).toBe("normal");
    expect(at(4.5, 4.5 - (FLAT_BAND_BPS + 1) / 100).shape).toBe("inverted");
    expect(at(4.5, 4.5 - FLAT_BAND_BPS / 100).slopeBps).toBe(-FLAT_BAND_BPS);
  });

  it("has no slope without both the 2-year and the 10-year, and says so", () => {
    const c = yieldCurve(
      readRates(
        [
          { series_id: "DGS1", obs_date: "2026-09-17", value: 4 },
          { series_id: "DGS3", obs_date: "2026-09-17", value: 4.1 },
          { series_id: "DGS5", obs_date: "2026-09-17", value: 4.2 },
          { series_id: "DGS10", obs_date: "2026-09-17", value: 4.3 },
        ],
        NOW,
      ),
    )!;
    expect(c.points).toHaveLength(4);
    expect(c.slopeBps).toBeNull();
    expect(c.shape).toBeNull();
  });

  it("leaves a stale tenor off rather than drawing last month into today", () => {
    const rows = REAL.filter((r) => r.series_id !== "DGS7").concat([
      { series_id: "DGS7", obs_date: "2026-08-20", value: 4.5 },
    ]);
    const c = yieldCurve(readRates(rows, NOW))!;
    expect(c.points.map((p) => p.short)).not.toContain("7-yr");
    expect(c.points).toHaveLength(10);
  });

  it("is no curve at all under four fresh tenors", () => {
    const three = REAL.filter((r) => ["DGS2", "DGS10", "DGS30"].includes(r.series_id));
    expect(yieldCurve(readRates(three, NOW))).toBeNull();
    expect(MIN_CURVE_POINTS).toBe(4);
  });

  it("carries the same tenor a week earlier once the history reaches back", () => {
    // Five observations back on a daily series is a week; with the fixture's
    // single observation per tenor there is nothing to draw the second line
    // from, and the flag says so rather than drawing today twice.
    expect(yieldCurve(read)!.weekAgoDrawable).toBe(false);
    const rows: RateRow[] = [];
    for (const id of ["DGS1", "DGS2", "DGS5", "DGS10"]) {
      for (let i = 0; i <= WEEK_OBSERVATIONS + 1; i++) {
        const d = new Date(Date.UTC(2026, 8, 17) - i * 86_400_000).toISOString().slice(0, 10);
        rows.push({ series_id: id, obs_date: d, value: 4 + i * 0.01 });
      }
    }
    const c = yieldCurve(readRates(rows, NOW))!;
    expect(c.weekAgoDrawable).toBe(true);
    expect(c.points[0].weekAgo).toBeCloseTo(4.05, 9);
    expect(c.points[0].value).toBe(4);
  });
});

describe("what may become a number in a box", () => {
  it("seeds the contract rates from today's figures", () => {
    expect(seedRate(read, "DGS10")).toBe(4.94);
    expect(seedRate(read, "DGS2")).toBe(4.67);
    expect(seedRate(read, "SOFR")).toBe(3.85);
    expect(seedRate(read, "DPRIME")).toBe(7);
  });

  it("never seeds the residential mortgage survey", () => {
    // It is shown — it is in the read — and it is refused as a seed. A
    // 30-year owner-occupier rate in a field labelled "loan rate" is wrong
    // by a spread nobody typed.
    expect(read.some((r) => r.meta.id === "MORTGAGE30US")).toBe(true);
    expect(seedRate(read, "MORTGAGE30US")).toBeNull();
  });

  it("never seeds a condition — delinquency, inflation, a count of starts", () => {
    expect(seedRate(read, "DRCRELEXFACBS")).toBeNull();
    expect(seedRate(read, "CPIAUCSL_YOY")).toBeNull();
    expect(seedRate(read, "HOUST5F")).toBeNull();
    expect(seedRate(read, "BAMLH0A0HYM2")).toBeNull();
  });

  it("stops seeding a contract rate that went stale", () => {
    const stale = readRates([{ series_id: "DGS10", obs_date: "2026-08-01", value: 4.2 }], NOW);
    expect(stale[0].fresh).toBe(false);
    expect(seedRate(stale, "DGS10")).toBeNull();
  });

  it("refuses a figure outside the range a rate can take", () => {
    const silly = readRates([{ series_id: "DGS10", obs_date: "2026-09-18", value: 494 }], NOW);
    expect(seedRate(silly, "DGS10")).toBeNull();
    const zero = readRates([{ series_id: "SOFR", obs_date: "2026-09-18", value: 0 }], NOW);
    expect(seedRate(zero, "SOFR")).toBeNull();
  });

  it("answers null for a series that is not there", () => {
    expect(seedRate([], "DGS10")).toBeNull();
  });
});

describe("the seeds handed to the page", () => {
  it("carries each seed with the date behind it, and the whole curve", () => {
    const seeds = rateSeeds(read);
    expect(seeds.treasury10yPct).toBe(4.94);
    expect(seeds.treasury10yAsOf).toBe("2026-09-17");
    expect(seeds.sofrPct).toBe(3.85);
    expect(seeds.sofrAsOf).toBe("2026-09-18");
    expect(seeds.curve.map((c) => c.tenorMonths)).toEqual([1, 3, 6, 12, 24, 36, 60, 84, 120, 240, 360]);
    expect(seeds.curve[4]).toEqual({ id: "DGS2", short: "2-yr", tenorMonths: 24, pct: 4.67, asOf: "2026-09-17" });
  });

  it("gives no date where it gave no figure", () => {
    // The date is the provenance of the seed. A date with no seed behind it
    // would be labelling the card's worked example as today's Treasury.
    const seeds = rateSeeds(readRates([{ series_id: "DGS10", obs_date: "2026-07-01", value: 4.2 }], NOW));
    expect(seeds.treasury10yPct).toBeNull();
    expect(seeds.treasury10yAsOf).toBeNull();
    expect(seeds.curve).toEqual([]);
  });

  it("is the empty set when the table is empty", () => {
    expect(rateSeeds(readRates([], NOW))).toEqual(NO_SEEDS);
  });

  it("seeds one where only one qualified", () => {
    const seeds = rateSeeds(readRates(REAL.filter((r) => r.series_id === "SOFR"), NOW));
    expect(seeds.sofrPct).toBe(3.85);
    expect(seeds.treasury10yPct).toBeNull();
    expect(seeds.curve).toEqual([]);
  });
});

describe("the Treasury a clause names", () => {
  const curve = rateSeeds(read).curve;

  it("is the tenor nearest the remaining term", () => {
    // A yield-maintenance clause prices off the Treasury with the maturity
    // closest to the remaining term. Thirty months is the card's worked
    // example — the 2-year, not the 10-year the strip leads with, and on
    // this curve twenty-seven basis points lower, which is a larger penalty.
    expect(treasuryForTerm(curve, 30)!.short).toBe("2-yr");
    expect(treasuryForTerm(curve, 30)!.pct).toBe(4.67);
    expect(treasuryForTerm(curve, 100)!.short).toBe("7-yr");
    expect(treasuryForTerm(curve, 120)!.short).toBe("10-yr Treasury");
    expect(treasuryForTerm(curve, 2)!.short).toBe("1-mo");
    expect(treasuryForTerm(curve, 600)!.short).toBe("30-yr");
  });

  it("breaks a tie toward the shorter tenor", () => {
    // Thirty months sits exactly between the 2-year and the 3-year. The
    // shorter is the lower yield on a normal curve, and so the larger
    // penalty — the side a buyer would rather be wrong on.
    expect(treasuryForTerm(curve, 30)!.tenorMonths).toBe(24);
    expect(treasuryForTerm(curve, 48)!.tenorMonths).toBe(36);
  });

  it("names nothing with no term, or no tenor to name", () => {
    expect(treasuryForTerm(curve, null)).toBeNull();
    expect(treasuryForTerm(curve, 0)).toBeNull();
    expect(treasuryForTerm([], 30)).toBeNull();
  });
});

describe("a covered metro's own series", () => {
  const COVERED = (metrosSeed.metros ?? []).map((m) => m.id);

  it("gives every covered metro something to show", () => {
    expect(COVERED.length).toBe(18);
    for (const id of COVERED) {
      expect(metroSeriesFor(id).series.length, id).toBeGreaterThan(0);
    }
    // Filed under the metro group, never a contract rate, each with the
    // area FRED's own title names.
    expect(METRO_SERIES.length).toBeGreaterThan(50);
    for (const m of METRO_SERIES) {
      expect(m.group).toBe("metro");
      expect(m.contractRate).toBe(false);
      expect(m.area.length, m.id).toBeGreaterThan(3);
      expect(COVERED, m.id).toContain(m.metro);
    }
  });

  it("refuses a metro entry filed wrong", () => {
    const good = {
      historyRows: 40,
      groups: [{ id: "curve", label: "x" }],
      series: [],
      metroSeries: [
        { id: "WASH911URN", metro: "dc", metric: "unemployment", area: "Washington MSA", short: "u", label: "l", cadence: "monthly", freshDays: 110, unit: "pts" },
      ],
      metroAliases: { pg_county: "dc" },
    };
    expect(() => readSeriesTable(good)).not.toThrow();
    const entry = good.metroSeries[0];
    expect(() => readSeriesTable({ ...good, metroSeries: [entry, entry] })).toThrow(/already has/);
    expect(() => readSeriesTable({ ...good, metroSeries: [{ ...entry, metric: "rent" }] })).toThrow(/metric/);
    expect(() => readSeriesTable({ ...good, metroSeries: [{ ...entry, area: "" }] })).toThrow(/area/);
    expect(() => readSeriesTable({ ...good, metroAliases: { pg_county: "tulsa" } })).toThrow(/no series/);
    expect(() => readSeriesTable({ ...good, metroAliases: { dc: "dc" } })).toThrow(/own series/);
    // A metro series is never also a strip series under the same id.
    expect(() =>
      readSeriesTable({
        ...good,
        series: [{ ...entry, group: "curve", contractRate: false }],
      }),
    ).toThrow(/already a strip series/);
  });

  it("gives a suburb its own unemployment and the MSA's everything else, named", () => {
    // Prince George's County has an unemployment rate of its own on FRED
    // and nothing else at this cadence; the permits and the payrolls are
    // the Washington MSA's, and they stay filed under dc so the page can
    // say whose they are.
    const pg = metroSeriesFor("pg_county");
    expect(pg.series.map((s) => s.metric)).toEqual([
      "unemployment",
      "jobs_yoy",
      ...SECTOR_JOBS_METRICS,
      "permits",
      "permits_1unit",
      "rent_cpi_yoy",
      "rental_vacancy_msa",
      "rental_vacancy",
    ]);
    expect(pg.series[0].id).toBe("MDPRIN5URN");
    expect(pg.series[0].metro).toBe("pg_county");
    expect(pg.series[1].metro).toBe("dc");
    expect(pg.borrowed).toEqual(["jobs_yoy", ...SECTOR_JOBS_METRICS, "permits", "permits_1unit", "rent_cpi_yoy", "rental_vacancy_msa", "rental_vacancy"]);
  });

  it("gives Newark its own house prices and New York's jobs", () => {
    const nj = metroSeriesFor("newark_jc");
    expect(nj.series.map((s) => s.metric)).toEqual([
      "unemployment",
      "jobs_yoy",
      ...SECTOR_JOBS_METRICS,
      "permits",
      "permits_1unit",
      "hpi_yoy",
      "rent_cpi_yoy",
      "rental_vacancy_msa",
      "rental_vacancy",
    ]);
    const hpi = nj.series.find((s) => s.metric === "hpi_yoy")!;
    expect(hpi.id).toBe("ATNHPIUS35084Q_YOY");
    expect(hpi.metro).toBe("newark_jc");
    expect(nj.borrowed).toEqual(["unemployment", "jobs_yoy", ...SECTOR_JOBS_METRICS, "permits", "permits_1unit", "rent_cpi_yoy", "rental_vacancy_msa", "rental_vacancy"]);
  });

  it("files each metro's payrolls by sector after its jobs, as FRED's own change from a year ago, only where the runner found the series", () => {
    // The probes of 2026-09-23 (rates runs 35920921683, 35920930790 and
    // 35921989451): FRED's short ids carry professional and business
    // services, education and health, and leisure and hospitality for
    // twelve metros (WASH911PBSV, …EDUH, …LEIH); retail trade and
    // transportation, warehousing and utilities exist only under the
    // BLS-shaped SMU…SA ids (SMU11479004200000001SA); Los Angeles has all
    // five in the SMU…SA form and no short ids; and Boston's exist only NOT
    // seasonally adjusted (SMU25144606000000001, no suffix — the SA form
    // and the SMS form both answered "does not exist"), which a change
    // against the same month a year earlier reads the same way. The dry
    // run on the branch (35922719610) then found FRED REFUSES its own
    // transform on three of Boston's five ("Value of units is not one of:
    // ch1, chg, lin" — the refusal Boston's total nonfarm already had),
    // while accepting it on the other two, so those three are stored as
    // the level under FRED's own id and derived on read.
    const dc = metroSeriesFor("dc").series.filter((s) => isSectorJobsMetric(s.metric));
    expect(dc.map((s) => s.metric)).toEqual(SECTOR_JOBS_METRICS);
    expect(dc.map((s) => s.id)).toEqual([
      "WASH911PBSV_YOY",
      "WASH911EDUH_YOY",
      "SMU11479004300000001SA_YOY",
      "SMU11479004200000001SA_YOY",
      "WASH911LEIH_YOY",
    ]);
    expect(metroSeriesFor("los_angeles").series.filter((s) => isSectorJobsMetric(s.metric)).map((s) => s.fred)).toEqual([
      "SMU06310806000000001SA",
      "SMU06310806500000001SA",
      "SMU06310804300000001SA",
      "SMU06310804200000001SA",
      "SMU06310807000000001SA",
    ]);
    const boston = metroSeriesFor("boston").series.filter((s) => isSectorJobsMetric(s.metric));
    expect(boston.map((s) => s.fred)).toEqual([
      "SMU25144606000000001",
      "SMU25144606500000001",
      "SMU25144604300000001",
      "SMU25144604200000001",
      "SMU25144607000000001",
    ]);
    expect(boston.map((s) => [s.id, s.units, s.derived])).toEqual([
      ["SMU25144606000000001", null, "yoy"],
      ["SMU25144606500000001", null, "yoy"],
      ["SMU25144604300000001_YOY", "pc1", null],
      ["SMU25144604200000001_YOY", "pc1", null],
      ["SMU25144607000000001", null, "yoy"],
    ]);
    // Every sector series is a change from a year ago — FRED's own
    // transform under a _YOY id, or the level derived on read where FRED
    // refuses it — in points, monthly, on the metro lag, labelled by
    // FRED's own title.
    for (const m of METRO_SERIES.filter((s) => isSectorJobsMetric(s.metric))) {
      if (m.derived === "yoy") {
        expect(m.units, m.id).toBeNull();
        expect(m.fred, m.id).toBe(m.id);
        expect(m.label, m.id).toContain("derived from the level");
      } else {
        expect(m.units, m.id).toBe("pc1");
        expect(m.id, m.id).toMatch(/_YOY$/);
      }
      expect(m.unit, m.id).toBe("pts");
      expect(m.cadence, m.id).toBe("monthly");
      expect(m.freshDays, m.id).toBe(110);
      expect(m.label, m.id).toMatch(/^All Employees: .* — change from a year ago/);
      expect(SECTOR_JOBS_LABEL[m.metric as keyof typeof SECTOR_JOBS_LABEL], m.id).toBeTruthy();
    }
    // Every MSA carries all five: fourteen pictures, seventy series.
    const sectorSeries = METRO_SERIES.filter((s) => isSectorJobsMetric(s.metric));
    expect(new Set(sectorSeries.map((s) => s.metro)).size).toBe(14);
    expect(sectorSeries.length).toBe(70);
    // And a read hands them back in the table's order, between the jobs and the permits.
    const rows: RateRow[] = [
      { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
      { series_id: "SMU11479004200000001SA_YOY", obs_date: "2026-08-01", value: -0.4 },
      { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.3 },
      { series_id: "WASH911BPPRIV", obs_date: "2026-07-01", value: 1844 },
    ];
    expect(readMetroRates("dc", rows, NOW).map((r) => r.meta.id)).toEqual([
      "WASH911NA_YOY",
      "WASH911PBSV_YOY",
      "SMU11479004200000001SA_YOY",
      "WASH911BPPRIV",
    ]);
  });

  it("leaves out a house price index FRED stopped publishing", () => {
    // Washington's and Atlanta's MSA series end at 2024 Q4 under the new
    // delineations: a tile reading "not updating" forever is worse than no
    // tile, so neither is filed.
    expect(metroSeriesFor("dc").series.map((s) => s.metric)).not.toContain("hpi_yoy");
    expect(metroSeriesFor("atlanta").series.map((s) => s.metric)).not.toContain("hpi_yoy");
    expect(metroSeriesFor("baltimore").series.map((s) => s.metric)).toContain("hpi_yoy");
  });

  it("answers nothing for a metro the table does not cover", () => {
    expect(metroSeriesFor("tulsa")).toEqual({ metro: "tulsa", series: [], borrowed: [] });
    expect(readMetroRates("tulsa", REAL, NOW)).toEqual([]);
  });

  it("reads a metro's rows in metric order, fresh through the two-month lag", () => {
    // Metro unemployment for July is published in early September and stays
    // the newest figure until October: eighty-odd days old and current.
    const rows: RateRow[] = [
      { series_id: "WASH911BPPRIV", obs_date: "2026-07-01", value: 1844 },
      { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
      { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.8 },
      { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
    ];
    const read = readMetroRates("dc", rows, NOW);
    expect(read.map((r) => r.meta.id)).toEqual(["WASH911URN", "WASH911NA_YOY", "WASH911BPPRIV"]);
    expect(read[0].ageDays).toBe(82);
    expect(read.every((r) => r.fresh)).toBe(true);
    expect(read[0].move).toBeCloseTo(0.2, 9);
    expect(read[0].moveUnit).toBe("pt");
    // And a suburb reads the MSA's rows under its own id.
    const pg = readMetroRates("pg_county", rows.concat({ series_id: "MDPRIN5URN", obs_date: "2026-07-01", value: 4.7 }), NOW);
    expect(pg.map((r) => r.meta.id)).toEqual(["MDPRIN5URN", "WASH911NA_YOY", "WASH911BPPRIV"]);
  });

  it("says a plain count of permits as units, moving in percent", () => {
    const rows: RateRow[] = [
      { series_id: "WASH911BPPRIV", obs_date: "2026-07-01", value: 1844 },
      { series_id: "WASH911BPPRIV", obs_date: "2026-06-01", value: 1600 },
    ];
    const r = readMetroRates("dc", rows, NOW).find((x) => x.meta.id === "WASH911BPPRIV")!;
    expect(formatValue(r)).toBe("1,844");
    expect(r.moveUnit).toBe("pct");
    expect(r.move).toBeCloseTo(15.3, 9);
    expect(formatMove(r)).toBe("15.3%");
  });
});

describe("a year of permits", () => {
  const monthly = (n: number, at: (i: number) => number): RateRow[] => {
    const rows: RateRow[] = [];
    for (let i = 0; i < n; i++) {
      // i months before July 2026, dated the first of the month.
      const d = new Date(Date.UTC(2026, 6 - i, 1)).toISOString().slice(0, 10);
      rows.push({ series_id: "WASH911BPPRIV", obs_date: d, value: at(i) });
    }
    return rows;
  };
  const permits = (rows: RateRow[]) =>
    readMetroRates("dc", rows, NOW).find((x) => x.meta.id === "WASH911BPPRIV")!;

  it("sums the trailing twelve months and sets them against the twelve before", () => {
    // A metro's permits arrive as one month's count, not seasonally
    // adjusted, so a single month is mostly the season. A year of them is
    // the pipeline; the year before is its direction.
    const r = permits(monthly(24, (i) => (i < 12 ? 1000 : 800)));
    const y = permitsTrailingYear(r)!;
    expect(y.units).toBe(12_000);
    expect(y.priorUnits).toBe(9_600);
    expect(y.changePct).toBeCloseTo(25, 9);
    expect(y.to).toBe("2026-07-01");
    expect(y.from).toBe("2025-08-01");
    expect(PERMIT_WINDOW_MONTHS).toBe(12);
  });

  it("is null without a full year, and has no comparison without two", () => {
    // A partial year is not a year; scaling it up would say the season.
    expect(permitsTrailingYear(permits(monthly(11, () => 1000)))).toBeNull();
    const one = permitsTrailingYear(permits(monthly(15, () => 1000)))!;
    expect(one.units).toBe(12_000);
    expect(one.priorUnits).toBeNull();
    expect(one.changePct).toBeNull();
  });
});

describe("a change from a year ago derived from the level", () => {
  // Boston's payrolls: FRED refuses its own pc1 transform on the series
  // ("units is not one of: ch1, chg, lin"), so the level is stored and the
  // change is worked out here — exactly what pc1 would have said.
  const level = (months: number, at: (i: number) => number): RateRow[] => {
    const rows: RateRow[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
      rows.push({ series_id: "SMS25144600000000001", obs_date: d, value: at(i) });
    }
    return rows;
  };

  it("stores the level under FRED's own id and shows the change", () => {
    const meta = seriesMeta("SMS25144600000000001")!;
    expect(meta.derived).toBe("yoy");
    expect(meta.units).toBeNull();
    expect(meta.fred).toBe("SMS25144600000000001");
    expect(fredUrl(meta.id)).toBe("https://fred.stlouisfed.org/series/SMS25144600000000001");
  });

  it("compares each month to the same month a year earlier, never to the nearest", () => {
    // 2,731.8 thousand in August 2026 against 2,700 a year before: +1.178%.
    const rows = level(14, (i) => (i === 0 ? 2731.8 : i === 12 ? 2700 : 2650));
    const r = readMetroRates("boston", rows, NOW).find((x) => x.meta.id === "SMS25144600000000001")!;
    expect(r.obsDate).toBe("2026-08-01");
    expect(r.value).toBeCloseTo(1.178, 3);
    expect(formatValue(r)).toBe("1.2%");
    // Two derivable points (August and July), so a move exists — in points.
    expect(r.history).toHaveLength(2);
    expect(r.move).not.toBeNull();
    expect(r.moveUnit).toBe("pt");
  });

  it("says nothing without a year of history behind the newest month", () => {
    const rows = level(12, () => 2700);
    expect(readMetroRates("boston", rows, NOW).some((x) => x.meta.id === "SMS25144600000000001")).toBe(false);
    expect(yearOverYear([])).toEqual([]);
  });

  it("refuses a BLS series filed with a FRED transform, or under a FRED id", () => {
    const good = { historyRows: 40, groups: [{ id: "inflation", label: "x" }], series: [] };
    const base = { id: "CUURS35ASEHA", source: "bls", short: "r", label: "l", group: "inflation", cadence: "monthly", freshDays: 110, unit: "pts", contractRate: false, derived: "yoy" };
    expect(() => readSeriesTable({ ...good, series: [base] })).not.toThrow();
    expect(() => readSeriesTable({ ...good, series: [{ ...base, derived: undefined, units: "pc1", id: "X_YOY", fred: "X" }] })).toThrow(/untransformed/);
    expect(() => readSeriesTable({ ...good, series: [{ ...base, fred: "CUURA311SEHA" }] })).toThrow(/untransformed/);
    expect(() => readSeriesTable({ ...good, series: [{ ...base, source: "opendata" }] })).toThrow(/source/);
    // A Census source is a different shape again: it needs a name to match.
    expect(() => readSeriesTable({ ...good, series: [{ ...base, source: "census" }] })).toThrow(/name prefix/);
    // Unsaid, the source is FRED.
    const read = readSeriesTable({ ...good, series: [{ ...base, source: undefined }] });
    expect(read.series[0].source).toBe("fred");
  });

  it("refuses a derived series filed with a transform, or under another id", () => {
    const good = { historyRows: 40, groups: [{ id: "economy", label: "x" }], series: [] };
    const base = { id: "SMS25144600000000001", short: "j", label: "l", group: "economy", cadence: "monthly", freshDays: 110, unit: "pts", contractRate: false, derived: "yoy" };
    expect(() => readSeriesTable({ ...good, series: [base] })).not.toThrow();
    expect(() => readSeriesTable({ ...good, series: [{ ...base, units: "pc1", fred: "X" }] })).toThrow(/level/);
    expect(() => readSeriesTable({ ...good, series: [{ ...base, derived: "mom" }] })).toThrow(/derived/);
  });
});

describe("each metro's rent index, from FRED or from the BLS", () => {
  // The CPI's rent of primary residence: what SITTING tenants pay across
  // the area's leases, where the asking rent on the same page is this
  // month's new ones. FRED carries it for eight metros under the BLS's
  // pre-2018 area codes (New York is A101, San Francisco A422 — found by
  // FRED's own search from the runner, rates runs 35752361935 and
  // 35752980803). It does not carry the areas the BLS redrew in 2018:
  // Washington, Baltimore and Los Angeles come from the BLS's API, and
  // their S-coded areas were pinned from FRED's average-price series for
  // the same places (APUS35A…, APUS35E…, APUS49A…).
  const rentOf = (metro: string) => metroSeriesFor(metro).series.find((s) => s.metric === "rent_cpi_yoy") ?? null;

  it("files a rent index for every metro that has one, and none for the two that do not", () => {
    for (const id of ["dc", "baltimore", "philadelphia", "nyc", "boston", "chicago", "los_angeles", "san_francisco", "seattle", "miami", "atlanta", "dallas"]) {
      const r = rentOf(id);
      expect(r, id).not.toBeNull();
      expect(r!.metro, id).toBe(id);
      expect(r!.derived, id).toBe("yoy");
      expect(r!.units, id).toBeNull();
      expect(r!.cadence, id).toBe("monthly");
      expect(r!.unit, id).toBe("pts");
    }
    // Richmond and Hampton Roads have no CPI area of their own, and a
    // region's figure is not a metro's — the tile is absent, not borrowed.
    expect(rentOf("richmond")).toBeNull();
    expect(rentOf("norfolk_hampton_roads")).toBeNull();
    // The Washington suburbs and Newark read their MSA's, named as such.
    for (const id of ["pg_county", "montgomery_county", "nova"]) {
      expect(rentOf(id)!.id, id).toBe("CUURS35ASEHA");
      expect(metroSeriesFor(id).borrowed, id).toContain("rent_cpi_yoy");
    }
    expect(rentOf("newark_jc")!.id).toBe("CUURA101SEHA");
  });

  it("knows which three come from the BLS, and links each to its own source", () => {
    expect(rentOf("dc")!.source).toBe("bls");
    expect(rentOf("baltimore")!.source).toBe("bls");
    expect(rentOf("los_angeles")!.source).toBe("bls");
    expect(rentOf("san_francisco")!.source).toBe("fred");
    expect(rentOf("nyc")!.source).toBe("fred");
    expect(seriesUrl("CUURS35ASEHA")).toBe("https://data.bls.gov/timeseries/CUURS35ASEHA");
    expect(seriesUrl("CUURA422SEHA")).toBe("https://fred.stlouisfed.org/series/CUURA422SEHA");
    // A FRED series' url is unchanged by the second source existing.
    expect(seriesUrl("DGS10")).toBe(fredUrl("DGS10"));
    expect(seriesUrl("CPIAUCSL_YOY")).toBe("https://fred.stlouisfed.org/series/CPIAUCSL");
    // Every other series in the table is FRED's.
    for (const s of SERIES) expect(s.source, s.id).toBe("fred");
    expect(METRO_SERIES.filter((s) => s.source === "bls").map((s) => s.id).sort()).toEqual(["CUURS35ASEHA", "CUURS35ESEHA", "CUURS49ASEHA"]);
  });

  it("reads the level and shows the change from a year earlier, whichever source wrote it", () => {
    const level = (id: string, months: number, at: (i: number) => number): RateRow[] => {
      const rows: RateRow[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
        rows.push({ series_id: id, obs_date: d, value: at(i) });
      }
      return rows;
    };
    // 420 in August 2026 against 400 a year before: +5.000%, in points.
    const dc = readMetroRates("dc", level("CUURS35ASEHA", 14, (i) => (i === 0 ? 420 : i === 12 ? 400 : 410)), NOW);
    const r = dc.find((x) => x.meta.id === "CUURS35ASEHA")!;
    expect(r.obsDate).toBe("2026-08-01");
    expect(r.value).toBeCloseTo(5, 6);
    expect(formatValue(r)).toBe("5.0%");
    expect(r.moveUnit).toBe("pt");
    expect(r.fresh).toBe(true);
    // And a suburb reads the same rows under the MSA's id.
    const pg = readMetroRates("pg_county", level("CUURS35ASEHA", 14, () => 400), NOW);
    expect(pg.map((x) => x.meta.id)).toEqual(["CUURS35ASEHA"]);
    expect(pg[0].value).toBe(0);
    // The FRED copy reads identically.
    const ny = readMetroRates("nyc", level("CUURA101SEHA", 14, (i) => (i === 0 ? 412 : 400)), NOW);
    expect(ny.find((x) => x.meta.id === "CUURA101SEHA")!.value).toBeCloseTo(3, 6);
  });
});

describe("the region's rental vacancy, borrowed and named", () => {
  // The Census Bureau's Housing Vacancy Survey publishes a rental vacancy
  // rate for the four Census regions and never for a metro (rates run
  // 35790692228 printed the four titles from the runner: "Rental Vacancy
  // Rate in the Northeast Census Region", Midwest, South, West —
  // quarterly, percent, newest 2026-04-01). Every covered metro borrows
  // its region's, filed under the REGION's id so the tile wears the
  // region's name and no metro's row ever claims a figure it lacks.
  const COVERED = (metrosSeed.metros ?? []).map((m) => m.id);
  const REGIONS = ["northeast", "midwest", "south", "west"];

  it("files one series per region, under the region and never a covered metro", () => {
    expect(REGION_SERIES.map((r) => r.metro).sort()).toEqual([...REGIONS].sort());
    for (const r of REGION_SERIES) {
      expect(COVERED, r.id).not.toContain(r.metro);
      expect(r.metric).toBe("rental_vacancy");
      expect(r.cadence).toBe("quarterly");
      expect(r.unit).toBe("pts");
      expect(r.area).toMatch(/Census region$/);
      expect(r.group).toBe("metro");
      expect(r.contractRate).toBe(false);
    }
  });

  it("gives every covered metro its region's figure, borrowed, last in the order", () => {
    for (const id of COVERED) {
      const { series, borrowed } = metroSeriesFor(id);
      const v = series.find((s) => s.metric === "rental_vacancy");
      expect(v, id).toBeDefined();
      expect(REGIONS, id).toContain(v!.metro);
      expect(borrowed, id).toContain("rental_vacancy");
      expect(series[series.length - 1].metric, id).toBe("rental_vacancy");
    }
    // Washington and its suburbs are the South; New York and Newark the
    // Northeast; Chicago the Midwest; the three Pacific metros the West.
    expect(metroSeriesFor("dc").series.at(-1)!.metro).toBe("south");
    expect(metroSeriesFor("nova").series.at(-1)!.metro).toBe("south");
    expect(metroSeriesFor("newark_jc").series.at(-1)!.metro).toBe("northeast");
    expect(metroSeriesFor("chicago").series.at(-1)!.metro).toBe("midwest");
    expect(metroSeriesFor("seattle").series.at(-1)!.metro).toBe("west");
  });

  it("links a region series to its FRED page like any other", () => {
    const south = REGION_SERIES.find((r) => r.metro === "south")!;
    expect(seriesMeta(south.id)).toBe(south);
    expect(seriesUrl(south.id)).toBe(`https://fred.stlouisfed.org/series/${south.id}`);
  });

  it("refuses a region filed wrong", () => {
    const good = {
      historyRows: 40,
      groups: [{ id: "curve", label: "x" }],
      series: [],
      metroSeries: [
        { id: "WASH911URN", metro: "dc", metric: "unemployment", area: "Washington MSA", short: "u", label: "l", cadence: "monthly", freshDays: 110, unit: "pts" },
      ],
      regionSeries: [
        { id: "RRVRSOQ156N", metro: "south", metric: "rental_vacancy", area: "South Census region", short: "v", label: "l", cadence: "quarterly", freshDays: 300, unit: "pts" },
      ],
      metroRegions: { dc: "south" },
    };
    expect(() => readSeriesTable(good)).not.toThrow();
    expect(() => readSeriesTable({ ...good, metroRegions: { dc: "north" } })).toThrow(/no series/);
    expect(() => readSeriesTable({ ...good, regionSeries: [{ ...good.regionSeries[0], area: "" }] })).toThrow(/area/);
    // A region series is never also a metro series under the same id.
    expect(() =>
      readSeriesTable({ ...good, regionSeries: [{ ...good.regionSeries[0], id: "WASH911URN" }] }),
    ).toThrow(/already a strip or metro series/);
  });
});

describe("the metro area's own rental vacancy, from the survey's workbook, with its margin", () => {
  // The Housing Vacancy Survey publishes a quarterly rate for the 75
  // largest metro areas as .xlsx and nothing else (zori.yml probe_url, run
  // 35794270430, printed both tables from the runner: Washington 5.9 ±2.2
  // then 6.2 ±2.2 for 2026, Richmond 7.0 ±4.7 then 6.2 ±5.1). The figure is
  // stored under an id of ours with the survey's margin of error in a
  // companion series, and a sample's margin for one metro is wide enough
  // that the figure is never shown without it.
  const COVERED = (metrosSeed.metros ?? []).map((m) => m.id);
  const CENSUS = METRO_SERIES.filter((s) => s.source === "census");

  it("files fourteen metro areas under one metric, each with a name prefix and a margin companion", () => {
    expect(CENSUS).toHaveLength(14);
    for (const s of CENSUS) {
      expect(s.metric, s.id).toBe("rental_vacancy_msa");
      expect(s.id).toMatch(/^HVS_RVR_\d{5}$/);
      expect(s.moe).toBe(`${s.id}_MOE`);
      expect(s.census, s.id).toBeTruthy();
      expect(s.cadence).toBe("quarterly");
      expect(s.unit).toBe("pts");
      expect(s.area).toMatch(/ MSA$/);
      expect(s.units).toBeNull();
      expect(s.derived).toBeNull();
      expect(s.fred).toBe(s.id);
      expect(COVERED).toContain(s.metro);
      // A companion is read beside its figure, never as a series of its own.
      expect(seriesMeta(s.moe!)).toBeNull();
    }
    // Nothing outside the survey's workbook carries a margin or a name to match.
    for (const s of [...SERIES, ...METRO_SERIES, ...REGION_SERIES]) {
      if (s.source === "census") continue;
      expect(s.moe, s.id).toBeNull();
      expect(s.census, s.id).toBeNull();
    }
  });

  it("gives every covered metro the survey's metro figure ahead of the region's, borrowed where a suburb has none", () => {
    for (const id of COVERED) {
      const { series } = metroSeriesFor(id);
      const msa = series.findIndex((s) => s.metric === "rental_vacancy_msa");
      const region = series.findIndex((s) => s.metric === "rental_vacancy");
      expect(msa, id).toBeGreaterThanOrEqual(0);
      expect(region, id).toBeGreaterThan(msa);
    }
    expect(metroSeriesFor("dc").borrowed).not.toContain("rental_vacancy_msa");
    const pg = metroSeriesFor("pg_county");
    expect(pg.borrowed).toContain("rental_vacancy_msa");
    expect(pg.series.find((s) => s.metric === "rental_vacancy_msa")!.area).toBe("Washington MSA");
    expect(metroSeriesFor("newark_jc").series.find((s) => s.metric === "rental_vacancy_msa")!.area).toBe("New York MSA");
  });

  it("reads the figure with the margin for the SAME date, and links it to the survey's page", () => {
    const rows: RateRow[] = [
      { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
      { series_id: "HVS_RVR_47900", obs_date: "2026-01-01", value: 5.9 },
      { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
      { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-01-01", value: 2.1 },
    ];
    const r = readMetroRates("dc", rows, NOW).find((x) => x.meta.id === "HVS_RVR_47900")!;
    expect(r.value).toBe(6.2);
    expect(r.moe).toBe(2.2);
    expect(r.move).toBe(0.3);
    expect(r.moveUnit).toBe("pt");
    expect(formatValue(r)).toBe("6.2%");
    // No margin for the newest quarter: null — never the quarter before's.
    const noMargin = readMetroRates(
      "dc",
      rows.filter((x) => !(x.series_id.endsWith("_MOE") && x.obs_date === "2026-04-01")),
      NOW,
    ).find((x) => x.meta.id === "HVS_RVR_47900")!;
    expect(noMargin.moe).toBeNull();
    // The companion never surfaces as a tile of its own.
    expect(readMetroRates("dc", rows, NOW).some((x) => x.meta.id === "HVS_RVR_47900_MOE")).toBe(false);
    // A FRED figure states no margin, and a Census one links to the survey.
    expect(readMetroRates("dc", [{ series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 }], NOW)[0].moe).toBeNull();
    expect(seriesUrl("HVS_RVR_47900")).toBe(HVS_RATES_URL);
    expect(seriesUrl("HVS_RVR_47900")).toMatch(/^https:\/\/www\.census\.gov\//);
  });

  it("holds a Census entry to its shape, and a margin companion to being nobody's series", () => {
    const base = {
      id: "HVS_RVR_00000", source: "census", census: "Nowhere-", moe: "HVS_RVR_00000_MOE",
      short: "r", label: "l", cadence: "quarterly", freshDays: 300, unit: "pts",
    };
    const tableOf = (entry: Record<string, unknown>, series: unknown[] = []) => ({
      historyRows: 2,
      groups: [{ id: "metro", label: "m" }, { id: "curve", label: "c" }],
      series,
      metroSeries: [{ ...entry, metro: "dc", metric: "rental_vacancy_msa", area: "Nowhere MSA" }],
    });
    expect(() => readSeriesTable(tableOf(base))).not.toThrow();
    expect(() => readSeriesTable(tableOf({ ...base, census: undefined }))).toThrow(/name prefix/);
    expect(() => readSeriesTable(tableOf({ ...base, census: "  " }))).toThrow(/name prefix/);
    // A transform trips the table's older rule first (a transformed figure
    // needs an id of its own) or this one; either way it is refused.
    expect(() => readSeriesTable(tableOf({ ...base, units: "pc1" }))).toThrow(/own id|untransformed/);
    expect(() => readSeriesTable(tableOf({ ...base, units: "pc1", fred: "OTHER" }))).toThrow(/untransformed/);
    expect(() => readSeriesTable(tableOf({ ...base, fred: "OTHER" }))).toThrow(/untransformed/);
    expect(() => readSeriesTable(tableOf({ ...base, derived: "yoy" }))).toThrow(/untransformed/);
    expect(() => readSeriesTable(tableOf({ ...base, moe: base.id }))).toThrow(/companion/);
    expect(() => readSeriesTable(tableOf({ ...base, source: "fred", census: "Nowhere-", moe: undefined }))).toThrow(/only a Census series/);
    // A margin id that is already a series of the table's own is refused.
    const strip = { id: "HVS_RVR_00000_MOE", short: "x", label: "x", group: "curve", cadence: "daily", freshDays: 6, unit: "pct", contractRate: false };
    expect(() => readSeriesTable(tableOf(base, [strip]))).toThrow(/already a series/);
  });
});
