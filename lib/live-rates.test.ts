import { describe, expect, it } from "vitest";
import {
  NO_SEEDS,
  SERIES,
  ageDays,
  fredUrl,
  rateSeeds,
  readRates,
  seedRate,
  seriesMeta,
  shortDate,
  type RateRow,
} from "./live-rates";

const NOW = new Date("2026-09-17T14:00:00Z");

/** What the Sep 16 cron actually wrote, read out of the runner's log. */
const REAL: RateRow[] = [
  { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
  { series_id: "SOFR", obs_date: "2026-09-15", value: 3.64 },
  { series_id: "MORTGAGE30US", obs_date: "2026-09-10", value: 6.76 },
  { series_id: "DRCRELEXFACBS", obs_date: "2026-04-01", value: 1.53 },
];

describe("the series table", () => {
  it("knows all four the cron pulls", () => {
    expect(SERIES.map((s) => s.id)).toEqual([
      "DGS10",
      "SOFR",
      "MORTGAGE30US",
      "DRCRELEXFACBS",
    ]);
  });

  it("gives each series a threshold at least its own cadence", () => {
    // The whole point of freshDays is that it clears one publication
    // interval with room to spare. A daily series judged at one day would
    // be stale every weekend.
    // The quarterly floor is the one that surprises: a quarterly observation
    // is dated the quarter's first day and published two months after that
    // quarter ends, so the current figure can be eight months old. A
    // threshold of one quarter — the obvious number, and the one written
    // here first — reports a working feed as broken.
    const floor = { daily: 4, weekly: 8, quarterly: 250 } as const;
    for (const s of SERIES) {
      expect(s.freshDays, s.id).toBeGreaterThanOrEqual(floor[s.cadence]);
    }
  });

  it("calls only the rates a loan document names a contract rate", () => {
    // The mortgage survey is the one that looks seedable and is not: it is
    // an owner-occupier residential rate, and lib/leverage.ts already treats
    // it as a floor rather than a quote for exactly this reason.
    expect(seriesMeta("DGS10")!.contractRate).toBe(true);
    expect(seriesMeta("SOFR")!.contractRate).toBe(true);
    expect(seriesMeta("MORTGAGE30US")!.contractRate).toBe(false);
    expect(seriesMeta("DRCRELEXFACBS")!.contractRate).toBe(false);
  });

  it("does not know a series the cron never pulls", () => {
    expect(seriesMeta("DGS2")).toBeNull();
  });
});

describe("how old a figure is", () => {
  it("counts whole days back to the observation", () => {
    expect(ageDays("2026-09-17", NOW)).toBe(0);
    expect(ageDays("2026-09-16", NOW)).toBe(1);
    expect(ageDays("2026-09-14", NOW)).toBe(3);
  });

  it("crosses a month end", () => {
    expect(ageDays("2026-08-31", new Date("2026-09-02T00:00:00Z"))).toBe(2);
  });

  it("treats an observation dated tomorrow as today, not as an error", () => {
    // A timezone edge, not a bad row. Refusing a good figure over it would
    // drop the seed for a few hours a day.
    expect(ageDays("2026-09-18", NOW)).toBe(0);
  });

  it("is infinitely old when the date does not parse", () => {
    expect(ageDays("not a date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("reading the table", () => {
  it("reports each series' newest observation", () => {
    const read = readRates(REAL, NOW);
    expect(read.map((r) => r.meta.id)).toEqual([
      "DGS10",
      "SOFR",
      "MORTGAGE30US",
      "DRCRELEXFACBS",
    ]);
    expect(read[0].value).toBe(4.97);
    expect(read[1].value).toBe(3.64);
  });

  it("does not depend on the order the query returned", () => {
    // The query asks for obs_date descending. If that ever changes — a new
    // index, a rewritten select — the newest figure must still be the one
    // reported, not whichever row happened to arrive first.
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-10", value: 4.61 },
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.7 },
    ];
    expect(readRates(rows, NOW)[0].value).toBe(4.97);
    expect(readRates([...rows].reverse(), NOW)[0].value).toBe(4.97);
  });

  it("skips a series with no rows rather than inventing one", () => {
    const read = readRates([REAL[0]], NOW);
    expect(read).toHaveLength(1);
    expect(read[0].meta.id).toBe("DGS10");
  });

  it("ignores a row whose value is not a number", () => {
    // FRED posts "." for a holiday; the fetcher skips those, but a bad row
    // reaching the table must not become a rate on the page.
    const rows = [
      { series_id: "DGS10", obs_date: "2026-09-15", value: Number.NaN },
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
    ];
    expect(readRates(rows, NOW)[0].value).toBe(4.97);
  });

  it("reads a series the table holds but the table of series does not", () => {
    // Backwards: an unknown series_id is dropped, so adding a series to the
    // cron without adding it here shows nothing rather than an unlabelled row.
    const read = readRates([{ series_id: "DGS2", obs_date: "2026-09-16", value: 3.9 }], NOW);
    expect(read).toEqual([]);
  });
});

describe("the move since the observation before", () => {
  it("is in basis points, signed", () => {
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.84 },
    ];
    expect(readRates(rows, NOW)[0].moveBps).toBe(13);
  });

  it("is negative when the rate fell", () => {
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.84 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.97 },
    ];
    expect(readRates(rows, NOW)[0].moveBps).toBe(-13);
  });

  it("is null with only one observation, never zero", () => {
    // Zero would say "unchanged", which is a claim. There is nothing to
    // compare against.
    expect(readRates([REAL[0]], NOW)[0].moveBps).toBeNull();
  });

  it("is zero when the rate genuinely did not move", () => {
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.97 },
    ];
    expect(readRates(rows, NOW)[0].moveBps).toBe(0);
  });

  it("compares against a different day, not a re-pull of the same one", () => {
    // The cron upserts on (series_id, obs_date), so a duplicate should be
    // impossible — but if one arrived, comparing a day against itself would
    // report a flat market on every series.
    const rows: RateRow[] = [
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
      { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
      { series_id: "DGS10", obs_date: "2026-09-11", value: 4.8 },
    ];
    expect(readRates(rows, NOW)[0].moveBps).toBe(17);
  });
});

