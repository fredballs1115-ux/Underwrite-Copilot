import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { SAMPLE_DEAL } from "./sample-deal";
import { samplePlacement, sampleStressTest } from "./sample-stress";
import { sampleDemoData, walkthroughData } from "@/app/demo/demo-data";
import { NO_DEBT_SEEDS } from "./debt-index";
import { readActuals } from "./actuals/actuals-read";
import { t12SummaryOf } from "./actuals/analyze";
import type { RentRollSummary } from "./actuals/types";
import { inferStrategy } from "./deal-strategy";
import { shownAssetClass } from "./asset-class";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { modelMarketFor } from "./model-market";
import { regulationForDeal } from "./rent-regulation";
import { countyOf, placeDeal } from "./market-county";
import { modelVsMarketFor } from "./model-vs-market";
import { buildStressTest } from "./stress-test";
import type { StressTest } from "./stress-test-types";
import type { TodayReads } from "./model-vs-market-read";

// The sample's stress test is drawn on three surfaces: the signed-in sample
// deal's page (app/(app)/deals/[id]/page.tsx), /demo's Overview
// (app/demo/demo-data) and the homepage's walkthrough (app/page.tsx). The
// two public ones build it through lib/sample-stress; the page builds it
// from its own reads of the sample's row. They had built it three ways —
// the homepage with no published figure at all, so its exit cap, vacancy,
// rent and expense growth and insurance rows read differently from /demo's
// and the page's — and this file holds the three to one StressTest.

vi.mock("@/lib/model-vs-market-read", () => ({
  todayReads: async () => {
    throw new Error("no database in a test");
  },
}));

