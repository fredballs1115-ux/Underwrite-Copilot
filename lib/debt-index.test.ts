import { describe, expect, it } from "vitest";
import { readRates } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import {
  CONSTRUCTION_SPREAD_BPS,
  NO_DEBT_SEEDS,
  allInPct,
  benchmark30,
  constructionSeed,
  datedLong,
  debtRateNote,
  debtSeeds,
  indexName,
  isDebtSeedSeries,
  ratesPromptLine,
  type SurveyRate,
} from "./debt-index";
import { SERIES } from "./live-rates";
import { seedBenchmarks } from "./research-data";

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

  it("the 30-year survey rides with the seeds, dated and flagged fresh — shown, never a seed", () => {
    expect(debtSeeds(rates, 60).survey30).toEqual({
      id: "MORTGAGE30US",
      pct: 6.95,
      asOf: "2026-09-17",
      fresh: true,
    });
    expect(debtSeeds(rates, 120).survey30?.pct).toBe(6.95);
  });

  it("a stale table seeds nothing — a benchmark that cannot be backed is not made — while the survey still comes back, flagged, with its date", () => {
    const stale = readRates(REAL_ROWS, new Date("2027-03-01T00:00:00Z"));
    const s = debtSeeds(stale, 60);
    expect({ ...s, survey30: null }).toEqual(NO_DEBT_SEEDS);
    expect(s.survey30).toEqual({ id: "MORTGAGE30US", pct: 6.95, asOf: "2026-09-17", fresh: false });
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
    // The index it was built on, so the panel that prints it owes and draws
    // the New York Fed's notice (lib/data-notices).
    expect(c?.index).toBe("SOFR30DAYAVG");
    expect(constructionSeed(NO_DEBT_SEEDS)).toBeNull();
  });

  it("a date is printed with its year, and an unreadable one as it came", () => {
    expect(datedLong("2026-09-17")).toBe("Sep 17, 2026");
    expect(datedLong("not a date")).toBe("not a date");
  });
});

describe("benchmark30 — the leverage check's 30-yr fixed, and which one it is", () => {
  const live: SurveyRate = { id: "MORTGAGE30US", pct: 6.95, asOf: "2026-09-17", fresh: true };
  // The research layer's checked-in row (data/research/capital_markets.json),
  // as the seed reads it: its source is the file's first.
  const snapshot = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed")!;

  it("the week's survey first, named as FRED's series", () => {
    expect(benchmark30(live, snapshot)).toEqual({
      value: 6.95,
      asOf: "2026-09-17",
      source: "FRED · MORTGAGE30US",
      live: true,
    });
  });

  it("a stale survey is still the survey, with its date, and says so", () => {
    const b = benchmark30({ ...live, fresh: false }, snapshot);
    expect(b?.value).toBe(6.95);
    expect(b?.asOf).toBe("2026-09-17");
    expect(b?.source).toBe("FRED · MORTGAGE30US, stale");
  });

  it("the checked-in snapshot only where the table has no survey, named as the snapshot by the publisher its source states", () => {
    // Research pass 26, C16: the file cites Freddie Mac's weekly release (and
    // a newswire's copy of it), never FRED — the label had said "FRED PMMS".
    expect(snapshot.source).toContain("(Freddie Mac PMMS weekly release)");
    expect(snapshot.source).not.toMatch(/\bFRED\b/);
    expect(benchmark30(null, snapshot)).toEqual({
      value: 6.65,
      asOf: "2026-08-20",
      source: "Freddie Mac PMMS, the checked-in snapshot",
      live: false,
    });
    expect(benchmark30(undefined, snapshot)?.live).toBe(false);
  });

  it("names the publisher only as the source's own words state it — a bare link or a blank names none", () => {
    const row = (source: string | null | undefined) => ({ low: 6.65, as_of: "2026-08-20", source });
    expect(benchmark30(null, row("Freddie Mac"))?.source).toBe("Freddie Mac, the checked-in snapshot");
    expect(benchmark30(null, row("https://example.org/news (Freddie Mac PMMS press release)"))?.source).toBe(
      "Freddie Mac PMMS, the checked-in snapshot",
    );
    for (const none of ["https://example.org/news/", "", null, undefined]) {
      expect(benchmark30(null, row(none))?.source).toBe("publisher not recorded, the checked-in snapshot");
    }
    // Whatever the row, the snapshot is never credited to FRED, which the
    // file does not say published it.
    for (const s of ["Freddie Mac", "", null]) expect(benchmark30(null, row(s))?.source).not.toContain("FRED");
  });

  it("nothing where neither states a figure — a blank is null, never zero", () => {
    expect(benchmark30(null, null)).toBeNull();
    expect(benchmark30(undefined, undefined)).toBeNull();
    expect(benchmark30(null, { low: null, as_of: "2026-08-20" })).toBeNull();
  });
});

