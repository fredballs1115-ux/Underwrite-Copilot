// Render smoke tests for the signed-in views a crawl never reaches: the
// pipeline (the first screen every account opens), the model tab and the
// compare table. Each is rendered statically on a fixture that carries
// every shape the real data takes — a stabilized asset, a conversion with a
// yield on cost, a development priced at its land, an office deal, a deal
// still screening, a failed job, a dead deal, a teammate's deal — and the
// visible text is read for a runtime error, a sentence glued to a number, a
// word doubled; the markup for an image with no alt, a button or link with
// no accessible name, a form control with no label, an id used twice. Same
// components, same props the server pages hand them.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));

// The server actions the views bind to forms — never called in a render.
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return {
    createDeal: noop,
    createDealFromBatch: noop,
    createManualDeal: noop,
    updateManualFacts: noop,
    createSampleDeal: noop,
    setStage: noop,
    setOffersDue: noop,
    renameDeal: noop,
    deleteDeal: noop,
    rerunAnalysis: noop,
    replaceOm: noop,
    reconcileWithModel: noop,
    addDealNote: noop,
    deleteDealNote: noop,
  };
});

import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ModelView } from "@/app/(app)/deals/[id]/model-view";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { ToastProvider } from "@/app/(app)/toaster";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { leverageRead } from "@/lib/leverage";
import { a11yIssues, dumpView, gluedWords, visibleText } from "./render-lint";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(ToastProvider, null, node));
}

const card = (over: Partial<DealCard> & Pick<DealCard, "id" | "name">): DealCard => ({
  assetClass: "multifamily",
  createdAt: "2026-09-01T12:00:00Z",
  verdict: null,
  stage: "screening",
  addedBy: null,
  fit: null,
  score: null,
  mandateVerdict: null,
  market: "North Dallas, TX",
  coveredMarket: "Dallas–Fort Worth",
  offersDue: null,
  slots: { cap: null, price: null, yoc: null },
  jobStatus: null,
  hasAddress: true,
  ...over,
});

const CARDS: DealCard[] = [
  card({ id: "a", name: "The Maddox at Brewerytown", verdict: "caution", stage: "underwriting", fit: "near", score: 71, mandateVerdict: "WATCH", slots: { cap: "5.6%", price: "$68,000,000", yoc: null }, offersDue: "2026-09-30" }),
  card({ id: "b", name: "1400 Market — office to residential", verdict: "pass", stage: "loi", fit: "fits", score: 88, mandateVerdict: "PURSUE", slots: { cap: null, price: "$20,000,000", yoc: "11.7%" }, market: "Center City, Philadelphia, PA", coveredMarket: "Philadelphia" }),
  card({ id: "c", name: "Riverbend Site — 240 units", verdict: "pass", stage: "screening", fit: "outside", score: 42, mandateVerdict: "PASS", slots: { cap: null, price: "$4,000,000", yoc: "7.2%" }, market: "Frisco, TX", coveredMarket: null }),
  card({ id: "d", name: "Tysons Corner Plaza", assetClass: "office", verdict: "pass_on", stage: "dead", fit: "outside", score: 18, mandateVerdict: "PASS", slots: { cap: "8.1%", price: "$60,000,000", yoc: null }, market: "Tysons, VA", coveredMarket: "Northern Virginia" }),
  card({ id: "e", name: "Logan Square Retail", assetClass: "retail", verdict: null, stage: "screening", jobStatus: "running", slots: { cap: null, price: "$12,500,000", yoc: null }, market: "Chicago, IL", coveredMarket: "Chicago", hasAddress: false }),
  card({ id: "f", name: "I-95 Logistics Center", assetClass: "industrial", verdict: null, stage: "screening", jobStatus: "failed", market: "Newark, NJ", coveredMarket: "Northern New Jersey" }),
  card({ id: "g", name: "Harbor View Apartments", verdict: "caution", stage: "underwriting", addedBy: "Jordan Lee", fit: "fits", score: 79, mandateVerdict: "PURSUE", slots: { cap: "5.9%", price: "$41,250,000", yoc: null }, market: "Baltimore, MD", coveredMarket: "Baltimore" }),
  card({ id: "h", name: "Sample — The Maddox at Brewerytown", verdict: "caution", stage: "screening", fit: "near", score: 71, mandateVerdict: "WATCH", slots: { cap: "5.6%", price: "$68,000,000", yoc: null }, market: "Brewerytown, Philadelphia, PA", coveredMarket: "Philadelphia" }),
  card({ id: "i", name: "Lakewood Self Storage", assetClass: "self_storage", verdict: "pass", stage: "closed", fit: null, slots: { cap: "6.4%", price: "$9,800,000", yoc: null }, market: "Lakewood, CO", coveredMarket: null }),
  card({ id: "j", name: "Unpriced land — Route 1 parcel", verdict: "caution", stage: "screening", fit: null, slots: { cap: null, price: null, yoc: null }, market: "Laurel, MD", coveredMarket: "Baltimore" }),
  // A run whose process died mid-screen, and a re-screen that failed before
  // its verdict — the stored verdict must not read as the current call.
  card({ id: "k", name: "Arlington Flex Park", assetClass: "industrial", stage: "screening", jobStatus: "stalled", slots: { cap: null, price: "$9,100,000", yoc: null }, market: "Arlington, TX", coveredMarket: "Dallas–Fort Worth", hasAddress: false }),
  card({ id: "l", name: "Elm Street Lofts", verdict: "pass", stage: "underwriting", jobStatus: "failed", fit: "fits", score: 84, mandateVerdict: "PURSUE", slots: { cap: "6.0%", price: "$14,000,000", yoc: null }, market: "Dallas, TX", coveredMarket: "Dallas–Fort Worth" }),
];

