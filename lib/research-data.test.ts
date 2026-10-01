// Pins benchmarksForDeal against the REAL seed benchmarks — the metro labels
// in the seeds are the contract ("New York City", "Washington DC area",
// "Philadelphia PA" vs "Philadelphia, PA"), so synthetic fixtures would test
// nothing.

import { describe, expect, it } from "vitest";
import {
  benchmarksForDeal,
  fmtBenchValue,
  mergeBenchmarks,
  mergeRules,
  metroFmr,
  ruleCounts,
  ruleName,
  seedBenchmarks,
  seedRules,
  twoToFourMedian,
} from "@/lib/research-data";
import type { Benchmark, RegulatoryRule } from "@/lib/research";
import { monthOf } from "@/lib/zori";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { metroForAddress } from "@/lib/market-match";
import { DC_AREA_METRO, FMR_BEDS, fmrBenchmarkRows, fmrBlock, fmrOf, readFmrMetric } from "@/lib/fmr";
import metrosSeed from "@/data/research/metros.json";
import multifamilySeed from "@/data/research/multifamily.json";
import { benchRowLabel } from "@/app/(app)/deals/[id]/research-panel";
import { SECTORS, looseValue } from "@/lib/research-sectors";

const seeds = seedBenchmarks();

describe("benchmarksForDeal", () => {
  it("a Brooklyn deal finds the NYC FMR row via its covered-market name", () => {
    // City-only matching (the old behavior) finds nothing for a borough…
    expect(benchmarksForDeal(seeds, "Brooklyn", null)).toHaveLength(0);
    // …the market matcher closes the gap.
    const metro = metroForAddress({ city: "Brooklyn", state: "NY" });
    const rows = benchmarksForDeal(seeds, "Brooklyn", metro?.name);
    const nyc2br = rows.find((b) => b.metro === "New York City" && b.metric === "hud_fmr_fy2027_2br");
    expect(nyc2br?.low).toBe(2971);
  });

  it("a county-only DC address still reaches the DC-area FMR rows", () => {
    const metro = metroForAddress({ county: "District of Columbia", state: "DC" });
    const rows = benchmarksForDeal(seeds, null, metro?.name);
    expect(rows.some((b) => b.metro === "Washington DC area")).toBe(true);
  });

  it("DMV suburbs do NOT inherit the DC-proper rows — they carry their own", () => {
    const metro = metroForAddress({ city: "Bethesda", state: "MD" });
    expect(metro?.id).toBe("montgomery_county");
    const rows = benchmarksForDeal(seeds, "Bethesda", metro?.name);
    expect(rows.some((b) => b.metro === "Washington DC area")).toBe(false);
    // The county's own rows: the Washington HUD area's figures.
    expect(rows.find((b) => b.metric === "hud_fmr_fy2027_2br")).toMatchObject({ metro: "Montgomery County MD", low: 2438 });
  });

  it("Philadelphia proper gets both the city sales rows and the FMR row", () => {
    const metro = metroForAddress({ city: "Philadelphia", state: "PA" });
    const rows = benchmarksForDeal(seeds, "Philadelphia", metro?.name);
    expect(rows.some((b) => b.metro === "Philadelphia, PA")).toBe(true);
    expect(rows.some((b) => b.metro === "Philadelphia PA")).toBe(true);
  });

  it("Wilmington DE gets the Philadelphia-market FMR but not Philly-city sales", () => {
    const metro = metroForAddress({ city: "Wilmington", state: "DE" });
    const rows = benchmarksForDeal(seeds, "Wilmington", metro?.name);
    expect(rows.some((b) => b.metro === "Philadelphia PA")).toBe(true);
    expect(rows.some((b) => b.metro === "Philadelphia, PA")).toBe(false);
  });

  it("no city and no metro means no rows — never the whole national list", () => {
    expect(benchmarksForDeal(seeds, null, null)).toHaveLength(0);
    expect(benchmarksForDeal(seeds, "", "")).toHaveLength(0);
  });
});