describe("today's rates, as a line a Claude step reads (the audit of 2026-09-30)", () => {
  it("names the index the model prices off, the 10-year and SOFR, each dated, from the same seeds the model takes", () => {
    const seeds = debtSeeds(rates, 60);
    const line = ratesPromptLine(seeds, 60)!;
    // Said as what they are: the latest published figures, each dated — never "today's".
    expect(line).toMatch(/^LATEST PUBLISHED RATES \(FRED, each dated the day it is for\): /);
    expect(line).not.toMatch(/today/i);
    expect(line).toContain(`the 5-yr Treasury ${seeds.permanent!.pct.toFixed(2)}% (${datedLong(seeds.permanent!.asOf)}), which the site's model prices a fixed-rate permanent loan off for its hold of 5 years`);
    expect(line).toContain(`the 10-yr Treasury ${seeds.tenYear!.pct.toFixed(2)}% (${datedLong(seeds.tenYear!.asOf)})`);
    expect(line).toContain(`30-day avg SOFR ${seeds.floating!.pct.toFixed(2)}% (${datedLong(seeds.floating!.asOf)}), a floating, bridge or construction loan's index`);
    expect(line).toContain("never state a rate as current that is not one of them or built from one of them");
  });

  it("says the 10-year once where the hold prices off it", () => {
    const seeds = debtSeeds(rates, 120);
    const line = ratesPromptLine(seeds, 120)!;
    expect(seeds.permanent?.id).toBe("DGS10");
    expect(line.match(/10-yr Treasury/g)?.length).toBe(1);
  });

  it("claims nothing where the table seeds nothing", () => {
    expect(ratesPromptLine(NO_DEBT_SEEDS, 60)).toBeNull();
    expect(ratesPromptLine(NO_DEBT_SEEDS, 60, { bps: 200, label: "multifamily spread" })).toBeNull();
  });

  // Research pass 18: the line said "plus the lender's spread" and never the
  // spread the site's own model adds, so each step invented one; and it
  // claimed a permanent loan on land, which the model carries none of.
  it("with the deal's class, names the spread the site's model adds as its screening default, and the construction panel's", () => {
    const seeds = debtSeeds(rates, 60);
    const line = ratesPromptLine(seeds, 60, { bps: 200, label: "multifamily spread" })!;
    expect(line).toContain(
      `the 5-yr Treasury 4.78% (Sep 17, 2026), which the site's model prices a fixed-rate permanent loan off for its hold of 5 years, adding a 200 bps multifamily spread — the site's screening default, an assumption a lender's quote replaces, never a quote`,
    );
    expect(line).toContain(`, which the site's construction panel starts from plus ${CONSTRUCTION_SPREAD_BPS} bps — a screening default too, never a quote`);
    // The figure decides the article.
    expect(ratesPromptLine(seeds, 60, { bps: 800, label: "generic spread" })).toContain("adding an 800 bps generic spread");
    // Without a class the line is the old one.
    expect(ratesPromptLine(seeds, 60)).not.toContain("screening default");
  });

  it("on land the tenor is said, and that the site's model carries no permanent loan to price off it", () => {
    const seeds = debtSeeds(rates, 60);
    const line = ratesPromptLine(seeds, 60, { bps: null, label: "land / infill spread" })!;
    expect(line).toContain(
      "the 5-yr Treasury 4.78% (Sep 17, 2026), the tenor nearest a hold of 5 years — the site's model carries no permanent loan on land, so it prices none off it",
    );
    expect(line).not.toContain("prices a fixed-rate permanent loan off");
    expect(line).not.toContain("land / infill spread");
  });

  it("reads exactly the series the seeds are built from: every Treasury tenor and SOFR", () => {
    const ids = SERIES.filter(isDebtSeedSeries).map((s) => s.id);
    expect(ids).toContain("DGS5");
    expect(ids).toContain("DGS10");
    expect(ids).toContain("SOFR30DAYAVG");
    expect(ids).toContain("SOFR");
    expect(ids).not.toContain("MORTGAGE30US");
    // The seeds read off those rows alone are the seeds read off the whole table.
    const only = readRates(REAL_ROWS.filter((r) => ids.includes(r.series_id)), FIXTURE_NOW);
    const all = debtSeeds(rates, 60);
    const bare = debtSeeds(only, 60);
    expect(bare.permanent).toEqual(all.permanent);
    expect(bare.tenYear).toEqual(all.tenYear);
    expect(bare.floating).toEqual(all.floating);
  });
});