const BILLING = { isPro: false, canCreateDeal: true, dealCount: 9, dealLimit: 25 };

describe("Pipeline — every card shape renders and reads clean", () => {
  it("renders the pipeline with twelve deals in every state", () => {
    const html = render(
      React.createElement(Pipeline, {
        deals: CARDS,
        errorMessage: null,
        notice: null,
        onboarding: { hasBuyBox: true, sampleId: "h", hasRealDeal: true },
        billing: BILLING,
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("pipeline", html);
    expect(a11yIssues(html), "a11y pipeline").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // Every live deal is on the page under its own name; the dead one is
    // folded away until asked for.
    for (const c of CARDS) {
      if (c.stage === "dead") continue;
      expect(text, c.name).toContain(c.name);
    }
    // The plan deals show their yield on cost where a cap would sit, the
    // stabilized ones their cap; the teammate's deal names who added it.
    expect(text).toContain("11.7%");
    expect(text).toContain("5.6%");
    expect(text).toContain("Jordan Lee");
    // The stalled run and the failed re-screen each say so in the status
    // column; the failed one's stored "Go" does not stand in for the call.
    expect(text).toContain("Stalled");
    expect(text).toContain("Failed");
    expect(text).not.toMatch(/Elm Street Lofts[^]*?\bGo\b[^]*?Arlington Flex Park|Elm Street Lofts[\s\S]{0,400}\bGo\b/);
    // The mandate fit is drawn, not said: the six scored live deals (the
    // dead one is folded away) each draw the bar twice — once in the `lg`
    // score column, once on the line the narrower widths show — and the
    // words a screen reader gets appear once per deal, not once per meta
    // line as they did when the fit was a word the truncation cut first.
    expect((html.match(/data-fit-bar/g) ?? []).length).toBe(12);
    expect((html.match(/Fit 71 · Watch/g) ?? []).length).toBe(2);
    expect((html.match(/Fit 88 · Pursue/g) ?? []).length).toBe(1);
    expect((html.match(/Fit 42 · Outside box/g) ?? []).length).toBe(1);
  });

  it("renders the empty pipeline with the getting-started state, and the at-limit notice", () => {
    const emptyHtml = render(
        React.createElement(Pipeline, {
          deals: [],
          errorMessage: null,
          notice: null,
          onboarding: { hasBuyBox: false, sampleId: null, hasRealDeal: false },
          billing: BILLING,
        }),
      );
    dumpView("pipeline-empty", emptyHtml);
    expect(a11yIssues(emptyHtml), "a11y pipeline-empty").toEqual([]);
    const empty = visibleText(emptyHtml);
    expect(gluedWords(empty)).toEqual([]);
    // The empty state is a picture, a line and two ways in — not an essay.
    expect(empty).toContain("Start your pipeline");
    expect(empty).toContain("Try a sample deal");
    expect(empty).toContain("Browse the covered markets");
    const atLimitHtml = render(
        React.createElement(Pipeline, {
          deals: CARDS.slice(0, 2),
          errorMessage: "Could not read that PDF — try a text-based export of the OM.",
          notice: "Your deal was saved.",
          onboarding: { hasBuyBox: true, sampleId: null, hasRealDeal: true },
          billing: { isPro: false, canCreateDeal: false, dealCount: 25, dealLimit: 25 },
        }),
      );
    dumpView("pipeline-at-limit", atLimitHtml);
    expect(a11yIssues(atLimitHtml), "a11y pipeline-at-limit").toEqual([]);
    const atLimit = visibleText(atLimitHtml);
    expect(gluedWords(atLimit)).toEqual([]);
    expect(atLimit).toContain("Could not read that PDF");
    expect(atLimit).toContain("Your deal was saved.");
  });
});

describe("ModelView — the sample model renders every panel", () => {
  it("renders the returns, stress, sensitivity, assumptions, capex and cash-flow panels", () => {
    const html = render(
      React.createElement(ModelView, {
        dealId: "sample",
        model: SAMPLE_DEAL.model,
        documents: [],
        active: true,
        isPro: false,
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("model", html);
    expect(a11yIssues(html), "a11y model").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/IRR/);
    // The cash-flow panel itself (it used to be matched by accident through
    // a "Cash Flow tab" phrase in the inputs list, which is a tooltip now).
    expect(text).toMatch(/Operating cash flow/);
  });

  it("renders the no-model state without a runtime error", () => {
    const text = visibleText(
      render(React.createElement(ModelView, { dealId: "d1", model: null, documents: [], active: true, isPro: true })),
    );
    expect(gluedWords(text)).toEqual([]);
    expect(text.length).toBeGreaterThan(100);
  });
});

describe("CompareTable — a stabilized asset, a conversion and a rejected deal side by side", () => {
  const col = (over: Partial<Col> & Pick<Col, "id" | "name">): Col => ({
    assetClass: "multifamily",
    market: "North Dallas, TX",
    coveredMarket: "Dallas–Fort Worth",
    verdict: "caution",
    reason: null,
    hasModel: true,
    fit: null,
    fitNote: null,
    strategy: "Stabilized",
    planDeal: false,
    irr: null,
    em: null,
    coc: null,
    cap: null,
    yoc: null,
    leverage: null,
    price: null,
    noi: null,
    ...over,
  });
  const COLS: Col[] = [
    col({ id: "a", name: "The Maddox at Brewerytown", reason: "Rents assume a premium the submarket has not printed.", fit: "near", fitNote: "Near on basis / unit", irr: 14.2, em: 1.82, coc: 6.1, cap: 5.6, leverage: leverageRead(5.6, 6.2), price: "$68,000,000", noi: "$3,808,000" }),
    col({ id: "b", name: "1400 Market — office to residential", verdict: "pass", reason: "The plan holds a 567 bps spread in the worst corner.", fit: "fits", strategy: "Conversion", planDeal: true, irr: 18.9, em: 2.1, coc: null, cap: null, yoc: 11.7, price: "$20,000,000", noi: "$21,000,000", market: "Center City, Philadelphia, PA", coveredMarket: "Philadelphia" }),
    col({ id: "c", name: "Tysons Corner Plaza", assetClass: "office", verdict: "pass_on", reason: "Vacancy above 20% with no leasing story.", fit: "outside", fitNote: "Misses: size, price", irr: 22.0, em: 2.4, coc: 8.0, cap: 8.1, leverage: leverageRead(8.1, 6.2), price: "$60,000,000", noi: "$4,860,000", market: "Tysons, VA", coveredMarket: "Northern Virginia" }),
    col({ id: "d", name: "Riverbend Site — 240 units", hasModel: false, verdict: null, strategy: "Development", planDeal: true, price: "$4,000,000", market: "Frisco, TX", coveredMarket: null }),
  ];

  it("renders four columns and reads clean", () => {
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: COLS }));
    dumpView("compare", html);
    expect(a11yIssues(html), "a11y compare").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    for (const c of COLS) expect(text, c.name).toContain(c.name);
    // The conversion's cap cell says it is judged on the plan, never a
    // dark building's cap; the rejected deal's 22% IRR is never crowned.
    expect(text).toMatch(/n\/a|plan/);
    expect(text).toContain("11.7%");
    // Every figure in the return rows draws its spread bar: three IRRs,
    // three multiples, two cash-on-cash, two caps (the conversion's cap
    // cell draws none), one yield on cost — once in the table and once in
    // the phone cards (one layout shows at a time). The rejected deal's bar
    // is the longest in the IRR row but muted, and it carries no "best" pill.
    expect((html.match(/data-spread-bar/g) ?? []).length).toBe(22);
    expect(html).toContain("bg-muted/50");
    expect((html.match(/>best</g) ?? []).length).toBe(4);
    // The leverage row's spread is signed, so its bar runs from a centre
    // line: the Maddox's −60 bps to the left, scaled to the Tysons' +190
    // (the row's widest), the Tysons' the full half to the right — once per
    // layout; the two plan deals, judged on yield on cost, draw none.
    expect((html.match(/data-signed-bar/g) ?? []).length).toBe(4);
    expect((html.match(/right:50%;width:16%/g) ?? []).length).toBe(2);
    expect((html.match(/left:50%;width:50%/g) ?? []).length).toBe(2);
    // The phone layout: a card per deal, the table hidden below `sm`.
    expect(html).toContain('aria-label="Deals compared"');
    expect((html.match(/<li /g) ?? []).length).toBe(COLS.length);
    expect(html).toMatch(/class="hidden overflow-x-auto[^"]*sm:block"/);
    // One deal alone has no spread to draw.
    const single = renderToStaticMarkup(React.createElement(CompareTable, { cols: [COLS[0]] }));
    expect(single).not.toContain("data-spread-bar");
    expect(single).not.toContain("data-signed-bar");
  });
});

// ── The bridge and the BOV reconciler ──────────────────────────────────────
import { BridgeView, type VersionOption } from "@/app/(app)/deals/[id]/bridge/bridge-view";
import { ValuationsView, type ColumnData } from "@/app/(app)/deals/[id]/valuations/valuations-view";
import { bridgeSentence, buildBridge } from "@/lib/bridge/attribution";
import { setPath } from "@/lib/bridge/fields";
import type { Assumptions } from "@/lib/bridge/model";
import { bridgeSummaryLine, reconcileValuations, scoreAggressiveness, type NamedValuation } from "@/lib/valuation/reconcile";

const BASE: Assumptions = {
  purchasePrice: 13_700_000,
  holdMonths: 60,
  acqFeePct: 0,
  acqFeeCap: 0,
  transferTaxPct: 0,
  recordationTaxPct: 0,
  generalHoldPct: 0.01,
  buyerLegal: 0,
  lenderLegal: 0,
  thirdPartyReports: 0,
  miscClosing: 0,
  inPlaceRentAnnual: 1_500_000,
  expenseRecoveriesAnnual: 0,
  otherRevenueAnnual: 0,
  vacancyPct: 0.05,
  rentGrowthPct: 0.03,
  expenseLines: [{ label: "Operating expenses", annual: 420_000 }],
  mgmtFeePct: 0,
  expenseGrowthPct: 0.03,
  rsf: 150_000,
  reservesPsf: 0.15,
  capitalImprovementsYr1: 0,
  tiPsf: 0,
  lcPct: 0,
  amFeePctEquity: 0.005,
  ltc: 0.6,
  allInRatePct: 0.06,
  ioMonths: 0,
  amortMonths: 360,
  financingCostPct: 0.01,
  exitCapPct: 0.08,
  saleCostPct: 0.02,
};

const version = (id: string, label: string, irr: number | null): VersionOption => ({
  id,
  label,
  note: id === "v2" ? "Retrade after the roof report." : null,
  createdAt: "2026-09-01T12:00:00Z",
  automatic: id === "v1",
  leveredIrrPct: irr,
});

describe("BridgeView — an IRR move attributed to its drivers renders and reads clean", () => {
  it("renders a three-driver bridge and the identical-assumptions state", () => {
    const to = setPath(setPath(setPath(BASE, "purchasePrice", 12_400_000), "exitCapPct", 0.07), "rentGrowthPct", 0.025);
    const bridge = buildBridge(BASE, to);
    expect(bridge.steps.length).toBe(3);
    const html = render(
      React.createElement(BridgeView, {
        bridge,
        sentence: bridgeSentence(bridge),
        fromVersion: version("v1", "Screen of Sep 1", bridge.fromIrr),
        toVersion: version("v2", "Retrade", bridge.toIrr),
      }),
    );
    dumpView("bridge", html);
    expect(a11yIssues(html), "a11y bridge").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/bps/);
    expect(text).toContain("Purchase price");
    // The before / after columns read in the field's units, never as the
    // raw numbers the model ran on.
    expect(text).toContain("$13.7M");
    expect(text).toContain("$12.4M");
    expect(text).toMatch(/8\.00?%/);
    expect(text).not.toMatch(/13700000/);
    const same = visibleText(
      render(
        React.createElement(BridgeView, {
          bridge: buildBridge(BASE, BASE),
          sentence: "",
          fromVersion: version("v1", "Screen of Sep 1", null),
          toVersion: version("v2", "Retrade", null),
        }),
      ),
    );
    expect(gluedWords(same)).toEqual([]);
    expect(same).toContain("identical");
  });
});

const JLL: NamedValuation = {
  sourceLabel: "JLL BOV",
  headlineValue: 71_500_000,
  year1Noi: 4_320_000,
  goingInCap: 0.06,
  exitCap: 0.0575,
  holdYears: 5,
  rentGrowth: 0.035,
  vacancyAssumption: 0.05,
  capexDeduction: 500_000,
  discountRate: 0.075,
};
const EASTDIL: NamedValuation = {
  sourceLabel: "Eastdil BOV",
  headlineValue: 65_000_000,
  year1Noi: 4_116_800,
  goingInCap: 0.062,
  exitCap: 0.0625,
  holdYears: 5,
  rentGrowth: 0.025,
  vacancyAssumption: 0.07,
  capexDeduction: 1_400_000,
  discountRate: 0.085,
};

const column = (id: string, v: NamedValuation, over: Partial<ColumnData> = {}): ColumnData => ({
  id,
  label: v.sourceLabel,
  sourceType: "broker",
  extracted: true,
  internal: false,
  documentUrl: null,
  note: null,
  values: {
    headlineValue: v.headlineValue,
    year1Noi: v.year1Noi,
    goingInCap: v.goingInCap,
    exitCap: v.exitCap,
    holdYears: v.holdYears,
    rentGrowth: v.rentGrowth,
    vacancyAssumption: v.vacancyAssumption,
    capexDeduction: v.capexDeduction,
    discountRate: v.discountRate,
  },
  citations: { headlineValue: { page: "3", snippet: "Our opinion of value is $71,500,000" } },
  derivedFields: [],
  implied: { ok: true, leveredIrrPct: 0.134, leveredEquityMultiple: 1.74, substitutions: [{ label: "Hold", reason: "the BOV states no hold; the model's 5 years used" }] },
  ...over,
});

describe("ValuationsView — two BOVs, the gap decomposed, renders and reads clean", () => {
  it("renders the comparison table, the bridge and the aggressiveness tally", () => {
    const bridge = reconcileValuations(JLL, EASTDIL);
    expect(bridge.ok).toBe(true);
    const html = render(
      React.createElement(ValuationsView, {
        columns: [
          column("a", JLL),
          column("b", EASTDIL, { note: "Marked to the Q2 trades." }),
          column("me", { ...EASTDIL, sourceLabel: "Your model" }, { sourceType: "internal", internal: true, extracted: false, derivedFields: ["goingInCap"], implied: { ok: false, error: "no model yet", leveredIrrPct: null, leveredEquityMultiple: null, substitutions: [] } }),
        ],
        bridge,
        summary: bridge.ok ? bridgeSummaryLine(bridge) : null,
        tally: scoreAggressiveness(JLL, EASTDIL),
        aLabel: "JLL BOV",
        bLabel: "Eastdil BOV",
      }),
    );
    dumpView("valuations", html);
    expect(a11yIssues(html), "a11y valuations").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("JLL BOV");
    expect(text).toContain("Eastdil BOV");
    expect(text).toMatch(/\$6\.5M|6\.5M/);
    expect(text).toContain("13.4%");
    expect(text).toMatch(/year-1 NOI/);
  });

  it("renders the no-bridge state when a side lacks a figure", () => {
    const thin: NamedValuation = { ...EASTDIL, year1Noi: null, goingInCap: null };
    const bridge = reconcileValuations(JLL, thin);
    expect(bridge.ok).toBe(false);
    const text = visibleText(
      render(
        React.createElement(ValuationsView, {
          columns: [column("a", JLL), column("b", thin)],
          bridge,
          summary: null,
          tally: scoreAggressiveness(JLL, thin),
          aLabel: "JLL BOV",
          bLabel: "Eastdil BOV",
        }),
      ),
    );
    expect(gluedWords(text)).toEqual([]);
    expect(text.length).toBeGreaterThan(300);
  });
});

// ── The rent roll, the analytics charts and the submarket trend ────────────
import { RentRollDashboard } from "@/app/(app)/deals/[id]/rent-roll/dashboard";
import { DotTimeline, StageFunnel, VerdictMix } from "@/app/(app)/analytics/charts";
import { DualAxisTrend } from "@/app/(app)/submarkets/[id]/trend-chart";
import { analyzeRentRoll, leaseUpCurve, markToMarket, rolloverCostForecast, rolloverSchedule } from "@/lib/rentroll/analytics";
import { parseCsv, suggestMapping, toLeases } from "@/lib/rentroll/parse";
import { PROFILE_DEFAULTS } from "@/lib/rentroll/profiles";
import { validateLeases } from "@/lib/rentroll/validate";
import { CLEAN_CSV, MISSING_EXPIRIES_CSV } from "@/lib/rentroll/__fixtures__";
import { deriveAnalytics, type AnalyticsRow } from "@/lib/analytics";
import { rentTrend } from "@/lib/market/metrics";
import type { SubmarketPeriod } from "@/lib/market/types";

describe("RentRollDashboard — a parsed rent roll renders every panel", () => {
  const renderRoll = (csv: string) => {
    const grid = parseCsv(csv);
    const leases = toLeases(grid, suggestMapping(grid)).leases;
    const profile = PROFILE_DEFAULTS.office;
    const analytics = analyzeRentRoll(leases, { asOf: "2026-01-01", nra: null });
    const schedule = rolloverSchedule(leases, { nra: null });
    const rent = profile.marketRentPsf;
    const html = render(
        React.createElement(RentRollDashboard, {
          analytics,
          mtm: markToMarket(leases, { default: rent, NNN: rent, MG: rent, FSG: rent }),
          cost: rolloverCostForecast(schedule, profile),
          leaseUp: leaseUpCurve({
            vacantSf: schedule.vacantSf,
            occupiedSf: analytics.occupiedSf,
            nra: analytics.totalSf,
            absorptionSfPerMonth: 2_500,
          }),
          issues: validateLeases(leases, { nra: null }),
          filename: "rent-roll.csv",
        }),
      );
    dumpView(`rent-roll-${csv === CLEAN_CSV ? "clean" : "issues"}`, html);
    expect(a11yIssues(html), "a11y rent roll").toEqual([]);
    return visibleText(html);
  };

  it("the clean roll: WALT, rollover, mark-to-market, lease-up", () => {
    const text = renderRoll(CLEAN_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/WALT/i);
    expect(text).toMatch(/rollover/i);
  });

  it("a roll with missing expiries names what the import found", () => {
    const text = renderRoll(MISSING_EXPIRIES_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("What the import found in rent-roll.csv");
  });
});

describe("Analytics charts — timeline, verdict mix and stage funnel render and read clean", () => {
  const metric = (label: string, value: string) => ({ label, value, flagged: false, page: "" });
  const row = (id: string, name: string, metrics: ReturnType<typeof metric>[], over: Partial<AnalyticsRow> = {}): AnalyticsRow => ({
    id,
    name,
    asset_class: "multifamily",
    created_at: `2026-08-${(10 + Number(id)).toString().padStart(2, "0")}T12:00:00Z`,
    is_sample: false,
    stage: "screening",
    verdict: { verdict: "pass" },
    extraction: { dealName: name, assetClass: "multifamily", market: "Dallas, TX", address: "", metrics },
    ...over,
  });
  const deals = deriveAnalytics([
    row("1", "Maddox", [metric("Asking price", "$50,000,000"), metric("Going-in cap rate", "5.70%"), metric("Units", "248")]),
    row("2", "Harbor View", [metric("Asking price", "$41,250,000"), metric("Going-in cap rate", "5.90%"), metric("Units", "180")], { verdict: { verdict: "caution" }, stage: "underwriting" }),
    row("3", "Tysons Plaza", [metric("Asking price", "$60,000,000"), metric("Going-in cap rate", "8.10%"), metric("Total SF", "200,000 SF")], { asset_class: "office", verdict: { verdict: "pass_on" }, stage: "dead" }),
    row("4", "1400 Market", [metric("Purchase price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000"), metric("Total project cost", "$180,000,000"), metric("Units (proposed)", "612")], { verdict: { verdict: "pass" }, stage: "loi", extraction: { dealName: "1400 Market", assetClass: "multifamily", market: "Philadelphia, PA", address: "", strategy: { kind: "conversion", summary: "Office to residential." }, metrics: [metric("Purchase price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000"), metric("Total project cost", "$180,000,000"), metric("Units (proposed)", "612")] } }),
  ]);

  it("plots the cap and per-unit series, the verdict mix and the funnel", () => {
    expect(deals.length).toBe(4);
    const capPoints = deals.filter((d) => d.capPct != null).map((d) => ({ at: d.at, value: d.capPct!, name: d.name }));
    expect(capPoints.length).toBe(3); // the conversion has no going-in cap
    const unitPoints = deals.filter((d) => d.perUnit != null).map((d) => ({ at: d.at, value: d.perUnit!, name: d.name }));
    const html =
      renderToStaticMarkup(React.createElement(DotTimeline, { points: capPoints, format: (v: number) => `${v.toFixed(1)}%`, medianLabel: "median" })) +
      renderToStaticMarkup(React.createElement(DotTimeline, { points: unitPoints, format: (v: number) => `$${Math.round(v / 1000)}k`, medianLabel: "median" })) +
      renderToStaticMarkup(React.createElement(VerdictMix, { deals })) +
      renderToStaticMarkup(
        React.createElement(StageFunnel, {
          rows: [
            { label: "Screening", count: 1 },
            { label: "Underwriting", count: 1 },
            { label: "LOI", count: 1 },
          ],
        }),
      );
    dumpView("analytics-charts", html);
    expect(a11yIssues(html), "a11y analytics-charts").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Screening");
    expect(html).toContain("<svg");
  });
});

describe("DualAxisTrend — a submarket's vacancy bars and rent line render", () => {
  const period = (over: Partial<SubmarketPeriod> & { period: string }): SubmarketPeriod => ({
    id: over.period,
    submarketId: "sm",
    inventorySf: 20_000_000,
    vacancyPct: 0.06,
    netAbsorptionSf: 150_000,
    underConstructionSf: 1_200_000,
    askingRent: 9.5,
    rentBasis: "nnn_direct",
    source: "market-export.csv",
    unverified: false,
    sourceUrl: null,
    ...over,
  });
  const PERIODS = [
    period({ period: "2025-03-31", askingRent: 9.3, vacancyPct: 0.052 }),
    period({ period: "2025-06-30", askingRent: 9.35, vacancyPct: 0.048 }),
    period({ period: "2025-09-30", askingRent: 9.42, vacancyPct: 0.055, unverified: true }),
    period({ period: "2025-12-31", askingRent: 12.1, vacancyPct: 0.06, rentBasis: "gross_direct" }),
  ];

  it("draws four periods, breaks the rent line at the basis change, and reads clean", () => {
    const trend = rentTrend(PERIODS);
    expect(trend.basisChanged).toBe(true);
    const bars = PERIODS.map((p) => ({ period: p.period, value: p.vacancyPct!, source: p.source, unverified: p.unverified }));
    const html = renderToStaticMarkup(
      React.createElement(DualAxisTrend, {
        bars,
        barLabel: "Vacancy",
        segments: trend.segments,
        lineLabel: "Asking rent",
        formatBar: (n: number) => `${(n * 100).toFixed(1)}%`,
        formatLine: (n: number) => `$${n.toFixed(2)}`,
      }),
    );
    dumpView("submarket-trend", html);
    expect(a11yIssues(html), "a11y submarket-trend").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain("<svg");
    expect(text).toMatch(/Vacancy/);
    const empty = visibleText(
      renderToStaticMarkup(
        React.createElement(DualAxisTrend, { bars: [], barLabel: "Vacancy", segments: [], lineLabel: "Asking rent", formatBar: String, formatLine: String }),
      ),
    );
    expect(empty).toContain("No periods loaded yet.");
  });
});

// ── The shared screen (the one signed-out surface) ─────────────────────────
import { Expired, ShareView } from "@/app/share/[token]/share-view";
import type { ExtractionResult, VerdictResult } from "@/lib/anthropic/types";

describe("ShareView — the read-only screen a partner or lender opens", () => {
  it("renders the sample deal: the verdict mark, the flip dots, every range, the killers, key terms and the folded reads", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: SAMPLE_DEAL.name,
        assetClass: SAMPLE_DEAL.asset_class,
        expiresAt: "2026-09-30T12:00:00Z",
        verdictStale: false,
        aerial: {
          src: "/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/aerial?w=960&h=400",
          place: "Brewerytown, Philadelphia, PA",
        },
        extraction: SAMPLE_DEAL.extraction,
        comps: SAMPLE_DEAL.comps,
        market: SAMPLE_DEAL.market,
        verdict: SAMPLE_DEAL.verdict,
      }),
    );
    expect(html.length).toBeGreaterThan(5_000);
    dumpView("share", html);
    expect(a11yIssues(html), "a11y share").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain(SAMPLE_DEAL.name);
    expect(text).toContain("expires Sep 30");
    // The building from above, through the token-scoped route, credited.
    expect(html).toContain('alt="Aerial view of Brewerytown, Philadelphia, PA"');
    expect(html).toContain("/api/share/0f6f2d4e-1b2c-4d5e-8f90-a1b2c3d4e5f6/aerial");
    expect(text).toContain("USGS The National Map");
    expect(text).toContain("Caution");
    // The call across the range, as three dots — No-go / Caution / Go.
    expect(text).toMatch(/Conservative\s*No-go/);
    expect(text).toMatch(/Sponsor\s*Go/);
    for (const r of SAMPLE_DEAL.verdict.screen?.ranges ?? []) expect(text, r.label).toContain(r.label);
    // Each range carries the deal page's positional read of where the base
    // sits; the vacancy base at 9.0% between 6.0% and 9.5% hugs the high end.
    expect(html).toContain('aria-label="Base sits near the optimistic end of the range"');
    expect(html).toContain('aria-label="Where the base sits inside the range"');
    expect(text).toContain("Basis");
    expect(text).toContain("Breaks if:");
    expect(text).toContain("Key terms");
    expect(text).toContain("pro forma");
    // The comp and market reads: first sentence in the open, the rest folded
    // but still on the page.
    expect(html).toContain("<details");
    expect(text).toContain("sell-side selections usually do.");
    expect(text).toContain("the basis looks 8–12% rich.");
    // Nothing editable, nothing of the buyer's.
    expect(text).not.toMatch(/Buy box|Notes|Documents/);
    expect(html).not.toMatch(/<(button|input|textarea|select)\b/);
  });

  it("renders a conversion with the plan block and a stale verdict, and the expired state", () => {
    const conversion: ExtractionResult = {
      dealName: "1200 K Street — Office-to-Residential Conversion",
      assetClass: "multifamily",
      market: "Washington, DC",
      address: "1200 K St NW, Washington, DC",
      strategy: {
        kind: "conversion",
        summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
        capitalBudget: "$160M hard and soft costs",
        timeline: "24 months of construction, 12 months of lease-up",
      },
      metrics: [
        { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: true, page: "p. 12" },
        { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
      ],
    };
    const verdict: VerdictResult = {
      verdict: "pass",
      reason: "The plan holds a 567 bps spread over the exit cap in the worst corner of the grid.",
      topRisks: ["Entitlements are not yet in hand."],
      nextSteps: [],
      screen: {
        ranges: [
          { label: "Total cost", low: "$170M", base: "$180M", high: "$200M", source: "OM budget (p. 14)", basis: "High adds a 10% contingency.", confidence: "low" },
        ],
        dealKillers: [{ lever: "exit", read: "Stabilized value at a 6% cap.", risk: "" }],
        sensitivity: [],
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShareView, {
        dealName: conversion.dealName ?? "",
        assetClass: "multifamily",
        expiresAt: "2026-10-05T12:00:00Z",
        verdictStale: true,
        aerial: null,
        extraction: conversion,
        comps: null,
        market: null,
        verdict,
      }),
    );
    dumpView("share-conversion", html);
    expect(a11yIssues(html), "a11y share-conversion").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/\bGo\b/);
    expect(text).toContain("From the previous completed screen");
    // The plan first: the conversion's finished-project figures and its yield
    // on cost, so the $21M NOI beside a $20M price reads as the plan.
    expect(text).toContain("The plan");
    expect(text).toContain("Conversion");
    expect(text).toContain("$21.0M");
    expect(text).toContain("11.7%");
    expect(text).toContain("A conversion deal has no going-in cap");
    expect(text).toContain("verify vs. source");
    expect(text).toContain("Exit");
    expect(text).not.toContain("Breaks if:");
    expect(text).not.toContain("Comp read");
    // No address, no picture — and no empty frame or credit line either.
    expect(html).not.toContain("<img");
    expect(text).not.toContain("USGS");

    const expired = renderToStaticMarkup(
      React.createElement(Expired, { reason: "The sender revoked this link." }),
    );
    expect(a11yIssues(expired), "a11y share-expired").toEqual([]);
    const gone = visibleText(expired);
    expect(gone).toContain("This link isn’t available");
    expect(gone).toContain("The sender revoked this link.");
  });
});
