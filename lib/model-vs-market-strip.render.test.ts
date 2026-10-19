// "Assumptions against the published figures" as pictures: each row a strip
// — the published figures as ticks on one percent scale, a survey's margin
// as a whisker, the model's assumption as a marker — with the figures that
// are shown apart (an allowance, the insurance index, the breakeven, the
// tracker's apartment read) on a track of their own, never in the range.
// The exit cap's row keeps its words. Display only: the report and the
// workbook read the same checks, and their words and figures are unchanged.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { modelVsMarket, wordsOnly, type ModelVsMarketInput } from "./model-vs-market";
import { ModelVsMarketCard } from "@/app/(app)/deals/[id]/model-vs-market-card";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const national = readRates(REAL_ROWS, FIXTURE_NOW);
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

const base: ModelVsMarketInput = {
  inputs: { rentGrowthPct: 0.03, expenseGrowthPct: 0.03, vacancyPct: 0.05, exitCapPct: 0.06 },
  sources: {
    rentGrowthPct: { provenance: "assumption", note: "Default 3.0%/yr — set your view" },
    expenseGrowthPct: { provenance: "assumption", note: "Default 3.0%/yr — set your view" },
    vacancyPct: { provenance: "extracted", note: "OM in-place occupancy 95%" },
    exitCapPct: { provenance: "derived", note: "Going-in cap as stated" },
  },
  assetClass: "multifamily",
  plan: false,
  goingInCapPct: 5.45,
  metro: { id: "dc", name: "Washington DC" },
  rates: readMetroRates("dc", METRO_ROWS, FIXTURE_NOW),
  zori: {
    rent: 2412,
    yoyPct: 2.3,
    asOf: "2026-08-31",
    note: "Zillow Observed Rent Index (ZORI), all homes.",
    shared: false,
    mfrRent: 2150,
    mfrYoyPct: 1.1,
    homeValue: null,
    homeValueYoyPct: null,
    priceToRentYears: null,
  },
  national,
  now: FIXTURE_NOW,
};

const read = modelVsMarket(base)!;
const byKey = (key: string) => read.checks.find((c) => c.key === key)!;
const count = (html: string, bar: string) => html.split(`data-bar="${bar}"`).length - 1;
const rowHtml = (html: string, key: string) => html.split(`data-qa="model-check-${key}"`)[1]?.split("</li>")[0] ?? "";

describe("the checks' picture fields — display only", () => {
  it("carry the model's figure and one mark a published figure, in order", () => {
    for (const key of ["rent_growth", "expense_growth", "vacancy"]) {
      const c = byKey(key);
      expect(c.modelValue, key).toBeTypeOf("number");
      expect(c.marks, key).toHaveLength(c.published.length);
    }
    expect(byKey("rent_growth").modelValue).toBeCloseTo(3, 9);
    expect(byKey("vacancy").modelValue).toBeCloseTo(5, 9);
  });

  it("draws the price indexes as the range and the insurance index and the breakeven apart, all the nation's", () => {
    const c = byKey("expense_growth");
    expect(c.marks!.map((m) => [m.role, m.nation])).toEqual([
      ["range", true],
      ["range", true],
      ["apart", true],
      ["apart", true],
    ]);
  });

  it("anchors the vacancy on the survey's metro figure with its margin, the region's beside it", () => {
    expect(byKey("vacancy").marks).toEqual([
      { role: "range", nation: false, moe: 2.2 },
      { role: "beside", nation: false, moe: null },
    ]);
  });

  it("gives the exit cap's row no picture: a spread against a spread stays in words", () => {
    const x = byKey("exit_cap");
    expect(x.modelValue).toBeUndefined();
    expect(x.marks).toBeUndefined();
  });

  it("a commercial deal's rent index is the nation's", () => {
    const office = modelVsMarket({ ...base, assetClass: "office" })!.checks.find((c) => c.key === "rent_growth")!;
    expect(office.marks).toEqual([{ role: "range", nation: true, moe: null }]);
  });

  it("leaves the words and figures the report and the workbook read as they were", () => {
    const words = wordsOnly(read)!;
    expect(words.checks.every((c) => c.modelValue === undefined && c.marks === undefined)).toBe(true);
    for (const [i, c] of read.checks.entries()) {
      const w = words.checks[i];
      expect([w.key, w.model, w.modelSource, w.tone, w.scope, w.read]).toEqual([c.key, c.model, c.modelSource, c.tone, c.scope, c.read]);
      expect(w.published).toEqual(c.published);
    }
    expect(wordsOnly(null)).toBeNull();
  });
});

describe("ModelVsMarketCard — the strips", () => {
  const html = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read }));
  const text = visibleText(html);

  it("draws the model as a marker and the published figures as ticks, the survey's margin a whisker", () => {
    expect(count(html, "mvm-model")).toBe(3);
    const rent = rowHtml(html, "rent_growth");
    // Zillow's two and the CPI rent: three figures, the range filled.
    expect(count(rent, "mvm-figure")).toBe(3);
    expect(count(rent, "mvm-range")).toBe(1);
    const vac = rowHtml(html, "vacancy");
    expect(count(vac, "mvm-moe")).toBe(1);
    expect(count(vac, "mvm-figure")).toBe(1);
    expect(count(vac, "mvm-beside")).toBe(1);
  });

  it("draws the insurance index and the breakeven on a track apart, never in the range", () => {
    const exp = rowHtml(html, "expense_growth");
    expect(count(exp, "mvm-figure")).toBe(2);
    expect(count(exp, "mvm-apart")).toBe(2);
    expect(exp).toContain('data-qa="model-strip-apart"');
    expect(text).toContain("Commercial property insurance premiums (PPI, commercial multiple peril): +4.8% over the year to Aug 2026, the nation's (BLS via FRED) — shown apart, not in the range");
    expect(text).toContain("Expected inflation, next ten years (10-year breakeven): 2.33% a year (Sep 18, 2026), the nation's (FRED) — shown apart, not in the range");
    expect(text).toContain("Consumer prices (CPI, all items): +3.4% over the year to Aug 2026, the nation's (BLS via FRED)");
  });

  it("keeps the exit cap in words, and every row's sentence whole in the HTML", () => {
    const exit = rowHtml(html, "exit_cap");
    expect(exit).not.toContain("data-bar=");
    expect(text).toContain("106 bps over the latest 10-year");
    for (const c of read.checks) expect(text).toContain(c.read.slice(0, 60));
    expect(text).toContain("The model: 3.0%/yr");
    expect(text).toContain("Rental vacancy, metro area: 6.2% ±2.2 pts (Q2 2026) (Census Bureau)");
  });

  it("draws nothing where the model's reads are withheld — the words alone", () => {
    const bare = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: wordsOnly(read) }));
    expect(bare).not.toContain("data-bar=");
    expect(bare).not.toContain("Read it in words");
    expect(visibleText(bare)).toContain(byKey("rent_growth").read);
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the data-bar markers are this picture's own", () => {
  it("no other source names them", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("git", ["grep", "--untracked", "-l", "-E", '"mvm-', "--", "app", "lib"], { encoding: "utf8" });
    expect(out.split("\n").filter(Boolean).sort()).toEqual([
      "app/(app)/deals/[id]/model-vs-market-card.tsx",
      "lib/model-vs-market-strip.render.test.ts",
    ]);
  });
});
