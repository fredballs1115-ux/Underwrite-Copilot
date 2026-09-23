import { describe, expect, it } from "vitest";
import { readMetroRates, type RateRow } from "./live-rates";
import { liveMarketBrief, periodLabel } from "./live-market-brief";
import type { ZoriRead } from "./zori";
import type { RealtorRead } from "./realtor";

const NOW = new Date("2026-09-23T12:00:00Z");

// Washington's own series, as the table stores them (ids from data/fred-series.json).
const DC_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 3.4 },
  { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.2 },
  { series_id: "WASH911NA_YOY", obs_date: "2026-07-01", value: 0.81234 },
  // Twenty-four months of permits, so a trailing year and the year before it both exist.
  ...Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7 - i, 1));
    return { series_id: "WASH911BPPRIV", obs_date: d.toISOString().slice(0, 10), value: i < 12 ? 1_000 : 1_250 };
  }),
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-01-01", value: 5.9 },
  { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
  { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
];

const ZORI: ZoriRead = {
  rent: 2_310,
  yoyPct: 2.1,
  asOf: "2026-08-31",
  note: "Washington, DC",
  shared: false,
  mfrRent: 2_080,
  mfrYoyPct: 1.4,
  homeValue: 560_000,
  homeValueYoyPct: 0.9,
  priceToRentYears: 20.2,
};

const REALTOR: RealtorRead = {
  medianListPrice: 599_000,
  medianListPriceYoyPct: -1.2,
  activeListings: 12_400,
  activeListingsYoyPct: 14.3,
  daysOnMarket: 41,
  daysOnMarketYoyPct: 12.5,
  asOf: "2026-08-01",
  note: "Washington-Arlington-Alexandria, DC-VA-MD-WV",
  shared: false,
  direction: "loosening",
  hotness: { rank: 40, priorRank: 28, move: { places: -12, direction: "cooler" }, viewsVsUs: 1.2, domVsUsDays: -9, asOf: "2026-08-01" },
};

describe("liveMarketBrief — the metro's published figures, dated and sourced, for the market check", () => {
  const rates = readMetroRates("dc", DC_ROWS, NOW);
  const brief = liveMarketBrief({ metro: { id: "dc", name: "Washington, DC" }, rates, zori: ZORI, realtor: REALTOR, now: NOW })!;

  it("names the metro, the day it was read, and that the figures are the metro's", () => {
    expect(brief.metro).toBe("Washington, DC");
    expect(brief.readOn).toBe("2026-09-23");
    expect(brief.text).toContain("Published figures for the Washington, DC market the deal sits in, read on 2026-09-23");
    expect(brief.text).toContain("not the submarket's and not the building's");
  });

  it("every FRED, BLS and Census figure carries its period, its area and its publisher", () => {
    expect(brief.lines).toContain("Unemployment 3.4% (Jul 2026, Washington MSA; FRED), +0.2 pt on the month before");
    expect(brief.lines).toContain("Nonfarm payrolls +0.8% from a year ago (Jul 2026, Washington MSA; FRED)");
    expect(brief.lines).toContain(
      "Rental vacancy, metro area, Washington MSA: 6.2% with a ±2.2 pt margin of error (a sample — a move inside the margin is noise) (Q2 2026; the Census Bureau's Housing Vacancy Survey)",
    );
    expect(brief.lines).toContain("Rental vacancy, South Census region: 9.5% (Q2 2026; FRED)");
  });

  it("a year of permits is summed against the year before it — a month alone is the season", () => {
    expect(brief.lines).toContain(
      "Housing units permitted, twelve months to Aug 2026, Washington MSA: 12,000 (-20.0% against the twelve months before); FRED",
    );
  });

  it("the asking rent and the for-sale market are said with their months and their publishers", () => {
    expect(brief.lines).toContain(
      "Asking rent, all home types: $2,310/mo, +2.1% from a year ago; apartments alone $2,080/mo (+1.4%); typical home value $560,000 (+0.9%), 20.2 years of asking rent (Aug 2026; Zillow Research — listings, before concessions)",
    );
    expect(brief.lines).toContain(
      "For-sale market: median list price $599,000 (-1.2% from a year ago), 12,400 active listings (+14.3%), median 41 days on market (+12.5%), loosening on both flow figures, hotness rank 40 of 300 metros (12 places cooler than a year ago) (Aug 2026; Realtor.com — list prices are asks, not sales)",
    );
  });

  it("the block is the header and one dash a line", () => {
    expect(brief.text.split("\n").length).toBe(1 + brief.lines.length);
    expect(brief.text.split("\n").slice(1).every((l) => l.startsWith("- "))).toBe(true);
  });

  it("a stale figure is left out rather than offered as current", () => {
    const later = new Date("2027-06-01T00:00:00Z");
    const stale = liveMarketBrief({
      metro: { id: "dc", name: "Washington, DC" },
      rates: readMetroRates("dc", DC_ROWS, later),
      zori: null,
      realtor: null,
      now: later,
    });
    expect(stale).toBeNull();
  });

  it("a figure the pull did not have has no line, never a zero", () => {
    const few = liveMarketBrief({
      metro: { id: "dc", name: "Washington, DC" },
      rates: readMetroRates("dc", DC_ROWS.filter((r) => r.series_id === "WASH911URN"), NOW),
      zori: { ...ZORI, mfrRent: null, mfrYoyPct: null, homeValue: null, homeValueYoyPct: null, priceToRentYears: null },
      realtor: null,
    now: NOW,
    })!;
    expect(few.lines).toHaveLength(2);
    expect(few.lines[1]).toBe("Asking rent, all home types: $2,310/mo, +2.1% from a year ago (Aug 2026; Zillow Research — listings, before concessions)");
    expect(few.text).not.toContain("0 active");
  });

  it("nothing to say is null, not an empty block", () => {
    expect(liveMarketBrief({ metro: { id: "dc", name: "Washington, DC" }, rates: [], zori: null, realtor: null, now: NOW })).toBeNull();
  });

  it("a suburb's lines wear the MSA's name, as its tiles do", () => {
    const pg = liveMarketBrief({
      metro: { id: "pg_county", name: "Prince George's County, MD" },
      rates: readMetroRates("pg_county", DC_ROWS, NOW),
      zori: null,
      realtor: null,
      now: NOW,
    })!;
    expect(pg.text).toContain("Prince George's County, MD market");
    expect(pg.lines.some((l) => l.includes("Rental vacancy, metro area, Washington MSA"))).toBe(true);
  });
});

describe("periodLabel", () => {
  it("a month for a monthly figure, a quarter for a quarterly one, the day otherwise", () => {
    expect(periodLabel("2026-07-01", "monthly")).toBe("Jul 2026");
    expect(periodLabel("2026-04-01", "quarterly")).toBe("Q2 2026");
    expect(periodLabel("2026-10-01", "quarterly")).toBe("Q4 2026");
    expect(periodLabel("2026-09-17", "daily")).toBe("Sep 17, 2026");
    expect(periodLabel("junk", "monthly")).toBe("junk");
  });
});
