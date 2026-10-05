import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { modelVsMarket, type ModelVsMarketInput } from "./model-vs-market";
import { checkTitles, readGrainNote, readScope, readsNation } from "./model-vs-market-scope";
import { ModelVsMarketCard } from "@/app/(app)/deals/[id]/model-vs-market-card";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// The national table as the runner printed it: CPI +3.4% and core +2.4%
// for August 2026, the 10-year at 4.94% on Sep 17.
const national = readRates(REAL_ROWS, FIXTURE_NOW);

// Washington's own series, the shape lib/views.render.test.ts draws the
// metro tiles on: the rent index as a LEVEL (420 against 400 a year
// earlier is +5.0%), the metro area's rental vacancy 6.2 ±2.2 for Q2 2026
// and the South's 9.5.
const rentIndex: RateRow[] = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
  rentIndex.push({ series_id: "CUURS35ASEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
}
const METRO_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
  { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
  { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
  ...rentIndex,
];
const rates = readMetroRates("dc", METRO_ROWS, FIXTURE_NOW);

const zori = {
  rent: 2412,
  yoyPct: 2.3,
  asOf: "2026-08-31",
  note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research.",
  shared: false,
  mfrRent: 2150,
  mfrYoyPct: 1.1,
  homeValue: null,
  homeValueYoyPct: null,
  priceToRentYears: null,
};

const base: ModelVsMarketInput = {
  inputs: { rentGrowthPct: 0.03, expenseGrowthPct: 0.03, vacancyPct: 0.05, exitCapPct: 0.06 },
  sources: {
    rentGrowthPct: { provenance: "assumption", note: "Default 3.0%/yr — set your view" },
    expenseGrowthPct: { provenance: "assumption", note: "Default 3.0%/yr — set your view" },
    vacancyPct: { provenance: "extracted", note: "OM in-place occupancy 95% — the vacancy is what it leaves" },
    exitCapPct: { provenance: "derived", note: "Going-in cap as stated" },
  },
  assetClass: "multifamily",
  plan: false,
  goingInCapPct: 5.45,
  metro: { id: "dc", name: "Washington DC" },
  rates,
  zori,
  national,
  now: FIXTURE_NOW,
};

const check = (input: ModelVsMarketInput, key: string) => modelVsMarket(input)?.checks.find((c) => c.key === key) ?? null;

describe("modelVsMarket — the model's four assumptions against the published figures", () => {
  const read = modelVsMarket(base)!;

  it("reads all four for an apartment deal in a covered market, dated", () => {
    expect(read.readOn).toBe("2026-09-21");
    expect(read.metro).toBe("Washington DC");
    expect(read.checks.map((c) => c.key)).toEqual(["rent_growth", "expense_growth", "vacancy", "exit_cap"]);
  });

  it("rent growth: the asking rents and the sitting tenants' rents, each dated and sourced, and the model placed inside the range", () => {
    const c = check(base, "rent_growth")!;
    expect(c.model).toBe("3.0%/yr");
    expect(c.modelSource).toBe("a screening default");
    expect(c.published.map((p) => p.value)).toEqual([2.3, 1.1, 5]);
    expect(c.published.map((p) => p.publisher)).toEqual(["Zillow Research", "Zillow Research", "BLS"]);
    expect(c.tone).toBe("inside");
    expect(c.toneLabel).toBe("inside the published range");
    expect(c.read).toBe(
      "The model grows rents 3.0%/yr. Over the past year the metro's asking rents moved +2.3% (apartments alone +1.1%) over the year to Aug 2026 (Zillow) and sitting tenants' rents +5.0% over the year to Aug 2026 (CPI rent, BLS). The model sits inside the published range. A trailing year is what the assumption is being asked to beat, not a forecast.",
    );
  });

  it("rent growth ahead of every figure says by how much, nearest to farthest; behind says the same", () => {
    const ahead = check({ ...base, inputs: { ...base.inputs, rentGrowthPct: 0.06 } }, "rent_growth")!;
    expect(ahead.tone).toBe("ahead");
    expect(ahead.read).toContain("The model runs ahead of every published figure, by 1.0 to 4.9 points.");
    const behind = check({ ...base, inputs: { ...base.inputs, rentGrowthPct: 0.005 } }, "rent_growth")!;
    expect(behind.tone).toBe("behind");
    expect(behind.read).toContain("The model runs behind every published figure, by 0.6 to 4.5 points.");
    // One published figure: one gap, said once.
    const one = check({ ...base, rates: [], inputs: { ...base.inputs, rentGrowthPct: 0.04 }, zori: { ...zori, mfrYoyPct: null } }, "rent_growth")!;
    expect(one.published).toHaveLength(1);
    expect(one.read).toContain("Over the past year the metro's asking rents moved +2.3% over the year to Aug 2026 (Zillow). The model runs ahead of every published figure, by 1.7 points.");
  });

  it("expense growth against consumer prices and core, BLS via FRED, with the insurance premium index beside them and never averaged in", () => {
    const c = check(base, "expense_growth")!;
    expect(c.published.map((p) => p.label)).toEqual([
      "Consumer prices (CPI, all items)",
      "Core CPI",
      "Commercial property insurance premiums (PPI, commercial multiple peril)",
      "Expected inflation, next ten years (10-year breakeven)",
    ]);
    expect(c.published[3]).toMatchObject({ text: "2.33% a year (Sep 18, 2026)", value: 2.33, asOf: "2026-09-18", publisher: "FRED" });
    expect(c.published[2]).toMatchObject({ text: "+4.8% over the year to Aug 2026", value: 4.83683, asOf: "2026-08-01", publisher: "BLS via FRED" });
    // The tone is read against the price indexes alone: 3.0% is inside
    // 2.4–3.4, and the 4.8% premium index does not widen the band.
    expect(c.tone).toBe("inside");
    expect(c.read).toBe(
      "The model grows expenses 3.0%/yr against consumer prices +3.4% over the year to Aug 2026 (core +2.4%); BLS via FRED. The model sits inside the published range. Insurance is the line that reprices hardest: commercial property premiums are +4.8% nationally over the year to Aug 2026 (the BLS's index of commercial multiple peril premiums), and a memorandum's premium is the seller's expiring policy, so the index is the floor for the other lines and this is the one to re-quote. The bond market expects inflation to average 2.33% a year over the next ten years (the 10-year breakeven, Sep 18, 2026; FRED) — its forecast over ten years, not the hold's.",
    );
    const ahead = check({ ...base, inputs: { ...base.inputs, expenseGrowthPct: 0.05 } }, "expense_growth")!;
    expect(ahead.read).toContain("The model runs ahead of the index, by 1.6 to 2.6 points.");
    // Without the index the sentence is the old one, and nothing claims a figure.
    const without = check({ ...base, national: (base.national ?? []).filter((r) => r.meta.id !== "PCU9241269241265_YOY" && r.meta.id !== "T10YIE") }, "expense_growth")!;
    expect(without.published.map((p) => p.label)).toEqual(["Consumer prices (CPI, all items)", "Core CPI"]);
    expect(without.read).not.toContain("breakeven");
    expect(without.read).toContain("Insurance and taxes reprice on their own cycles, so the index is the floor for the other lines, not the whole answer.");
  });

  it("vacancy: inside the survey's margin is inside the figure; past it is tighter or looser, said in points", () => {
    const c = check(base, "vacancy")!;
    expect(c.model).toBe("5.0%");
    expect(c.modelSource).toBe("from the documents");
    expect(c.published[0]).toMatchObject({ label: "Rental vacancy, metro area", value: 6.2, asOf: "2026-04-01", publisher: "Census Bureau" });
    expect(c.published[0].text).toBe("6.2% ±2.2 pts (Q2 2026)");
    expect(c.published[1].value).toBe(9.5);
    expect(c.tone).toBe("inside");
    expect(c.read).toContain("The model holds 5.0% vacancy. The metro area's rental vacancy is 6.2% ±2.2 pts (Q2 2026; Census Bureau), the");
    expect(c.read).toContain("9.5%. The model sits inside the survey's margin of the published figure.");
    const tight = check({ ...base, inputs: { ...base.inputs, vacancyPct: 0.03 } }, "vacancy")!;
    expect(tight.tone).toBe("tighter");
    expect(tight.toneLabel).toBe("tighter than the published figures");
    expect(tight.read).toContain("The building would run 3.2 points tighter than the metro's rental stock as a whole");
    const loose = check({ ...base, inputs: { ...base.inputs, vacancyPct: 0.09 } }, "vacancy")!;
    expect(loose.tone).toBe("looser");
    expect(loose.read).toContain("The model runs 2.8 points looser than the metro's rental stock as a whole — conservative against the survey.");
  });

  it("vacancy against the region alone where the metro has no survey row, at a plain tolerance", () => {
    const regionOnly = readMetroRates("dc", METRO_ROWS.filter((r) => !r.series_id.startsWith("HVS_")), FIXTURE_NOW);
    const c = check({ ...base, rates: regionOnly, inputs: { ...base.inputs, vacancyPct: 0.095 } }, "vacancy")!;
    expect(c.published).toHaveLength(1);
    expect(c.published[0].value).toBe(9.5);
    expect(c.tone).toBe("inside");
    expect(c.read).toContain("The model sits at the published figure.");
    expect(check({ ...base, rates: regionOnly, inputs: { ...base.inputs, vacancyPct: 0.07 } }, "vacancy")!.read).toContain(
      "2.5 points tighter than the region's rental stock as a whole",
    );
  });

  it("exit cap: the spread over the latest 10-year beside the going-in cap's — a widening is named as the conservative direction", () => {
    const c = check(base, "exit_cap")!;
    expect(c.model).toBe("6.00%");
    expect(c.modelSource).toBe("derived from the documents");
    expect(c.published[0]).toMatchObject({ label: "10-year Treasury", value: 4.94, asOf: "2026-09-17", publisher: "FRED" });
    expect(c.tone).toBe("widens");
    expect(c.read).toBe(
      "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year unchanged — the conservative direction.",
    );
  });

  it("an exit cap under the going-in cap is named as compression, and compression is not a plan", () => {
    const c = check({ ...base, inputs: { ...base.inputs, exitCapPct: 0.05 } }, "exit_cap")!;
    expect(c.tone).toBe("compresses");
    expect(c.toneLabel).toBe("assumes cap compression");
    expect(c.read).toContain("The exit cap 5.00% is 6 bps over the latest 10-year");
    expect(c.read).toContain("so the exit assumes the spread narrows 45 bps with the 10-year unchanged. Cap compression is not a plan");
    const level = check({ ...base, inputs: { ...base.inputs, exitCapPct: 0.0545 } }, "exit_cap")!;
    expect(level.tone).toBe("level");
    expect(level.read).toContain("so the exit holds the spread with the 10-year unchanged.");
  });

  it("a plan deal has no going-in cap: the exit's spread is stated, not set against an entry", () => {
    const c = check({ ...base, plan: true, goingInCapPct: null }, "exit_cap")!;
    expect(c.tone).toBe("stated");
    expect(c.read).toContain("A plan deal has no going-in cap to set it against; the spread is the claim");
    const noCap = check({ ...base, goingInCapPct: null }, "exit_cap")!;
    expect(noCap.tone).toBe("stated");
    expect(noCap.read).toContain("No going-in cap to set it against; the spread is the claim.");
  });

  it("a figure is set against an assumption of its own kind: an office reads the national office rent index and no metro row, a hotel has no lessor's rent, land has none", () => {
    const office = modelVsMarket({ ...base, assetClass: "office" })!;
    expect(office.checks.map((c) => [c.key, c.scope])).toEqual([
      ["rent_growth", "national"],
      ["expense_growth", "national"],
      ["exit_cap", "national"],
    ]);
    expect(office.metro).toBeNull();
    const hotel = modelVsMarket({ ...base, assetClass: "hospitality_str" })!;
    expect(hotel.checks.map((c) => c.key)).toEqual(["expense_growth", "exit_cap"]);
    expect(modelVsMarket({ ...base, assetClass: "senior_housing" })!.checks.map((c) => c.key)).toEqual(["expense_growth", "exit_cap"]);
    expect(modelVsMarket({ ...base, assetClass: "land_infill" })).toBeNull();
    // The apartment deal's rent and vacancy rows are the metro's.
    expect(read.checks.map((c) => c.scope)).toEqual(["metro", "national", "metro", "national"]);
  });

  it("a commercial deal's rents against the rents its kind of lessor charges, nationally, said as the nation's — the runner's August figures", () => {
    // Office: +7.2% on the year, the model's 3.0% well behind it.
    const office = check({ ...base, assetClass: "office" }, "rent_growth")!;
    expect(office.published).toEqual([
      { label: "Rents charged by lessors of professional and office buildings, national (PPI)", text: "+7.2% over the year to Aug 2026", value: 7.18581, asOf: "2026-08-01", publisher: "BLS via FRED" },
    ]);
    expect(office.tone).toBe("behind");
    expect(office.read).toBe(
      "The model grows rents 3.0%/yr. Over the year to Aug 2026 the rents lessors of professional and office buildings charge moved +7.2% nationally (BLS producer price index, via FRED) — the nation's lessors, not the metro's. The model runs behind the index, by 4.2 points. A trailing year is what the assumption is being asked to beat, not a forecast.",
    );
    // A medical office reads the office index too.
    expect(check({ ...base, assetClass: "medical_office" }, "rent_growth")!.published[0].value).toBe(7.18581);
    // Retail: rents fell 0.3% on the year, so 3.0% is ahead by 3.3 points.
    const retail = check({ ...base, assetClass: "retail" }, "rent_growth")!;
    expect(retail.tone).toBe("ahead");
    expect(retail.read).toContain("the rents lessors of shopping centers and retail stores charge moved -0.3% nationally");
    expect(retail.read).toContain("The model runs ahead of the index, by 3.3 points.");
    // Industrial: +3.2%, the model a shade behind.
    const industrial = check({ ...base, assetClass: "industrial" }, "rent_growth")!;
    expect(industrial.tone).toBe("behind");
    expect(industrial.read).toContain("lessors of manufacturing and industrial buildings charge moved +3.2% nationally");
    expect(industrial.read).toContain("by 0.2 points");
    // Self-storage: its own operators' index, -0.2%.
    const storage = check({ ...base, assetClass: "self_storage" }, "rent_growth")!;
    expect(storage.read).toContain("the rents miniwarehouse and self-storage operators charge moved -0.2% nationally");
    expect(storage.read).toContain("by 3.2 points");
    // A net lease, a data center and a parking structure read the aggregate.
    for (const cls of ["net_lease", "data_center", "parking"]) {
      const c = check({ ...base, assetClass: cls }, "rent_growth")!;
      expect(c.read, cls).toContain("the rents lessors of nonresidential buildings charge moved +3.5% nationally");
      expect(c.read, cls).toContain("The model runs behind the index, by 0.5 points.");
    }
    // A stale national table leaves the row out rather than reading a dead index.
    const stale = new Date("2027-03-01T00:00:00Z");
    expect(check({ ...base, assetClass: "office", national: readRates(REAL_ROWS, stale), now: stale }, "rent_growth")).toBeNull();
  });

  it("outside the covered markets the national rows still read; a stale table reads nothing", () => {
    const national = modelVsMarket({ ...base, metro: null, rates: [], zori: null })!;
    expect(national.checks.map((c) => c.key)).toEqual(["expense_growth", "exit_cap"]);
    expect(national.metro).toBeNull();
    const stale = new Date("2027-03-01T00:00:00Z");
    expect(
      modelVsMarket({
        ...base,
        rates: readMetroRates("dc", METRO_ROWS, stale),
        zori: null,
        national: readRates(REAL_ROWS, stale),
        now: stale,
      }),
    ).toBeNull();
  });

  it("a figure with no provenance is 'as set'", () => {
    expect(check({ ...base, sources: undefined }, "rent_growth")!.modelSource).toBe("as set");
  });
});

describe("ModelVsMarketCard — the card on the deal page", () => {
  const html = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: modelVsMarket(base) }));
  const text = visibleText(html);

  it("names the scope, the date, and each assumption with its source and its chip", () => {
    expect(text).toContain("Assumptions against the published figures");
    expect(text).toContain("set against the published figures for the Washington DC market and the nation, read on Sep 21, 2026.");
    // The expense row carries the bond market's inflation expectation, a
    // forecast, so the header never calls every figure what the series did.
    expect(text).not.toContain("actually done");
    expect(text).toContain("not a forecast");
    expect(text).toContain("Rent growth");
    expect(text).toContain("3.0%/yr");
    expect(text).toContain("a screening default");
    expect(text).toContain("inside the published range");
    expect(text).toContain("Stabilized vacancy");
    expect(text).toContain("from the documents");
    expect(text).toContain("Exit cap");
    expect(text).toContain("spread widens at the exit");
    expect(text).toContain("106 bps over the latest 10-year");
    expect(text).not.toContain("today's 10-year");
  });

  it("says the national scope where no metro figure was read, names the rows it has, and renders nothing with nothing to say", () => {
    const national = visibleText(renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: modelVsMarket({ ...base, assetClass: "office" }) })));
    expect(national).toContain("The model's rent growth, expense growth and exit cap, set against the nation's published figures, read on Sep 21, 2026.");
    expect(national).toContain("Rent growth");
    expect(national).toContain("the nation's lessors, not the metro's");
    expect(national).not.toContain("Stabilized vacancy");
    expect(text).toContain("The model's rent growth, expense growth, stabilized vacancy and exit cap, set against the published figures for the Washington DC market and the nation, read on Sep 21, 2026.");
    expect(renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: null }))).toBe("");
  });

  it("names the nation only where a national figure was read, and a state as a state", () => {
    // A stale national table: the metro's rents and vacancy still read, and
    // nothing of the nation's does, so the sentence names the market alone.
    const stale = new Date("2027-03-01T00:00:00Z");
    const metroOnly = modelVsMarket({ ...base, national: readRates(REAL_ROWS, stale) })!;
    expect(metroOnly.checks.map((c) => c.key)).toEqual(["rent_growth", "vacancy"]);
    expect(readsNation(metroOnly)).toBe(false);
    expect(readScope(metroOnly, "Sep 21, 2026")).toBe(
      "The model's rent growth and stabilized vacancy, set against the published figures for the Washington DC market, read on Sep 21, 2026.",
    );
    // The exit cap's 10-year is the nation's even where the tracker's cap
    // range makes the row the metro's.
    expect(readsNation({ checks: [{ ...check(base, "exit_cap")!, scope: "metro" }] })).toBe(true);
    const state = { readOn: "2026-09-21", metro: "Pennsylvania", grain: "state" as const, checks: modelVsMarket(base)!.checks };
    expect(readScope(state, "2026-09-21")).toBe(
      "The model's rent growth, expense growth, stabilized vacancy and exit cap, set against the published figures for the state of Pennsylvania and the nation, read on 2026-09-21 — the address lies outside the metros the site tracks, so the state's figures stand in for a metro's.",
    );
    expect(readGrainNote(state)).toBe("a state figure is the state's, not any metro's, the submarket's or the building's.");
    expect(readGrainNote(modelVsMarket(base)!)).toBe("a metro figure is the metro area's, not the submarket's or the building's.");
    expect(checkTitles({ checks: [check(base, "vacancy")!] })).toBe("stabilized vacancy");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "model vs market card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── One read for every surface ──────────────────────────────────────────────
import { dealGoingInCap, impliedGoingInCap, modelVsMarketFor } from "./model-vs-market";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";

/** A first signal naming no plan, carrying whatever cap the fast read found. */
const signalWithCap = (goingInCap: string, assetClass = "industrial"): FirstSignal => ({
  dealName: "Meridian Logistics Center",
  assetClass,
  market: "Inland Empire, CA",
  askPrice: "$50,000,000",
  size: "300,000 SF",
  goingInCap,
  perUnit: "",
  take: "Check the rent roll against the market's asking rents.",
});

describe("modelVsMarketFor — the deal page, the report and the workbook call one function", () => {
  const extraction: ExtractionResult = {
    dealName: "Meridian Logistics Center",
    assetClass: "industrial",
    market: "Inland Empire, CA",
    address: "1 Distribution Dr, Fontana, CA",
    metrics: [
      { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
      { label: "Going-in cap rate", value: "6.0%", flagged: true, page: "p. 6" },
      { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
      { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
    ],
  };
  const derived = deriveUnderwriteInputs(extraction, extraction.dealName!);
  const reads = { rates, zori, national, now: FIXTURE_NOW };

  it("reads the class the deck turned out to be, the extraction's going-in cap, today's figures and the metro's tracker", () => {
    const r = modelVsMarketFor({ derived, extraction, storedAssetClass: "auto", metro: { id: "dc", name: "Washington DC" }, reads })!;
    expect(r.checks.map((c) => c.key)).toEqual(["rent_growth", "expense_growth", "vacancy", "exit_cap"]);
    // A warehouse's rents are the nation's lessors'; its vacancy is the
    // metro's industrial tracker read, so the metro is named.
    expect(r.metro).toBe("Washington DC");
    expect(r.checks[0].read).toContain("lessors of manufacturing and industrial buildings");
    expect(r.checks[2].read).toContain(
      "Industrial vacancy reads 7.4% on the research tracker: Newmark, the Washington metro, Q1 2026 (read Aug 25, 2026) — a research print, not a feed.",
    );
    // The exit cap is derived from the going-in cap, so the spread is held;
    // the industrial tracker carries no cap range for Washington.
    expect(r.checks[3].tone).toBe("level");
    expect(r.checks[3].read).toContain("The going-in cap 6.00% is 106 bps over it, so the exit holds the spread");
    expect(r.checks[3].read).not.toContain("cap range");
  });

  it("reads no research tracker for a deal its county alone placed in the market (#447)", () => {
    // The tracker is the market's research, and may be its core county's; a
    // deal placed by its county reads the metro area's published figures only.
    const r = modelVsMarketFor({
      derived,
      extraction,
      storedAssetClass: "auto",
      metro: { id: "dc", name: "Washington DC", placedBy: { county: "Stafford County, VA", area: "Washington-Arlington-Alexandria, DC-VA-MD-WV" } },
      reads,
    })!;
    expect(r.checks.map((c) => c.read).join(" ")).not.toContain("research tracker");
    // A warehouse's one metro figure was the tracker's, so with it out the
    // read names no metro rather than one it read nothing of.
    expect(r.metro).toBeNull();
    expect(r.checks.every((c) => c.scope === "national")).toBe(true);
  });

  it("where the extraction states no cap, takes the first signal's, as the page's summary bar does; where neither does, the cap the documents' NOI implies on their price", () => {
    const noCap: ExtractionResult = { ...extraction, metrics: extraction.metrics.filter((m) => !/cap rate/i.test(m.label)) };
    // The page, the report and the workbook all hand the signal in, so all
    // three read its 5.5% — the page's summary bar's own fallback.
    const own = modelVsMarketFor({ derived, extraction: noCap, firstSignal: signalWithCap("5.5%"), storedAssetClass: "industrial", metro: null, reads })!;
    expect(own.checks[2].read).toContain("The going-in cap 5.50% is 56 bps over it, so the exit assumes the spread widens 50 bps");
    // The extraction's stated cap outranks the signal's.
    const stated = modelVsMarketFor({ derived, extraction, firstSignal: signalWithCap("5.5%"), storedAssetClass: "industrial", metro: null, reads })!;
    expect(stated.checks[2].read).toContain("The going-in cap 6.00% is 106 bps over it");
    // No cap stated anywhere, or a signal "cap" no price can carry (a 105%
    // figure is a yield on cost or a pro forma): the OM's $3,000,000 NOI
    // over its $50,000,000 price is 6.00% going in, said as the arithmetic.
    for (const firstSignal of [undefined, signalWithCap(""), signalWithCap("105%"), signalWithCap("0.4%")]) {
      const none = modelVsMarketFor({ derived, extraction: noCap, firstSignal, storedAssetClass: "industrial", metro: null, reads })!;
      expect(none.checks[2].tone, firstSignal?.goingInCap).toBe("level");
      expect(none.checks[2].read).toContain("The going-in cap implied by the OM's NOI over its price, 6.00%, is 106 bps over it, so the exit holds the spread");
    }
    // Nothing to imply it from: no cap, and the check states the spread alone.
    const bare: ExtractionResult = { ...noCap, metrics: noCap.metrics.filter((m) => !/net operating income/i.test(m.label)) };
    const noNoi = modelVsMarketFor({ derived, extraction: bare, storedAssetClass: "industrial", metro: null, reads })!;
    expect(noNoi.checks[2].tone).toBe("stated");
    expect(noNoi.checks[2].read).toContain("No going-in cap to set it against; the spread is the claim.");
  });

  it("reads one going-in cap for one deal on the page, the report and the workbook (the audit of 2026-10-01)", () => {
    // A $30M price, a $1.74M NOI and no cap row: the documents imply 5.80%,
    // while the first signal read 5.4% off the cover. The page had handed in
    // its summary bar's 5.4% and read 60 bps of widening; the report and the
    // workbook, handed nothing, read the implied 5.80% and 20 bps.
    const deal: ExtractionResult = {
      ...extraction,
      metrics: [
        { label: "Asking price", value: "$30,000,000", flagged: false, page: "p. 5" },
        { label: "Net operating income", value: "$1,740,000", flagged: false, page: "p. 7" },
        { label: "Rentable square feet", value: "200,000", flagged: false, page: "p. 4" },
      ],
    };
    expect(impliedGoingInCap(deal)?.pct).toBeCloseTo(5.8, 6);
    const model = deriveUnderwriteInputs(deal, deal.dealName!);
    const exit = modelVsMarketFor({ derived: model, extraction: deal, firstSignal: signalWithCap("5.4%"), storedAssetClass: "industrial", metro: null, reads })!.checks.find((c) => c.key === "exit_cap");
    expect(exit?.read).toContain("The going-in cap 5.40%");
    expect(exit?.read).not.toContain("implied");
  });

  it("a plan deal reads no going-in cap, whatever the extraction states", () => {
    const plan: ExtractionResult = {
      ...extraction,
      assetClass: "multifamily",
      metrics: [
        ...extraction.metrics,
        { label: "Strategy", value: "Ground-up development", flagged: false, page: "p. 2" },
        { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
        { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
      ],
    };
    const r = modelVsMarketFor({ derived: deriveUnderwriteInputs(plan, "plan"), extraction: plan, storedAssetClass: "auto", metro: { id: "dc", name: "Washington DC" }, reads });
    const exit = r?.checks.find((c) => c.key === "exit_cap");
    expect(exit?.tone).toBe("stated");
    expect(exit?.read).toContain("A plan deal has no going-in cap to set it against");
    // Not the first signal's either, nor the one its figures would imply: a
    // plan's NOI belongs over total cost, and the page shows none.
    const shown = modelVsMarketFor({ derived: deriveUnderwriteInputs(plan, "plan"), extraction: plan, firstSignal: signalWithCap("5.0%"), storedAssetClass: "auto", metro: null, reads });
    expect(shown?.checks.find((c) => c.key === "exit_cap")?.read).toContain("A plan deal has no going-in cap to set it against");
  });

  it("reads the plan the first signal names, as the page does (the audit of 2026-09-30)", () => {
    // Nothing in the extraction names a plan; the first signal does. The
    // page hands the signal in, and so must the report and the workbook.
    const signal: FirstSignal = {
      dealName: "Meridian Logistics Center",
      assetClass: "industrial",
      market: "Inland Empire, CA",
      askPrice: "$50,000,000",
      size: "300,000 SF",
      goingInCap: "6.0%",
      perUnit: "",
      take: "A conversion of a vacant plant to last-mile logistics — check the budget against the clear height.",
    };
    const exitOf = (r: ReturnType<typeof modelVsMarketFor>) => r?.checks.find((c) => c.key === "exit_cap");
    const withSignal = modelVsMarketFor({ derived, extraction, firstSignal: signal, storedAssetClass: "industrial", metro: null, reads });
    expect(exitOf(withSignal)?.tone).toBe("stated");
    expect(exitOf(withSignal)?.read).toContain("A plan deal has no going-in cap to set it against");
    const without = modelVsMarketFor({ derived, extraction, storedAssetClass: "industrial", metro: null, reads });
    expect(exitOf(without)?.read).toContain("The going-in cap 6.00%");
  });

  it("a note reads no going-in cap — stated, the first signal's or implied — since its price is a loan's (the audit of 2026-09-30)", () => {
    const note: ExtractionResult = {
      ...extraction,
      interest: { kind: "note", summary: "The first mortgage note secured by the property", share: "", groundLease: "", loan: "", page: "p. 2" },
    };
    const exitOf = (r: ReturnType<typeof modelVsMarketFor>) => r?.checks.find((c) => c.key === "exit_cap");
    for (const r of [
      // the report's and the workbook's call: the extraction's own stated cap
      modelVsMarketFor({ derived, extraction: note, storedAssetClass: "industrial", metro: null, reads }),
      // the first signal's cap, which the summary bar falls back to
      modelVsMarketFor({ derived, extraction: note, firstSignal: signalWithCap("6.0%"), storedAssetClass: "industrial", metro: null, reads }),
      // no cap stated anywhere: the NOI over the note's price is no cap either
      modelVsMarketFor({
        derived,
        extraction: { ...note, metrics: note.metrics.filter((m) => !/cap rate/i.test(m.label)) },
        storedAssetClass: "industrial",
        metro: null,
        reads,
      }),
    ]) {
      expect(exitOf(r)?.tone).toBe("stated");
      expect(exitOf(r)?.read).toContain("No going-in cap to set it against; the spread is the claim.");
      expect(exitOf(r)?.read).not.toContain("The going-in cap");
    }
  });

  it("is one reader, `dealGoingInCap`, that the submarket check's supply warning reads too", () => {
    const noCap: ExtractionResult = { ...extraction, metrics: extraction.metrics.filter((m) => !/cap rate/i.test(m.label)) };
    expect(dealGoingInCap(extraction)).toEqual({ pct: 6, source: "stated" });
    expect(dealGoingInCap(noCap, signalWithCap("5.5%"))).toEqual({ pct: 5.5, source: "stated" });
    expect(dealGoingInCap(noCap)?.source).toBe("implied");
    expect(dealGoingInCap(noCap)?.pct).toBeCloseTo(6, 9);
    const note: ExtractionResult = {
      ...extraction,
      interest: { kind: "note", summary: "The first mortgage note", share: "", groundLease: "", loan: "", page: "p. 2" },
    };
    expect(dealGoingInCap(note, signalWithCap("6.0%"))).toBeNull();
    const conversion: FirstSignal = { ...signalWithCap("6.0%"), take: "A conversion of a vacant plant to last-mile logistics." };
    expect(dealGoingInCap(extraction, conversion)).toBeNull();
  });
});

describe("the going-in cap the documents imply where they state none", () => {
  // A $20,000,000 price and a $1,500,000 NOI, no cap row: 7.50% going in.
  // The model exits at its 6.00% default, 150 bps of compression the check
  // had left unsaid ("No going-in cap to set it against").
  const priced: ExtractionResult = {
    dealName: "Elm Court",
    assetClass: "multifamily",
    market: "Washington, DC",
    address: "100 Elm St NW, Washington, DC",
    metrics: [
      { label: "Asking price", value: "$20,000,000", flagged: false, page: "p. 3" },
      { label: "Net operating income (T-12)", value: "$1,500,000", flagged: false, page: "p. 9" },
      { label: "Units", value: "80", flagged: false, page: "p. 2" },
    ],
  };
  const derived = deriveUnderwriteInputs(priced, priced.dealName!);
  const reads = { rates, zori, national, now: FIXTURE_NOW };
  const exitOf = (r: ReturnType<typeof modelVsMarketFor>) => r?.checks.find((c) => c.key === "exit_cap");

  it("reads the OM's NOI over its price, on the page, the report and the workbook alike, and names the compression the default exit runs", () => {
    expect(derived.inputs.exitCapPct).toBe(0.06);
    expect(derived.sources.exitCapPct?.provenance).toBe("assumption");
    expect(impliedGoingInCap(priced)).toEqual({ pct: 7.5, whole: false });
    const metro = { id: "dc", name: "Washington DC" };
    for (const exit of [
      // no first signal handed in
      exitOf(modelVsMarketFor({ derived, extraction: priced, storedAssetClass: "auto", metro, reads })),
      // a first signal with no cap in it, as every surface hands it in
      exitOf(modelVsMarketFor({ derived, extraction: priced, firstSignal: signalWithCap("", "multifamily"), storedAssetClass: "auto", metro, reads })),
    ]) {
      expect(exit?.modelSource).toBe("a screening default");
      expect(exit?.tone).toBe("compresses");
      expect(exit?.read).toContain(
        "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap implied by the OM's NOI over its price, 7.50%, is 256 bps over it, so the exit assumes the spread narrows 150 bps with the 10-year unchanged. Cap compression is not a plan",
      );
      expect(exit?.read).not.toContain("No going-in cap");
    }
  });

  it("a stated cap wins, and is said as the stated one", () => {
    const stated: ExtractionResult = { ...priced, metrics: [...priced.metrics, { label: "Going-in cap rate", value: "7.0%", flagged: false, page: "p. 3" }] };
    const exit = exitOf(modelVsMarketFor({ derived: deriveUnderwriteInputs(stated, "x"), extraction: stated, storedAssetClass: "auto", metro: null, reads }));
    expect(exit?.read).toContain("The going-in cap 7.00% is 206 bps over it");
    expect(exit?.read).not.toContain("implied");
  });

  it("grosses a share's price up to the whole and says so; a note and a leased fee imply none", () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    const share: ExtractionResult = { ...priced, interest: { ...blank, kind: "partial_interest", share: "50% limited partnership interest" } };
    // $1.5M over the $40M whole the $20M half implies.
    expect(impliedGoingInCap(share)).toEqual({ pct: 3.75, whole: true });
    const shareExit = exitOf(modelVsMarketFor({ derived: deriveUnderwriteInputs(share, "x"), extraction: share, storedAssetClass: "auto", metro: null, reads }));
    expect(shareExit?.read).toContain("The going-in cap implied by the OM's NOI over the whole price its share implies, 3.75%,");
    // A share with no stated percentage, a note (a loan's price) and a
    // leased fee (the land's): no building price, so no cap on it.
    for (const interest of [
      { ...blank, kind: "partial_interest" as const, share: "a majority interest" },
      { ...blank, kind: "note" as const },
      { ...blank, kind: "leased_fee" as const },
    ]) {
      const ex: ExtractionResult = { ...priced, interest };
      expect(impliedGoingInCap(ex), interest.kind).toBeNull();
      expect(exitOf(modelVsMarketFor({ derived: deriveUnderwriteInputs(ex, "x"), extraction: ex, storedAssetClass: "auto", metro: null, reads }))?.tone, interest.kind).toBe("stated");
    }
  });

  it("reads none where the NOI is no going-in figure on the price, or a figure is missing", () => {
    const withNoi = (value: string): ExtractionResult => ({
      ...priced,
      metrics: priced.metrics.map((m) => (/net operating income/i.test(m.label) ? { ...m, value } : m)),
    });
    // 30% of the price is past the ceiling a cap can be: a misread or a pro forma.
    expect(impliedGoingInCap(withNoi("$6,000,000"))).toBeNull();
    expect(impliedGoingInCap(withNoi("$0"))).toBeNull();
    expect(impliedGoingInCap({ ...priced, metrics: priced.metrics.filter((m) => !/price/i.test(m.label)) })).toBeNull();
    expect(impliedGoingInCap(null)).toBeNull();
    // A stabilized pro forma is not today's income: it implies no going-in cap.
    const proForma: ExtractionResult = {
      ...priced,
      metrics: priced.metrics.map((m) => (/net operating income/i.test(m.label) ? { ...m, label: "NOI (stabilized, pro forma)" } : m)),
    };
    expect(impliedGoingInCap(proForma)).toBeNull();
    // A price stated as a range is read at its top, as every price reader reads it.
    const ranged: ExtractionResult = {
      ...priced,
      metrics: priced.metrics.map((m) => (/price/i.test(m.label) ? { ...m, value: "$18,000,000 – $20,000,000" } : m)),
    };
    expect(impliedGoingInCap(ranged)).toEqual({ pct: 7.5, whole: false });
  });
});

// ── The research tracker's read, beside the feeds ───────────────────────────
import { bandText, figureCitation, figureNote, figureRead, rentOf, trackerFor, trackerSectorFor } from "./tracker-read";
import { sectorLeaderboard } from "./sector-leaderboard";
import metrosSeed from "@/data/research/metros.json";

describe("trackerFor — the sector snapshot's vacancy band and cap range for a deal's kind of building in its metro", () => {
  it("maps a class to its tracker sector, and a class no tracker covers to none", () => {
    expect(trackerSectorFor("office")).toBe("office");
    expect(trackerSectorFor("Class A office tower")).toBe("office");
    expect(trackerSectorFor("industrial")).toBe("industrial");
    expect(trackerSectorFor("retail")).toBe("retail");
    expect(trackerSectorFor("multifamily")).toBe("multifamily");
    for (const cls of ["medical_office", "net_lease", "sfr_btr", "student_housing", "senior_housing", "self_storage", "hospitality_str", "data_center", "parking", "land_infill", "auto", null, undefined, ""]) {
      expect(trackerSectorFor(cls), String(cls)).toBeNull();
    }
  });

  it("reads no tracker for a lab, an outdoor-storage yard or a cold-storage warehouse: a neighbour's figure is not theirs", () => {
    // lib/asset-words files each under office or industrial; the trackers
    // describe offices and warehouses, not these.
    for (const cls of [
      "Life Science / Lab",
      "Laboratory building",
      "Life sciences campus",
      "Industrial Outdoor Storage",
      "IOS yard",
      "Truck terminal",
      "Cold Storage Warehouse",
      "Refrigerated distribution",
      "Freezer facility",
    ]) {
      expect(trackerSectorFor(cls), cls).toBeNull();
      expect(trackerFor("dc", cls), cls).toBeNull();
    }
    // A plain class filed by the analyst, with the deck's own words naming the building.
    expect(trackerSectorFor("office", "Life Science / Lab")).toBeNull();
    expect(trackerSectorFor("industrial", "Cold Storage Warehouse")).toBeNull();
    expect(trackerFor("dc", "industrial", "Industrial Outdoor Storage")).toBeNull();
    // A plain office, warehouse or distribution building reads its tracker as before.
    expect(trackerSectorFor("Warehouse / Distribution")).toBe("industrial");
    expect(trackerSectorFor("industrial", "Bulk distribution warehouse")).toBe("industrial");
    expect(trackerSectorFor("office", "Class A office tower")).toBe("office");
    expect(trackerSectorFor("Collaborative office studios")).toBe("office");
    expect(trackerFor("dc", "industrial", "Industrial")).toMatchObject({ sector: "industrial", vacancyLow: 7.4 });
  });

  it("the model's checks read no tracker for a cold-storage warehouse the analyst filed as industrial", () => {
    const cold: ExtractionResult = {
      dealName: "Anacostia Cold Storage",
      assetClass: "Cold Storage Warehouse",
      market: "Washington, DC",
      address: "1 Cold Storage Way NE, Washington, DC",
      metrics: [
        { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
        { label: "Going-in cap rate", value: "6.0%", flagged: false, page: "p. 6" },
        { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
      ],
    };
    const r = modelVsMarketFor({
      derived: deriveUnderwriteInputs(cold, "cold"),
      extraction: cold,
      storedAssetClass: "industrial",
      metro: { id: "dc", name: "Washington DC" },
      reads: { rates, zori, national, now: FIXTURE_NOW },
    })!;
    // No rent row either: the industrial landlords' rent index is the
    // neighbour's figure the tracker refuses it (research pass 23).
    expect(r.checks.map((c) => c.key)).toEqual(["expense_growth", "exit_cap"]);
    expect(r.checks.map((c) => c.read).join(" ")).not.toContain("research tracker");
    expect(r.checks.map((c) => c.read).join(" ")).not.toContain("lessors of manufacturing and industrial buildings");
    // A lab the analyst filed as an office reads no office landlords' rents;
    // a plain warehouse filed the same way still reads its own.
    const lab = { ...cold, dealName: "Navy Yard Labs", assetClass: "Laboratory" };
    const labRead = modelVsMarketFor({
      derived: deriveUnderwriteInputs(lab, "lab"),
      extraction: lab,
      storedAssetClass: "office",
      metro: { id: "dc", name: "Washington DC" },
      reads: { rates, zori, national, now: FIXTURE_NOW },
    })!;
    expect(labRead.checks.map((c) => c.key)).not.toContain("rent_growth");
    const warehouse = { ...cold, dealName: "Anacostia Distribution", assetClass: "Bulk distribution warehouse" };
    const plain = modelVsMarketFor({
      derived: deriveUnderwriteInputs(warehouse, "warehouse"),
      extraction: warehouse,
      storedAssetClass: "industrial",
      metro: { id: "dc", name: "Washington DC" },
      reads: { rates, zori, national, now: FIXTURE_NOW },
    })!;
    expect(plain.checks.find((c) => c.key === "rent_growth")?.read).toContain("lessors of manufacturing and industrial buildings");
  });

  it("reads a band as a band, a point as a point, the day the research was read, and each figure's own provenance", () => {
    expect(trackerFor("dc", "office")).toEqual({
      sector: "office",
      sectorLabel: "office",
      vacancyLow: 21.3,
      vacancyHigh: 22.2,
      capLow: null,
      capHigh: null,
      asOf: "2026-08-25",
      vacancy: {
        house: "Colliers (21.3%) and CBRE (22.2%)",
        area: "the District",
        period: "Q2 2026",
        links: [
          "https://www.colliers.com/en/research/washington-dc/washington-dc-office-market-report-2026-q2",
          "https://www.cbre.com/insights/figures/washington-dc-office-figures-q2-2026",
        ],
        construct: null,
        slice: null,
        printedBand: false,
      },
      cap: null,
    });
    expect(trackerFor("dc", "multifamily")).toMatchObject({ sector: "multifamily", sectorLabel: "apartment", vacancyLow: 5.2, vacancyHigh: 5.2, capLow: 4.75, capHigh: 5.5 });
    expect(trackerFor("nova", "industrial")).toMatchObject({ vacancyLow: 3.9, vacancyHigh: 5.0, capLow: null });
    // A block with a rent and nothing else is no read; a metro with no block for the sector is none; an unknown metro is none.
    expect(trackerFor("montgomery_county", "industrial")).toBeNull();
    expect(trackerFor("pg_county", "retail")).toBeNull();
    expect(trackerFor("tulsa", "office")).toBeNull();
    expect(trackerFor("dc", "medical_office")).toBeNull();
    expect(bandText(21.3, 22.2)).toBe("21.3–22.2%");
    expect(bandText(7.4, 7.4)).toBe("7.4%");
    expect(bandText(4.75, 5.5, 2)).toBe("4.75–5.50%");
  });

  it("credits each figure to its own house, area and period — never the block's first link or the snapshot's day", () => {
    // Chicago's cap is Essex Realty's April 2026 average for the small-building
    // stock; the block's first link is JPMorgan's, the vacancy's source.
    const chicago = trackerFor("chicago", "multifamily")!;
    expect(chicago.cap).toMatchObject({
      house: "Essex Realty",
      area: "Chicago",
      period: "April 2026",
      links: ["https://essexrealtygroup.com/chicago-multifamily-report-april-2026/"],
      construct: "a transaction average of 175 sales, not a quoted band",
    });
    expect(chicago.cap!.slice).toContain("Class B/C neighborhood buildings");
    expect(chicago.vacancy!.links).toEqual(["https://www.jpmorgan.com/insights/real-estate/commercial-term-lending/chicago-multifamily-market-outlook"]);
    // Prince George's County's office figure is Colliers' Suburban Maryland survey area, both counties together.
    expect(trackerFor("pg_county", "office")!.vacancy).toMatchObject({
      house: "Colliers",
      area: "Suburban Maryland (Montgomery and Prince George's together, not a county split)",
      period: "Q1 2026",
    });
    // The Washington region's apartment figures name no house: no link is credited, and the cap is undated.
    const region = trackerFor("pg_county", "multifamily")!;
    expect(region.vacancy).toMatchObject({ house: null, area: "the Washington DC region", period: "year-end 2025", links: [] });
    expect(region.cap).toMatchObject({ house: null, period: null, links: [] });
    expect(figureCitation(region.cap!)).toBe("publisher not recorded, the Washington DC region, undated");
    // The Miami retail figure is Colliers' Q2 2026; the block's only Colliers link is its Q1 report, so it is not credited.
    expect(trackerFor("miami", "retail")!.vacancy).toMatchObject({ house: "Colliers", period: "Q2 2026", links: [] });
  });

  it("reads a figure's provenance only from its own block: a link outside the block's sources is dropped, and no read names nothing", () => {
    const sources = ["https://a.example/q2", "https://b.example/q2"];
    expect(figureRead({ house: "A", period: "Q2 2026", links: ["https://b.example/q2", "https://c.example/other"] }, sources)).toEqual({
      house: "A",
      area: null,
      period: "Q2 2026",
      links: ["https://b.example/q2"],
      construct: null,
      slice: null,
      printedBand: false,
    });
    // A block with a figure and no read: nothing named, and never the first source.
    const bare = figureRead(undefined, sources);
    expect(bare).toEqual({ house: null, area: null, period: null, links: [], construct: null, slice: null, printedBand: false });
    expect(figureCitation(bare)).toBe("publisher not recorded, undated");
    expect(figureNote({ ...bare, house: "Essex Realty", period: "April 2026", construct: "a transaction average", slice: "Class B/C buildings" })).toBe(
      "Essex Realty, April 2026; a transaction average; for Class B/C buildings",
    );
  });

  it("every tracker figure in the research file carries its own read, linked only to its block's sources", () => {
    const known = new Set(["house", "area", "period", "links", "construct", "slice", "band"]);
    let figures = 0;
    for (const m of metrosSeed.metros) {
      const snap = (m as { sector_snapshot?: Record<string, unknown> | null }).sector_snapshot ?? {};
      for (const [sector, raw] of Object.entries(snap)) {
        if (sector === "as_of" || !raw || typeof raw !== "object") continue;
        const blk = raw as Record<string, unknown>;
        const sources = (blk.sources as string[] | undefined) ?? [];
        const where = `${m.id}.${sector}`;
        const hasVacancy = typeof (blk.vacancy_pct ?? blk.vacancy_pct_low) === "number";
        const hasRent = rentOf(blk) !== null;
        const hasCap = typeof blk.cap_rate_low_pct === "number";
        expect("vacancy_read" in blk, `${where} vacancy_read`).toBe(hasVacancy);
        expect("rent_read" in blk, `${where} rent_read`).toBe(hasRent);
        expect("cap_read" in blk, `${where} cap_read`).toBe(hasCap);
        for (const key of ["vacancy_read", "rent_read", "cap_read"]) {
          const read = blk[key] as Record<string, unknown> | undefined;
          if (!read) continue;
          figures++;
          for (const k of Object.keys(read)) expect(known.has(k), `${where}.${key}.${k}`).toBe(true);
          for (const link of (read.links as string[] | undefined) ?? []) expect(sources, `${where}.${key}`).toContain(link);
          // Any figure may be for a narrower stock than its class (Northern
          // Virginia's small-bay vacancy); a slice is words, and the checks
          // name it rather than hold the model to it.
          if (read.slice !== undefined) expect(typeof read.slice, where).toBe("string");
        }
      }
    }
    expect(figures).toBeGreaterThan(95);
  });

  it("an asking rent is credited to its own house and period, never the block's first link", () => {
    const rentRead = (id: string, sector: string) => {
      const blk = (metrosSeed.metros.find((m) => m.id === id)!.sector_snapshot as unknown as Record<string, { rent_read?: unknown; sources?: string[] }>)[sector];
      return figureRead(blk.rent_read, blk.sources);
    };
    // Chicago's office rent is Cushman's CBD MarketBeat for Q2 2026; the
    // block's first link is Tenantbase's Q1 print, the vacancy's.
    const chicago = rentRead("chicago", "office");
    expect(chicago).toMatchObject({ house: "Cushman & Wakefield", area: "the CBD", period: "Q2 2026" });
    expect(chicago.links).toEqual(["https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/chicago-marketbeats/cbd-office"]);
    // A house the note names with no source in the block is named and left unlinked.
    expect(rentRead("atlanta", "industrial")).toMatchObject({ house: "Cushman & Wakefield", period: "Q2 2026", links: [] });
    // Miami retail's rent is Colliers' Q2 2026 figure; the only Colliers link is its Q1 report.
    expect(rentRead("miami", "retail")).toMatchObject({ house: "Colliers", area: "Miami-Dade", period: "Q2 2026", links: [] });
    // A rent whose house the note does not name names none and links nothing.
    expect(rentRead("dallas", "industrial")).toMatchObject({ house: null, period: "Q2 2026", links: [] });
    // A Class A figure says so.
    expect(figureNote(rentRead("philadelphia", "industrial"))).toBe("Colliers, Q2 2026; average asking; for Class A space");
  });
});

describe("the tracker inside the model's checks", () => {
  const office = { ...base, assetClass: "office", inputs: { ...base.inputs, vacancyPct: 0.1 }, tracker: trackerFor("dc", "office") };

  it("an office deal's vacancy is read against the tracker's band, with each figure's own house, area and period and the day it was read", () => {
    const c = check(office, "vacancy")!;
    expect(c.model).toBe("10.0%");
    expect(c.scope).toBe("metro");
    expect(c.published.map((p) => [p.label, p.value, p.asOf, p.publisher])).toEqual([
      ["Office vacancy (research tracker), the District, low read", 21.3, "Q2 2026", "research tracker: Colliers (21.3%) and CBRE (22.2%)"],
      ["Office vacancy (research tracker), the District, high read", 22.2, "Q2 2026", "research tracker: Colliers (21.3%) and CBRE (22.2%)"],
    ]);
    expect(c.published[0].text).toBe("21.3% (Q2 2026)");
    expect(c.tone).toBe("tighter");
    expect(c.toneLabel).toBe("tighter than the published figures");
    expect(c.read).toBe(
      "The model holds 10.0% vacancy. Office vacancy reads 21.3–22.2% on the research tracker: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026 (read Aug 25, 2026) — a research print, not a feed. The building would run 11.3 points tighter than the office stock the figure covers — a leased building against a market average, and the figure to hold the rent roll and the rollover to.",
    );
    // The read names the metro now that a metro row exists.
    expect(modelVsMarket(office)!.metro).toBe("Washington DC");
  });

  it("a figure for an area other than the market says its area, never 'the metro's'", () => {
    // Prince George's County: Colliers' Q1 2026 Suburban Maryland survey, both counties together.
    const pg = check(
      { ...base, assetClass: "office", metro: { id: "pg_county", name: "Prince George's County MD" }, inputs: { ...base.inputs, vacancyPct: 0.1 }, tracker: trackerFor("pg_county", "office") },
      "vacancy",
    )!;
    expect(pg.read).toBe(
      "The model holds 10.0% vacancy. Office vacancy reads 19.2% on the research tracker: Colliers, Suburban Maryland (Montgomery and Prince George's together, not a county split), Q1 2026 (read Aug 25, 2026) — a research print, not a feed. The building would run 9.2 points tighter than the office stock the figure covers — a leased building against a market average, and the figure to hold the rent roll and the rollover to.",
    );
    expect(pg.read).not.toContain("metro's");
    expect(pg.published[0]).toMatchObject({
      label: "Office vacancy (research tracker), Suburban Maryland (Montgomery and Prince George's together, not a county split)",
      text: "19.2% (Q1 2026)",
      asOf: "Q1 2026",
      publisher: "research tracker: Colliers",
    });
  });

  it("inside the band is inside; over its high end is looser and conservative; a point band reads as one figure", () => {
    const pg = { ...base, assetClass: "industrial", metro: { id: "pg_county", name: "Prince George's County MD" }, tracker: trackerFor("pg_county", "industrial") };
    const inside = check({ ...pg, inputs: { ...base.inputs, vacancyPct: 0.08 } }, "vacancy")!;
    expect(inside.tone).toBe("inside");
    expect(inside.read).toContain("The model sits inside the tracker's band.");
    const looser = check({ ...pg, inputs: { ...base.inputs, vacancyPct: 0.12 } }, "vacancy")!;
    expect(looser.tone).toBe("looser");
    expect(looser.read).toContain("The model runs 1.9 points looser than the industrial stock the figure covers — conservative against the tracker.");
    const point = check({ ...base, assetClass: "industrial", tracker: trackerFor("dc", "industrial"), inputs: { ...base.inputs, vacancyPct: 0.05 } }, "vacancy")!;
    expect(point.published).toHaveLength(1);
    expect(point.published[0].label).toBe("Industrial vacancy (research tracker), the Washington metro");
    expect(point.read).toContain("reads 7.4% on the research tracker: Newmark, the Washington metro, Q1 2026 (read Aug 25, 2026)");
  });

  it("a band the file says is for a narrower stock is shown and named, and the model is not held to it (the audit of 2026-10-01)", () => {
    // Northern Virginia's 3.9–5.0% is its small-bay space: a bulk warehouse
    // at 6% had read "1.0 point looser than the industrial stock the figure
    // covers".
    const nova = { ...base, assetClass: "industrial", metro: { id: "nova", name: "Northern Virginia" }, tracker: trackerFor("nova", "industrial") };
    const bulk = check({ ...nova, inputs: { ...base.inputs, vacancyPct: 0.06 } }, "vacancy")!;
    expect(bulk.tone).toBe("aside");
    expect(bulk.toneLabel).toBe("beside a narrower stock");
    // Northern Virginia's industrial band names no house and no period.
    expect(bulk.read).toContain("reads 3.9–5.0% on the research tracker: publisher not recorded, Northern Virginia, undated (read Aug 25, 2026)");
    // It is undated too, and says so beside the stock.
    expect(bulk.read).toContain(
      "That figure is for small-bay space, not the industrial market as a whole, and undated, so the model is not held to it; its vacancy sits 1.0 point over its high end.",
    );
    expect(bulk.read).not.toContain("looser than");
    expect(bulk.published.map((p) => [p.asOf, p.publisher])).toEqual([
      ["undated", "research tracker"],
      ["undated", "research tracker"],
    ]);
    expect(check({ ...nova, inputs: { ...base.inputs, vacancyPct: 0.045 } }, "vacancy")!.read).toContain("its vacancy sits inside it.");
  });

  // Research pass 26 (C6): a retail deal's vacancy was held to Newark's
  // 2024 figure and Richmond's undated one — figures the sector leaderboard
  // refuses to rank. One rule now: a tracker figure the leaderboard would
  // not rank for its own period (undated, or over a year old) is shown
  // beside the check and never held against the assumption.
  it("holds a retail deal to no tracker figure the leaderboard would not rank for its period", () => {
    const retail = (id: string, name: string, vacancyPct = 0.08) => ({
      ...base,
      assetClass: "retail",
      metro: { id, name },
      tracker: trackerFor(id, "retail"),
      inputs: { ...base.inputs, vacancyPct },
    });
    const today = FIXTURE_NOW.toISOString().slice(0, 10);
    const reasonOf = (id: string) => sectorLeaderboard("retail", today).rows.find((r) => r.markets.some((m) => m.id === id))!.reason;
    const old = check(retail("newark_jc", "Newark / Jersey City"), "vacancy")!;
    expect(reasonOf("newark_jc")).toBe("2024, over a year old");
    expect(old.tone).toBe("old");
    expect(old.toneLabel).toBe("beside a figure over a year old");
    expect(old.read).toContain("reads 3.4% on the research tracker: Marcus & Millichap");
    expect(old.read).toContain("That figure is from 2024, over a year old, so the model is not held to it; its vacancy sits 4.6 points over it.");
    expect(old.read).not.toContain("looser than");
    expect(old.published.map((p) => p.asOf)).toEqual(["2024"]);
    const undated = check(retail("richmond", "Richmond VA"), "vacancy")!;
    expect(reasonOf("richmond")).toBe("undated");
    expect(undated.tone).toBe("undated");
    expect(undated.toneLabel).toBe("beside an undated figure");
    expect(undated.read).toContain("That figure is undated, so the model is not held to it; its vacancy sits 3.6 points over it.");
    // A figure dated within the year is held as before: Chicago's Q2 2026.
    const dated = check(retail("chicago", "Chicago", 0.09), "vacancy")!;
    expect(reasonOf("chicago")).toBeNull();
    expect(dated.tone).toBe("looser");
    expect(dated.read).toContain("The model runs 1.2 points looser than the retail stock the figure covers — conservative against the tracker.");
  });

  it("without a tracker read a commercial deal has no vacancy row, as before", () => {
    expect(check({ ...base, assetClass: "office" }, "vacancy")).toBeNull();
    expect(check({ ...base, assetClass: "office", tracker: null }, "vacancy")).toBeNull();
  });

  it("an apartment deal keeps the survey as the anchor and carries the tracker's read beside it, never in its place", () => {
    const apt = { ...base, tracker: trackerFor("dc", "multifamily") };
    const c = check(apt, "vacancy")!;
    expect(c.tone).toBe("inside");
    expect(c.published.map((p) => p.label)).toEqual([
      "Rental vacancy, metro area",
      "Rental vacancy, South Census region",
      "Apartment vacancy (research tracker), the Washington DC region",
    ]);
    // The region's figure names no house, so no link and no house is credited.
    expect(c.published[2]).toMatchObject({ value: 5.2, asOf: "year-end 2025", publisher: "research tracker" });
    expect(c.read).toContain(
      "The model sits inside the survey's margin of the published figure. The research tracker's apartment vacancy reads 5.2%: publisher not recorded, the Washington DC region, year-end 2025 (read Aug 25, 2026) — research, shown beside the Census figure rather than in its place.",
    );
  });

  it("the tracker's cap range joins the exit-cap read: over its high end is the conservative direction, under its low end is compression on top of the spread", () => {
    // Hampton Roads' range is Newmark's Q1 2026, dated within the year.
    const apt = { ...base, metro: { id: "norfolk_hampton_roads", name: "Norfolk / Hampton Roads VA" }, tracker: trackerFor("norfolk_hampton_roads", "multifamily") };
    const c = check(apt, "exit_cap")!;
    expect(c.scope).toBe("metro");
    expect(c.published.map((p) => [p.label, p.value, p.asOf])).toEqual([
      ["10-year Treasury", 4.94, "2026-09-17"],
      ["Apartment cap (research tracker), low end", 5.25, "Q1 2026"],
      ["Apartment cap (research tracker), high end", 5.5, "Q1 2026"],
    ]);
    expect(c.read).toContain(
      "The research tracker's apartment cap range is 5.25–5.50% (Class A near the low end, Class B/C toward 5.5%): Newmark (its Richmond & Hampton Roads report), Q1 2026 (read Aug 25, 2026), and the exit cap sits 50 bps over its high end — the conservative direction for an exit.",
    );
    const tight = check({ ...apt, inputs: { ...base.inputs, exitCapPct: 0.045 } }, "exit_cap")!;
    expect(tight.read).toContain("the exit cap sits 75 bps under its low end — an exit priced tighter than the market's own range, which is cap compression on top of the spread read.");
    const within = check({ ...apt, inputs: { ...base.inputs, exitCapPct: 0.054 } }, "exit_cap")!;
    expect(within.read).toContain("and the exit cap sits inside it.");
    // A plan deal states its spread and still reads the range.
    const plan = check({ ...apt, plan: true }, "exit_cap")!;
    expect(plan.tone).toBe("stated");
    expect(plan.read).toContain("A plan deal has no going-in cap to set it against");
    expect(plan.read).toContain("apartment cap range is 5.25–5.50%");
    // Washington's range is undated: the leaderboard would not rank it, so
    // it is shown and the exit is not held to it — no compression named.
    const dc = { ...base, tracker: trackerFor("dc", "multifamily") };
    const undated = check(dc, "exit_cap")!;
    expect(undated.scope).toBe("metro");
    expect(undated.published.slice(1).map((p) => [p.value, p.asOf])).toEqual([
      [4.75, "undated"],
      [5.5, "undated"],
    ]);
    expect(undated.read).toContain(
      "The research tracker's apartment cap range is 4.75–5.50% (a band on a deal mix leaning Class B / value-add): publisher not recorded, the Washington DC region, undated (read Aug 25, 2026). That figure is undated, so the exit is not held to it; the exit cap sits 50 bps over its high end.",
    );
    const dcTight = check({ ...dc, inputs: { ...base.inputs, exitCapPct: 0.045 } }, "exit_cap")!;
    expect(dcTight.read).not.toContain("cap compression on top of the spread read");
    expect(dcTight.read).toContain("the exit cap sits 25 bps under its low end.");
    // No range on the tracker: the check reads as it did, national.
    const office = check({ ...base, assetClass: "office", tracker: trackerFor("dc", "office") }, "exit_cap")!;
    expect(office.scope).toBe("national");
    expect(office.read).not.toContain("research tracker");
  });

  it("a single cap figure is read as one figure, with what its file says it is", () => {
    const la = { ...base, metro: { id: "los_angeles", name: "Los Angeles" }, tracker: trackerFor("los_angeles", "multifamily") };
    const c = check(la, "exit_cap")!;
    expect(c.published.slice(1)).toEqual([
      { label: "Apartment cap (research tracker)", text: "5.80% (Q2 2026)", value: 5.8, asOf: "Q2 2026", publisher: "research tracker: Kidder Mathews" },
    ]);
    expect(c.read).toContain(
      "The research tracker's apartment cap is 5.80% (a CoStar-sourced transaction average, not a quoted band): Kidder Mathews, Q2 2026 (read Aug 25, 2026), and the exit cap sits 20 bps over it — the conservative direction for an exit.",
    );
    expect(check({ ...la, inputs: { ...base.inputs, exitCapPct: 0.058 } }, "exit_cap")!.read).toContain("and the exit cap sits at it.");
  });

  it("a cap figure for a narrower stock than the class is named and shown, and the exit is not held to it", () => {
    // Chicago: Essex Realty's April 2026 average for the small-building stock,
    // 8.30%. A 5.50% exit sits 280 bps under it — which, read against the
    // metro, would call a sound Class A exit cap compression.
    const chicago = {
      ...base,
      metro: { id: "chicago", name: "Chicago" },
      inputs: { ...base.inputs, exitCapPct: 0.055 },
      tracker: trackerFor("chicago", "multifamily"),
    };
    const c = check(chicago, "exit_cap")!;
    expect(c.published.slice(1)).toEqual([
      { label: "Apartment cap (research tracker), Chicago", text: "8.30% (April 2026)", value: 8.3, asOf: "April 2026", publisher: "research tracker: Essex Realty" },
    ]);
    expect(c.read).toContain(
      "The research tracker's apartment cap is 8.30% (a transaction average of 175 sales, not a quoted band): Essex Realty, Chicago, April 2026 (read Aug 25, 2026). That figure is for the small-building stock, mostly the Class B/C neighborhood buildings that drive Chicago volume, not the apartment market as a whole, so the exit is not held to it; the exit cap sits 280 bps under it.",
    );
    expect(c.read).not.toContain("jpmorgan");
    expect(c.read).not.toContain("cap compression on top of the spread read");
    // Miami's range is Class A stabilized core, CBRE's H2 2025 read.
    const miami = check({ ...base, metro: { id: "miami", name: "Miami" }, tracker: trackerFor("miami", "multifamily") }, "exit_cap")!;
    expect(miami.read).toContain(
      "The research tracker's apartment cap range is 4.75–5.00%: CBRE, H2 2025 (read Aug 25, 2026). That figure is for Class A stabilized core, not the apartment market as a whole, so the exit is not held to it; the exit cap sits 100 bps over its high end.",
    );
    expect(miami.read).not.toContain("the conservative direction for an exit");
  });
});

// ── The tracker ages by the research rule (lib/research-age) ──────────────
// The snapshot was read Aug 25, 2026: current through Feb 21, 2027, its
// 180th day, and stale from Feb 22. Past it, its figures are still shown,
// named stale with their age, and the model is held to none of them. The
// feeds here stay the fixture's, read on their own day; only the check's
// clock moves.
describe("a stale tracker read is named stale and held to nothing", () => {
  const LAST_CURRENT = new Date("2027-02-21T12:00:00Z");
  const FIRST_STALE = new Date("2027-02-22T12:00:00Z");
  const office = { ...base, assetClass: "office", inputs: { ...base.inputs, vacancyPct: 0.1 }, tracker: trackerFor("dc", "office") };

  it("an office's vacancy is held to the tracker through Feb 21, and beside it, not held, from Feb 22", () => {
    const before = check({ ...office, now: LAST_CURRENT }, "vacancy")!;
    expect(before.tone).toBe("tighter");
    expect(before.read).toContain("Q2 2026 (read Aug 25, 2026) — a research print, not a feed. The building would run 11.3 points tighter");
    const after = check({ ...office, now: FIRST_STALE }, "vacancy")!;
    expect(after.tone).toBe("stale");
    expect(after.toneLabel).toBe("beside stale research");
    expect(after.read).toBe(
      "The model holds 10.0% vacancy. Office vacancy reads 21.3–22.2% on the research tracker: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026 (read Aug 25, 2026; 181 days old, stale) — a research print, not a feed. That research is 181 days old, past the 180 days the site holds research current, so the model is not held to it; its vacancy sits 11.3 points under its low end.",
    );
    expect(after.read).not.toContain("tighter than");
    // The figures stay, each saying it is stale.
    expect(after.published.map((p) => [p.value, p.text])).toEqual([
      [21.3, "21.3% (Q2 2026; read Aug 25, 2026, 181 days old, stale)"],
      [22.2, "22.2% (Q2 2026; read Aug 25, 2026, 181 days old, stale)"],
    ]);
  });

  it("a narrower stock, no date and a stale read say every reason", () => {
    const nova = { ...base, assetClass: "industrial", metro: { id: "nova", name: "Northern Virginia" }, tracker: trackerFor("nova", "industrial") };
    const c = check({ ...nova, inputs: { ...base.inputs, vacancyPct: 0.06 }, now: FIRST_STALE }, "vacancy")!;
    expect(c.tone).toBe("stale");
    expect(c.read).toContain(
      "That figure is for small-bay space, not the industrial market as a whole, and undated, and the research is 181 days old, past the 180 days the site holds research current, so the model is not held to it; its vacancy sits 1.0 point over its high end.",
    );
  });

  it("an apartment deal's survey stays the anchor, and the tracker beside it is named stale", () => {
    const apt = { ...base, tracker: trackerFor("dc", "multifamily") };
    expect(check({ ...apt, now: LAST_CURRENT }, "vacancy")!.read).toContain("year-end 2025 (read Aug 25, 2026) — research, shown beside");
    const c = check({ ...apt, now: FIRST_STALE }, "vacancy")!;
    expect(c.tone).toBe("inside");
    expect(c.read).toContain(
      "The research tracker's apartment vacancy reads 5.2%: publisher not recorded, the Washington DC region, year-end 2025 (read Aug 25, 2026; 181 days old, stale) — research, shown beside the Census figure rather than in its place.",
    );
  });

  it("the exit is set against the 10-year alone once the tracker's cap range is stale, the range still shown", () => {
    // Hampton Roads' range is dated (Newmark's Q1 2026), so only the
    // research rule's limit sets it aside.
    const apt = { ...base, metro: { id: "norfolk_hampton_roads", name: "Norfolk / Hampton Roads VA" }, tracker: trackerFor("norfolk_hampton_roads", "multifamily") };
    const before = check({ ...apt, now: LAST_CURRENT }, "exit_cap")!;
    expect(before.read).toContain("and the exit cap sits 50 bps over its high end — the conservative direction for an exit.");
    const after = check({ ...apt, now: FIRST_STALE }, "exit_cap")!;
    expect(after.tone).toBe(before.tone);
    expect(after.read).toContain(
      "The research tracker's apartment cap range is 5.25–5.50% (Class A near the low end, Class B/C toward 5.5%): Newmark (its Richmond & Hampton Roads report), Q1 2026 (read Aug 25, 2026; 181 days old, stale). That research is 181 days old, past the 180 days the site holds research current, so the exit is not held to it; the exit cap sits 50 bps over its high end.",
    );
    expect(after.read).not.toContain("the conservative direction for an exit");
    expect(after.published.slice(1).map((p) => p.value)).toEqual([5.25, 5.5]);
    // A compression the tracker would have named is not named on stale research.
    const tight = check({ ...apt, inputs: { ...base.inputs, exitCapPct: 0.045 }, now: FIRST_STALE }, "exit_cap")!;
    expect(tight.read).not.toContain("cap compression on top of the spread read");
    expect(tight.read).toContain("the exit cap sits 75 bps under its low end.");
  });

  it("the card draws the stale chip and the sentence", () => {
    const html = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: modelVsMarket({ ...office, now: FIRST_STALE }) }));
    const text = visibleText(html);
    expect(text).toContain("beside stale research");
    expect(text).toContain("(read Aug 25, 2026; 181 days old, stale)");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── A deal outside the covered metros: the state's annual vacancy ───────────
describe("a deal outside the covered metros anchors its vacancy check on the state's annual figure, and says so", () => {
  const paRates = readMetroRates("state:PA", [{ series_id: "PARVAC", obs_date: "2025-01-01", value: 6.6 }], FIXTURE_NOW);
  const pa: ModelVsMarketInput = { ...base, metro: { id: "state:PA", name: "Pennsylvania" }, rates: paRates, zori: null };

  it("publishes the state's figure by its year, reads it as the state's rental stock, and reaches no tracker", () => {
    const c = check(pa, "vacancy")!;
    expect(c.published).toEqual([
      { label: "Rental vacancy, Pennsylvania (annual)", text: "6.6% (2025)", value: 6.6, asOf: "2025-01-01", publisher: "FRED" },
    ]);
    expect(c.read).toContain(
      "The state's rental vacancy is 6.6% (2025, the survey's annual figure for the whole of Pennsylvania; FRED) — the deal lies outside the metros the site tracks, so no metro figure is read",
    );
    expect(c.read).toContain("the state's rental stock as a whole");
    expect(c.read).not.toContain("metro's rental stock");
    expect(c.read).not.toContain("research tracker");
    // The metro's rents and the tracker are absent for a state, so the
    // rent-growth check is left out rather than read against nothing.
    expect(modelVsMarket(pa)!.checks.map((x) => x.key)).toEqual(["expense_growth", "vacancy", "exit_cap"]);
    expect(modelVsMarket(pa)!.metro).toBe("Pennsylvania");
  });
});

// ── A rent-regulated building: the regime's allowance beside the market's ─────
import { regulationForDeal } from "./rent-regulation";

describe("a rent-regulated building's allowance, shown beside the market's figures and never folded into them (lib/rent-regulation)", () => {
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "" });
  const deck = (...metrics: ReturnType<typeof row>[]): ExtractionResult => ({
    dealName: "The Walk-up",
    assetClass: "multifamily",
    metrics: [row("Asking price", "$14,000,000"), ...metrics],
  });
  const BROOKLYN = { state: "NY", city: "Brooklyn", county: "Kings County" };
  const OCT_5 = new Date("2026-10-05T12:00:00Z");
  const stabilized = regulationForDeal(
    { extraction: deck(row("Units", "48"), row("Year built", "1931"), row("Rent-regulated units", "41")), address: BROOKLYN, siteFlags: null, assetClass: "multifamily" },
    "2026-10-05",
  );

  it("a NYC stabilized deal at a 3% model growth never reads only 'inside the published range': the allowance is named first, as a figure of its own kind", () => {
    const plain = check({ ...base, now: OCT_5 }, "rent_growth")!;
    expect(plain.read).toContain("The model sits inside the published range.");
    const c = check({ ...base, now: OCT_5, regulation: stabilized }, "rent_growth")!;
    // The chip is the market's: the allowance never joins its range.
    expect(c.tone).toBe("inside");
    expect(c.toneLabel).toBe("inside the published range");
    // The sentence names the allowance first, as the regime's for the units
    // it regulates, with the model's growth against it.
    expect(c.read).toBe(
      "Under NYC rent stabilization, the allowance for leases commencing Oct 1, 2026 to Sep 30, 2027 is 0% on a one-year lease and 0% on a two-year lease (the Rent Guidelines Board's Apartment/Loft Order #58). That is the regime's allowance for the units it regulates, not a market figure: the model's 3.0%/yr runs 3.0 points over both. For the market-rate units, over the past year the metro's asking rents moved +2.3% (apartments alone +1.1%) over the year to Aug 2026 (Zillow) and sitting tenants' rents +5.0% over the year to Aug 2026 (CPI rent, BLS). The model sits inside the published range. A trailing year is what the assumption is being asked to beat, not a forecast.",
    );
    expect(c.read.startsWith("The model grows rents")).toBe(false);
    // The allowance's figures lead the published list; the market's follow,
    // as they were.
    expect(c.published.slice(0, 2)).toEqual([
      {
        label: "NYC rent stabilization: allowance on the regulated units, a one-year lease",
        text: "0% for leases commencing Oct 1, 2026 to Sep 30, 2027",
        value: 0,
        asOf: "2026-10-01",
        publisher: "The Rent Guidelines Board's Apartment/Loft Order #58",
      },
      {
        label: "NYC rent stabilization: allowance on the regulated units, a two-year lease",
        text: "0% for leases commencing Oct 1, 2026 to Sep 30, 2027",
        value: 0,
        asOf: "2026-10-01",
        publisher: "The Rent Guidelines Board's Apartment/Loft Order #58",
      },
    ]);
    expect(c.published.slice(2)).toEqual(plain.published);
    expect(gluedWords(c.read)).toEqual([]);
  });

  it("keeps the tone the market's: a model behind every market figure stays behind beside a 0% allowance", () => {
    // 0.5% against the market's 1.1–5.0% is behind; with the 0% allowance
    // folded into the range it would have read inside.
    const behind = check({ ...base, now: OCT_5, inputs: { ...base.inputs, rentGrowthPct: 0.005 }, regulation: stabilized }, "rent_growth")!;
    expect(behind.tone).toBe("behind");
    expect(behind.read).toContain("the model's 0.5%/yr runs 0.5 points over both.");
    expect(behind.read).toContain("For the market-rate units, over the past year");
    expect(behind.read).toContain("The model runs behind every published figure, by 0.6 to 4.5 points.");
  });

  it("names a DC rent-controlled building's two caps, a regime that only possibly applies as such, and nothing for an allowance not in force", () => {
    const dc = regulationForDeal(
      { extraction: deck(row("Units", "24"), row("Year built", "1962")), address: { state: "DC", city: "Washington" }, siteFlags: null, assetClass: "multifamily" },
      "2026-09-21",
    );
    const c = check({ ...base, regulation: dc }, "rent_growth")!;
    expect(c.read).toMatch(
      /^Under DC rent stabilization, the allowance for increases taking effect May 1, 2026 to Apr 30, 2027 is 4\.1% on a rent-controlled unit and 2\.1% on a unit with a registered elderly or disabled tenant \(the Rental Housing Commission's caps for Rent Control Year 2026\)\. That is the regime's allowance for the units it regulates, not a market figure: the model's 3\.0%\/yr runs over 2\.1% and under 4\.1%\. For the market-rate units,/,
    );
    // A building whose year the memorandum does not state: the regime only
    // possibly applies, and the sentence says so.
    const possibly = regulationForDeal(
      { extraction: deck(row("Units", "48")), address: BROOKLYN, siteFlags: null, assetClass: "multifamily" },
      "2026-10-05",
    );
    expect(check({ ...base, now: OCT_5, regulation: possibly }, "rent_growth")!.read).toContain(
      "That is the regime's allowance for the units it regulates, where it applies (the site's rules say it possibly does here), not a market figure",
    );
    // Before the filed period begins and after it ends, no allowance is in
    // force: the check reads as it would without the regulation.
    const before = regulationForDeal(
      { extraction: deck(row("Units", "48"), row("Year built", "1931")), address: BROOKLYN, siteFlags: null, assetClass: "multifamily" },
      "2026-09-21",
    );
    expect(check({ ...base, regulation: before }, "rent_growth")).toEqual(check(base, "rent_growth"));
    const after = regulationForDeal(
      { extraction: deck(row("Units", "48"), row("Year built", "1931")), address: BROOKLYN, siteFlags: null, assetClass: "multifamily" },
      "2027-11-15",
    );
    expect(check({ ...base, regulation: after }, "rent_growth")).toEqual(check(base, "rent_growth"));
  });

  it("draws the allowance first on the card, clean", () => {
    const html = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: modelVsMarket({ ...base, now: OCT_5, regulation: stabilized }) }));
    const text = visibleText(html);
    expect(text).toContain("Under NYC rent stabilization, the allowance for leases commencing Oct 1, 2026 to Sep 30, 2027 is 0% on a one-year lease");
    expect(text).toContain("inside the published range");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("is handed through the one read every surface calls", () => {
    const extraction = deck(row("Units", "48"), row("Year built", "1931"), row("Rent-regulated units", "41"), row("NOI (in-place)", "$700,000"));
    const derived = deriveUnderwriteInputs(extraction, "fallback");
    const read = modelVsMarketFor({
      derived,
      extraction,
      storedAssetClass: "multifamily",
      metro: { id: "dc", name: "Washington DC" },
      reads: { rates, zori, national, now: OCT_5 },
      regulation: stabilized,
    })!;
    expect(read.checks.find((x) => x.key === "rent_growth")!.read.startsWith("Under NYC rent stabilization")).toBe(true);
    const without = modelVsMarketFor({ derived, extraction, storedAssetClass: "multifamily", metro: { id: "dc", name: "Washington DC" }, reads: { rates, zori, national, now: OCT_5 } })!;
    expect(without.checks.find((x) => x.key === "rent_growth")!.read.startsWith("The model grows rents")).toBe(true);
  });
});