describe("freshness, per series", () => {
  it("calls the real Sep 16 pull fresh on all four", () => {
    // Including the quarterly series, whose newest observation is five
    // months old and entirely current.
    const read = readRates(REAL, NOW);
    expect(read.every((r) => r.fresh)).toBe(true);
    expect(read.find((r) => r.meta.id === "DRCRELEXFACBS")!.ageDays).toBeGreaterThan(150);
  });

  it("would call three of the four stale under one uniform threshold", () => {
    // This is the claim the per-series rule exists to make. Judge every
    // series at five days and the weekly and quarterly feeds read broken
    // while working perfectly.
    const read = readRates(REAL, NOW);
    const uniform = read.filter((r) => r.ageDays <= 5);
    expect(uniform.map((r) => r.meta.id)).toEqual(["DGS10", "SOFR"]);
  });

  it("holds a daily series fresh across a holiday weekend", () => {
    // The pull runs mid-morning Eastern, before the day's release. Read on
    // the Tuesday after a Monday holiday it returns the previous Thursday's
    // figure — five days old and entirely correct.
    const read = readRates(
      [{ series_id: "DGS10", obs_date: "2026-09-12", value: 4.9 }],
      NOW,
    );
    expect(read[0].ageDays).toBe(5);
    expect(read[0].fresh).toBe(true);
  });

  it("catches a daily feed that actually stopped", () => {
    const stale = readRates(
      [{ series_id: "DGS10", obs_date: "2026-09-01", value: 4.5 }],
      NOW,
    );
    expect(stale[0].fresh).toBe(false);
    expect(stale[0].ageDays).toBe(16);
  });

  it("holds a weekly survey fresh across its own week", () => {
    const read = readRates(
      [{ series_id: "MORTGAGE30US", obs_date: "2026-09-10", value: 6.76 }],
      NOW,
    );
    expect(read[0].ageDays).toBe(7);
    expect(read[0].fresh).toBe(true);
  });

  it("holds a quarterly series fresh through its whole publication cycle", () => {
    // Q1, dated Jan 1, is the newest observation available until Q2 is
    // released in late August. At 259 days it is current, not stale.
    const read = readRates(
      [{ series_id: "DRCRELEXFACBS", obs_date: "2026-01-01", value: 1.4 }],
      NOW,
    );
    expect(read[0].ageDays).toBe(259);
    expect(read[0].fresh).toBe(true);
  });

  it("marks a quarterly series stale once a whole further cycle is missed", () => {
    const read = readRates(
      [{ series_id: "DRCRELEXFACBS", obs_date: "2025-07-01", value: 1.2 }],
      NOW,
    );
    expect(read[0].ageDays).toBeGreaterThan(300);
    expect(read[0].fresh).toBe(false);
  });
});