describe("sector snapshot benchmark rows", () => {
  it("emits Philadelphia office vacancy as the observed tracker spread", () => {
    const row = seeds.find(
      (b) => b.metric === "office_vacancy_pct" && b.metro.startsWith("Philadelphia"),
    );
    expect(row).toBeTruthy();
    expect(row!.low).toBe(17.7);
    expect(row!.high).toBe(22.3);
    expect(row!.sector).toBe("office");
  });

  it("emits the DC multifamily cap band and NoVA industrial rent", () => {
    const cap = seeds.find(
      (b) => b.metric === "multifamily_cap_rate_pct" && b.metro === "Washington DC",
    );
    expect(cap).toBeTruthy();
    expect(cap!.low).toBe(4.75);
    expect(cap!.high).toBe(5.5);
    const nova = seeds.find(
      (b) => b.metric === "industrial_asking_rent_psf" && b.metro === "Northern Virginia",
    );
    expect(nova).toBeTruthy();
    expect(nova!.low).toBeCloseTo(17.44, 2);
  });

  it("emits NO cap-rate row where the research deliberately carries null", () => {
    // Atlanta's MF cap is a documented gap (conflicting constructs across
    // trackers) — the generator must not conjure a row from the nulls.
    // (Philadelphia held this role until its Northmarq fill on Aug 25.)
    const row = seeds.find(
      (b) => b.metric === "multifamily_cap_rate_pct" && b.metro.startsWith("Atlanta"),
    );
    expect(row).toBeUndefined();
    // And the Philadelphia fill emits with its exact Northmarq band.
    const philly = seeds.find(
      (b) => b.metric === "multifamily_cap_rate_pct" && b.metro.startsWith("Philadelphia"),
    );
    expect(philly).toBeTruthy();
    expect(philly!.low).toBe(5.0);
    expect(philly!.high).toBe(5.7);
  });

  it("every snapshot row carries provenance: its own figure's link and citation, never the block's first link", () => {
    const snapRows = seeds.filter((b) =>
      /_(vacancy_pct|asking_rent_psf|cap_rate_pct)$/.test(b.metric),
    );
    expect(snapRows.length).toBeGreaterThanOrEqual(8);
    const blockOf = (r: Benchmark) => {
      const m = metrosSeed.metros.find((x) => x.name === r.metro)!;
      return (m.sector_snapshot as Record<string, { sources?: string[] }>)[r.sector];
    };
    for (const r of snapRows) {
      // The day the research was read.
      expect(r.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A vacancy, a rent or a cap: a link only where the file ties one to
      // the figure, and then one of its block's own sources; a citation always.
      if (r.source) expect(blockOf(r).sources, `${r.metro} ${r.metric}`).toContain(r.source);
      expect(r.cite, `${r.metro} ${r.metric}`).toBeTruthy();
    }
    expect(snapRows.filter((r) => /_asking_rent_psf$/.test(r.metric)).length).toBeGreaterThanOrEqual(20);
    // Chicago's office rent is Cushman's CBD MarketBeat; the block's first
    // link is Tenantbase's Q1 print.
    const chicagoRent = snapRows.find((b) => b.metro === "Chicago" && b.metric === "office_asking_rent_psf")!;
    expect(chicagoRent.low).toBe(43.9);
    expect(chicagoRent.source).toBe("https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/chicago-marketbeats/cbd-office");
    expect(chicagoRent.cite).toBe("Cushman & Wakefield, the CBD, Q2 2026; average gross asking");
    // Miami retail's rent is Colliers' Q2 2026; the block's Colliers link is
    // its Q1 report, so the figure is unlinked.
    const miamiRent = snapRows.find((b) => b.metro === "Miami" && b.metric === "retail_asking_rent_psf")!;
    expect(miamiRent.source).toBe("");
    expect(miamiRent.cite).toBe("Colliers, Miami-Dade, Q2 2026; average asking");
    // Chicago's cap is Essex Realty's April 2026 average — the block's first
    // link is JPMorgan's, the vacancy's source.
    const chicagoCap = snapRows.find((b) => b.metro === "Chicago" && b.metric === "multifamily_cap_rate_pct")!;
    expect(chicagoCap.source).toBe("https://essexrealtygroup.com/chicago-multifamily-report-april-2026/");
    expect(chicagoCap.cite).toBe(
      "Essex Realty, Chicago, April 2026; a transaction average of 175 sales, not a quoted band; for the small-building stock, mostly the Class B/C neighborhood buildings that drive Chicago volume",
    );
    const chicagoVacancy = snapRows.find((b) => b.metro === "Chicago" && b.metric === "multifamily_vacancy_pct")!;
    expect(chicagoVacancy.source).toBe("https://www.jpmorgan.com/insights/real-estate/commercial-term-lending/chicago-multifamily-market-outlook");
    // Prince George's County's office figure is Suburban Maryland's, both counties together.
    const pgOffice = snapRows.find((b) => b.metro === "Prince George's County MD" && b.metric === "office_vacancy_pct")!;
    expect(pgOffice.cite).toBe("Colliers, Suburban Maryland (Montgomery and Prince George's together, not a county split), Q1 2026");
    // The Washington region's apartment vacancy names no house: no link, and its own period.
    const dcVacancy = snapRows.find((b) => b.metro === "Washington DC" && b.metric === "multifamily_vacancy_pct")!;
    expect(dcVacancy.source).toBe("");
    expect(dcVacancy.cite).toBe("the Washington DC region, year-end 2025");
  });
  it("the homepage spread board has at least three real divergences to draw", () => {
    // The SpreadBoard derives (metro, sector) pairs where two named trackers
    // publish different vacancy figures. Lock the derivation's ground truth:
    // the widest spread today is LA office (17.8-25.8), and there are always
    // at least three genuine spreads to fill the board.
    const rows: { name: string; sector: string; low: number; high: number }[] = [];
    for (const m of metrosSeed.metros ?? []) {
      const snap = (m as { sector_snapshot?: Record<string, unknown> | null }).sector_snapshot;
      if (!snap) continue;
      for (const [sector, blk] of Object.entries(snap)) {
        if (sector === "as_of" || typeof blk !== "object" || blk == null) continue;
        const b = blk as { vacancy_pct?: number | null; vacancy_pct_low?: number | null; vacancy_pct_high?: number | null };
        const low = b.vacancy_pct ?? b.vacancy_pct_low;
        const high = b.vacancy_pct ?? b.vacancy_pct_high;
        if (typeof low === "number" && typeof high === "number" && high > low) {
          rows.push({ name: m.name, sector, low, high });
        }
      }
    }
    rows.sort((a, b) => b.high - b.low - (a.high - a.low));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Baltimore office took the top slot on Aug 25 when the KLNB all-inventory
    // read (10.0) widened the band against CBRE's competitive 20.9 — the
    // starkest basis divergence on the board.
    expect(rows[0].name).toBe("Baltimore MD");
    expect(rows[0].sector).toBe("office");
    expect(rows[0].low).toBeCloseTo(10.0, 3);
    expect(rows[0].high).toBeCloseTo(20.9, 3);
    // LA office (17.8–25.8) still rides in the top three.
    expect(
      rows.slice(0, 3).some((r) => r.name === "Los Angeles" && r.sector === "office"),
    ).toBe(true);
  });
});

describe("fmtBenchValue", () => {
  it("formats percent metrics with % and never $", () => {
    expect(fmtBenchValue("office_vacancy_pct", 17.7, 22.3)).toBe("17.7%–22.3%");
    expect(fmtBenchValue("multifamily_cap_rate_pct", 4.75, 5.5)).toBe("4.75%–5.5%");
    expect(fmtBenchValue("multifamily_vacancy_pct", 5.2, 5.2)).toBe("5.2%");
    expect(fmtBenchValue("pmms_30y_fixed", 6.5, null)).toBe("6.5%");
  });
  it("formats rents as $/SF and counts plain", () => {
    expect(fmtBenchValue("industrial_asking_rent_psf", 13.27, 13.27)).toBe("$13.27/SF");
    expect(fmtBenchValue("monthly_sales_2_4_unit", 58, 58)).toBe("58");
    expect(fmtBenchValue("active_listings_2_4_unit", 1200, null)).toBe("1,200");
  });
  it("keeps dollars for sale medians and FMRs, dash for missing", () => {
    expect(fmtBenchValue("median_sale_price_2_4_unit", 450000, 520000)).toBe("$450,000–$520,000");
    expect(fmtBenchValue("hud_fmr_fy2027_2br", 2044, 2044)).toBe("$2,044");
    expect(fmtBenchValue("median_sale_price_2_4_unit", null, null)).toBe("—");
  });
});

describe("HUD's fair market rents — the year in the data, the newest year only", () => {
  const metros = metrosSeed.metros as { id: string; name: string }[];

  it("every covered metro carries a block the one reader reads: HUD's year, its day, its area, five bedrooms", () => {
    expect(metros.length).toBeGreaterThan(0);
    for (const m of metros) {
      const fmr = fmrOf(m);
      expect(fmr, m.id).not.toBeNull();
      expect(fmr!.status, m.id).toBe("verified");
      expect(fmr!.asOf, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fmr!.sources[0], m.id).toMatch(/^https:\/\/www\.huduser\.gov\//);
      for (const bed of FMR_BEDS) expect(fmr!.rents[bed], `${m.id} ${bed}`).toBeGreaterThan(0);
      // No key names a fiscal year: the year is the block's own field.
      expect(Object.keys(m).filter((k) => /fy_?20\d\d/i.test(k)), m.id).toEqual([]);
    }
    expect(Object.keys(multifamilySeed.supply_demand).filter((k) => /fy_?20\d\d/i.test(k))).toEqual([]);
  });

  it("pins the figures HUD's own file states, where the old ones were wrong or missing", () => {
    // Baltimore's and Seattle's two-bedroom and the Washington area's four
    // had been a republisher's figure, a gap and a gap.
    expect(metroFmr("baltimore")?.rents["2br"]).toBe(2006);
    expect(metroFmr("seattle")?.rents["2br"]).toBe(2549);
    expect(metroFmr("dc")?.rents["4br"]).toBe(3658);
    expect(metroFmr("atlanta")?.area).toBe("Atlanta-Sandy Springs-Roswell, GA HUD Metro FMR Area");
    expect(metroFmr("philadelphia")).toMatchObject({ fy: 2027, effective: "2026-10-01", rents: { "2br": 1860 } });
    expect(metroFmr("nowhere")).toBeNull();
  });

  it("the four DMV jurisdictions and multifamily.json's block are one HUD area, figure for figure", () => {
    const block = fmrBlock(multifamilySeed.supply_demand.rents_hud_fmr_dc_area)!;
    expect(block).not.toBeNull();
    for (const id of ["dc", "pg_county", "montgomery_county", "nova"]) {
      const fmr = metroFmr(id)!;
      expect({ fy: fmr.fy, effective: fmr.effective, area: fmr.area, rents: fmr.rents }, id).toEqual({
        fy: block.fy,
        effective: block.effective,
        area: block.area,
        rents: block.rents,
      });
    }
  });

  it("the seeds write lib/fmr's rows — the ones scripts/seed-research.mjs and the FMR pull write", () => {
    const fmrSeeds = seeds.filter((b) => readFmrMetric(b.metric));
    expect(fmrSeeds).toEqual(fmrBenchmarkRows(metrosSeed, multifamilySeed));
    // The Washington area's under its table label, every other metro under
    // its own name, five bedrooms each.
    expect(fmrSeeds).toHaveLength(metros.length * FMR_BEDS.length);
    expect(fmrSeeds.filter((b) => b.metro === DC_AREA_METRO)).toHaveLength(FMR_BEDS.length);
    expect(fmrSeeds.some((b) => b.metro === "Washington DC")).toBe(false);
    // The two scripts build rows through the same functions and never name
    // a metric (or a year) themselves.
    const seedScript = readFileSync(join(process.cwd(), "scripts/seed-research.mjs"), "utf8");
    expect(seedScript).toContain("fmrBenchmarkRows(metrosDoc, mf)");
    const pull = readFileSync(join(process.cwd(), "scripts/fetch-fmr.mjs"), "utf8");
    expect(pull).toContain("fmrRows(");
    expect(pull).toContain("fmrMetroLabel(entry)");
    for (const src of [seedScript, pull]) expect(src).not.toMatch(/hud_fmr_fy|(?<![a-z])fy ?20\d\d/i);
  });

  it("an older fiscal year merged in from the database is never shown as current", () => {
    const old = (metro: string, bed: string, low: number): Benchmark => ({
      sector: "multifamily",
      metro,
      metric: `hud_fmr_fy2026_${bed}`,
      low,
      high: low,
      unit: "usd_month",
      source: "https://www.dchousing.org/api/files/board/610.pdf",
      as_of: "2026-08-21",
      status: "verified",
      note: null,
    });
    // What the table may still hold: last year's seed under the Washington
    // area's label (a 4BR this year's file has too), and a row from an older
    // pull under the metro's own name.
    const stale = [old(DC_AREA_METRO, "2br", 2246), old(DC_AREA_METRO, "4br", 3413), old("Washington DC", "2br", 2246), old("Baltimore MD", "2br", 1943)];
    const merged = mergeBenchmarks(stale);
    expect(merged.filter((b) => readFmrMetric(b.metric)?.fy === 2026)).toEqual([]);
    expect(merged.find((b) => b.metro === DC_AREA_METRO && b.metric === "hud_fmr_fy2027_2br")?.low).toBe(2438);
    expect(merged.find((b) => b.metro === DC_AREA_METRO && b.metric === "hud_fmr_fy2027_4br")?.low).toBe(3658);
    // A deal's own rows, whatever was handed in.
    const dcDeal = benchmarksForDeal([...seeds, ...stale], "Washington", "Washington DC");
    const years = dcDeal.flatMap((b) => {
      const m = readFmrMetric(b.metric);
      return m ? [m.fy] : [];
    });
    expect(years.length).toBe(FMR_BEDS.length);
    expect(new Set(years)).toEqual(new Set([2027]));
  });

  it("a database row of the newest year replaces the file's figure of the same key", () => {
    const seed = seeds.find((b) => b.metro === "Baltimore MD" && b.metric === "hud_fmr_fy2027_2br")!;
    const pulled = { ...seed, low: 2010, high: 2010, source: "https://www.huduser.gov/portal/dataset/fmr-api.html" };
    const merged = mergeBenchmarks([pulled]).filter((b) => b.metro === "Baltimore MD" && b.metric === "hud_fmr_fy2027_2br");
    expect(merged).toEqual([pulled]);
  });

  it("the demo prints Philadelphia's from the file, never a figure or a year typed", () => {
    const demo = readFileSync(join(process.cwd(), "app/demo/page.tsx"), "utf8");
    expect(demo).toContain('metroFmr("philadelphia")');
    expect(demo).not.toContain("$1,810");
    expect(demo).not.toContain("$1,860");
  });
});

describe("twoToFourMedian — a sale median with its month, from the research file", () => {
  it("Philadelphia's May 2026 median and change, the month the file's own period states", () => {
    const m = twoToFourMedian("philadelphia_pa");
    expect(m).toEqual({ price: 363_500, yoy: "+6.9%", asOf: "2026-05-31" });
    expect(monthOf(m!.asOf)).toBe("May 2026");
    // The benchmark rows the deal pages read carry the same month.
    const row = seeds.find((b) => b.metro === "Philadelphia, PA" && b.metric === "median_sale_price_2_4_unit");
    expect(row?.as_of).toBe(m!.asOf);
    expect(row?.low).toBe(m!.price);
    // A metro the file states no change for has none; one it lacks is null.
    expect(twoToFourMedian("reading_pa")?.yoy).toBeNull();
    expect(twoToFourMedian("nowhere_xx")).toBeNull();
  });

  it("the demo prints the figure from the file, never a figure typed with no month", () => {
    const demo = readFileSync(join(process.cwd(), "app/demo/page.tsx"), "utf8");
    expect(demo).toContain('twoToFourMedian("philadelphia_pa")');
    expect(demo).not.toContain("$363,500");
    expect(demo).not.toContain("+6.9% YoY");
  });
});

// The research pass of 2026-09-30: the deal page's research panel set the
// deal's price PER UNIT against this median, a whole property's sale price,
// and called every Philadelphia deal priced under it a unit "below market".
describe("the deal page's research panel keeps the 2–4 unit median as dated context, never a call", () => {
  const row = seeds.find((b) => b.metro === "Philadelphia, PA" && b.metric === "median_sale_price_2_4_unit")!;

  it("names the figure as a whole property's sale price, with the month it is for", () => {
    expect(benchRowLabel(row)).toBe(`Median sale price of a 2–4 unit property, ${monthOf(row.as_of)}`);
    expect(monthOf(row.as_of)).toBe("May 2026");
    // A row with no date names no month rather than an empty one.
    expect(benchRowLabel({ ...row, as_of: "" })).toBe("Median sale price of a 2–4 unit property");
    // Every other row keeps its own name.
    expect(benchRowLabel({ metric: "monthly_sales_2_4_unit", as_of: row.as_of })).toBe("2–4 unit sales / month");
  });

  it("sets no price per unit against it, and draws no verdict chip", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/research-panel.tsx"), "utf8");
    expect(src).not.toMatch(/vsRange\(/);
    expect(src).not.toMatch(/deal \{cmp\} market/);
    expect(src).toContain("{benchRowLabel(b)}");
  });
});

describe("mergeRules — a rule's words are the file's; the database adds only a later re-check of those words", () => {
  const seed = seedRules();
  const ca = seed.find((r) => r.id === "ca-ab1482-rent-cap") ?? seed.find((r) => r.jurisdiction_state === "CA")!;
  // Postgres's jsonb hands keys back by length, then bytes: never the
  // file's order. The words are the same rule for all that.
  const reordered = (o: Record<string, unknown> | null) =>
    o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))) : o;

  it("keeps the file's corrected conditions over a copy seeded before the correction", () => {
    const stale: RegulatoryRule = {
      ...ca,
      exempt_if: { any_of: [{ building_permit_issued_after: "2011-01-01" }, { owner_occupied_with_units_lte: 2 }] },
      as_of: "2026-09-20",
    };
    const merged = mergeRules([stale]).find((r) => r.id === ca.id)!;
    expect(merged.exempt_if).toEqual(ca.exempt_if);
    // A re-check of other words does not date these.
    expect(merged.as_of).toBe(ca.as_of);
  });

  it("takes a later re-verification of the same words, whatever order their keys come back in", () => {
    const rechecked: RegulatoryRule = {
      ...ca,
      applies_if: reordered(ca.applies_if),
      exempt_if: reordered(ca.exempt_if),
      as_of: "2026-12-01",
    };
    const merged = mergeRules([rechecked]).find((r) => r.id === ca.id)!;
    expect(merged.as_of).toBe("2026-12-01");
    expect(merged.effect).toBe(ca.effect);
    // An earlier stamp never moves the file's back.
    expect(mergeRules([{ ...ca, as_of: "2026-01-01" }]).find((r) => r.id === ca.id)!.as_of).toBe(ca.as_of);
  });

  it("keeps a rule only the database holds, and every rule the file holds", () => {
    const extra: RegulatoryRule = { ...ca, id: "db-only-rule", effect: "A rule added in the database." };
    const merged = mergeRules([extra]);
    expect(merged.find((r) => r.id === "db-only-rule")?.effect).toBe("A rule added in the database.");
    expect(merged.length).toBe(seed.length + 1);
    expect(mergeRules(null)).toEqual(seed);
  });
});

