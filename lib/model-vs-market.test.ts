import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { modelVsMarket, type ModelVsMarketInput } from "./model-vs-market";
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

  it("expense growth against consumer prices and core, BLS via FRED", () => {
    const c = check(base, "expense_growth")!;
    expect(c.published.map((p) => p.label)).toEqual(["Consumer prices (CPI, all items)", "Core CPI"]);
    expect(c.tone).toBe("inside");
    expect(c.read).toBe(
      "The model grows expenses 3.0%/yr against consumer prices +3.4% over the year to Aug 2026 (core +2.4%); BLS via FRED. The model sits inside the published range. Insurance and taxes reprice on their own cycles, so the index is the floor for the other lines, not the whole answer.",
    );
    const ahead = check({ ...base, inputs: { ...base.inputs, expenseGrowthPct: 0.05 } }, "expense_growth")!;
    expect(ahead.read).toContain("The model runs ahead of the index, by 1.6 to 2.6 points.");
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
    expect(tight.toneLabel).toBe("tighter than the metro");
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

  it("exit cap: the spread over today's 10-year beside the going-in cap's — a widening is named as the conservative direction", () => {
    const c = check(base, "exit_cap")!;
    expect(c.model).toBe("6.00%");
    expect(c.modelSource).toBe("derived from the documents");
    expect(c.published[0]).toMatchObject({ label: "10-year Treasury", value: 4.94, asOf: "2026-09-17", publisher: "FRED" });
    expect(c.tone).toBe("widens");
    expect(c.read).toBe(
      "The exit cap 6.00% is 106 bps over today's 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year where it is today — the conservative direction.",
    );
  });

  it("an exit cap under the going-in cap is named as compression, and compression is not a plan", () => {
    const c = check({ ...base, inputs: { ...base.inputs, exitCapPct: 0.05 } }, "exit_cap")!;
    expect(c.tone).toBe("compresses");
    expect(c.toneLabel).toBe("assumes cap compression");
    expect(c.read).toContain("The exit cap 5.00% is 6 bps over today's 10-year");
    expect(c.read).toContain("so the exit assumes the spread narrows 45 bps with the 10-year where it is today. Cap compression is not a plan");
    const level = check({ ...base, inputs: { ...base.inputs, exitCapPct: 0.0545 } }, "exit_cap")!;
    expect(level.tone).toBe("level");
    expect(level.read).toContain("so the exit holds the spread with the 10-year where it is today.");
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
    expect(text).toContain("set against what the Washington DC market and the national series have actually done, read on Sep 21, 2026.");
    expect(text).toContain("not a forecast");
    expect(text).toContain("Rent growth");
    expect(text).toContain("3.0%/yr");
    expect(text).toContain("a screening default");
    expect(text).toContain("inside the published range");
    expect(text).toContain("Stabilized vacancy");
    expect(text).toContain("from the documents");
    expect(text).toContain("Exit cap");
    expect(text).toContain("spread widens at the exit");
    expect(text).toContain("106 bps over today");
  });

  it("says the national scope where no metro figure was read, names the rows it has, and renders nothing with nothing to say", () => {
    const national = visibleText(renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: modelVsMarket({ ...base, assetClass: "office" }) })));
    expect(national).toContain("The model's rent growth, expense growth and exit cap, set against the national series, read on Sep 21, 2026.");
    expect(national).toContain("Rent growth");
    expect(national).toContain("the nation's lessors, not the metro's");
    expect(national).not.toContain("Stabilized vacancy");
    expect(text).toContain("The model's rent growth, expense growth, stabilized vacancy and exit cap, set against what the Washington DC market and the national series have actually done, read on Sep 21, 2026.");
    expect(renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: null }))).toBe("");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "model vs market card").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── One read for every surface ──────────────────────────────────────────────
import { modelVsMarketFor } from "./model-vs-market";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import type { ExtractionResult } from "@/lib/anthropic/types";

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

  it("reads the class the deck turned out to be, the extraction's going-in cap and today's figures", () => {
    const r = modelVsMarketFor({ derived, extraction, storedAssetClass: "auto", metro: { id: "dc", name: "Washington DC" }, reads })!;
    expect(r.checks.map((c) => c.key)).toEqual(["rent_growth", "expense_growth", "exit_cap"]);
    // A warehouse's rents are the nation's lessors', so no metro row and no metro name.
    expect(r.metro).toBeNull();
    expect(r.checks[0].read).toContain("lessors of manufacturing and industrial buildings");
    // The exit cap is derived from the going-in cap, so the spread is held.
    expect(r.checks[2].tone).toBe("level");
    expect(r.checks[2].read).toContain("The going-in cap 6.00% is 106 bps over it, so the exit holds the spread");
  });

  it("takes the page's own cap where it passes one, and none where it passes null", () => {
    const own = modelVsMarketFor({ derived, extraction, storedAssetClass: "industrial", metro: null, reads, goingInCapText: "5.5%" })!;
    expect(own.checks[2].read).toContain("The going-in cap 5.50% is 56 bps over it, so the exit assumes the spread widens 50 bps");
    const none = modelVsMarketFor({ derived, extraction, storedAssetClass: "industrial", metro: null, reads, goingInCapText: null })!;
    expect(none.checks[2].tone).toBe("stated");
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
  });
});