// Today's figures for the sample's market (Philadelphia), in the shapes the
// deal page's read returns: the national table as the runner printed it,
// and the metro's own unemployment, survey vacancy with its margin, the
// Northeast's vacancy and the CPI rent index as a level.
const ROWS: RateRow[] = [
  { series_id: "PHIL942URN", obs_date: "2026-07-01", value: 4.1 },
  { series_id: "RRVRNEQ156N", obs_date: "2026-04-01", value: 4.6 },
  { series_id: "HVS_RVR_37980", obs_date: "2026-04-01", value: 5.8 },
  { series_id: "HVS_RVR_37980_MOE", obs_date: "2026-04-01", value: 1.9 },
];
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
  ROWS.push({ series_id: "CUURA102SEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
}
const READS: TodayReads = {
  rates: readMetroRates("philadelphia", ROWS, FIXTURE_NOW),
  zori: null,
  realtor: null,
  national: readRates(REAL_ROWS, FIXTURE_NOW),
  now: FIXTURE_NOW,
};
const TODAY = "2026-09-21";

/**
 * The signed-in sample deal's page, its expressions on the sample's row, in
 * its order: the row the "Try a sample deal" action seeds (no first signal),
 * the rent roll and T-12 rows it seeds read through `t12SummaryOf` and
 * `readActuals`, the place `placeDeal(address, countyOf(address, flags))`,
 * the rent rules, the derivation with `modelMarketFor(true, …)` (never
 * seeded), the model's read against today's figures, and `buildStressTest`
 * with no recorded sales or past screens on the sample.
 */
function signedInSample(reads: TodayReads | null): StressTest {
  const extraction = SAMPLE_DEAL.extraction;
  const strategy = inferStrategy(extraction, null);
  const readClass = shownAssetClass(SAMPLE_DEAL.asset_class, extraction) || null;
  const t12Summary = t12SummaryOf(SAMPLE_DEAL.t12.summary);
  const actuals = readActuals({
    metrics: extraction.metrics,
    strategy,
    rentRoll: { asOf: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary as RentRollSummary },
    t12: t12Summary ? { periodEnd: SAMPLE_DEAL.t12.period_end_date, summary: t12Summary } : null,
    assetClass: readClass,
  })!;
  const address = SAMPLE_DEAL.address;
  const placement = placeDeal(address, countyOf(address, null));
  const regulation = regulationForDeal({ extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class }, TODAY);
  const derived = deriveUnderwriteInputs(
    extraction,
    SAMPLE_DEAL.name,
    {
      rentRoll: actuals.rentRoll ? { summary: actuals.rentRoll.summary, asOf: actuals.rentRoll.asOf } : null,
      t12: actuals.t12 ? { summary: actuals.t12.summary, periodEnd: actuals.t12.periodEnd } : null,
    },
    modelMarketFor(true, NO_DEBT_SEEDS),
    { regulation, asOf: new Date(`${TODAY}T12:00:00Z`) },
  );
  const modelRead = reads
    ? modelVsMarketFor({
        derived,
        extraction,
        firstSignal: null,
        storedAssetClass: SAMPLE_DEAL.asset_class,
        metro: placement.live,
        reads,
        regulation,
      })
    : null;
  return buildStressTest({
    extraction,
    firstSignal: null,
    challenger: SAMPLE_DEAL.challenges,
    market: SAMPLE_DEAL.market,
    modelVsMarket: modelRead,
    actuals,
    derived,
    storedAssetClass: SAMPLE_DEAL.asset_class,
    brokerComps: SAMPLE_DEAL.comps,
    recordedSales: null,
    pastScreens: null,
    readOn: TODAY,
  });
}

/** The homepage's walkthrough, as app/page.tsx builds it: /demo's build,
 *  picked for the walkthrough. */
const homepage = (reads: TodayReads | null) =>
  walkthroughData(sampleDemoData({ today: TODAY, reads, debt: NO_DEBT_SEEDS }).data).stressTest;
/** /demo's Overview, as app/demo/demo-data builds it. */
const demo = (reads: TodayReads | null) => sampleDemoData({ today: TODAY, reads, debt: NO_DEBT_SEEDS }).data.stressTest;

const src = (p: string) => readFileSync(p, "utf8");

describe("the sample's stress test, one build on every surface", () => {
  it("is the same StressTest on the homepage, /demo and the signed-in sample's page, with today's figures read", () => {
    const page = signedInSample(READS);
    expect(sampleStressTest({ today: TODAY, reads: READS })).toEqual(page);
    expect(homepage(READS)).toEqual(page);
    expect(demo(READS)).toEqual(page);
    // The published figures are its evidence: the rent growth row is set
    // against the metro's sitting-tenant rents, the vacancy row against the
    // survey's metro figure, the exit against the 10-year.
    const row = (k: string) => page.rows.find((r) => r.key === k)!;
    expect(row("rent_growth").verdict).not.toBe("unchecked");
    expect(row("vacancy").evidence.map((e) => e.label)).toContain("Rental vacancy, metro area");
    expect(row("exit_cap").evidence.map((e) => e.label)).toContain("10-year Treasury");
    expect(page.rows.some((r) => r.key === "expense_growth")).toBe(true);
  });

  it("is the same StressTest on all three where the read failed, its published rows unchecked", () => {
    const page = signedInSample(null);
    expect(homepage(null)).toEqual(page);
    expect(demo(null)).toEqual(page);
    const rent = page.rows.find((r) => r.key === "rent_growth")!;
    expect(rent.verdict).toBe("unchecked");
    expect(page.rows.flatMap((r) => r.evidence).some((e) => e.kind === "published" && e.publisher === "FRED")).toBe(false);
  });

  it("places the sample where the deal page places it", () => {
    expect(samplePlacement()).toEqual(placeDeal(SAMPLE_DEAL.address, countyOf(SAMPLE_DEAL.address, null)));
    expect(samplePlacement().live).toMatchObject({ id: "philadelphia" });
  });

  it("reads today's figures for the public pages without failing them", async () => {
    const { sampleTodayReads } = await import("./sample-stress-read");
    await expect(sampleTodayReads()).resolves.toBeNull();
  });

  it("builds it through lib/sample-stress on both public pages, and the page hands the sample no reader's evidence", () => {
    // The homepage draws /demo's own build (app/demo/demo-data), picked for
    // the walkthrough (`walkthroughData`), on the reads it makes itself.
    const home = src("app/page.tsx");
    expect(home).toContain("const reads = await sampleTodayReads();");
    expect(home).toMatch(/sampleDemoData\(\{ today: fmrToday\(\), reads, debt: NO_DEBT_SEEDS \}\)/);
    expect(home).toContain("<DemoTabs {...walkthroughData(data)} />");
    expect(home).not.toMatch(/buildStressTest|sampleStressTest\(/);
    expect(src("app/demo/page.tsx")).toContain("await sampleTodayReads()");
    const demoData = src("app/demo/demo-data.ts");
    expect(demoData).toContain("stressTest: sampleStressTest({ today, reads })");
    expect(demoData).not.toContain("buildStressTest");
    expect(demoData).not.toMatch(/modelVsMarketFor\(|sampleDerivedInputs\(/);
    const page = src("app/(app)/deals/[id]/page.tsx");
    // The one builder hands the sample neither (lib/stress-basis-evidence).
    expect(page).toMatch(/stressBasisEvidence\(\{[^}]*isSample: isSampleDeal,/);
    // The sample is never seeded from today's rates (lib/model-market).
    expect(page).toContain("modelMarketFor((deal as { is_sample?: boolean }).is_sample, debt)");
  });
});

/** The components a section's JSX draws, in order. */
function overviewOrder(file: string, start: string, end: string): string[] {
  const s = src(file);
  const from = s.indexOf(start);
  const to = s.indexOf(end, from);
  expect(from, file).toBeGreaterThan(0);
  expect(to, file).toBeGreaterThan(from);
  return [...s.slice(from, to).matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]);
}

// What the deal page's Overview draws that /demo leaves off, each because a
// visitor has no account or the sample never has it: a re-screen's diff (the
// sample is never re-screened), the reader's own model's discrepancies and
// past screens, the actuals prompt (hidden on the sample), the tasks, Ask,
// the outcome, the decision log, and the track record (the sample's verdict
// carries no screen time, so nothing is scored on it).
const ACCOUNT_ONLY = new Set([
  "SinceLastScreen",
  "ReconciliationPanel",
  "MarketMemoryStrip",
  "ActualsPrompt",
  "DealTasks",
  "AskPanel",
  "DealOutcomeCard",
  "DecisionLog",
  "TrackRecordCard",
]);

describe("/demo's Overview, in the deal page's order", () => {
  it("draws the deal page's Overview components in its order, leaving off only what needs an account", () => {
    // The sections' own JSX, `{section === "overview" && (`: the deal page
    // also tests the section in its code (the stress chip's jump).
    const deal = overviewOrder("app/(app)/deals/[id]/deal-view.tsx", '{section === "overview" && (', '{section === "financials" && (');
    const demoOrder = overviewOrder("app/demo/sections.tsx", '{section === "overview" && (', '{section === "financials" && (');
    expect(deal).toContain("OverviewView");
    expect(demoOrder).toEqual(deal.filter((c) => !ACCOUNT_ONLY.has(c)));
  });

  it("draws the homepage walkthrough's Overview with the deal page's own OverviewView, the stress test inside it after the call", () => {
    // Its parts and their order against /demo's are lib/sample-tabs.test.ts's.
    const home = src("app/landing-interactive.tsx");
    const overview = home.slice(home.indexOf('case "Overview":'), home.indexOf('case "Financials":'));
    expect([...overview.matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1])).toEqual(["OverviewTab"]);
    expect(overview).toContain("stressTest={stressTest}");
    const tab = home.slice(home.indexOf("function OverviewTab("), home.indexOf("/** One tab's panel"));
    expect(tab).toMatch(/<OverviewView [^>]*stressTest=\{stressTest\}/);
    const base = src("app/(app)/deals/[id]/deal-sections-base.tsx");
    const view = base.slice(base.indexOf("export function OverviewView"));
    expect(view.indexOf("<VerdictHero")).toBeGreaterThan(0);
    expect(view.indexOf("<StressTestPanel")).toBeGreaterThan(view.indexOf("<VerdictHero"));
    expect(view.indexOf("Risk digest")).toBeGreaterThan(view.indexOf("<StressTestPanel"));
    // The deal page's slot under the panel (the rent roll and T-12 prompt,
    // 2026-10-20) is drawn after the panel and its method link and before
    // the meter and the risk digest; /demo and the homepage fill it with
    // nothing, so the three Overviews stay one order.
    expect(view.indexOf("{afterStress}")).toBeGreaterThan(view.indexOf("how-we-test-link"));
    expect(view.indexOf("{afterStress}")).toBeLessThan(view.indexOf("Risk digest"));
    expect(overview).not.toContain("afterStress");
    expect(src("app/demo/sections.tsx")).not.toContain("afterStress");
    const deal = src("app/(app)/deals/[id]/deal-view.tsx");
    const slot = deal.slice(deal.indexOf("afterStress={"), deal.indexOf("<SensitivityPlayground"));
    expect(slot).toContain("<ActualsPrompt");
  });
});