describe("ruleCounts — the homepage's claim about the rules on file", () => {
  it("counts a rule filed without a source, and never calls it source-linked", () => {
    const { all, sourced } = ruleCounts();
    expect(all).toBe(seedRules().length);
    expect(sourced).toBe(seedRules().filter((r) => !!r.source && r.source.trim() !== "").length);
    // A rule the file carries with no source (New Jersey's municipal rent
    // control, as of this writing) keeps the two counts apart.
    const unsourced = seedRules().filter((r) => !r.source || r.source.trim() === "").length;
    expect(all - sourced).toBe(unsourced);
  });
});

describe("ruleName — a rule named for a reader, never by its raw id", () => {
  it("names a rule by what it is and where it holds, from the file's own fields", () => {
    expect(ruleName("md-moco-rent-stabilization")).toBe("rent control (Montgomery County, MD)");
    expect(ruleName("dc-topa-sale-trigger")).toBe("TOPA (Washington, DC)");
    expect(ruleName("dc-topa-2-4-unit-exemption")).toBe("TOPA exemption (Washington, DC)");
    expect(ruleName("md-baltimore-rental-license")).toBe("rental licensing (Baltimore City, MD)");
    // A statewide rule is named for its state, spelled out.
    expect(ruleName("va-no-local-rent-control")).toBe("no local rent control (Virginia)");
    expect(ruleName("ca-ab1482-rent-cap")).toBe("rent control coverage (California)");
    expect(ruleName("nj-municipal-rent-control")).toBe("rent control (New Jersey)");
  });

  it("names every rule on file in words — no underscore, no id — and an id the file does not hold not at all", () => {
    for (const r of seedRules()) {
      const name = ruleName(r.id);
      expect(name, r.id).toBeTruthy();
      expect(name, r.id).not.toMatch(/_/);
      expect(name, r.id).not.toContain(r.id);
      expect(name, r.id).toMatch(/\(.+\)$/);
    }
    // The intel sweep's rule id is whatever it matched: one the file does
    // not hold is said by nothing, never printed.
    expect(ruleName("md-rent-cap")).toBeNull();
    expect(ruleName(null)).toBeNull();
    expect(ruleName("")).toBeNull();
  });
});

