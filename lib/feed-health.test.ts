import { describe, expect, it } from "vitest";
import metros from "@/data/research/metros.json";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { FEEDS, REALTOR_FRESH_DAYS, SAMPLE_METRO, ZILLOW_FRESH_DAYS, feedHealth, feedStatusWord } from "./feed-health";
import type { ZoriRead } from "./zori";
import type { RealtorRead } from "./realtor";

const DC_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
  { series_id: "WASH911NA_YOY", obs_date: "2026-07-01", value: 0.8 },
  { series_id: "CUURS35ASEHA", obs_date: "2026-08-01", value: 340.1 },
  { series_id: "CUURS35ASEHA", obs_date: "2025-08-01", value: 330.2 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
  { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
  { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
];

const zori = { asOf: "2026-08-31" } as ZoriRead;
const realtor = { asOf: "2026-09-01" } as RealtorRead;

const health = (now = FIXTURE_NOW) =>
  feedHealth({
    rates: readRates(REAL_ROWS, now),
    metro: readMetroRates(SAMPLE_METRO.id, DC_ROWS, now),
    zori,
    realtor,
    now,
  });

describe("feedHealth — each feed judged on its own cadence, the stale series named", () => {
  const byId = Object.fromEntries(health().map((s) => [s.spec.id, s]));

  it("lists every feed once, in the table's order", () => {
    expect(health().map((s) => s.spec.id)).toEqual(FEEDS.map((f) => f.id));
  });

  it("the runner's own table is current on the day the fixture was taken", () => {
    for (const id of ["fred_daily", "fred_weekly", "fred_monthly", "fred_quarterly"]) {
      expect(byId[id].fresh, id).toBe(true);
      expect(byId[id].stale, id).toEqual([]);
      expect(byId[id].seriesTotal, id).toBeGreaterThan(0);
      expect(byId[id].sample, id).toBeNull();
    }
    expect(byId.fred_daily.newest).toBe("2026-09-21");
    expect(byId.fred_daily.ageDays).toBe(0);
  });

  it("the per-metro feeds are judged on the sample metro's rows and say so", () => {
    expect(byId.metro_fred).toMatchObject({ fresh: true, seriesTotal: 3, sample: "Washington DC", newest: "2026-07-01" });
    expect(byId.bls).toMatchObject({ fresh: true, seriesTotal: 1, newest: "2026-08-01" });
    expect(byId.census_hvs).toMatchObject({ fresh: true, seriesTotal: 1, newest: "2026-04-01" });
  });

  it("Zillow and Realtor.com are judged on their own month's cadence", () => {
    expect(byId.zillow).toMatchObject({ fresh: true, newest: "2026-08-31", ageDays: 21, seriesTotal: 1 });
    expect(byId.realtor).toMatchObject({ fresh: true, newest: "2026-09-01", ageDays: 20 });
    expect(ZILLOW_FRESH_DAYS).toBeGreaterThan(REALTOR_FRESH_DAYS);
  });

  it("a dead daily pull shows as stale on the daily row while the monthly rows stay current — the steward's whole-table check cannot see this", () => {
    const later = new Date("2026-10-05T12:00:00Z");
    const s = Object.fromEntries(health(later).map((x) => [x.spec.id, x]));
    expect(s.fred_daily.fresh).toBe(false);
    expect(s.fred_daily.stale.length).toBe(s.fred_daily.seriesTotal);
    expect(s.fred_monthly.fresh).toBe(true);
    expect(feedStatusWord(s.fred_daily)).toBe("stale");
    expect(feedStatusWord(s.fred_monthly)).toBe("current");
  });

  it("a feed with no rows says so, never current", () => {
    const empty = feedHealth({ rates: [], metro: [], zori: null, realtor: null, now: FIXTURE_NOW });
    for (const s of empty) {
      expect(s.fresh).toBeNull();
      expect(s.newest).toBeNull();
      expect(feedStatusWord(s)).toBe("no rows");
    }
  });

  it("names the stale series rather than averaging them away", () => {
    // Every daily series read on the fixture's day but the 10-year, read a
    // fortnight later: one stale series among fresh ones.
    const partly = feedHealth({
      rates: readRates(REAL_ROWS.filter((r) => r.series_id !== "DGS10"), FIXTURE_NOW).concat(
        readRates(REAL_ROWS.filter((r) => r.series_id === "DGS10"), new Date("2026-10-05T12:00:00Z")),
      ),
      metro: [],
      zori: null,
      realtor: null,
      now: FIXTURE_NOW,
    });
    const daily = partly.find((s) => s.spec.id === "fred_daily")!;
    expect(daily.fresh).toBe(false);
    expect(daily.stale).toEqual(["10-yr Treasury"]);
    expect(daily.seriesFresh).toBe(daily.seriesTotal - 1);
  });

  it("the sample metro is a covered market under its own name", () => {
    const dc = metros.metros.find((m) => m.id === SAMPLE_METRO.id);
    expect(dc?.name).toBe(SAMPLE_METRO.name);
  });
});