describe("what may become a number in a box", () => {
  const read = readRates(REAL, NOW);

  it("seeds the Treasury and SOFR from today's figures", () => {
    expect(seedRate(read, "DGS10")).toBe(4.97);
    expect(seedRate(read, "SOFR")).toBe(3.64);
  });

  it("never seeds the residential mortgage survey", () => {
    // It is shown — it is in the read — and it is refused as a seed. A
    // 30-year owner-occupier rate in a field labelled "loan rate" is wrong
    // by a spread nobody typed.
    expect(read.some((r) => r.meta.id === "MORTGAGE30US")).toBe(true);
    expect(seedRate(read, "MORTGAGE30US")).toBeNull();
  });

  it("never seeds the delinquency rate, which is not a price at all", () => {
    expect(seedRate(read, "DRCRELEXFACBS")).toBeNull();
  });

  it("stops seeding a contract rate that went stale", () => {
    const stale = readRates(
      [{ series_id: "DGS10", obs_date: "2026-08-01", value: 4.2 }],
      NOW,
    );
    expect(stale[0].fresh).toBe(false);
    expect(seedRate(stale, "DGS10")).toBeNull();
  });

  it("refuses a figure outside the range a rate can take", () => {
    const silly = readRates(
      [{ series_id: "DGS10", obs_date: "2026-09-16", value: 497 }],
      NOW,
    );
    expect(seedRate(silly, "DGS10")).toBeNull();
    const zero = readRates(
      [{ series_id: "SOFR", obs_date: "2026-09-16", value: 0 }],
      NOW,
    );
    expect(seedRate(zero, "SOFR")).toBeNull();
  });

  it("answers null for a series that is not there", () => {
    expect(seedRate([], "DGS10")).toBeNull();
  });
});

describe("the seeds handed to the page", () => {
  it("carries each seed with the date behind it", () => {
    const seeds = rateSeeds(readRates(REAL, NOW));
    expect(seeds).toEqual({
      treasury10yPct: 4.97,
      sofrPct: 3.64,
      treasury10yAsOf: "2026-09-14",
      sofrAsOf: "2026-09-15",
    });
  });

  it("gives no date where it gave no figure", () => {
    // The date is the provenance of the seed. A date with no seed behind it
    // would be labelling the card's worked example as today's Treasury.
    const seeds = rateSeeds(
      readRates([{ series_id: "DGS10", obs_date: "2026-07-01", value: 4.2 }], NOW),
    );
    expect(seeds.treasury10yPct).toBeNull();
    expect(seeds.treasury10yAsOf).toBeNull();
  });

  it("is the empty set when the table is empty", () => {
    expect(rateSeeds(readRates([], NOW))).toEqual(NO_SEEDS);
  });

  it("seeds one where only one qualified", () => {
    const seeds = rateSeeds(readRates([REAL[1]], NOW));
    expect(seeds.sofrPct).toBe(3.64);
    expect(seeds.treasury10yPct).toBeNull();
  });
});

describe("how the strip says it", () => {
  it("writes a short date with no year", () => {
    expect(shortDate("2026-09-14")).toBe("Sep 14");
    expect(shortDate("2026-04-01")).toBe("Apr 1");
  });

  it("reads the date in UTC, so it never slips a day", () => {
    // Formatting in the server's local zone would render "Sep 13" for a
    // Sep 14 observation anywhere west of Greenwich.
    expect(shortDate("2026-01-01")).toBe("Jan 1");
  });

  it("hands back an unparseable date rather than inventing one", () => {
    expect(shortDate("whenever")).toBe("whenever");
  });

  it("links each series to its own FRED page", () => {
    expect(fredUrl("DGS10")).toBe("https://fred.stlouisfed.org/series/DGS10");
  });
});