describe("the research files' per-foot figures keep their dollar signs", () => {
  // An edit that read "$1" as a back-reference ate it out of two notes /market
  // prints: Prince George's industrial read "Asking ~0-15/SF NNN; the encoded
  // 2.50 is the band midpoint" for ~$10-15 and $12.50, and Baltimore retail's
  // rejected digest print read "1.04/SF … at 2.84" for $11.04 and $12.84.
  const strings = (v: unknown): string[] =>
    typeof v === "string"
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(strings)
        : v && typeof v === "object"
          ? Object.values(v).flatMap(strings)
          : [];

  it("a figure before /SF carries its $, or is the far end of a $ range", () => {
    const dir = join(process.cwd(), "data/research");
    const lost: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      for (const s of strings(JSON.parse(readFileSync(join(dir, file), "utf8")))) {
        for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?\/SF/g)) {
          const before = s.slice(0, m.index);
          if (/\$$/.test(before) || /\$\d[\d,]*(?:\.\d+)?\s*[-–]\s*$/.test(before)) continue;
          lost.push(`${file}: …${s.slice(Math.max(0, m.index - 40), m.index + m[0].length)}`);
        }
      }
    }
    expect(lost).toEqual([]);
  });
});

describe("the multifamily file's ACS stock counts", () => {
  // The entry's note and the gaps list /market prints said a live re-fetch
  // was "in progress". None was: the ACS data API answers a request without
  // a key with a redirect to its missing_key.html page, so the counts wait
  // on a Census API key.
  it("says the counts are not filed and wait on a Census API key, and claims no fetch", () => {
    const entry = multifamilySeed.supply_demand.stock_counts_acs_b25024;
    expect(entry.value).toBeNull();
    expect(entry.note).toContain("Not filed");
    expect(entry.note).toContain("Census API key");
    const gap = multifamilySeed.gaps.find((g) => g.includes("B25024"))!;
    expect(gap).toContain("not filed");
    expect(gap).toContain("Census API key");
    for (const text of [entry.note, gap]) expect(text).not.toMatch(/in progress|re-fetch|403/i);
  });
});

