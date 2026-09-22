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
import { ScoredFeedView, type AlertRow, type ItemRow } from "@/app/(app)/news/scored-feed";
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
    // Every row keeps a picture slot of the same size, so the names line
    // up: the nine live deals with an address try their photo, the two
    // without one (Logan Square, Arlington Flex Park) show a blank plate;
    // the dead one is folded away.
    expect((html.match(/data-deal-thumb="photo"/g) ?? []).length).toBe(9);
    expect((html.match(/data-deal-thumb="blank"/g) ?? []).length).toBe(2);
    // The two exports travel together at the filter row's right edge.
    expect(html).toMatch(/class="flex items-center gap-2 md:ml-auto"/);
    // A stored class prints its words: the storage deal's row and the
    // asset filter both say "Self-storage", and the key never shows.
    expect(text).toContain("Self-storage");
    expect(text).not.toMatch(/self_storage|Self_storage/);
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
    const mtm = markToMarket(leases, { default: rent, NNN: rent, MG: rent, FSG: rent });
    const html = render(
        React.createElement(RentRollDashboard, {
          analytics,
          mtm,
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
    return { text: visibleText(html), html, priced: Math.min(25, mtm.rows.length) };
  };

  it("the clean roll: WALT, rollover, mark-to-market, lease-up", () => {
    const { text, html, priced } = renderRoll(CLEAN_CSV);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/WALT/i);
    expect(text).toMatch(/rollover/i);
    // Every priced lease draws its rent against market as a bar from a
    // centre line — once in the table, once in the phone card (one layout
    // shows at a time) — and the phone gets a card per lease.
    expect(priced).toBeGreaterThan(0);
    expect((html.match(/data-mtm-bar/g) ?? []).length).toBe(priced * 2);
    expect(html).toContain('aria-label="Leases marked to market"');
    expect(html).toMatch(/data-mtm-bar[\s\S]{0,400}?(bg-pass|bg-kill)/);
    expect(html).toMatch(/class="mt-3 hidden overflow-x-auto sm:block"/);
  });

  it("a roll with missing expiries names what the import found", () => {
    const { text } = renderRoll(MISSING_EXPIRIES_CSV);
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

// ── The News page's live section ─────────────────────────────────────────
// A pure view of one fetch: the ranked headlines, then one chip per source
// in the state it answered in (live, an earlier copy, did not answer) and
// the search host behind the topic searches. The page hands it the real
// fetch; this hands it a fixture with every state.
import { LiveHeadlinesView } from "@/app/(app)/news/live-headlines";
import type { LiveHeadlines, SourceStatus } from "@/lib/news/live";

describe("News live section", () => {
  const status = (id: string, name: string, over: Partial<SourceStatus> = {}): SourceStatus => ({
    id,
    name,
    home: `https://${id}.test/`,
    kind: "publisher",
    ok: true,
    count: 12,
    ms: 40,
    stale: false,
    cached: false,
    ...over,
  });
  const live: LiveHeadlines = {
    fetchedAt: "2026-09-14T19:00:00Z",
    headlines: [
      {
        title: "Investor takes over distressed Atlanta apartment asset",
        url: "https://a.test/1",
        publisher: "Connect CRE",
        publisherUrl: "https://a.test/",
        publishedAt: "2026-09-14T17:00:00Z",
        snippet: "The lender-controlled sale closed at a 6.4% cap.",
        sourceId: "connect",
        image: "https://cdn.a.test/atlanta.jpg",
        score: 3.2,
      },
      {
        title: "PGIM refis Manhattan office-to-storage conversion",
        url: "https://b.test/2",
        publisher: "Commercial Observer",
        publisherUrl: null,
        publishedAt: null,
        snippet: "",
        sourceId: "co",
        image: null,
        score: 2.1,
      },
    ],
    sources: [
      status("co", "Commercial Observer"),
      status("trd", "The Real Deal", { via: "Bing News · site:therealdeal.com" }),
      status("cpe", "Commercial Property Executive", {
        ok: false,
        stale: true,
        count: 100,
        ms: 4187,
        error: "HTTP 403 · Google News · site:commercialsearch.com: The operation was aborted due to timeout",
      }),
      status("gn-cre", "Google News · commercial real estate", { kind: "topic", via: "Bing News · commercial real estate" }),
      status("mhn", "Multi-Housing News", { ok: false, count: 0, ms: 8000, error: "HTTP 403" }),
    ],
  };

  it("leads with the top story — kicker, headline, dek, the publisher's picture — then the sources as one line, and reads clean", () => {
    const html = render(React.createElement(LiveHeadlinesView, { live }));
    const text = visibleText(html);
    expect(text).toContain("live from 4 of 5 sources");
    expect(text).toContain("Monday, September 14, 2026");
    expect(text).toContain("Investor takes over distressed Atlanta apartment asset");
    // the kicker: what the story touches, and the covered market it names
    expect(text).toContain("distress");
    expect(text).toContain("Atlanta");
    expect(html).toContain('href="/market?metro=atlanta"');
    expect(text).toContain("Connect CRE");
    expect(text).toContain("2h ago");
    // the publisher's picture, decorative beside its headline
    expect(html).toContain('src="https://cdn.a.test/atlanta.jpg"');
    expect(html).toMatch(/<img[^>]*\salt=""/);
    // two stories: the lead and one in the grid, no list yet
    expect((html.match(/<article/g) ?? []).length).toBe(2);
    expect(text).not.toContain("More headlines");
    // the topic source reads as its topic; the row already names the host
    expect(text).toContain("commercial real estate");
    expect(text).toContain("(earlier copy)");
    expect(text).toContain("(did not answer)");
    expect(text).toContain("via Bing News");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live", html);
  });

  it("keeps the front page's shape at fourteen stories: one lead, six in the grid, the rest in the list", () => {
    const many: LiveHeadlines = {
      ...live,
      headlines: Array.from({ length: 14 }, (_, i) => ({
        ...live.headlines[i % 2],
        url: `https://m.test/${i}`,
        title: `${live.headlines[i % 2].title} (${i + 1})`,
      })),
    };
    const html = render(React.createElement(LiveHeadlinesView, { live: many }));
    const text = visibleText(html);
    expect((html.match(/<article/g) ?? []).length).toBe(7);
    expect(text).toContain("More headlines");
    expect(text).toContain("(14)");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live-fold", html);
  });

  it("says so when nothing answered — a sentence, never a fake page", () => {
    const dark: LiveHeadlines = {
      ...live,
      headlines: [],
      sources: live.sources.map((s) => ({ ...s, ok: false, stale: false, count: 0, via: undefined, error: "HTTP 503" })),
    };
    const html = render(React.createElement(LiveHeadlinesView, { live: dark }));
    const text = visibleText(html);
    expect(text).toContain("None of the publishers answered just now");
    expect(text).toContain("live from 0 of 5 sources");
    expect(text).not.toContain("via ");
    expect(html).not.toContain("<article");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-live-dark", html);
  });
});

describe("News scored feed", () => {
  const item = (over: Partial<ItemRow>): ItemRow => ({
    url: "https://x.test/1",
    title: "t",
    source: "GlobeSt",
    sector: "multifamily",
    relevance: 7,
    summary: null,
    action: null,
    published_at: null,
    created_at: "2026-09-14T11:00:00Z",
    ...over,
  });
  const items: ItemRow[] = [
    item({
      url: "https://x.test/1",
      title: "Rent cap bill advances in Annapolis",
      sector: "regulation-md",
      relevance: 8,
      summary: "The bill would cap increases at CPI plus 3%.",
      action: "Re-run the Maryland deals' rent growth at the cap.",
    }),
    item({
      url: "https://x.test/2",
      title: "Fannie tightens agency debt terms",
      sector: "capital-markets",
      relevance: 3,
      created_at: "2026-09-13T11:00:00Z",
    }),
    item({ url: "https://x.test/3", title: "Local bakery opens second location", relevance: null }),
  ];
  const alerts: AlertRow[] = [
    {
      id: "a1",
      rule_id: "md-rent-cap",
      headline: "Maryland rent stabilization act signed",
      url: "https://x.test/law",
      detail: null,
      detected_at: "2026-09-14T10:00:00Z",
    },
  ];

  it("groups the stories by the day the sweep picked them up, highest relevance first, with the sector chips and the law strip", () => {
    const html = render(React.createElement(ScoredFeedView, { items, alerts, wantSector: "" }));
    const text = visibleText(html);
    expect(text).toContain("rule changes");
    expect(text).toContain("Maryland rent stabilization act signed");
    expect(text).toContain("affects md-rent-cap");
    expect(text).toContain("Monday, Sep 14");
    expect(text).toContain("Sunday, Sep 13");
    expect(text).toContain("8/10");
    expect(text).toContain("MD regulation");
    expect(text).toContain("capital markets");
    expect(html).toContain('href="/news?sector=regulation-md"');
    // within a day the scored story leads and the unscored one trails
    expect(text.indexOf("Rent cap bill")).toBeLessThan(text.indexOf("Local bakery"));
    expect(text).toContain("Re-run the Maryland deals");
    expect(text).not.toContain("starts with the weekday sweep");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
    dumpView("news-scored", html);
  });

  it("filters to the sector asked for, and ignores one the rows have never seen", () => {
    const one = visibleText(render(React.createElement(ScoredFeedView, { items, alerts: [], wantSector: "capital-markets" })));
    expect(one).toContain("Fannie tightens");
    expect(one).not.toContain("Rent cap bill");
    const all = visibleText(render(React.createElement(ScoredFeedView, { items, alerts: [], wantSector: "nope" })));
    expect(all).toContain("Rent cap bill");
    expect(all).toContain("Fannie tightens");
  });

  it("says the sweep has not run, in one quiet line, when there are no rows", () => {
    const html = render(React.createElement(ScoredFeedView, { items: [], alerts: [], wantSector: "" }));
    const text = visibleText(html);
    expect(text).toContain("starts with the weekday sweep");
    // no law strip, no sector chips, no day group — one line only
    expect(html).not.toContain("<section");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<h2");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });
});

// ── /tools, the deal-math calculators ──────────────────────────────────────
//
// A client component full of controls is exactly the shape the a11y lint
// exists for: eleven text inputs, a checkbox and three toggle buttons, every
// one of which needs a name a screen reader can read. Rendered here in its
// default state, which is also the state a first-time visitor meets — so
// this doubles as a check that the seeded numbers actually compute rather
// than showing a page of em dashes.
import { DealMathTools } from "@/app/tools/deal-math-tools";
import { TOOL_GROUPS, TOOL_INDEX } from "@/lib/tools/catalog";

describe("the deal math tools", () => {
  const html = render(React.createElement(DealMathTools));
  const text = visibleText(html);

  it("renders the seed on the server, where there is no URL to read", () => {
    // The trap useSyncExternalStore exists for: a hook that read
    // window.location during render would make the server's HTML and the
    // browser's first paint disagree — a hydration error to React, a flash
    // of the wrong numbers to a reader. The server snapshot is the seed,
    // and this render IS the server, so the seeded figures must be here.
    expect(html).toContain('value="$20M"');
    expect(text).toContain("$12,656,86");
  });

  it("offers a link and a table, so the work can leave the page", () => {
    // An analyst who cannot get a sizing out of the page goes back to
    // Excel, which is the thing this page exists to prevent.
    expect(text).toContain("Copy link to this sizing");
    expect(text).toContain("Copy as table");
    expect(a11yIssues(html), "the copy buttons are named").toEqual([]);
  });

  it("names every control and reads clean", () => {
    expect(a11yIssues(html), "a11y tools").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    dumpView("tools", html);
  });

  it("answers on its seeded numbers rather than showing a page of dashes", () => {
    // $20M at a $1.2M NOI, 6.5% over 30 years, 65 / 1.25x / 9% — coverage is
    // the binding test, and saying so is the point of the whole card.
    expect(text).toContain("Debt service coverage");
    expect(text).toContain("governs at");
    expect(text).toContain("1.25x");
    // the loan lands where lib/tools/deal-math says it does
    expect(text).toContain("$12,656,86");
    // 5% of $30M hard cost, on a $42.5M total, at a 7% yield on cost
    expect(text).toContain("$42.50M");
    expect(text).toContain("7.00%");
    expect(text).toContain("150 bps");
    // $36/SF/yr over 100,000 SF and 120 units: $3.60M a year, $2,500 a
    // unit a month. The totals read compact, the per-unit rent exact —
    // which is the right way round, since one is a magnitude and the other
    // is a figure somebody will type into a comp sheet.
    expect(text).toContain("$3.60M");
    expect(text).toContain("$2,500");
  });

  it("shows the shorthand in the price fields it now accepts", () => {
    // Both the fix and the teaching: a field seeded with "$20M" tells the
    // next person the notation works, and the figures below it prove the
    // reader read it. live-verify greps the live page for this exact
    // attribute, because the old build could not produce it — the old
    // parser could not read "$20M", so it could not have been seeded.
    expect(html).toContain('value="$20M"');
    expect(text).toContain("$12,656,86"); // …and $20M sized the loan
  });

  it("shows what a lease is worth after what it cost to sign", () => {
    // $36 face, ten years, twelve months free, $90 TI, 4% commission, 3%
    // steps. The point of the card is that $36 face is nothing like $36
    // effective, so the seeded case has to show that gap.
    expect(text).toContain("What the lease is really worth");
    expect(text).toContain("Net effective");
    expect(text).toContain("Where the face rent goes");
    // The concession is DRAWN before it is said: four segments, one each
    // for what is kept, the free rent, the TI and the commission.
    expect(html).toContain('class="bg-caution"');
    // …and the face rent is named beside the effective one, or the gap
    // has nothing to be a gap from.
    expect(text).toContain("The face rent is");
  });

  it("says one operating expense three ways", () => {
    // $504k on 120 units, 96,000 SF, $1.68M of income: $4,200 a unit,
    // $5.25 a foot, 30% of income. A broker quotes the first; an
    // underwriter argues the third.
    expect(text).toContain("One expense, three ways");
    expect(text).toContain("$4,200");
    expect(text).toContain("$5.25");
    expect(text).toContain("30.0%");
  });

  it("draws the binding test rather than only naming it", () => {
    // three tracks in the debt sizer, one filled in the brand colour and
    // two in the line colour — the picture that makes the short bar the
    // answer. (The cash-flow strip draws its own bars; they are counted in
    // their own test below, which is why this one anchors on `h-full`.)
    const sizerBars = html.match(/data-bar="lender-test"[^>]*/g) ?? [];
    expect(sizerBars.length, "three lender tests").toBe(3);
    expect(sizerBars.filter((b) => b.includes("bg-brand")).length, "one binds").toBe(1);
    expect(sizerBars.filter((b) => b.includes("bg-line")).length).toBe(2);
  });

  it("reads a pasted cash flow and says where the return comes from", () => {
    // The seeded strip: −$10M, four thin years, a $15.2M exit of which
    // $14.4M is the sale. It must answer on arrival, like every other card.
    expect(text).toContain("Paste a cash flow");
    expect(text).toContain("1.81x"); // $18.1M back on $10M in
    expect(text).toContain("$8.10M"); // the profit
    expect(text).toContain("4.5 yr"); // payback, inside the year
    // The split is the figure nothing else on the page computes, and it is
    // DRAWN before it is said: two segments, brand and sidebar.
    expect(text).toContain("from cash flow");
    expect(text).toContain("from the sale");
    expect(html).toContain('class="bg-sidebar"');
    // A deal that is mostly its exit says so in words too.
    expect(text).toContain("the cap you sell at is the argument");
    // Every year is drawn from a centre line: six rows, the first negative.
    // Scoped to THIS card's own bars. Counting `bg-kill` across the whole
    // page counted every other card's red too, so a new card with a failing
    // test in it broke an assertion about a cash flow.
    const years = html.match(/data-bar="year"[^>]*/g) ?? [];
    expect(years.length, "one bar per year").toBe(6);
    expect(years.filter((b) => b.includes("bg-kill")).length, "the year in").toBe(1);
    expect(years.filter((b) => b.includes("bg-brand")).length).toBe(5);
  });

  it("indexes itself, and every jump link lands on a real card", () => {
    // A page of this many cards is more than a reader should scroll past to
    // find one. The nav and the cards read one INDEX, and this holds the
    // two sides together: every href must name an id the page actually
    // emits, and every card must be reachable from the index.
    //
    // UNIQUE hrefs, and both counts read from the catalog rather than a
    // number written here. A card may be linked from more than one place —
    // the after-tax card's fine print points at the exchange — so a raw
    // count of hrefs is a count of links, not of cards, and a literal here
    // is one more thing to remember to bump.
    const hrefs = [...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]);
    const linked = new Set(hrefs);
    const ids = new Set([...html.matchAll(/<section id="([a-z0-9-]+)"/g)].map((m) => m[1]));
    expect(linked.size).toBe(TOOL_INDEX.length);
    expect(ids.size).toBe(TOOL_INDEX.length);
    for (const h of hrefs) expect(ids.has(h), `#${h} has no card`).toBe(true);
    for (const id of ids) expect(hrefs, `${id} is not in the index`).toContain(id);
    expect(text).toContain("Jump to");
  });

  it("makes the equity the plug, and says how far above the price it is", () => {
    // $20M price, $3M capital, 2% closing, 1% loan fee, $500k reserve, $13M
    // loan. The figure people carry is $20M − $13M = $7M; the cheque is
    // $11.03M, and that gap is the card.
    expect(text).toContain("Sources and uses");
    expect(text).toContain("$24.03M");
    expect(text).toContain("$11.03M");
    expect(text).toContain("$7.00M"); // the figure it corrects
    // Leverage both ways, because they are different numbers.
    expect(text).toContain("54.1%");
    expect(text).toContain("65.0%");
    expect(text).toContain("20.2%");
    // Closing is 2% of the PRICE, not of a total that includes itself.
    expect(text).toContain("$400,000");
    expect(text).toContain("$130,000");
  });

  it("draws both sides as bars of the same length", () => {
    // Five use segments (price, capital, closing, fee, reserves) and two
    // source segments (debt, equity) — seven in all. Both bars run the full
    // width, which is what "the sides balance" looks like.
    expect((html.match(/data-bar="stack"/g) ?? []).length).toBe(7);
    expect(text).toContain("Purchase price");
    expect(text).toContain("Loan fee");
    expect(text).toContain("Equity");
  });

  it("reads a pasted unit mix and weights it by units", () => {
    // 144 units: 24 studios, 60 ones, 48 twos, 12 threes. The weighted
    // average rent is $1,858 — the average of the four ROW rents is $1,961,
    // which is the number you get by averaging what you can see.
    expect(text).toContain("Read the unit mix");
    expect(text).toContain("144");
    expect(text).toContain("$1,858");
    expect(text).not.toContain("$1,961");
    // GPR both ways, and the gap between them.
    expect(text).toContain("$3.21M");
    expect(text).toContain("$3.48M");
    expect(text).toContain("$272,160");
    expect(text).toContain("7.8%");
    // Rent per foot needs the SF column, which this table has.
    expect(text).toContain("841");
    expect(text).toContain("$26.50");
  });

  it("draws a row per unit type, as wide as its share of the building", () => {
    expect(text).toContain("Studio");
    expect(text).toContain("1 Bed / 1 Bath");
    expect((html.match(/data-bar="mix-row"/g) ?? []).length).toBe(4);
    // Nothing is missing from this table, so no caveat is printed.
    expect(text).not.toContain("no square footage stated");
  });

  it("turns acres into square feet, so nobody has to remember 43,560", () => {
    expect(text).toContain("The site, and what it carries");
    expect(text).toContain("2.5 acres");
    expect(text).toContain("108,900 SF");
    expect(text).toContain("One acre is 43,560 square feet");
  });

  it("draws the built floor area inside what the zoning allows", () => {
    // 165,000 SF on 108,900 of land is 1.52 FAR against a 1.75 limit —
    // 25,575 SF of the site never built. The bar is the gap.
    expect(text).toContain("Built at 1.52 FAR");
    expect(text).toContain("of an allowed 1.75");
    expect(text).toContain("25,575 SF unbuilt");
    expect((html.match(/data-bar="far"/g) ?? []).length).toBe(1);
  });

  it("counts density, land per unit and parking both ways", () => {
    // 180 units on 2.5 acres is 72/acre; 270 spaces is 1.50 per unit and
    // 1.64 per 1,000 SF — the residential and commercial conventions, which
    // are different numbers for the same car park.
    expect(text).toContain("72.0");
    expect(text).toContain("605");
    expect(text).toContain("917 SF");
    expect(text).toContain("1.50");
    expect(text).toContain("1.64");
  });

  it("takes the land out before it depreciates anything", () => {
    // $20M at 25% land is $15M of basis, and $545,455 a year off a 27.5-year
    // schedule turns $1.2M of NOI into a loss.
    expect(text).toContain("Depreciation, and what the sale takes back");
    expect(text).toContain("Land is never depreciable");
    expect(text).toContain("$15.00M");
    expect(text).toContain("$545,455");
    expect(text).toContain("a $190,455 paper loss");
    // The sign belongs in the words, never in front of the dollar sign.
    expect(text).not.toContain("$-190,455");
  });

  it("splits the gain at the sale into the rates it is actually taxed at", () => {
    expect(text).toContain("$11.45M");
    expect(text).toContain("Unrecaptured 1250");
    expect(text).toContain("$5.45M");
    expect(text).toContain("Capital gain");
    expect(text).toContain("$6.00M");
    // No cost segregation on the seed, so there is no 1245 slice.
    expect((html.match(/data-bar="gain-slice"/g) ?? []).length).toBe(2);
  });

  it("names the error it exists to prevent", () => {
    // $11.45M at 20% says $2.29M. The bill is $2.56M.
    expect(text).toContain("Running the whole gain at the capital gains rate would say $2.29M");
    expect(text).toContain("$2.56M");
  });

  it("says what the shelter was worth and what the sale took back", () => {
    expect(text).toContain("$2.02M");
    expect(text).toContain("$1.36M");
    expect(text).toContain("$654,545");
    expect(text).toContain("shelter and recapture at the same rate and it nets");
  });

  it("says plainly that it is not tax advice", () => {
    expect(text).toContain("federal only");
    expect(text).toContain("Not tax advice");
  });

  it("settles the closing statement, and says which way each line moves", () => {
    // A 15 April close on a calendar-year bill: 105 of 365 days to the
    // seller, so $69,041 of a $240,000 bill; half of April's $150,000 rent;
    // the deposits whole; the escrow off the wire.
    expect(text).toContain("Who owes whom at closing");
    expect(text).toContain("$69,041");
    expect(text).toContain("105 of 365 days the seller owned");
    expect(text).toContain("15 of 30 days the buyer owns the building");
    expect(text).toContain("$736,041"); // the net credit
    expect(text).toContain("$19.26M"); // …so this is the wire
    expect(text).toContain("105 / 260");
  });

  it("draws each credit on the side the money moves to", () => {
    // The point of the picture: reading arrears as advance does not change a
    // number, it flips a bar. Four lines on the seed, every one to the
    // buyer, so every bar is on the brand side of the centre.
    const bars = html.match(/data-bar="proration"[^>]*/g) ?? [];
    expect(bars.length, "one bar per statement line").toBe(4);
    expect(bars.filter((b) => b.includes("bg-brand")).length).toBe(4);
    expect(bars.filter((b) => b.includes("bg-caution")).length).toBe(0);
    // …and the direction is named in words as well as drawn.
    expect(text).toContain("To the seller");
    expect(text).toContain("To the buyer");
    expect(text).toContain("misses by the sum of the two figures, not the difference");
  });

  it("never lets the tenants' deposits read as the seller's money", () => {
    expect(text).toContain("Security deposits");
    expect(text).toContain("the buyer inherits the obligation to return it");
  });

  it("shows an exchange that passes the price test and still owes tax", () => {
    // The seeded deal is the trap, on first load: $26M sold and $30M bought
    // with MORE debt, so the price test passes comfortably — and $1.22M of
    // proceeds stayed in the seller's pocket, which no amount of fresh
    // borrowing cures.
    expect(text).toContain("Roll it into the next deal");
    expect(text).toContain("$30.00M of $25.22M"); // trade up: met
    expect(text).toContain("$12.00M of $13.22M"); // reinvest the equity: not
    expect(text).toContain("$18.00M of $12.00M"); // replace the debt: met
    expect(text).toContain("Short by $1,220,000");
    expect(text).toContain("STILL boot");
    expect(text).toContain("$305,000"); // the bill on the boot
    expect(text).toContain("$2.11M"); // what the exchange deferred
  });

  it("draws the three tests, failing the one that causes the boot", () => {
    const bars = html.match(/data-bar="exchange-test"[^>]*/g) ?? [];
    expect(bars.length, "one bar per test").toBe(3);
    expect(bars.filter((b) => b.includes("bg-pass")).length).toBe(2);
    expect(bars.filter((b) => b.includes("bg-kill")).length).toBe(1);
    // The gain splits into what rolls forward and what is taxed now.
    expect((html.match(/data-bar="gain-split"/g) ?? []).length).toBe(2);
  });

  it("says the deferred gain is still there, in the replacement's basis", () => {
    // $30M of property carrying a $20.5M basis. A card that stopped at "tax
    // deferred" would read as a saving, which is the thing it must not do.
    expect(text).toContain("Deferred is not forgiven");
    expect(text).toContain("$20.50M");
    expect(text).toContain("$9.50M"); // rolled into the replacement
  });

  it("reconciles the expenses, and grosses BOTH years up", () => {
    // The seeded building: 100,000 SF, a 12,000 SF tenant, a base year
    // struck at 72% occupancy. Gross-up adds $287,500 to the base and
    // $12,553 to this year, which is the whole point of the picture.
    expect(text).toContain("What the tenant actually owes");
    expect(text).toContain("$1.83M"); // the grossed-up base
    expect(text).toContain("$1.91M"); // the grossed-up current year
    expect(text).toContain("72% full");
    expect(text).toContain("94% full");
    expect(text).toContain("12.00%"); // the pro rata share
  });

  it("prices the one-sided gross-up rather than warning about it", () => {
    expect(text).toContain("leave the base year alone");
    expect(text).toContain("$10,206"); // both years grossed up
    expect(text).toContain("$38,623"); // only this year
    expect(text).toContain("$28,417"); // the difference, in the sentence
    const bars = html.match(/data-bar="one-sided"[^>]*/g) ?? [];
    expect(bars.length, "the honest share against the one-sided one").toBe(2);
    expect(bars.filter((b) => b.includes("bg-kill")).length).toBe(1);
  });

  it("answers in the direction the money moves, not as a total", () => {
    // $10,206 of share against $30,000 of estimates is a REFUND, and the
    // card says so in those words rather than leaving a reader to subtract.
    expect(text).toContain("the tenant is owed");
    expect(text).toContain("$19,794");
  });

  it("draws each year as fixed, variable and the gross-up on top", () => {
    const years = html.match(/data-bar="recovery-year"/g) ?? [];
    expect(years.length, "fixed and variable, both years").toBe(4);
    const adj = html.match(/data-bar="recovery-grossup"/g) ?? [];
    expect(adj.length, "one gross-up segment per year").toBe(2);
  });

  it("lets the loan schedule leave the page as numbers", () => {
    // The one table here a reader most often wants OUT of the page — into
    // a model, a lender's file, a memo. Two Copy-as-table buttons now: the
    // cash flow's and this one.
    const copies = (text.match(/Copy as table/g) ?? []).length;
    expect(copies, "the cash flow's and the loan schedule's").toBe(2);
  });

  it("shows a percentage-rent year that owes nothing and still collects", () => {
    // $120,000 at 6% is a $2M natural breakpoint, a twelfth of which is
    // $166,667. The seeded year lands at $1.92M — under the breakpoint, so
    // nothing is owed — and November and December each clear the monthly
    // line, which a monthly bill with no true-up keeps.
    expect(text).toContain("Percentage rent, and the breakpoint");
    expect(text).toContain("$2.00M"); // the natural breakpoint
    expect(text).toContain("$166,667"); // a twelfth of it
    expect(text).toContain("$1.92M"); // the year's sales
    expect(text).toContain("$22,300"); // what a monthly regime collects
    expect(text).toContain("2 months over");
    expect(text).toContain("that the year's sales do not support");
  });

  it("shows the cap the buyer actually gets after the assessor catches up", () => {
    // The seeded building: $25M, a $14M assessment the seller has had for
    // years, 1.5% — so the bill goes $210,000 to $375,000 and the 6% on
    // the cover is 5.34% to the buyer.
    expect(text).toContain("What the taxes become when you own it");
    expect(text).toContain("$375,000"); // the bill after closing
    expect(text).toContain("$265,000"); // year one, a third of the way in
    expect(text).toContain("$165,000"); // what it adds to the expense line
    expect(text).toContain("5.34%"); // the cap the buyer gets
    expect(text).toContain("$22.80M"); // where the 6.00% is actually true
    expect(text).toContain("$2.20M"); // what that is worth in negotiation
  });

  it("names the growth rate a price is quietly assuming", () => {
    // $25M for $1.5M is a 6.00% cap. Held five years and sold at 6.25%
    // with 2% of sale cost, a 12% UNLEVERED return needs 7.16% growth —
    // 4.16 points past the 3% the reader called ordinary, so "heroic".
    expect(text).toContain("What you would have to believe");
    expect(text).toContain("7.16%"); // the growth required
    expect(text).toContain("heroic");
    expect(text).toContain("5.01%"); // the exit cap at ordinary growth
    expect(text).toContain("This return is unlevered");
  });

  it("draws the growth pair and the exit-cap pair", () => {
    expect((html.match(/data-bar="growth"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="exit"/g) ?? []).length).toBe(2);
  });

  it("draws the stack bottom to top and names every layer", () => {
    expect(text).toContain("What each layer costs, and whether it earns its place");
    // One segment per layer, common equity included — the plug is part of
    // the picture, not the space left over from it.
    expect((html.match(/data-bar="layer"/g) ?? []).length).toBe(4);
    expect(text).toContain("Senior loan");
    expect(text).toContain("Mezzanine");
    expect(text).toContain("Preferred (accruing)");
    expect(text).toContain("Common equity");
    expect(text).toContain("$22.00M"); // the plug: 100 less 60, 10 and 8
  });

  it("passes the blend and still marks the layers that are over the line", () => {
    // The card's whole argument. A 6.13% blended cost against a 6.5%
    // yield on cost reads fine, and both layers above the senior cost
    // more than the building earns.
    expect(text).toContain("6.13%");
    expect(text).toContain("The line is the 6.50% yield on cost.");
    expect(text).toContain("The blend is hiding it");
    const rates = html.match(/data-bar="rate"[^>]*/g) ?? [];
    expect(rates.length, "three layers plus the blend").toBe(4);
    expect(rates.filter((b) => b.includes("bg-kill")).length, "mezz and pref").toBe(2);
    expect(rates.filter((b) => b.includes("bg-brand")).length, "senior and blend").toBe(2);
  });

  it("shows the ratio rising while the cash falls", () => {
    // Rule 3: the accruing preferred takes no cash, so cash-on-cash goes
    // UP as the equity base shrinks. Both figures are drawn so the rise
    // can be seen for what it is.
    expect(text).toContain("7.89%"); // cash-on-cash with the full stack
    expect(text).toContain("6.59%"); // the senior alone would give
    expect(text).toContain("The ratio is not the test here");
    // And the balloon it is hiding.
    expect(text).toContain("$13.48M"); // owed at the sale
    expect(text).toContain("$5.48M"); // of which accrual
    expect(text).toContain("$1.08M"); // the compounding alone
  });

  it("separates the three coverage ratios", () => {
    expect(text).toContain("1.68×"); // the senior's own
    expect(text).toContain("1.36×"); // once the mezzanine is counted
    expect(text).toContain("decides who can take the property");
  });

  it("files the jump index into named clusters", () => {
    // Twenty-six chips in a row is a wall; six clusters is a directory.
    for (const g of TOOL_GROUPS) expect(text, g).toContain(g);
    // And the links are all still there — grouping must not lose one.
    const linked = new Set(
      [...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    expect(linked.size).toBe(TOOL_INDEX.length);
  });

  it("puts the bridge loan's cap on the wrong side of its covenant", () => {
    // The seeded loan is the case the card exists for: a 4.00% strike that
    // looks like it is right there, 8 bps above the point at which the loan
    // breaks its own covenant.
    expect(text).toContain("The bridge loan, and whether its cap protects anything");
    expect(text).toContain("The cap is on the wrong side of the covenant.");
    expect(text).toContain("Covenant breaks 3.92%");
    expect(text).toContain("Cap strike 4.00%");
    expect(text).toContain("6.64%"); // SOFR + 300 today
    expect(text).toContain("1.25x"); // DSCR today, comfortably over the 1.20
    expect(text).toContain("1.19x"); // and under it at the strike
    expect(text).toContain("75 bps"); // the premium said as a rate
    // Today, the breach and the strike on one track, plus the fill.
    expect((html.match(/data-bar="float"/g) ?? []).length).toBe(4);
  });

  it("runs the construction draw rather than approximating it", () => {
    // The card exists to price the gap between the schedule and the
    // constant lib/construction-debt.ts assumes.
    expect(text).toContain("The interest reserve, run month by month");
    expect(text).toContain("$1.36M"); // the schedule's reserve
    expect(text).toContain("$1.91M"); // the average-balance shortcut
    expect(text).toContain("$3.46M"); // as if drawn at closing
    expect(text).toContain("42% of loan"); // measured, not the assumed 55%
    expect(text).toContain("Month 7"); // equity funds the first seven
    expect(text).toContain("Equity funds the first 7 of 24 months");
    // One bar a month, closing through completion, plus the three reserves.
    expect((html.match(/data-bar="draw"/g) ?? []).length).toBe(25);
    expect((html.match(/data-bar="reserve"/g) ?? []).length).toBe(3);
  });

  it("names the direction the shortcut errs in, which is why it hides", () => {
    expect(text).toContain("reads as prudence rather than as a mistake");
  });

  it("says the premium is a quote and not something it worked out", () => {
    expect(text).toContain("never a number this works out");
    expect(text).toContain("use funded at closing");
  });

  it("keeps the 10-year out of the prepayment card and says why", () => {
    // The strip above carries today's 10-year. The clause here wants the
    // Treasury matched to the remaining term, so the card is seeded with
    // its worked example and the note names the direction of the error.
    expect(html).toContain('value="4.75"');
    expect(text).toContain("matched to the REMAINING term");
    expect(text).toContain("understates what getting out costs");
  });

  it("draws the two ways out, one of them a gain", () => {
    expect(text).toContain("What it costs to get out of the loan early");
    expect(text).toContain("$200,000"); // yield maintenance, all of it the floor
    // The sign goes outside the dollar, which it did not before this
    // card made a negative headline figure impossible to miss.
    expect(text).toContain("-$385,213"); // defeasance, a gain after hard costs
    expect(text).not.toContain("$-");
    expect(text).toContain("Yield maintenance — all of it the floor");
    // Two rows, each a left and a right half of the same centre line.
    expect((html.match(/data-bar="prepay"/g) ?? []).length).toBe(4);
  });

  it("names the cheaper route and what the debt is worth to a buyer", () => {
    expect(text).toContain("defeasance");
    expect(text).toContain("$1.24M"); // below market, to a buyer assuming it
    expect(text).toContain("the lender loses nothing by being repaid");
    expect(text).toContain("Both are worth having; only one can be had");
  });

  it("draws the honest answer against the spread everyone starts from", () => {
    expect(text).toContain("What a below-market lease is worth to end");
    expect(text).toContain("$2.93M"); // the spread over the term
    expect(text).toContain("$1.50M"); // what ending the lease is worth
    expect(text).toContain("$14.00 / SF"); // under market by
    expect(text).toContain("$560,000"); // a year across the space
    // Two rows, each drawn from the centre line as a left and a right
    // half, so a negative answer has somewhere to go.
    expect((html.match(/data-bar="buyout"/g) ?? []).length).toBe(4);
  });

  it("draws the bargain, and marks the tenant's floor when there is no deal", () => {
    expect(text).toContain("$3.18M"); // least the tenant should take
    expect(text).toContain("no deal on these terms");
    const sides = html.match(/data-bar="side"[^>]*/g) ?? [];
    expect(sides.length, "the ceiling and the floor").toBe(2);
    expect(sides.filter((b) => b.includes("bg-kill")).length, "the floor is out of reach").toBe(1);
  });

  it("prices a leasehold over its term rather than as a perpetuity", () => {
    // $8M NOI less $2M ground rent is $6M, which at a 5% fee-simple cap
    // looks like $120M. Over the 40 years the lease actually has, at 8%,
    // it is $97.5M — and 18.7% of the perpetual figure is a reversion
    // the fee owner keeps.
    expect(text).toContain("A building on someone else's land");
    expect(text).toContain("$120.00M"); // capitalised as though forever
    expect(text).toContain("$97.53M"); // worth over the term
    expect(text).toContain("4.00×"); // ground rent coverage today
    expect(text).toContain("2.22×"); // after the reset
  });

  it("draws the leasehold pair and the coverage pair", () => {
    expect((html.match(/data-bar="leasehold"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="coverage"/g) ?? []).length).toBe(2);
  });

  it("draws both caps and both prices, never one without the other", () => {
    // Each pair is the comparison the card exists to make; a single bar
    // is a figure with nothing to read it against.
    expect((html.match(/data-bar="cap"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="price"/g) ?? []).length).toBe(2);
  });

  it("draws the year against the line, and colours the months that clear it", () => {
    const months = html.match(/data-bar="month"[^>]*/g) ?? [];
    expect(months.length, "one bar per month pasted").toBe(12);
    expect(months.filter((b) => b.includes("bg-kill")).length, "Nov and Dec").toBe(2);
    expect(months.filter((b) => b.includes("bg-brand")).length).toBe(10);
    // And the two figures the card exists to contrast.
    expect((html.match(/data-bar="true-up"/g) ?? []).length).toBe(2);
  });

  it("says the occupancy cost, and the sales that would reach the ceiling", () => {
    expect(text).toContain("$178,000"); // base + recoveries, no percentage rent
    expect(text).toContain("9.27%");
    expect(text).toContain("$1.78M"); // sales at which the ratio is 10%
    expect(text).toContain("$40.00 a foot base");
    expect(text).toContain("$59.33 all in");
  });

  it("draws the clock, and shows the days a Q4 closing loses", () => {
    expect(text).toContain("both windows from the day you close");
    expect(text).toContain("2026-12-30"); // 45 days to identify
    expect(text).toContain("2027-04-15"); // the return's due date, not day 180
    expect(text).toContain("151 days");
    expect(text).toContain("29 days");
    expect(text).toContain("An extension restores the full 180 days");
    // Two segments of the window plus the part the due date takes off it.
    expect((html.match(/data-bar="clock"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="clock-lost"/g) ?? []).length).toBe(1);
  });

  it("solves for the land instead of judging a price", () => {
    // $4.2M at a 5.5% cap is a $76.36M building. Build it for $44.55M hard,
    // $9.80M soft and $3.76M of carry, take 15% on cost, and $8.29M is what
    // is left for the dirt.
    expect(text).toContain("What the land can be worth");
    expect(text).toContain("$76.36M");
    expect(text).toContain("$44.55M");
    expect(text).toContain("$9.80M");
    expect(text).toContain("$3.76M");
    expect(text).toContain("$8.29M");
    expect(text).toContain("$50.26");
    expect(text).toContain("$46,075");
  });

  it("draws the land as a segment of the finished value, five parts in all", () => {
    // Hard, soft, carry, profit, land — and they sum to the whole, which is
    // what makes the thin land segment read as the point rather than as a
    // gap in the picture.
    expect((html.match(/data-bar="residual"/g) ?? []).length).toBe(5);
  });

  it("names the binding test, and what the other one would have allowed", () => {
    expect(text).toContain("Binding test");
    expect(text).toContain("Profit on cost");
    expect(text).toContain("At 15% profit on cost the site is worth $8.29M");
    expect(text).toContain("6.25% yield on cost, $9.05M");
    expect(text).toContain("lower of two tests you have agreed to meet");
  });

  it("says what a quarter point and a 5% overrun do to it", () => {
    // $8.29M becomes $5.57M and $5.58M — about a third gone either way.
    expect(text).toContain("A quarter point wider on the exit cap takes it to $5.57M");
    expect(text).toContain("5% overrun on the build, to $5.58M");
    expect(text).toContain("a residual is a range and not a number");
  });

  it("splits the rentable foot into what you occupy and what you pay for", () => {
    expect(text).toContain("Rentable, usable, and the rent you actually pay");
    expect(text).toContain("Every 100 rentable feet is 87 you occupy");
    expect(text).toContain("13 of lobby, corridor and core");
    expect((html.match(/data-bar="load-usable"/g) ?? []).length).toBe(1);
    expect((html.match(/data-bar="load-common"/g) ?? []).length).toBe(1);
  });

  it("converts the quoted rent to the foot a tenant can furnish", () => {
    // A 15% load turns $38.00 per rentable foot into $43.70 per usable one.
    // The card also keeps the two figures people both call "the load
    // factor" side by side: 15.0% and 13.0% are the same building.
    expect(text).toContain("$38.00 per rentable foot");
    expect(text).toContain("$43.70 per foot you can furnish");
    expect(text).toContain("15.0%");
    expect(text).toContain("13.0%");
    expect(text).toContain("92.0%");
    expect(text).toContain("$291,333");
  });

  it("says the property's IRR is not anybody's IRR", () => {
    // One property, three answers: the deal makes 14.1%, the LP keeps 13.3%
    // and the GP takes 20.6%. That row IS the card — everything under it
    // explains where the gap went.
    expect(text).toContain("Who actually gets the return");
    expect(text).toContain("14.1%");
    expect(text).toContain("13.3%");
    expect(text).toContain("20.6%");
    expect(text).toContain("1.61x");
    expect(text).toContain("2.05x");
    // The promote, named as what the GP took above its share of the equity.
    expect(text).toContain("$400,565");
    expect(text).toContain("above its share of the equity");
    expect(text).toContain("0.8 pts");
  });

  it("draws every dollar back, split by tier", () => {
    // Three tiers reached on the seeded deal — the pref, 80/20 to 12%, and
    // 70/30 climbing toward 18% where the cash runs out.
    expect(text).toContain("Preferred return, 8%");
    expect(text).toContain("To 12% — 80/20");
    expect(text).toContain("To 18% — 70/30");
    // Each tier draws two segments, LP then GP.
    expect((html.match(/data-bar="tier-lp"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="tier-gp"/g) ?? []).length).toBe(3);
  });

  it("runs the loan over the hold and draws each year's split", () => {
    // $13M at 6.5% over 30 years, held 10: a $986,026 payment, and $11.02M
    // STILL OWED at the balloon. The point of the card is that a third of
    // the schedule has run and 85% of the loan is still there.
    expect(text).toContain("What the loan does");
    expect(text).toContain("$986,026");
    expect(text).toContain("$11.02M");
    expect(text).toContain("15.2% of the loan is repaid over the term");
    expect(text).toContain("80% of everything paid is interest");
    // …and the sentence that names amortisation as equity rather than cost.
    expect(text).toContain("Principal — equity, returned at sale");
    // One column per year of the term, each split into two segments.
    const cols = html.match(/w-full bg-brand(\/30)?"/g) ?? [];
    expect(cols.length, "ten years, two segments each").toBe(20);
  });

  it("holds the take-out against what is owed", () => {
    // The schedule's balloon feeds the refinance directly — nothing here is
    // retyped. $1.45M of NOI at a 6.5% exit cap is $22.31M of value, and
    // the DSCR test lends $14.17M of it against $11.02M owed.
    expect(text).toContain("Can the balloon be refinanced?");
    expect(text).toContain("Owed at the balloon");
    expect(text).toContain("New loan");
    expect(text).toContain("$22.31M");
    expect(text).toContain("$14.17M");
    expect(text).toContain("cash-out refinance");
    // Two bars, one per side of the comparison.
    expect((html.match(/data-bar="refi"/g) ?? []).length).toBe(2);
    // The binding test is named, as it is in the sizer.
    expect(text).toContain("Debt service coverage");
  });

  it("prices the window the memorandum chose, in dollars of value", () => {
    // #337. Fifteen months of a growing building whose last three months
    // are its peak season: T-3 annualized reads $1,720,000 against a T-12
    // of $1,582,000. That $138,000 at the stated 5.5% cap is $2,509,091 of
    // value riding on which window the cover page quoted — the figure the
    // card exists to print, and the one no memorandum ever does.
    expect(text).toContain("Which trailing window");
    expect(text).toContain("T-3 annualized");
    expect(text).toContain("$1,720,000");
    expect(text).toContain("$1,582,000");
    expect(text).toContain("$2,509,091");
    expect(text).toContain("Worth, at that cap");
  });

  it("separates the growth from the season rather than leaving both in one figure", () => {
    // The whole claim in one sentence: +8.7% against the full year, +3.6%
    // against the same three months a year earlier. The difference is the
    // season, and only a year-over-year read can see it.
    expect(text).toContain("the building is up 3.6%");
    expect(text).toContain("The rest is the season, not the trend.");
  });

  it("draws every window on one track against the full year", () => {
    // Four windows — T-12, T-6, T-3, T-1 — each a bar, so a short window
    // standing clear of the full year is visible before a figure is read.
    expect((html.match(/data-bar="window"/g) ?? []).length).toBe(4);
  });

  it("sets the cover page's occupancy against what the building banks", () => {
    // #338. 200 units at $1,850, 95% leased — and 87.3% of market rent
    // actually reaching the bank once loss to lease, concessions, three
    // non-revenue units and bad debt are off. Both figures are true; only
    // one is ever printed.
    expect(text).toContain("The doors against the dollars");
    expect(text).toContain("95.0%");
    expect(text).toContain("87.3%");
    expect(text).toContain("7.7 pts");
  });

  it("prices the naive underwrite — vacancy off the top and nothing else", () => {
    // 4.96% against an honest 4.30%: 66bp of cap, which at the cap this
    // NOI really supports is $7,950,698 of price.
    expect(text).toContain("4.96%");
    expect(text).toContain("4.30%");
    expect(text).toContain("$7,950,698");
    expect(text).toContain("Cap on doors alone");
  });

  it("draws the two occupancies and every line of the bridge", () => {
    // Two bars on one track for the pair, five deductions below it.
    expect((html.match(/data-bar="occ"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="egi"/g) ?? []).length).toBe(5);
    expect(text).toContain("$4,440,000");
  });

  it("says which bucket the largest part of the gap is in", () => {
    // Rule 3, and the two buckets carry opposite instructions.
    expect(text).toContain("Loss to lease is the largest part");
    expect(text).toContain("closes as leases roll");
  });

  it("answers when to sell with a year rather than a verdict", () => {
    // #339. A $34M building with $18.5M of debt: $14.82M of equity in it,
    // 14.1% on holding one more year, and the decay crosses a 12.5%
    // reinvestment rate in year five.
    expect(text).toContain("Hold it or sell it");
    expect(text).toContain("$14.82M");
    expect(text).toContain("14.1%");
    expect(text).toContain("Year 5");
    expect(text).toContain("clears the hurdle for 4 more years and falls under it in year 5");
  });

  it("draws the decay, which is the thing a lifetime IRR cannot show", () => {
    // Ten years, each a bar against the first, so the slope is the picture.
    expect((html.match(/data-bar="hold"/g) ?? []).length).toBe(10);
    expect(text).toContain("The return on holding, year by year");
  });

  it("prices the error of charging the cost of selling against the hold year", () => {
    // 18.8% against an honest 14.1%, which on a 12.5% hurdle reverses the
    // answer from "sell in five years" to "hold indefinitely".
    expect(text).toContain("18.8%");
    expect(text).toContain("You pay that cost whenever you sell");
  });

  it("separates the broker's NOI from the one you would own", () => {
    // #341. A $48M building at a stated 5.50% cap: the reserve and the
    // leasing capital are $308,800 a year, and the cap a lender would
    // underwrite is 4.86%.
    expect(text).toContain("What sits below the NOI line");
    expect(text).toContain("$2,640,000");
    expect(text).toContain("$2,331,200");
    expect(text).toContain("4.86%");
    expect(text).toContain("is 64bp of cap rate above the one a lender would underwrite");
  });

  it("says the omission as a price, and again as a bid", () => {
    // $5,614,545 of value, which is also $48M less the $42.39M at which the
    // real NOI earns the advertised cap — one number said two ways.
    expect(text).toContain("$5,614,545");
    expect(text).toContain("$42.39M");
  });

  it("draws the largest line as the range the assumption actually spans", () => {
    // Four bars for the two NOIs and the two cost lines, one mark on the
    // renewal range.
    expect((html.match(/data-bar="line"/g) ?? []).length).toBe(4);
    expect((html.match(/data-bar="renew"/g) ?? []).length).toBe(1);
    expect(text).toContain("$144,000");
    expect(text).toContain("$472,000");
    expect(text).toContain("And the largest line is a guess");
  });

  it("solves a price instead of judging one", () => {
    // #342. $1.65M of NOI, a 15% levered target, ordinary agency debt:
    // $25.54M, a 6.46% going-in cap — and the stream rebuilt at that price
    // returns 15.0%, which is the round trip through the Excel export's
    // own IRR.
    expect(text).toContain("What you can pay");
    expect(text).toContain("$25.54M");
    expect(text).toContain("6.46%");
    expect(text).toContain("Rebuilt, it returns");
    expect(text).toContain("15.0%");
  });

  it("names which lender test governs, and where it changes hands", () => {
    // Both halves computed: the binding test comes out of sizeLoan at the
    // solved price, and the crossing is solved from the coverage cap.
    expect(text).toContain(
      "Loan to value governs at this price. Above $26.77M the coverage tests take over instead.",
    );
    expect(text).toContain("the shortest one is the loan");
  });

  it("draws the three tests and the equity stream", () => {
    // One bar per lender test plus the price-against-crossing bar, and one
    // per year of the equity stream including year zero.
    expect((html.match(/data-bar="bid"/g) ?? []).length).toBe(4);
    expect((html.match(/data-bar="bidflow"/g) ?? []).length).toBe(6);
  });

  it("says the same building's lease term three different ways", () => {
    // #344, rules 1 and 2 on the seeded roll: 7.0 years by area, 5.1 by
    // rent, 4.3 to the break. Every step down is a figure the memorandum
    // did not print, and the middle one is the flattering one it did.
    expect(text).toContain("When the income rolls");
    expect(text).toContain("7 yrs");
    expect(text).toContain("5.1 yrs");
    expect(text).toContain("4.3 yrs");
    expect(text).toContain(
      "Break options give up 0.8 years of the quoted term, leaving 4.3.",
    );
  });

  it("prices the cliff year as capital rather than as rent", () => {
    // Rule 4. The cheque is larger than the income at risk, which is the
    // sentence the card exists to put on a page.
    expect(text).toContain("$1,530,000");
    expect(text).toContain("$1,292,000");
    expect(text).toContain("a cheque larger than the income at risk");
    expect(text).toContain("$5,040,000"); // over the whole hold
  });

  it("reads the roll against the building rather than against itself", () => {
    // 172,000 leased feet in a 200,000-foot building, and 89.2% of the
    // income rolling before a five-year sale.
    expect(text).toContain("86.0%");
    expect(text).toContain("89.2%");
    expect(text).toContain("Meridian Health pays");
  });

  it("draws the terms and the schedule", () => {
    // Three term bars, one row per year of the hold.
    expect((html.match(/data-bar="walt"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="roll"/g) ?? []).length).toBe(5);
  });

  it("puts the lease-up's worst month deep into a lease-up that is going well", () => {
    // #345, rule 4. Month 22 is the month the building FILLS — the leasing
    // capital is due at signing and the rent it buys is six months behind.
    expect(text).toContain("Filling an empty building");
    expect(text).toContain(
      "The worst month is 22, not month one: $6,200,437 of cash out before the building carries itself.",
    );
  });

  it("shows slippage costing money the reserve cannot see", () => {
    // Rule 1, the finding: the trough FALLS to $5,674,789 on a six-month
    // slip, while the position at a common date is $693,442 worse. The
    // sentence renders only when the trough moves that way, so its presence
    // is the claim.
    expect(text).toContain("$5,674,789");
    expect(text).toContain("The reserve is the wrong place to look for slippage");
    expect(text).toContain("Where the cash stands at month 36");
    expect(text).toContain("$4,158,892"); // six months slower
    expect(text).toContain("$3,828,910"); // 5% less rent, the smaller shock
  });

  it("draws the J-curve and the three positions", () => {
    // One bar a month over the sixty-month horizon, and one per shock.
    expect((html.match(/data-bar="leaseup"/g) ?? []).length).toBe(60);
    expect((html.match(/data-bar="slip"/g) ?? []).length).toBe(3);
  });

  it("says what a sale-leaseback's rent is really buying", () => {
    // #346, rules 1 and 2. The seller writes the lease, so $5.4M of the
    // $27M price is the lease rather than the building — and the rent
    // reverts at year 20 while the building does not, which is $3,973,557
    // a buyer capitalising the contract NOI has not priced at all.
    expect(text).toContain("The sale-leaseback");
    expect(text).toContain("$27,000,000");
    expect(text).toContain("$5,400,000");
    expect(text).toContain(
      "The rent reverts at year 20, and the building does not — which is $3,973,557 of the price, 14.7% of it.",
    );
  });

  it("sets the escalating rent against a coupon that never moves", () => {
    // Rule 4: 6.09 cents in year one against a 6.50% coupon, 8.87 by the
    // end, crossing in year five — and the loan sized through sizeLoan.
    expect(text).toContain("Rent per dollar raised, against the mortgage coupon");
    expect(text).toContain("6.09");
    expect(text).toContain("8.87");
    expect(text).toContain("The rent passes it in year 5 and never comes back under");
    expect(text).toContain("$12,816,579");
  });

  it("draws the three values and a bar a year", () => {
    expect((html.match(/data-bar="slb"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="coupon"/g) ?? []).length).toBe(20);
  });

  it("charges the insurance quote against the memorandum's own price", () => {
    // #347, rules 1 and 2. The memorandum carries the seller's expiring
    // $420,000; the quote is $780,000, which is 65bp of the advertised
    // 5.25% cap and $6,857,143 of price.
    expect(text).toContain("What insurance really costs");
    expect(text).toContain("$780,000");
    expect(text).toContain("65 bps");
    expect(text).toContain("$6,857,143");
  });

  it("says the named-storm deductible as years of income", () => {
    // Rule 3, and the figure the card exists to put on a page: $2,600,000
    // retained per event against $2,900,000 of annual NOI.
    expect(text).toContain(
      "One named-storm event retains 0.9 years of NOI before the policy pays anything.",
    );
    expect(text).toContain("The deductible against a year of income");
    expect(text).toContain("$2,600,000");
  });

  it("prices raising the deductible as a frequency", () => {
    // Rule 4: $160,000 a year against $2,600,000 more per event is a
    // break-even of once every 16.3 years.
    expect(text).toContain("$160,000");
    expect(text).toContain("16.3 years");
    expect((html.match(/data-bar="prem"/g) ?? []).length).toBe(2);
    expect((html.match(/data-bar="storm"/g) ?? []).length).toBe(2);
  });

  it("separates the property's return from the LP's, before and after fees", () => {
    // #349. Three answers about one property: 20.63% on the deck, 17.39%
    // to the LP once the promote is taken, 15.71% once the fees are too.
    expect(text).toContain("What the LP actually nets");
    expect(text).toContain("The LP, before fees");
    expect(text).toContain("20.63%");
    expect(text).toContain("17.39%");
    expect(text).toContain("15.71%");
  });

  it("says the acquisition fee against the cheque, not against the price", () => {
    // Rule 1. $450,000 is 1.5% of the $30,000,000 price and 4.11% of the
    // equity the LP actually wires — the figure no deck prints.
    expect(text).toContain("$450,000");
    expect(text).toContain("4.11%");
    expect(text).toContain("15.3%");
  });

  it("puts the asset management fee on both of its bases", () => {
    // Rule 2. One missing word in the term sheet is $110,250 a year.
    expect(text).toContain("$164,250");
    expect(text).toContain("$54,000");
    expect(text).toContain("$110,250");
  });

  it("draws the sponsor's take twice, as underwritten and 10% softer", () => {
    // Rule 4. The fee share moves 47.6% → 66.5% because the promote more
    // than halves while the fees fall by $40,000.
    expect(text).toContain("Exit 10% softer");
    expect(text).toContain("48% fee");
    expect(text).toContain("67% fee");
    // …and the note carries the unrounded pair, which is what moves.
    expect(text).toContain("66.5% of it is fees rather than promote");
    expect((html.match(/data-bar="feereturn"/g) ?? []).length).toBe(3);
    expect((html.match(/data-bar="sponsor"/g) ?? []).length).toBe(4);
  });

  it("draws every zoning cap and names the one that binds", () => {
    // #350, rule 1. Density 160, floor area 198, height 238, parking 140 —
    // the site is held by the cap nobody writes at the top of a pro forma.
    expect(text).toContain("What the site actually holds");
    expect(text).toContain("160 units");
    expect(text).toContain("198 units");
    expect(text).toContain("238 units");
    expect(text).toContain("140 units");
    expect(text).toContain("Parking binds");
    expect((html.match(/data-bar="envelope"/g) ?? []).length).toBe(4);
  });

  it("charges a unit its gross area, not its net", () => {
    // Rule 2: 900 SF at 82% is 1,098 SF of floor area ratio, so the code
    // allows 198 against the 242 a napkin claims.
    expect(text).toContain("1,098 SF");
    expect(text).toContain("44 units that are not there");
  });

  it("prices the density bonus against the bonus it would take to break even", () => {
    // Rule 4: +20% on a 15% set-aside clears the 6.4% crossing.
    expect(text).toContain("The density bonus, against what it costs");
    expect(text).toContain("168 units");
    expect(text).toContain("Break-even bonus");
    expect(text).toContain("6.4%");
    expect((html.match(/data-bar="setaside"/g) ?? []).length).toBe(2);
  });

  it("draws the statement against the cash, a year a side of the line", () => {
    // #351, rule 1. The gap reverses: +$381,688 in year 1 (the concession)
    // to −$133,367 in year 10, crossing in year 5.
    expect(text).toContain("What the statement reports, and what the building collects");
    expect(text).toContain("+$381,688");
    expect(text).toContain("−$133,367");
    expect(text).toContain("Year 5");
    expect((html.match(/data-bar="sline"/g) ?? []).length).toBe(10);
  });

  it("prices this year's gap and names the receivable it built", () => {
    // Rules 3 and 4: $42,488 at 6.5% is $653,662, and the cumulative gap
    // standing on the seller's books in year 2 is $424,177.
    expect(text).toContain("$653,662");
    expect(text).toContain("Deferred rent on the books");
    expect(text).toContain("$424,177");
  });

  it("draws the feasibility rent against the rent the market signs", () => {
    // #352, rules 1 and 2. A new building needs $42.08; the market pays
    // $38.00, so nothing competes for 3.5 years of growth — even though the
    // building being held cost 53.3% of replacement.
    expect(text).toContain("The rent a new building needs");
    expect(text).toContain("$42.08");
    expect(text).toContain("$38.00");
    expect(text).toContain("53.3%");
    expect(text).toContain("Years of growth away");
    expect((html.match(/data-bar="feas"/g) ?? []).length).toBe(2);
  });

  it("solves the cost side too, which is the half nobody models", () => {
    // Rule 4b: today's $38 already pencils at $263.37 of hard cost.
    expect(text).toContain("$263.37");
    expect(text).toContain("the cost side is the one nobody models");
  });

  it("splits the quoted renovation premium from the gap to a better building", () => {
    // #354, rule 2. $250 quoted is $150 of renovation and $100 of the
    // comparable simply being a different building — two segments on one
    // track, because a decomposition is not a figure.
    expect(text).toContain("The renovation program");
    expect(text).toContain("$150 renovation");
    expect(text).toContain("$100 a different building");
    expect((html.match(/data-bar="split"/g) ?? []).length).toBe(2);
  });

  it("corrects the memorandum's own return on cost, and paces the program", () => {
    // Rules 1 and 3: 20% becomes 13.4%, and turnover — not the crew, not
    // ambition — sets 70 doors a year over three years against the two the
    // page claims.
    expect(text).toContain("The page says");
    expect(text).toContain("20.0%");
    expect(text).toContain("13.4%");
    expect(text).toContain("turnover binds");
    expect(text).toContain("2.9 years against the 2 the page claims");
    expect((html.match(/data-bar="reno"/g) ?? []).length).toBe(3);
  });

  it("draws a hotel's penetration index apart into its two halves", () => {
    // #355, rule 2. A RevPAR index of 90 on a rate index of 108.8 — the
    // shortfall is rooms, and a revenue manager reading only the 90 would
    // cut rate, which is the one thing working.
    expect(text).toContain("What a hotel actually earns");
    expect(text).toContain("Against the competitive set, where 100 is fair share");
    expect(text).toContain("108.8");
    expect(text).toContain("82.7");
    expect(text).toContain("the whole shortfall is empty rooms");
    expect((html.match(/data-bar="revpar"/g) ?? []).length).toBe(3);
  });

  it("and sets the two RevPAR levers against each other at the same RevPAR", () => {
    // Rule 1: $126.17 reached either way, $489,657 of value apart — and
    // the crossing is solved rather than subtracted.
    expect(text).toContain("$126.17");
    expect(text).toContain("$489,657 of value at the stated cap");
    expect(text).toContain("$34.41");
    expect((html.match(/data-bar="lever"/g) ?? []).length).toBe(2);
  });

  it("sets both positions of a loan assumption against each other", () => {
    // #356, rule 1. The "cheap" loan is the LARGER cheque — $10.80M against
    // $8.42M — and only the two complete positions answer it.
    expect(text).toContain("Taking over the seller");
    expect(text).toContain("Coverage gained");
    expect(text).toContain("$10.80M");
    expect(text).toContain("$8.42M");
    expect(text).toContain("$2.38M");
    expect((html.match(/data-bar="assume"/g) ?? []).length).toBe(2);
  });

  it("and solves what the loan is worth in price", () => {
    // The headline: $934,223 of price, bisected rather than approximated.
    expect(text).toContain("The premium against the asking price");
    expect(text).toContain("$934,223");
    expect(text).toContain("A seller who does not ask for that hands it over");
    expect((html.match(/data-bar="premium"/g) ?? []).length).toBe(2);
  });

  it("draws a storage increase against the response it can take", () => {
    // #357, rule 1. A 10% increase breaks even at a 25.8% move-out against
    // the 5% assumed — 20.8 points of room, and $837,410 of value.
    expect(text).toContain("The rate increase, and the runway it spends");
    expect(text).toContain("The response the increase can take before it stops paying");
    expect(text).toContain("25.8%");
    expect(text).toContain("20.8 pts");
    expect(text).toContain("$837,410");
    expect((html.match(/data-bar="ecri"/g) ?? []).length).toBe(2);
  });

  it("and the runway each one spends, year by year", () => {
    // Rule 2: 25.8 → 20.7 over five years, because the gap it is traded
    // against widens from 29% to 48%.
    expect(text).toContain("Put through every year, the break-even falls");
    expect(text).toContain("20.7%");
    expect(text).toContain("48% gap");
    expect((html.match(/data-bar="runway"/g) ?? []).length).toBe(5);
  });

  it("charges the hotel's reserve against revenue and prices both caps", () => {
    // Rule 3: $281,065 of reserve turns a 9.25% cap into 8.00%.
    expect(text).toContain("struck on revenue, not on NOI");
    expect(text).toContain("$281,065");
    expect(text).toContain("9.25%");
  });

  it("puts a clock on the return on cost, which has none of its own", () => {
    // Rule 4: 63.7% sold at completion against 31.4% held to the stated
    // exit, because 90% of the value is the resale rather than the rent.
    expect(text).toContain("A return on cost has no clock in it");
    expect(text).toContain("63.7%");
    expect(text).toContain("31.4%");
  });

  it("files forty cards into eight clusters, none of them at the ceiling", () => {
    // #353. Two of the six clusters had reached the eight-card ceiling
    // catalog.test.ts enforces, so the next lease card and the next land
    // card could not be filed at all.
    for (const heading of [
      "Debt",
      "Equity & returns",
      "Leases",
      "Rent & recoveries",
      "The property",
      "Value",
      "Development",
      "Tax & closing",
    ]) {
      expect(text, `the index files ${heading}`).toContain(heading);
    }
  });
});

// ── today's rates, across the top of /tools ────────────────────────────────
//
// The page reads the table and hands the rows in, so this renders the strip
// on a fixture without a database: every series the cron writes, as the
// runner's Sep 21 dry run actually printed them (lib/live-rates.fixture.ts).
import { RatesStrip } from "@/app/rates-strip";
import { SERIES, readRates, type RateRow } from "@/lib/live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "@/lib/live-rates.fixture";

describe("the rates strip", () => {
  const rates = readRates(REAL_ROWS, FIXTURE_NOW);
  // The two the page actually seeds: SOFR into the floating-rate card, the
  // 2-year into the prepayment card (the tenor nearest its thirty months).
  const html = render(
    React.createElement(RatesStrip, { rates, seeds: ["SOFR", "DGS2"] }),
  );
  const text = visibleText(html);

  it("prints every series in its own unit, with its own observation date", () => {
    expect(rates).toHaveLength(SERIES.length);
    expect(text).toContain("4.94%"); // the 10-year
    expect(text).toContain("3.85%"); // SOFR
    expect(text).toContain("6.95%"); // the survey
    expect(text).toContain("77 bps"); // IG corporate: a spread, said as bps
    expect(text).toContain("3.4%"); // CPI y/y: a change, to one place
    expect(text).toContain("−5.7%"); // banks EASING on multifamily, signed
    expect(text).toContain("344k"); // starts, 5+ units: a count
    expect(text).toContain("10-yr Treasury as of Sep 17");
    expect(text).toContain("CRE delinquency as of Apr 1");
    expect(text).toContain("CPI y/y as of Aug 1");
  });

  it("draws the curve as a picture, today against the tenors, with its slope named", () => {
    expect((html.match(/data-curve/g) ?? []).length).toBe(1);
    expect(html).toContain('role="img"');
    expect(html).toContain("The Treasury curve as of Sep 17: 1-mo 3.97%, 3-mo 4.12%");
    expect(text).toContain("10-yr less 2-yr +27 bps");
    expect(text).toContain("a normal curve, long money dearer than short");
    // With one observation per tenor there is no week-ago line, and the
    // caption does not claim one.
    expect(text).toContain("Solid is today, as of Sep 17");
    expect(text).not.toContain("dashed a week earlier");
    // Every tenor's figure is written on the picture.
    for (const v of ["3.97", "4.67", "4.94", "5.32", "5.29"]) expect(html).toContain(`>${v}</text>`);
  });

  it("draws last week's curve once the history reaches back", () => {
    const rows: RateRow[] = [];
    for (const id of ["DGS1", "DGS2", "DGS5", "DGS10", "DGS30"]) {
      for (let i = 0; i <= 7; i++) {
        const d = new Date(Date.UTC(2026, 8, 17) - i * 86_400_000).toISOString().slice(0, 10);
        rows.push({ series_id: id, obs_date: d, value: 4 + i * 0.02 });
      }
    }
    const out = render(React.createElement(RatesStrip, { rates: readRates(rows, FIXTURE_NOW) }));
    expect(visibleText(out)).toContain("Solid is today, dashed a week earlier");
    expect(out).toContain('stroke-dasharray="3 3"');
    // And each tile now carries its recent path — the 2-year and the
    // 10-year have tiles under the picture; the other tenors are the
    // picture alone.
    expect((out.match(/data-spark/g) ?? []).length).toBe(2);
  });

  it("draws no curve under four fresh tenors, and says so", () => {
    const few = readRates(
      REAL_ROWS.filter((r) => ["DGS2", "DGS10", "SOFR"].includes(r.series_id)),
      FIXTURE_NOW,
    );
    const out = render(React.createElement(RatesStrip, { rates: few }));
    expect(out).not.toContain("data-curve");
    expect(visibleText(out)).toContain("Too few of the Treasury tenors");
  });

  it("draws the move since the observation before, signed", () => {
    // Asserted on the markup, because the space between the figure and its
    // unit is the thing worth checking: a number glued to a margin-spaced
    // span is one word to a screen reader.
    expect(html).toContain(">3</span> bps"); // the 10-year, down from 4.97
    expect(html).toContain(">21</span> bps"); // SOFR, up from 3.64
    expect(html).toContain("▲");
    expect(html).toContain("▼");
    // No path with one or two observations behind a figure.
    expect(html).not.toContain("data-spark");
  });

  it("folds the rest into groups whose summary already carries the figures", () => {
    for (const g of ["Credit spreads", "Mortgage &amp; bank lending", "Inflation &amp; cost", "Jobs &amp; output", "Supply &amp; vacancy"]) {
      expect(html).toContain(g);
    }
    expect((html.match(/<details/g) ?? []).length).toBe(5);
    expect(text).toContain("CPI y/y 3.4%");
    expect(text).toContain("Starts, 5+ units 344k");
    // The money market stands beside the curve, not in a fold.
    expect(text).toContain("Money market");
    expect(text).toContain("30-day avg SOFR");
  });

  it("links every figure back to FRED — a transform to the level's page", () => {
    for (const id of ["DGS10", "SOFR", "MORTGAGE30US", "DRCRELEXFACBS", "HOUST5F"]) {
      expect(html).toContain(`https://fred.stlouisfed.org/series/${id}"`);
    }
    expect(html).toContain("https://fred.stlouisfed.org/series/CPIAUCSL\"");
    expect(html).not.toContain("series/CPIAUCSL_YOY");
  });

  it("marks only what actually fills a field", () => {
    // The emphasis tracks the page, not the standing fact: SOFR and the
    // 2-year are seeded and marked; the 10-year and prime are contract
    // rates nothing on the page currently takes, so they are drawn like the
    // benchmarks.
    expect(text).toContain("2-yr and SOFR");
    expect(text).toContain("start fields below at today's figure");
    expect(text).toContain("never fills a box");
    expect(text).toContain("never as a level");
    expect((html.match(/border-brand/g) ?? []).length).toBe(2);
  });

  it("says nothing at all with an empty table", () => {
    // No strip rather than a stale one: the claim is about today. (The
    // render helper wraps in a provider, so the page chrome is what is
    // left — the strip itself is absent.)
    const none = render(React.createElement(RatesStrip, { rates: [] }));
    expect(none).not.toContain("Rates today");
    expect(none).not.toContain("fred.stlouisfed.org");
  });

  it("names a series that has stopped updating", () => {
    const stale = readRates(
      [{ series_id: "DGS10", obs_date: "2026-08-01", value: 4.2 }],
      FIXTURE_NOW,
    );
    const out = visibleText(render(React.createElement(RatesStrip, { rates: stale })));
    expect(out).toContain("not updating");
    // And it stops seeding, so nothing claims it fills a field.
    expect(out).not.toContain("starts a field");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "rates strip").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

// ── a metro's own figures, live from FRED, under the market brief ─────────
//
// The market page reads the metro's rows and hands them in, so this renders
// the panel on a fixture: the Washington MSA's newest figures as the runner's
// probes printed them, with a synthetic path behind the permits so the
// trailing year has twelve months to sum.
import { MetroLive } from "@/app/market/metro-live";
import { readMetroRates } from "@/lib/live-rates";

describe("a metro's own figures, live", () => {
  const permits: RateRow[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.UTC(2026, 6 - i, 1)).toISOString().slice(0, 10);
    // July 2026 is the real figure (1,844); the months behind it are a path.
    permits.push({ series_id: "WASH911BPPRIV", obs_date: d, value: i === 0 ? 1844 : 1500 + (i % 5) * 40 });
  }
  // The rent index arrives as the LEVEL (from the BLS, for Washington) and
  // the page derives the change: 420 in August 2026 against 400 a year
  // earlier is +5.0%.
  const rentIndex: RateRow[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
    rentIndex.push({ series_id: "CUURS35ASEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
  }
  const ROWS: RateRow[] = [
    { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
    { series_id: "WASH911URN", obs_date: "2026-06-01", value: 3.8 },
    { series_id: "WASH911NA_YOY", obs_date: "2026-08-01", value: 1.2 },
    { series_id: "MDPRIN5URN", obs_date: "2026-07-01", value: 4.7 },
    ...permits,
    ...rentIndex,
  ];
  const dc = render(
    React.createElement(MetroLive, {
      rates: readMetroRates("dc", ROWS, FIXTURE_NOW),
      metroId: "dc",
      metroName: "Washington DC",
    }),
  );
  const dcText = visibleText(dc);

  it("draws the metro's own figures with their dates and links", () => {
    expect(dcText).toContain("Live from FRED");
    expect(dcText).toContain("Washington MSA");
    expect(dcText).toContain("4.0%");
    expect(dcText).toContain("Unemployment as of Jul 1");
    expect(dcText).toContain("1.2%");
    expect(dc).toContain("https://fred.stlouisfed.org/series/WASH911URN\"");
    // The jobs figure links to the LEVEL's page, since the y/y is FRED's transform.
    expect(dc).toContain("https://fred.stlouisfed.org/series/WASH911NA\"");
    // Nothing borrowed, so no note about the metro area.
    expect(dcText).not.toContain("publishes nothing");
    // No house price index for Washington — the tile is absent, not stale.
    expect(dcText).not.toContain("House prices");
  });

  it("says a year of permits, against the year before, as units", () => {
    expect(dcText).toContain("Permits, 12 months");
    // 1,844 + eleven months of the path: the sum, with its thousands.
    const year = 1844 + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((a, i) => a + 1500 + (i % 5) * 40, 0);
    expect(dcText).toContain(`${year.toLocaleString("en-US")} units`);
    expect(dcText).toContain("on the year before");
    // The permits' path draws; unemployment has two observations, which is
    // a move and not yet a path, and the rent index derives two.
    expect((dc.match(/data-spark/g) ?? []).length).toBe(1);
  });

  it("draws the rent index as a change, credited to the BLS where FRED does not carry it", () => {
    expect(dcText).toContain("Rent CPI y/y");
    expect(dcText).toContain("5.0%");
    // Washington's comes from the BLS's own API, and the panel says so
    // three ways: the heading, the tile's link, and the note.
    expect(dcText).toContain("Live from FRED and the BLS");
    expect(dcText).toContain("Rent CPI y/y as of Aug 1 · BLS");
    expect(dc).toContain("https://data.bls.gov/timeseries/CUURS35ASEHA\"");
    expect(dcText).toContain("comes from the BLS directly");
    // And what the figure IS, against the asking rent above it.
    expect(dcText).toContain("what sitting tenants pay");
  });

  it("names the MSA on a suburb's borrowed tiles, and says so", () => {
    const pg = render(
      React.createElement(MetroLive, {
        rates: readMetroRates("pg_county", ROWS, FIXTURE_NOW),
        metroId: "pg_county",
        metroName: "Prince George's County MD",
      }),
    );
    const text = visibleText(pg);
    expect(text).toContain("4.7%"); // the county's own unemployment
    expect(text).toContain("Prince George's County · Washington MSA");
    expect(text).toContain("Permits, 12 months · Washington MSA");
    expect(text).toContain("Jobs y/y · Washington MSA");
    expect(text).toContain("Rent CPI y/y · Washington MSA");
    expect(text).toContain("Where FRED publishes nothing for Prince George's County MD itself");
  });

  it("renders nothing for a metro with no rows", () => {
    const none = render(
      React.createElement(MetroLive, { rates: [], metroId: "tulsa", metroName: "Tulsa" }),
    );
    expect(none).not.toContain("Live from FRED");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(dc), "metro panel").toEqual([]);
    expect(gluedWords(dcText)).toEqual([]);
  });
});

// ── the asking rent against the fair market rent ──────────────────────────
import { ZoriLine } from "@/app/market/zori-line";

describe("a metro's asking rent, against the FMR", () => {
  const z = {
    rent: 2412,
    yoyPct: 2.3,
    asOf: "2026-08-31",
    note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research.",
    shared: false,
  };
  const html = render(React.createElement(ZoriLine, { z, fmr2br: 2100 }));
  const text = visibleText(html);

  it("prints the asking rent, its change, its month and Zillow's credit", () => {
    expect(text).toContain("Asking rent, all homes");
    expect(text).toContain("$2,412");
    expect(text).toContain("2.3%");
    expect(text).toContain("on a year ago");
    expect(text).toContain("Aug 2026");
    expect(text).toContain("Data: Zillow Research");
    expect(html).toContain("https://www.zillow.com/research/data/");
  });

  it("draws the asking rent against the 2BR fair market rent on one scale, and says the gap", () => {
    expect((html.match(/data-bar="zori"/g) ?? []).length).toBe(2);
    expect(text).toContain("HUD 2BR");
    // (2412 − 2100) / 2100 = 14.857…%
    expect(text).toContain("runs 14.9% above the fair market rent");
    expect(text).toContain("neither is the other");
  });

  it("says when the figure is the metro area's, shared with a suburb", () => {
    const out = visibleText(render(React.createElement(ZoriLine, { z: { ...z, shared: true }, fmr2br: null })));
    expect(out).toContain("shared across the MSA");
    // No FMR to draw against: no bars, no gap sentence.
    expect(out).not.toContain("HUD 2BR");
    expect(out).not.toContain("above the fair market rent");
  });

  it("renders nothing with no figure", () => {
    expect(render(React.createElement(ZoriLine, { z: null, fmr2br: 2100 }))).not.toContain("Asking rent");
  });

  it("reads clean and names everything", () => {
    expect(a11yIssues(html), "zori line").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
