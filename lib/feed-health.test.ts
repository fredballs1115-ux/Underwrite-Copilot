import { describe, expect, it } from "vitest";
import metros from "@/data/research/metros.json";
import { ageDays, readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { FEEDS, REALTOR_FRESH_DAYS, SAMPLE_METRO, ZILLOW_FRESH_DAYS, feedHealth, feedStatusWord } from "./feed-health";
import { zillowFileMonths, type BenchRow, type FileMonth } from "./zori";
import { realtorFileMonths } from "./realtor";

const DC_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
  { series_id: "WASH911NA_YOY", obs_date: "2026-07-01", value: 0.8 },
  { series_id: "CUURS35ASEHA", obs_date: "2026-08-01", value: 340.1 },
  { series_id: "CUURS35ASEHA", obs_date: "2025-08-01", value: 330.2 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
  { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
  { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
];

// What the two monthly pulls hold on the fixture's day (Sep 21): Zillow's
// pull ran on the 20th and wrote August, dated its last day; Realtor.com's
// ran on the 8th and wrote August too, dated its first day. September's
// figure from Realtor.com does not exist until Oct 8. Each file is read by
// its lead row, as the data-health page reads them.
const bench = (metric: string, as_of: string): BenchRow => ({ metric, metro: SAMPLE_METRO.name, low: 1, as_of, note: null });
const BENCH: BenchRow[] = [
  bench("zori_rent", "2026-08-31"),
  bench("zori_mfr_rent", "2026-08-31"),
  bench("zhvi", "2026-08-31"),
  bench("rdc_median_list_price", "2026-08-01"),
  bench("rdc_hotness_rank", "2026-08-01"),
];
const zillow = zillowFileMonths(BENCH, SAMPLE_METRO.name);
const realtor = realtorFileMonths(BENCH, SAMPLE_METRO.name);

const health = (now = FIXTURE_NOW) =>
  feedHealth({
    rates: readRates(REAL_ROWS, now),
    metro: readMetroRates(SAMPLE_METRO.id, DC_ROWS, now),
    zillow,
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
    // The states' pull is judged on Pennsylvania's rows; handed none, it says "no rows", never "current".
    expect(byId.state_fred).toMatchObject({ fresh: null, seriesTotal: 0, sample: "Pennsylvania", newest: null });
    expect(byId.bls).toMatchObject({ fresh: true, seriesTotal: 1, newest: "2026-08-01" });
    expect(byId.census_hvs).toMatchObject({ fresh: true, seriesTotal: 1, newest: "2026-04-01" });
  });

  it("Zillow and Realtor.com are judged on their own month's cadence", () => {
    expect(byId.zillow).toMatchObject({ fresh: true, newest: "2026-08-31", ageDays: 21, seriesFresh: 3, seriesTotal: 3, stale: [] });
    expect(byId.realtor).toMatchObject({ fresh: true, newest: "2026-08-01", ageDays: 51, seriesFresh: 2, seriesTotal: 2, stale: [] });
    // Realtor.com dates a month its first day and Zillow its last, so the
    // same month's figure is thirty-odd days older on Realtor.com's clock.
    expect(REALTOR_FRESH_DAYS).toBeGreaterThan(ZILLOW_FRESH_DAYS);
  });

  it("each limit is the publisher's own calendar: never stale while its successor is still to come, stale within a week of a missed pull", () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let zillowOldest = 0;
    let realtorOldest = 0;
    for (let y = 2025; y <= 2028; y++) {
      for (let m = 0; m < 12; m++) {
        // Zillow: the month's last day, replaced by the pull on the 20th of the month after next.
        zillowOldest = Math.max(zillowOldest, ageDays(iso(new Date(Date.UTC(y, m + 1, 0))), new Date(Date.UTC(y, m + 2, 20))));
        // Realtor.com: the month's first day, replaced by the pull on the 8th of the month after next.
        realtorOldest = Math.max(realtorOldest, ageDays(iso(new Date(Date.UTC(y, m, 1))), new Date(Date.UTC(y, m + 2, 8))));
      }
    }
    expect(zillowOldest).toBe(51);
    expect(realtorOldest).toBe(69);
    for (const [limit, oldest] of [
      [ZILLOW_FRESH_DAYS, zillowOldest],
      [REALTOR_FRESH_DAYS, realtorOldest],
    ]) {
      expect(limit).toBeGreaterThanOrEqual(oldest);
      expect(limit).toBeLessThan(oldest + 7);
    }
    // The case that read "stale" on a healthy feed: Realtor.com's August
    // figure on Sep 30 (60 days old) is current until its successor lands on
    // Oct 8, and stale within the week after a missed pull.
    const onDay = (day: string) =>
      feedHealth({ rates: [], metro: [], zillow: [], realtor, now: new Date(`${day}T12:00:00Z`) }).find((s) => s.spec.id === "realtor")!;
    expect(onDay("2026-09-30")).toMatchObject({ fresh: true, ageDays: 60 });
    expect(onDay("2026-10-08")).toMatchObject({ fresh: true, ageDays: 68 });
    expect(onDay("2026-10-15")).toMatchObject({ fresh: false, stale: ["inventory (2026-08-01)", "hotness rank (2026-08-01)"] });
  });

  it("judges each of a monthly pull's files on its own, and names the one a dead file left behind", () => {
    // The apartment file has failed since June and the hotness history never
    // wrote: the all-homes rent and the inventory are current beside them.
    const rows = BENCH.filter((r) => r.metric !== "rdc_hotness_rank").map((r) => (r.metric === "zori_mfr_rent" ? { ...r, as_of: "2026-06-30" } : r));
    const s = Object.fromEntries(
      feedHealth({
        rates: [],
        metro: [],
        zillow: zillowFileMonths(rows, SAMPLE_METRO.name),
        realtor: realtorFileMonths(rows, SAMPLE_METRO.name),
        now: FIXTURE_NOW,
      }).map((x) => [x.spec.id, x]),
    );
    expect(s.zillow).toMatchObject({ fresh: false, newest: "2026-08-31", ageDays: 21, seriesFresh: 2, seriesTotal: 3, stale: ["apartment asking rent (2026-06-30)"] });
    expect(s.realtor).toMatchObject({ fresh: false, newest: "2026-08-01", seriesFresh: 1, seriesTotal: 2, stale: ["hotness rank (no rows)"] });
    expect(feedStatusWord(s.zillow)).toBe("stale");
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
    const empty = feedHealth({ rates: [], metro: [], zillow: [], realtor: [], now: FIXTURE_NOW });
    // A file list with no rows in any file is no rows too, never current.
    const none: FileMonth[] = [{ label: "asking rent", asOf: null }];
    expect(feedHealth({ rates: [], metro: [], zillow: none, realtor: [], now: FIXTURE_NOW }).find((s) => s.spec.id === "zillow")?.fresh).toBeNull();
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
      zillow: [],
      realtor: [],
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
