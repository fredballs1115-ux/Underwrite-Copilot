import { describe, expect, it } from "vitest";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { BRIEF_NATIONAL_IDS, CRE_PRICE_ID, DEBT_MARKET_IDS, lendingStandardsFor, liveMarketBrief, periodLabel, rentIndexFor, sectorJobsFor, sectorPayrollMetric } from "./live-market-brief";
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
  // And the single-family part of the same months, so the split can be said.
  ...Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7 - i, 1));
    return { series_id: "WASH911BP1FH", obs_date: d.toISOString().slice(0, 10), value: 400 };
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

  it("a year of permits is summed against the year before it — a month alone is the season — with the multi-unit part said as the total less the single-family series", () => {
    expect(brief.lines).toContain(
      "Housing units permitted, twelve months to Aug 2026, Washington MSA: 12,000 (-20.0% against the twelve months before), of which 7,200 in buildings of two or more units (-29.4%) — the total less the single-family series, the only split published for a metro or a state; FRED",
    );
    // The single-family series is never a line of its own.
    expect(brief.lines.filter((l) => l.startsWith("Housing units permitted"))).toHaveLength(1);
    expect(brief.lines.some((l) => /single-family permits/i.test(l))).toBe(false);
    // Without it, the line is the total alone.
    const totalOnly = liveMarketBrief({
      metro: { id: "dc", name: "Washington, DC" },
      assetClass: "multifamily",
      rates: readMetroRates("dc", DC_ROWS.filter((r) => r.series_id !== "WASH911BP1FH"), NOW),
      zori: null,
      realtor: null,
      national: [],
      now: NOW,
    })!;
    expect(totalOnly.lines).toContain(
      "Housing units permitted, twelve months to Aug 2026, Washington MSA: 12,000 (-20.0% against the twelve months before); FRED",
    );
    expect(totalOnly.figures.some((f) => f.key === "permits_multi_ttm")).toBe(false);
  });

  it("the asking rent and the for-sale market are said with their months and their publishers", () => {
    expect(brief.lines).toContain(
      "Asking rent, all home types: $2,310/mo, +2.1% from a year ago; apartments alone $2,080/mo (+1.4%); typical home value $560,000 (+0.9%), 20.2 years of asking rent (Aug 2026; Zillow Research — listings, before concessions)",
    );
    expect(brief.lines).toContain(
      "For-sale market: median list price $599,000 (-1.2% from a year ago), 12,400 active listings (+14.3%), median 41 days on market (+12.5%), loosening on both flow figures, hotness rank 40 of 300 metros (12 places cooler than a year ago) (Aug 2026; Realtor.com — list prices are asks, not sales)",
    );
  });

  it("the same figures are kept as values, keyed and dated, for a later screen to compare against", () => {
    const byKey = Object.fromEntries(brief.figures.map((f) => [f.key, f]));
    expect(byKey.unemployment).toEqual({ key: "unemployment", label: "Unemployment", value: 3.4, unit: "pts", asOf: "2026-07-01" });
    expect(byKey.permits_ttm).toEqual({ key: "permits_ttm", label: "Units permitted, trailing year", value: 12_000, unit: "count", asOf: "2026-08-01" });
    expect(byKey.permits_multi_ttm).toEqual({
      key: "permits_multi_ttm",
      label: "Units permitted in 2+ unit buildings, trailing year",
      value: 7_200,
      unit: "count",
      asOf: "2026-08-01",
    });
    expect(byKey.rental_vacancy_msa).toMatchObject({ value: 6.2, unit: "pts", asOf: "2026-04-01" });
    expect(byKey.zori_rent).toMatchObject({ value: 2_310, unit: "usd", asOf: "2026-08-31" });
    expect(byKey.zori_mfr_rent).toMatchObject({ value: 2_080, unit: "usd" });
    expect(byKey.zhvi).toMatchObject({ value: 560_000, unit: "usd" });
    expect(byKey.rdc_median_list_price).toMatchObject({ value: 599_000, unit: "usd", asOf: "2026-08-01" });
    expect(byKey.rdc_active_listings).toMatchObject({ value: 12_400, unit: "count" });
    expect(byKey.rdc_days_on_market).toMatchObject({ value: 41, unit: "days" });
    expect(byKey.rdc_hotness_rank).toMatchObject({ value: 40, unit: "rank" });
    // One key each — a value is never stored twice under one name.
    expect(new Set(brief.figures.map((f) => f.key)).size).toBe(brief.figures.length);
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

describe("the debt market — national, for every deal, after the metro's lines", () => {
  // The runner's own table (lib/live-rates.fixture.ts), the debt-market series only.
  const national = readRates(REAL_ROWS, FIXTURE_NOW).filter((r) => (DEBT_MARKET_IDS as readonly string[]).includes(r.meta.id));
  const metro = { id: "dc", name: "Washington DC" };
  const base = { metro, rates: [], zori: null, realtor: null, now: FIXTURE_NOW, national };

  it("an apartment deal reads the 10-year, the multifamily standards, delinquency and lending", () => {
    const b = liveMarketBrief({ ...base, assetClass: "multifamily" })!;
    expect(b.lines).toEqual([
      "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED), -3 bps on the day before",
      "Debt market — banks tightening standards for multifamily loans: a net -5.7% of banks (Q3 2026; Fed SLOOS via FRED; negative is a net share easing)",
      "Debt market — CRE loan delinquency at commercial banks 1.53% (Q2 2026; FRED)",
      "Debt market — bank CRE lending +3.6% from a year ago (Sep 9, 2026; FRED, from the Fed's H.8)",
      "Capital markets — commercial real estate prices, national: +8.8% from a year ago (Q2 2026; the Fed's Financial Accounts via FRED) — the nation's, a trailing year, not this market's and not a cap rate",
    ]);
    expect(b.figures.map((f) => [f.key, f.value, f.unit])).toEqual([
      ["dgs10", 4.94, "pct"],
      ["sloos_multifamily", -5.7, "pts"],
      ["cre_delinquency", 1.53, "pct"],
      ["cre_loans_yoy", 3.56389, "pts"],
      ["cre_prices_yoy", 8.8068348464, "pts"],
    ]);
  });

  it("the commercial property price index is said for every building that trades on its income, never for land, and nothing without the series", () => {
    const priceLine = (b: { lines: string[] } | null) => b?.lines.find((l) => l.startsWith("Capital markets")) ?? null;
    for (const cls of ["office", "industrial", "retail", "hospitality_str", "self_storage", "net_lease"]) {
      expect(priceLine(liveMarketBrief({ ...base, assetClass: cls })), cls).toContain("+8.8% from a year ago (Q2 2026");
    }
    expect(priceLine(liveMarketBrief({ ...base, assetClass: "land_infill" }))).toBeNull();
    const without = national.filter((r) => r.meta.id !== CRE_PRICE_ID);
    expect(priceLine(liveMarketBrief({ ...base, national: without, assetClass: "office" }))).toBeNull();
    // It is the one list the pipeline and the page both read.
    expect(BRIEF_NATIONAL_IDS).toContain(CRE_PRICE_ID);
  });

  it("an office deal reads the nonresidential standards; a development adds construction; land reads construction alone", () => {
    expect(lendingStandardsFor("office", false)).toEqual(["SUBLPDRCSN"]);
    expect(lendingStandardsFor("multifamily", true)).toEqual(["SUBLPDRCSM", "SUBLPDRCSC"]);
    expect(lendingStandardsFor("land_infill", false)).toEqual(["SUBLPDRCSC"]);
    expect(lendingStandardsFor(null, false)).toEqual(["SUBLPDRCSN"]);
    const office = liveMarketBrief({ ...base, assetClass: "office" })!;
    expect(office.lines[1]).toContain("nonfarm nonresidential loans: a net -11.3% of banks");
    const dev = liveMarketBrief({ ...base, assetClass: "multifamily", plan: true })!;
    expect(dev.lines.filter((l) => l.includes("tightening")).map((l) => l.split(":")[0])).toEqual([
      "Debt market — banks tightening standards for multifamily loans",
      "Debt market — banks tightening standards for construction and land development loans",
    ]);
    expect(dev.lines[2]).toContain("a net -3.7% of banks");
  });

  it("the debt-market lines come after the metro's, and none without the national series", () => {
    const withMetro = liveMarketBrief({ ...base, rates: readMetroRates("dc", DC_ROWS, NOW), now: NOW, assetClass: "multifamily" })!;
    const firstDebt = withMetro.lines.findIndex((l) => l.startsWith("Debt market"));
    expect(firstDebt).toBeGreaterThan(0);
    // The capital side runs to the end: the debt market, then what the
    // capital buys (the national price index).
    expect(withMetro.lines.slice(firstDebt).every((l) => l.startsWith("Debt market") || l.startsWith("Capital markets"))).toBe(true);
    expect(liveMarketBrief({ ...base, national: [] })).toBeNull();
    expect(liveMarketBrief({ ...base, national: undefined })).toBeNull();
  });

  it("a stale national series is left out like any other", () => {
    const later = new Date("2027-06-01T00:00:00Z");
    const stale = readRates(REAL_ROWS, later).filter((r) => (DEBT_MARKET_IDS as readonly string[]).includes(r.meta.id));
    expect(liveMarketBrief({ ...base, now: later, national: stale, assetClass: "multifamily" })).toBeNull();
  });
});

describe("the sector that fills the deal's kind of building — which payroll count a deal reads", () => {
  // Washington's sector payrolls as the table files them (WASH911PBSV_YOY
  // and the SMU…SA retail series, both FRED's own change from a year ago).
  const SECTOR_ROWS: RateRow[] = [
    ...DC_ROWS,
    { series_id: "WASH911PBSV_YOY", obs_date: "2026-08-01", value: 1.31234 },
    { series_id: "SMU11479004200000001SA_YOY", obs_date: "2026-08-01", value: -0.4 },
    { series_id: "WASH911LEIH_YOY", obs_date: "2026-08-01", value: 2.9 },
  ];
  const metro = { id: "dc", name: "Washington DC" };
  const base = { metro, rates: readMetroRates("dc", SECTOR_ROWS, NOW), zori: null, realtor: null, now: NOW };

  it("an office deal is handed the office-using sector's line and no other sector's, after the jobs line", () => {
    const office = liveMarketBrief({ ...base, assetClass: "office" })!;
    const line = office.lines.find((l) => l.startsWith("Payrolls in"))!;
    expect(line).toBe(
      "Payrolls in professional and business services, the sector that fills offices: +1.3% from a year ago (Aug 2026, Washington MSA; FRED)",
    );
    expect(office.lines.filter((l) => l.startsWith("Payrolls in"))).toHaveLength(1);
    expect(office.lines.indexOf(line)).toBe(office.lines.findIndex((l) => l.startsWith("Nonfarm payrolls")) + 1);
    expect(office.figures.find((f) => f.key === "sector_jobs_yoy")).toEqual({
      key: "sector_jobs_yoy",
      label: "Payrolls, professional and business services",
      value: 1.31234,
      unit: "pts",
      asOf: "2026-08-01",
    });
    expect(office.text).toContain("- Payrolls in professional and business services, the sector that fills offices: +1.3%");
  });

  it("a store reads retail trade, a hotel leisure and hospitality, and one key serves every class so a later screen compares like with like", () => {
    const store = liveMarketBrief({ ...base, assetClass: "retail" })!;
    expect(store.lines.filter((l) => l.startsWith("Payrolls in"))).toEqual([
      "Payrolls in retail trade, the sector that fills stores: -0.4% from a year ago (Aug 2026, Washington MSA; FRED)",
    ]);
    const hotel = liveMarketBrief({ ...base, assetClass: "hospitality_str" })!;
    expect(hotel.lines.filter((l) => l.startsWith("Payrolls in"))).toEqual([
      "Payrolls in leisure and hospitality, the sector that runs hotels: +2.9% from a year ago (Aug 2026, Washington MSA; FRED)",
    ]);
    expect(store.figures.find((f) => f.key === "sector_jobs_yoy")?.value).toBe(-0.4);
    expect(hotel.figures.find((f) => f.key === "sector_jobs_yoy")?.value).toBe(2.9);
  });

  it("an apartment deal reads all payrolls and no sector; a warehouse whose sector the table has no row for reads none rather than another's", () => {
    const apartments = liveMarketBrief({ ...base, assetClass: "multifamily" })!;
    expect(apartments.lines.some((l) => l.startsWith("Payrolls in"))).toBe(false);
    expect(apartments.lines.some((l) => l.startsWith("Nonfarm payrolls"))).toBe(true);
    expect(apartments.figures.some((f) => f.key === "sector_jobs_yoy")).toBe(false);
    // No transportation row in the fixture: the warehouse's brief has no sector line, not the office's.
    const warehouse = liveMarketBrief({ ...base, assetClass: "industrial" })!;
    expect(warehouse.lines.some((l) => l.startsWith("Payrolls in"))).toBe(false);
    // A stale sector row is left out like any other.
    const later = new Date("2027-06-01T00:00:00Z");
    const stale = liveMarketBrief({ ...base, rates: readMetroRates("dc", SECTOR_ROWS, later), now: later, assetClass: "office" });
    expect(stale?.lines.some((l) => l.startsWith("Payrolls in")) ?? false).toBe(false);
  });

  it("maps each class to its sector, and a class no one sector fills to none", () => {
    expect(sectorJobsFor("office")).toEqual({
      metric: "jobs_pbs_yoy",
      sector: "professional and business services",
      fills: "the sector that fills offices",
    });
    expect(sectorJobsFor("medical_office")?.metric).toBe("jobs_eduhealth_yoy");
    expect(sectorJobsFor("senior_housing")?.metric).toBe("jobs_eduhealth_yoy");
    expect(sectorJobsFor("senior_housing")?.fills).toBe("the sector that staffs senior housing");
    expect(sectorJobsFor("industrial")?.metric).toBe("jobs_transport_yoy");
    expect(sectorJobsFor("retail")?.metric).toBe("jobs_retail_yoy");
    expect(sectorJobsFor("hospitality_str")?.metric).toBe("jobs_leisure_yoy");
    // Rental housing reads all payrolls (on every brief already); a net
    // lease's tenant may be a store or a depot; storage, a data centre,
    // parking and land have no sector that fills them.
    for (const cls of ["multifamily", "mixed_use", "sfr_btr", "student_housing", "manufactured_housing", "net_lease", "self_storage", "data_center", "parking", "land_infill", "auto", null, undefined, ""]) {
      expect(sectorJobsFor(cls), String(cls)).toBeNull();
    }
    // A phrase the model wrote files by its words, like every other class read.
    expect(sectorJobsFor("Class A office tower")?.metric).toBe("jobs_pbs_yoy");
    expect(sectorJobsFor("boutique hotel")?.metric).toBe("jobs_leisure_yoy");
    expect(sectorJobsFor("bulk distribution warehouse")?.metric).toBe("jobs_transport_yoy");
  });

  it("a sector page ranks by its sector's payrolls, the apartment page by all payrolls, and a page no count speaks to by none", () => {
    expect(sectorPayrollMetric("office")).toBe("jobs_pbs_yoy");
    expect(sectorPayrollMetric("industrial")).toBe("jobs_transport_yoy");
    expect(sectorPayrollMetric("retail")).toBe("jobs_retail_yoy");
    expect(sectorPayrollMetric("multifamily")).toBe("jobs_yoy");
    expect(sectorPayrollMetric("sfr_btr")).toBe("jobs_yoy");
    for (const s of ["net_lease", "self_storage", "land_infill", "data_center", "auto", null, undefined, ""]) {
      expect(sectorPayrollMetric(s), String(s)).toBeNull();
    }
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

describe("the rents each kind of commercial lessor charges — national, said so, ahead of the debt market", () => {
  // The runner's own table: the debt-market series and the five lessor
  // rent indexes the dry run of 2026-09-23 printed for August.
  const national = readRates(REAL_ROWS, FIXTURE_NOW).filter((r) => BRIEF_NATIONAL_IDS.includes(r.meta.id));
  const base = { metro: { id: "dc", name: "Washington DC" }, rates: [], zori: null, realtor: null, now: FIXTURE_NOW, national };

  it("maps each class to the index of its own kind of lessor, and a residential class, lodging, care and land to none", () => {
    expect(rentIndexFor("office")?.id).toBe("PCU5311205311202_YOY");
    expect(rentIndexFor("medical_office")?.id).toBe("PCU5311205311202_YOY");
    expect(rentIndexFor("retail")?.id).toBe("PCU5311205311201_YOY");
    expect(rentIndexFor("industrial")?.id).toBe("PCU5311205311203_YOY");
    expect(rentIndexFor("self_storage")?.id).toBe("PCU531130531130_YOY");
    for (const cls of ["net_lease", "data_center", "parking"]) expect(rentIndexFor(cls)?.id, cls).toBe("PCU531120531120_YOY");
    for (const cls of ["multifamily", "mixed_use", "sfr_btr", "student_housing", "manufactured_housing", "hospitality_str", "senior_housing", "land_infill", "auto", null, undefined, ""]) {
      expect(rentIndexFor(cls), String(cls)).toBeNull();
    }
    // A phrase the model wrote files by its words, like every other class read.
    expect(rentIndexFor("Class A office tower")?.id).toBe("PCU5311205311202_YOY");
  });

  it("an office deal's brief opens its national lines with the office rent index, dated and named as the nation's", () => {
    const office = liveMarketBrief({ ...base, assetClass: "office" })!;
    expect(office.lines[0]).toBe(
      "Rents charged by lessors of professional and office buildings, national (BLS producer price index): +7.2% from a year ago (Aug 2026; BLS via FRED) — the nation's lessors, not the metro's",
    );
    // The insurance premium index follows it, then the debt market.
    expect(office.lines[1]).toContain("Commercial property insurance premiums, national");
    expect(office.lines[2]).toContain("Debt market — 10-year Treasury 4.94%");
    expect(office.figures[0]).toEqual({ key: "rent_index_yoy", label: "Rents charged by lessors of professional and office buildings, national", value: 7.18581, unit: "pts", asOf: "2026-08-01" });
    const storage = liveMarketBrief({ ...base, assetClass: "self_storage" })!;
    expect(storage.lines[0]).toContain("Rents charged by miniwarehouse and self-storage operators, national (BLS producer price index): -0.2% from a year ago");
  });

  it("an apartment deal has the metro's rents and reads no lessor index; a stale index is left out", () => {
    const apartments = liveMarketBrief({ ...base, assetClass: "multifamily" })!;
    expect(apartments.lines.some((l) => l.startsWith("Rents charged by"))).toBe(false);
    expect(apartments.figures.some((f) => f.key === "rent_index_yoy")).toBe(false);
    const later = new Date("2027-06-01T00:00:00Z");
    const stale = readRates(REAL_ROWS, later).filter((r) => BRIEF_NATIONAL_IDS.includes(r.meta.id));
    expect(liveMarketBrief({ ...base, now: later, national: stale, assetClass: "office" })).toBeNull();
  });

  it("the insurance premium index is said for every class that carries a policy, as the nation's carriers, and not for land", () => {
    const line =
      "Commercial property insurance premiums, national (BLS producer price index, commercial multiple peril): +4.8% from a year ago (Aug 2026; BLS via FRED) — the nation's carriers, not this building's quote; a memorandum's premium is the seller's expiring policy";
    for (const cls of ["office", "multifamily", "self_storage", "hospitality_str", "senior_housing", "data_center"]) {
      const b = liveMarketBrief({ ...base, assetClass: cls })!;
      expect(b.lines, cls).toContain(line);
      expect(b.figures.find((f) => f.key === "insurance_index_yoy"), cls).toEqual({
        key: "insurance_index_yoy",
        label: "Commercial property insurance premiums, national",
        value: 4.83683,
        unit: "pts",
        asOf: "2026-08-01",
      });
    }
    const land = liveMarketBrief({ ...base, assetClass: "land_infill" })!;
    expect(land.lines.some((l) => l.startsWith("Commercial property insurance premiums"))).toBe(false);
    // It rides after the income side's national line and ahead of the debt market's.
    const office = liveMarketBrief({ ...base, assetClass: "office" })!;
    expect(office.lines.findIndex((l) => l.startsWith("Rents charged by"))).toBeLessThan(office.lines.indexOf(line));
    expect(office.lines.indexOf(line)).toBeLessThan(office.lines.findIndex((l) => l.startsWith("Debt market")));
    // Without the series on hand, nothing claims a figure.
    const without = liveMarketBrief({ ...base, assetClass: "office", national: national.filter((r) => r.meta.id !== "PCU9241269241265_YOY") })!;
    expect(without.lines.some((l) => l.startsWith("Commercial property insurance premiums"))).toBe(false);
  });
});

// ── A deal outside the covered metros reads its state's figures ─────────────
describe("a deal outside the covered metros reads its state's figures, said as the state's", () => {
  // Pennsylvania's own series as the table files them (state:PA): the ids
  // the probe of 2026-09-23 printed (rates run 35931065205).
  const rows: RateRow[] = [
    { series_id: "PAUR", obs_date: "2026-08-01", value: 3.7 },
    { series_id: "PAUR", obs_date: "2026-07-01", value: 3.6 },
    { series_id: "PANA_YOY", obs_date: "2026-08-01", value: 0.9 },
    { series_id: "PARVAC", obs_date: "2025-01-01", value: 6.6 },
  ];
  const pa = liveMarketBrief({
    metro: { id: "state:PA", name: "Pennsylvania" },
    assetClass: "multifamily",
    rates: readMetroRates("state:PA", rows, NOW),
    zori: null,
    realtor: null,
    national: [],
    now: NOW,
  })!;

  it("opens by naming the grain, and every line carries the state's name", () => {
    expect(pa.text).toContain(
      "Published figures for the state of Pennsylvania the deal sits in — the address lies outside the metros the site tracks, so these are the state's own figures — read on 2026-09-23 from FRED and the Census Bureau. Each is dated, and each is the state's — not the metro's, not the submarket's and not the building's.",
    );
    expect(pa.text).not.toContain("metro area's");
    expect(pa.lines).toContain("Unemployment 3.7% (Aug 2026, Pennsylvania; FRED), +0.1 pt on the month before");
    expect(pa.lines).toContain("Nonfarm payrolls +0.9% from a year ago (Aug 2026, Pennsylvania; FRED)");
    expect(pa.lines).toContain(
      "Rental vacancy, Pennsylvania, the state's annual figure: 6.6% (2025; the Census Bureau's Housing Vacancy Survey via FRED — a year's rate for the whole state, not a quarter's for a metro)",
    );
    expect(pa.figures.find((f) => f.key === "rental_vacancy_state")).toMatchObject({ value: 6.6, unit: "pts", asOf: "2025-01-01" });
    expect(pa.metro).toBe("Pennsylvania");
    expect(pa.grain).toBe("state");
  });

  it("a covered metro's brief keeps the metro's grain", () => {
    const dc = liveMarketBrief({ metro: { id: "dc", name: "Washington DC" }, assetClass: "multifamily", rates: readMetroRates("dc", DC_ROWS, NOW), zori: null, realtor: null, national: [], now: NOW })!;
    expect(dc.grain).toBe("metro");
    expect(dc.text).toContain("each is the metro area's");
  });
});

// ── A metro area the site reads without a brief ─────────────────────────────
describe("a deal in a metro area the site reads without a brief gets the metro's own figures, and the header says what is behind them", () => {
  // Pittsburgh's series as the table files them, the ids the runner printed
  // (probe runs 35937200224 and 35937859807).
  const rows: RateRow[] = [
    { series_id: "PITT342URN", obs_date: "2026-07-01", value: 4.1 },
    { series_id: "PITT342URN", obs_date: "2026-06-01", value: 4.3 },
    { series_id: "PITT342NA_YOY", obs_date: "2026-08-01", value: 0.6 },
    { series_id: "HVS_RVR_38300", obs_date: "2026-04-01", value: 7.4 },
    { series_id: "HVS_RVR_38300_MOE", obs_date: "2026-04-01", value: 3.1 },
  ];
  const pitt = liveMarketBrief({
    metro: { id: "pittsburgh", name: "Pittsburgh PA" },
    assetClass: "multifamily",
    rates: readMetroRates("pittsburgh", rows, NOW),
    zori: null,
    realtor: null,
    national: [],
    now: NOW,
  })!;

  it("opens by saying the market is read but not briefed, and every line is the metro area's", () => {
    expect(pitt.text).toContain(
      "Published figures for the Pittsburgh PA metro area the deal sits in — a market the site reads but does not brief, so these figures are all it holds for it — read on 2026-09-23 from FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com. Each is dated, and each is the metro area's — not the submarket's and not the building's.",
    );
    expect(pitt.grain).toBe("metro");
    expect(pitt.metro).toBe("Pittsburgh PA");
    expect(pitt.lines).toContain("Unemployment 4.1% (Jul 2026, Pittsburgh MSA; FRED), -0.2 pt on the month before");
    expect(pitt.lines).toContain("Nonfarm payrolls +0.6% from a year ago (Aug 2026, Pittsburgh MSA; FRED)");
    expect(pitt.lines).toContain(
      "Rental vacancy, metro area, Pittsburgh MSA: 7.4% with a ±3.1 pt margin of error (a sample — a move inside the margin is noise) (Q2 2026; the Census Bureau's Housing Vacancy Survey)",
    );
    expect(pitt.text).not.toContain("state's");
  });

  it("a briefed market's header says nothing of the kind", () => {
    const dc = liveMarketBrief({ metro: { id: "dc", name: "Washington DC" }, assetClass: "multifamily", rates: readMetroRates("dc", DC_ROWS, NOW), zori: null, realtor: null, national: [], now: NOW })!;
    expect(dc.text).not.toContain("does not brief");
  });
});