describe("the multifamily debt terms /market prints", () => {
  // The sector explorer's "Debt terms" once said the survey's value was
  // "pending live FRED fetch" while the rates strip on the same page drew it
  // from FRED. The file points at the strip, in the strip's own words, and
  // files no rate of its own.
  it("points at the survey on the rates strip and states no PMMS figure", () => {
    const mf = SECTORS.find((s) => s.id === "multifamily")!.doc;
    const text = looseValue((mf.debt_terms as Record<string, unknown>).conventional_investor_2_4)!;
    const fred = JSON.parse(readFileSync(join(process.cwd(), "data/fred-series.json"), "utf8")) as {
      groups: { id: string; label: string }[];
      series: { id: string; short: string; group: string }[];
    };
    const survey = fred.series.find((s) => s.id === "MORTGAGE30US")!;
    const group = fred.groups.find((g) => g.id === survey.group)!;
    expect(text).toContain(`the ${survey.short} tile under ${group.label} in Rates today`);
    expect(readFileSync(join(process.cwd(), "app/rates-strip.tsx"), "utf8")).toContain("Rates today");
    expect(text).not.toMatch(/pending|in progress/i);
    // The down payment is the file's claim; no rate is.
    expect(text.replace(/\d+-\d+% down/, "")).not.toMatch(/\d\s*%/);
  });
});
