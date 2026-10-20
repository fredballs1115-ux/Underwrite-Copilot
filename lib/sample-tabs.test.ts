import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { SAMPLE_DEAL } from "./sample-deal";
import { samplePlacement } from "./sample-stress";
import { sampleDerivedInputs } from "./sample-derive";
import { NO_DEBT_SEEDS } from "./debt-index";
import { marketPictureFor } from "./market-picture";
import { readAssumable } from "./assumable-debt";
import { readSellerFinancing } from "./seller-financing";
import { readLeaseholdExit } from "./leasehold-exit";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import type { TodayReads } from "./model-vs-market-read";
import { sampleDemoData, walkthroughData } from "@/app/demo/demo-data";
import { DemoSections } from "@/app/demo/sections";
import { DemoPanel, loadWalkthrough } from "@/app/landing-interactive";
import { MarketCheck } from "@/app/(app)/deals/[id]/deal-sections-view";
import { ModelVsMarketCard } from "@/app/(app)/deals/[id]/model-vs-market-card";

// The owner's rule: the homepage's walkthrough and /demo reflect the signed-in
// sample deal's page "to a T". /demo draws the deal page's sections from the
// deal page's own components (app/demo/sections.tsx); the homepage's
// walkthrough draws them again from its own module (app/landing-interactive,
// whose tabs past the call arrive in a chunk of their own). The two had
// drifted: the walkthrough's Overview drew the call alone, its Financials no
// read of the model against today's figures, and its market check no demand
// card, each of which /demo draws. This file holds each of the walkthrough's
// tabs to /demo's parts in /demo's order, and /demo's to the deal page's, and
// the two to one build of the data (app/demo/demo-data).

const src = (p: string) => readFileSync(p, "utf8");

/** A stretch of a source file, from `start` to `end`. */
function slice(file: string, start: string, end: string): string {
  const s = src(file);
  const from = s.indexOf(start);
  const to = s.indexOf(end, from + start.length);
  expect(from, `${file}: ${start}`).toBeGreaterThan(-1);
  expect(to, `${file}: ${end}`).toBeGreaterThan(from);
  return s.slice(from, to);
}

/** A function's body, its props' types left out. */
function drawn(file: string, fn: string): string {
  const fnText = slice(file, `function ${fn}(`, "\n}\n");
  const open = fnText.search(/\)\s*\{\n/);
  expect(open, fn).toBeGreaterThan(-1);
  return fnText.slice(open);
}

/** The components a stretch of source draws, in order; the walkthrough's
 *  `w.` (its chunk's parts) read as the part it names. A type's generic
 *  (`Record<AnalysisKey, …>`) is no element. */
const partsIn = (code: string) =>
  [...code.matchAll(/(?<![\w\])])<(?:w\.)?([A-Z][A-Za-z]+)(?=[\s/>])/g)].map((m) => m[1]);

/** What a walkthrough draws until its chunk lands: a shape, never a part. */
const loading = (c: string) => /Skeleton$/.test(c) || c === "TabLoading" || c === "PartLoading";

// What the deal page draws that the sample's public pages leave off, each
// with its reason.
const LEFT_OFF: Record<string, string> = {
  // A visitor has no account: none of these can be used without one.
  SinceLastScreen: "a re-screen's diff — the sample is never re-screened",
  ReconciliationPanel: "the reader's own model's discrepancies",
  MarketMemoryStrip: "the reader's own past screens",
  ActualsPrompt: "asks the reader to upload a rent roll and T-12; hidden on the sample",
  DealTasks: "the reader's tasks",
  AskPanel: "Ask, a question of the reader's own",
  DealOutcomeCard: "the reader's decision on the deal",
  DecisionLog: "the reader's notes and stage history",
  TrackRecordCard: "the reader's track record; nothing on the sample postdates its screen",
  Supplements: "the reader's own notes and files",
  AddData: "adding the reader's own data",
  InternalCompsBlock: "comps from the reader's own pipeline",
  ReconcileSection: "uploading the reader's own model — the sample holds no OM of the reader's",
  LoiPanel: "the letter of intent, never on the sample (deal-view `!isSample`)",
  // The screen's states the sample never reaches: it holds a finished
  // screen and runs none.
  EmptyState: "a screen not run, stopped or empty",
  RetryForm: "running the screen",
  // Interests the sample's memorandum does not offer: each card renders
  // nothing for it (held below).
  AssumableLoanCard: "a seller's loan or note, which the sample offers none of",
  LeaseholdExitCard: "a leasehold's exit, and the sample is fee simple",
};

/** The deal page's part, read as the sample's public pages draw it: the
 *  first-draft model card's body (app/sample-model-card, the deal page's
 *  ModelView's own ModelBody). The Buy box tab's SampleBuyBox is the deal
 *  page's own on the sample (held below). */
const AS_SAMPLE: Record<string, string> = { ModelView: "SampleModelCard" };

const DEAL_VIEW = "app/(app)/deals/[id]/deal-view.tsx";
const DEMO = "app/demo/sections.tsx";
const HOME = "app/landing-interactive.tsx";

/** The deal page's parts for a section, as the sample's public pages should draw them. */
const dealParts = (code: string) =>
  partsIn(code)
    .filter((c) => !loading(c) && !(c in LEFT_OFF))
    .map((c) => AS_SAMPLE[c] ?? c);

describe("each walkthrough tab draws /demo's parts, in /demo's order, and /demo the deal page's", () => {
  it("Overview: the guide, the call with the stress test, the actuals, the playground", () => {
    // By the section's JSX: deal-view also names the section in its handler
    // for the stress-test jump (`const onOverview = section === "overview"`).
    const deal = dealParts(slice(DEAL_VIEW, '{section === "overview" && (', '{section === "financials" && ('));
    const demo = partsIn(slice(DEMO, 'section === "overview"', 'section === "financials"'));
    const home = partsIn(drawn(HOME, "OverviewTab")).filter((c) => !loading(c));
    // The call and its stress test lead: nothing the deal holds of its own
    // — its actuals, a re-screen's diff, the documents' reconciliation —
    // opens above them (the first-run audit of 2026-10-20).
    expect(deal).toEqual(["SampleGuide", "OverviewView", "PropertyActuals", "SensitivityPlayground"]);
    // The parts the sample leaves off ride the slot under the stress test
    // (OverviewView's `afterStress`), never above the call.
    const all = partsIn(slice(DEAL_VIEW, '{section === "overview" && (', '{section === "financials" && ('));
    const slot = slice(DEAL_VIEW, "afterStress={", "<PropertyActuals data={actuals} />");
    for (const part of ["ActualsPrompt", "SinceLastScreen", "ReconciliationPanel"]) {
      expect(all.indexOf(part), part).toBeGreaterThan(all.indexOf("OverviewView"));
      expect(slot, part).toContain(`<${part}`);
    }
    expect(demo).toEqual(deal);
    expect(home).toEqual(demo);
  });

  it("Financials: the terms, the debt sizer, the model against today's figures, the model card", () => {
    const deal = dealParts(drawn(DEAL_VIEW, "FinancialsPanel"));
    const demo = partsIn(slice(DEMO, 'section === "financials"', 'section === "buybox"'));
    const home = partsIn(drawn(HOME, "FinancialsView")).filter((c) => !loading(c));
    expect(deal).toEqual(["TermsView", "DebtSizer", "ModelVsMarketCard", "SampleModelCard"]);
    expect(demo).toEqual(deal);
    expect(home).toEqual(demo);
    // The cards left off render nothing on the sample: its memorandum
    // offers no seller's loan or note and states no ground lease.
    const { inputs } = sampleDerivedInputs();
    expect(readAssumable(SAMPLE_DEAL.extraction, inputs)).toBeNull();
    expect(readSellerFinancing(SAMPLE_DEAL.extraction, inputs)).toBeNull();
    expect(readLeaseholdExit(SAMPLE_DEAL.extraction, inputs)).toBeNull();
    // The sample's model card is the deal page's ModelView's own body.
    expect(src("app/sample-model-card.tsx")).toContain("<ModelBody");
    expect(src("app/(app)/deals/[id]/model-view.tsx")).toContain("<ModelBody");
  });

  it("Buy box: the deal page's panel, captioned as the sample's example box", () => {
    // The deal page draws the public pages' own SampleBuyBox on the sample
    // (handed the demo box's lines), and the bare panel on a deal of the
    // reader's own.
    const dealCode = slice(DEAL_VIEW, 'section === "buybox"', 'section === "analyses"');
    expect(partsIn(dealCode)).toEqual(["SampleBuyBox", "BuyBoxPanel"]);
    expect(dealCode).toMatch(/sampleBoxLines \? <SampleBuyBox /);
    const deal = ["SampleBuyBox"];
    const demo = partsIn(slice(DEMO, 'section === "buybox"', 'section === "analyses"'));
    const home = partsIn(drawn(HOME, "BuyBoxTab")).filter((c) => !loading(c));
    expect(demo).toEqual(deal);
    expect(home).toEqual(demo);
    expect(src("app/sample-buy-box.tsx")).toContain("<BuyBoxPanel");
    // …judged against the demo box whoever reads it: the page, the memo, the
    // report and the workbook read the deal's box through one reader, which
    // answers SAMPLE_DEMO_BOX on a sample.
    const page = src("app/(app)/deals/[id]/page.tsx");
    expect(page).toContain("sampleBoxLines={isSampleDeal ? buyBoxLines(SAMPLE_DEMO_BOX, { exchange: false }) : null}");
    expect(src("app/demo/demo-data.ts")).toContain("boxLines: buyBoxLines(SAMPLE_DEMO_BOX, { exchange: false })");
    expect(src("lib/deal-buy-box.ts")).toContain("if (row.is_sample) return SAMPLE_DEMO_BOX;");
    for (const file of [
      "app/(app)/deals/[id]/page.tsx",
      "app/api/deals/[id]/memo/route.ts",
      "app/api/deals/[id]/report/route.ts",
      "app/api/deals/[id]/underwrite.xlsx/route.ts",
    ]) {
      const code = src(file);
      expect(code, file).toContain("buyBoxForDealRow({ ...ownership, is_sample:");
      expect(code, file).not.toContain("getBuyBoxForDeal(");
    }
  });

  it("Analyses and Documents: /demo draws the walkthrough's own panel, handed only what the walkthrough is handed", () => {
    for (const [section, tab] of [
      ["analyses", "Analyses"],
      ["documents", "Documents"],
    ] as const) {
      const code = slice(DEMO, `section === "${section}"`, section === "analyses" ? 'section === "documents"' : "\n}\n");
      expect(partsIn(code)).toEqual(["DemoPanel"]);
      expect(code).toContain(`tab="${tab}"`);
      // Every prop /demo hands the panel, the homepage's tabs hand it too.
      const demoProps = [...code.matchAll(/\b([a-z][A-Za-z]*)=\{/g)].map((m) => m[1]);
      const homeCall = slice(HOME, "<DemoPanel", "/>");
      for (const p of demoProps) expect(homeCall, p).toMatch(new RegExp(`\\b${p}=\\{`));
    }
  });

  it("Analyses: the deal page's pills and its five views", () => {
    const deal = dealParts(slice(DEAL_VIEW, "function AnalysesPanel(", "\nfunction DocumentsPanel("));
    const home = partsIn(drawn(HOME, "AnalysesView")).filter((c) => !loading(c));
    const views = ["BrokerComps", "ChallengerView", "MarketCheck", "Reconciliation", "VerdictView"];
    expect(new Set(deal)).toEqual(new Set(["AnalysisTabs", ...views]));
    expect(home[0]).toBe("AnalysisTabs");
    expect([...home].sort()).toEqual(["AnalysisTabs", ...views]);
    // The market check is handed what the deal page hands it on the sample:
    // everything but "since this screen", which compares the figures the
    // check stored, and the sample's stored none.
    const propsOf = (code: string) => [...code.matchAll(/\b([a-z][A-Za-z]*)=\{/g)].map((m) => m[1]);
    const dealProps = propsOf(slice(DEAL_VIEW, "<MarketCheck ", "/>"));
    const homeProps = propsOf(slice(HOME, "<w.MarketCheck", "/>"));
    expect(dealProps).toContain("since");
    expect(SAMPLE_DEAL.market.liveBrief ?? null).toBeNull();
    expect(homeProps.sort()).toEqual(dealProps.filter((p) => p !== "since").sort());
  });

  it("Documents: the deal page's source documents card", () => {
    const deal = dealParts(slice(DEAL_VIEW, 'section === "documents"', "\n/* ----"));
    expect(deal).toEqual(["DocumentsPanel"]);
    // The deal page's DocumentsPanel draws the card; past it, its picture
    // (DealAvatar, the signed-in picture route) and its actions are the
    // reader's.
    const panel = partsIn(drawn(DEAL_VIEW, "DocumentsPanel")).filter((c) => !(c in LEFT_OFF));
    expect(panel).toEqual(["SourceDocumentsView", "DealAvatar", "ReplaceOm", "ReplaceOm", "ManualDealForm"]);
    const home = partsIn(drawn(HOME, "DocumentsTab")).filter((c) => !loading(c));
    expect(home).toEqual(["SourceDocumentsView"]);
  });
});

// Today's figures for the sample's market (Philadelphia), in the shapes the
// deal page's read returns (lib/sample-stress.test.ts's, with the metro's
// payrolls beside them): what the model's read and the demand card read.
const ROWS: RateRow[] = [
  { series_id: "PHIL942URN", obs_date: "2026-07-01", value: 4.1 },
  { series_id: "RRVRNEQ156N", obs_date: "2026-04-01", value: 4.6 },
  { series_id: "HVS_RVR_37980", obs_date: "2026-04-01", value: 5.8 },
  { series_id: "HVS_RVR_37980_MOE", obs_date: "2026-04-01", value: 1.9 },
  { series_id: "PHIL942NA_YOY", obs_date: "2026-07-01", value: 0.3 },
  { series_id: "PHIL942PBSV_YOY", obs_date: "2026-07-01", value: 1.7 },
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

describe("the walkthrough draws /demo's build, part for part", () => {
  const { data } = sampleDemoData({ today: TODAY, reads: READS, debt: NO_DEBT_SEEDS });
  const props = walkthroughData(data);
  const home = (tab: string, analysis?: string) =>
    renderToStaticMarkup(React.createElement(DemoPanel, { ...props, tab: tab as never, analysis: analysis as never }));
  const demo = (initialSection: "overview" | "financials" | "analyses", initialAnalysis?: "market") =>
    renderToStaticMarkup(React.createElement(DemoSections, { data, initialSection, ...(initialAnalysis ? { initialAnalysis } : {}) }));
  beforeAll(() => loadWalkthrough());

  it("is handed the build's own reads, never a second copy", () => {
    expect(props.financials.modelVsMarket).toBe(data.modelVsMarket);
    expect(props.demand).toBe(data.demand);
    expect(props.stressTest).toBe(data.stressTest);
    expect(props.overview).toEqual({ actuals: data.actuals, playground: data.playground });
    expect(props.buyBox).toEqual({ panel: data.buyBox, lines: data.boxLines });
    expect(props.marketPicture).toBe(data.marketPicture);
    // The fixture reads both cards' figures.
    expect(data.modelVsMarket).not.toBeNull();
    expect(data.demand).not.toBeNull();
    // The homepage builds it so, and hands it whole to its tabs.
    const page = src("app/page.tsx");
    expect(page).toMatch(/const \{ data \} = sampleDemoDataOnce\(readerToday\(null\), reads, NO_DEBT_SEEDS\);/);
    expect(page).toContain("<DemoTabs {...walkthroughData(data)} />");
    // …and every prop the tabs take reaches their panel.
    const call = slice(HOME, "<DemoPanel", "/>");
    for (const p of Object.keys(props)) expect(call, p).toContain(`${p}={${p}}`);
  });

  /** Where each marker first appears in a render. */
  const order = (html: string, markers: string[]) => markers.map((m) => html.indexOf(m));

  it("Overview: the guide, the call and its stress test, the actuals, the playground, in /demo's order", () => {
    const markers = ["How to read this screen", 'data-qa="stress-test-panel"', "Risk digest", "Property actuals", 'data-qa="playground-model"'];
    for (const html of [home("Overview"), demo("overview")]) {
      const at = order(html, markers);
      expect(at.every((i) => i > -1), at.join()).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
    const html = home("Overview");
    expect(html).not.toContain('data-qa="walkthrough-part-loading"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("Financials: the model against today's figures between the debt sizer and the model card, as on /demo", () => {
    const card = renderToStaticMarkup(React.createElement(ModelVsMarketCard, { read: data.modelVsMarket }));
    expect(card).toContain('data-qa="model-vs-market"');
    const markers = ["Extracted terms", 'data-qa="debt-sizer"', 'data-qa="model-vs-market"', 'data-qa="workbook-note"'];
    for (const html of [home("Financials"), demo("financials")]) {
      expect(html).toContain(card);
      const at = order(html, markers);
      expect(at.every((i) => i > -1), at.join()).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
    const html = home("Financials");
    expect(html).toContain("The Overview’s sensitivity playground runs the workbook’s model, not this one.");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("leaves the model's read out where today's figures could not be read, never the tab", () => {
    const failed = walkthroughData(sampleDemoData({ today: TODAY, reads: null, debt: NO_DEBT_SEEDS }).data);
    expect(failed.financials.modelVsMarket).toBeNull();
    expect(failed.demand).toBeNull();
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { ...failed, tab: "Financials" }));
    expect(html).not.toContain('data-qa="model-vs-market"');
    expect(html).toContain('data-qa="debt-sizer"');
    const market = renderToStaticMarkup(React.createElement(DemoPanel, { ...failed, tab: "Analyses", analysis: "market" }));
    expect(market).not.toContain('data-qa="metro-demand"');
    expect(market).toContain("Market plausibility check");
  });

  it("Analyses: the market check opens on the market's photograph and carries the demand card, as the deal page draws them on the sample", () => {
    // The photograph the deal page reads for the sample (page.tsx
    // `marketPicture`), on its stored address.
    const placement = samplePlacement();
    expect(data.marketPicture).toEqual(
      marketPictureFor(SAMPLE_DEAL.address, SAMPLE_DEAL.extraction.market ?? null, placement.briefed ?? placement.read, placement.county),
    );
    expect(data.marketPicture).not.toBeNull();
    expect(src(DEAL_VIEW.replace("deal-view.tsx", "page.tsx"))).toContain(
      "marketPictureFor(dealAddress, extraction?.market ?? null, placement.briefed ?? placement.read, placement.county)",
    );
    const check = renderToStaticMarkup(
      React.createElement(MarketCheck, {
        result: SAMPLE_DEAL.market,
        demand: data.demand,
        picture: data.marketPicture,
        pictureCheckReads: data.marketPictureCheckReads,
      }),
    );
    for (const html of [home("Analyses", "market"), demo("analyses", "market")]) {
      expect(html).toContain(check);
      expect(html).toContain('data-qa="market-check-picture"');
      expect(html).toContain('data-qa="metro-demand"');
    }
    const html = home("Analyses", "market");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });
});

// Past the sections: what the deal page draws under its header and under its
// sections, held to /demo's and the homepage's. Each part the public pages
// leave off is named with its reason, and a part named as drawing nothing on
// the sample is read on the sample here, so the list cannot hide one.
const PAGE = "app/(app)/deals/[id]/page.tsx";
const DEMO_PAGE = "app/demo/page.tsx";
const HOME_PAGE = "app/page.tsx";

/** Header panels that read nothing on the sample: a fee-simple, stabilized,
 *  single-property apartment building sold by negotiation, with no listing
 *  team, reports, abatement or rent regime stated. */
const HEADER_NOTHING: Record<string, string> = {
  PlanStrip: "a stabilized building has no plan",
  InterestPanel: "a plain fee simple says nothing",
  PlausibilityPanel: "the sample's figures tie",
  SandwichPanel: "no master lease",
  SalePanel: "a negotiated sale",
  ForwardPanel: "no forward purchase",
  GoingConcernPanel: "no operating business",
  AffordablePanel: "no recorded restriction",
  RegulationPanel: "no rent regime reaches it",
  SingleTenantPanel: "an apartment building of many tenants",
  RosterPanel: "no business tenants",
  TaxAbatementPanel: "no abatement",
  HotelPanel: "not a hotel",
  StudentHousingPanel: "not student housing",
  ManufacturedHousingPanel: "not a park",
  SelfStoragePanel: "not storage",
  MixedUsePanel: "one income",
  CondoPanel: "no condominium units",
  SiteReportsPanel: "no third-party reports cited",
  ListingTeam: "the memorandum names no brokers and no call for offers",
  PlanSensitivity: "no plan, so no yield-on-cost grid",
};
/** Header parts that are the reader's, never the sample's. */
const HEADER_LEFT_OFF: Record<string, string> = {
  OlderScreenNote: "a screen stored before a read, never on the sample (lib/older-screen `isSample`)",
  RetryForm: "the re-screen control inside that note",
  BrokerEmailActions: "writing to the memorandum's brokers, never on the sample",
};
/** Under the sections: the reader's, each with its reason. */
const PAGE_LEFT_OFF: Record<string, string> = {
  DealStickyBar: "the page's kept-in-view bar, its chrome",
  DealStepKeys: "the [ and ] keys through the reader's own pipeline",
  PortfolioCard: "one property: the sample states no portfolio",
  SubmarketCard: "the reader's own submarkets",
  PublicCompsPanel:
    "recorded sales pulled around a reader's row behind the page; on the sample they are shown and never set against its invented price",
  SiteFlagsCard: "the flood zone, Opportunity Zone and tract looked up at a reader's row's point; the public pages make no lookup",
  SectorFieldsForm: "the reader's own answers to the class's facts",
};
/** The deal page's part, as the public pages draw it on the sample. */
const PAGE_AS_SAMPLE: Record<string, string> = {
  DealView: "DemoSections",
  PublicRecordCard: "SamplePublicRecord",
  ResearchPanel: "ResearchPanelView",
};

describe("the deal page's panels past its sections, as the public pages draw them on the sample", () => {
  it("under the header: the renovation program, and every other panel named with why it is left off", () => {
    const deal = partsIn(slice(PAGE, "{older ? (", "</DealHero>"));
    for (const name of [...Object.keys(HEADER_NOTHING), ...Object.keys(HEADER_LEFT_OFF)]) expect(deal, name).toContain(name);
    const drawnOnSample = deal.filter((c) => !(c in HEADER_NOTHING) && !(c in HEADER_LEFT_OFF));
    expect(drawnOnSample).toEqual(["ValueAddPanel"]);
    const demo = partsIn(slice(DEMO_PAGE, "<SampleDealHero", "</SampleDealHero>")).filter((c) => c !== "SampleDealHero");
    expect(demo).toEqual(drawnOnSample);
    const home = partsIn(drawn(HOME_PAGE, "SampleWalkthrough")).filter((c) => c !== "DemoTabs");
    expect(home).toEqual(drawnOnSample);
  });

  it("each panel named as reading nothing reads nothing on the sample", async () => {
    const ex = SAMPLE_DEAL.extraction;
    const noon = new Date(`${TODAY}T12:00:00Z`);
    const ds = await import("./deal-strategy");
    const strategy = ds.inferStrategy(ex, null);
    const plan = ds.planWithBasisChecked(ex, strategy, ds.planSummary(ex, strategy));
    expect(plan).toBeNull();
    const { PlanStrip, PlausibilityPanel } = await import("@/app/(app)/deals/[id]/plausibility-panel");
    const { InterestPanel } = await import("@/app/interest-panel");
    const { RegulationPanel } = await import("@/app/regulation-panel");
    const { ListingTeam } = await import("@/app/(app)/deals/[id]/listing-team");
    const { readInterest } = await import("./interest");
    const { regulationForDeal } = await import("./rent-regulation");
    const { listingTeamOf, offersDueOf } = await import("./offering");
    const html = (el: React.ReactElement) => renderToStaticMarkup(el);
    const regulation = regulationForDeal(
      { extraction: ex, address: SAMPLE_DEAL.address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class },
      TODAY,
    );
    const rendered: Record<string, string> = {
      PlanStrip: html(React.createElement(PlanStrip, { strategy, plan })),
      InterestPanel: html(React.createElement(InterestPanel, { interest: readInterest(ex, ds.askingPriceOf(ex), noon) })),
      PlausibilityPanel: html(React.createElement(PlausibilityPanel, { findings: ds.assessPlausibility(ex, strategy), strategy })),
      RegulationPanel: html(React.createElement(RegulationPanel, { regulation, today: TODAY, modelGrowthPct: 3, modelLine: "" })),
      ListingTeam: html(React.createElement(ListingTeam, { team: listingTeamOf(ex), offersDue: offersDueOf(ex) })),
    };
    for (const [name, out] of Object.entries(rendered)) expect(out, name).toBe("");
    // The rest draw nothing on a null read; each reader reads none.
    const readers: Record<string, () => Promise<unknown>> = {
      SandwichPanel: async () => (await import("./sandwich-lease")).readSandwichLease(ex, noon),
      SalePanel: async () => (await import("./sale-terms")).readSale(ex, noon),
      ForwardPanel: async () => (await import("./forward-purchase")).readForwardPurchase(ex, noon, strategy),
      GoingConcernPanel: async () => (await import("./going-concern")).readGoingConcern(ex, noon),
      AffordablePanel: async () => (await import("./affordable")).readAffordable(ex, noon),
      SingleTenantPanel: async () => (await import("./single-tenant")).readSingleTenant(ex, noon),
      RosterPanel: async () => (await import("./tenant-roster")).readRoster(ex, noon),
      TaxAbatementPanel: async () => (await import("./tax-abatement")).readTaxAbatement(ex, noon),
      HotelPanel: async () => (await import("./hotel-deal")).readHotelDeal(ex, noon),
      StudentHousingPanel: async () => (await import("./student-housing")).readStudentHousing(ex),
      ManufacturedHousingPanel: async () => (await import("./manufactured-housing")).readManufacturedHousing(ex),
      SelfStoragePanel: async () => (await import("./self-storage")).readSelfStorage(ex),
      MixedUsePanel: async () => (await import("./mixed-use")).readMixedUse(ex, noon),
      CondoPanel: async () => (await import("./condo")).readCondo(ex, noon),
      SiteReportsPanel: async () => (await import("./site-reports")).readSiteReports(ex, noon),
    };
    for (const [name, read] of Object.entries(readers)) expect(await read(), name).toBeNull();
    // PlanSensitivity draws only with a plan, held null above.
    expect(new Set([...Object.keys(rendered), ...Object.keys(readers), "PlanSensitivity"])).toEqual(new Set(Object.keys(HEADER_NOTHING)));
  });

  it("under the sections: /demo's, the deal page's less the reader's own, each named with its reason", async () => {
    const deal = partsIn(slice(PAGE, "</DealHero>", "Room at the foot"));
    for (const name of Object.keys(PAGE_LEFT_OFF)) expect(deal, name).toContain(name);
    const expected = deal.filter((c) => !(c in PAGE_LEFT_OFF)).map((c) => PAGE_AS_SAMPLE[c] ?? c);
    expect(expected).toEqual(["DemoSections", "SamplePublicRecord", "ResearchPanelView"]);
    const demo = partsIn(slice(DEMO_PAGE, "<DemoSections", "What comes after the screen"));
    expect(demo).toEqual(expected);
    // The sample states one property.
    const { readPortfolio } = await import("./portfolio");
    expect(readPortfolio(SAMPLE_DEAL.extraction)).toBeNull();
    // On the sample, its neighbourhood's recorded sales are never set against
    // its invented price.
    expect(slice(PAGE, "<PublicCompsPanel", "/>")).toContain("subject={isSampleDeal ? null : compsCallSubject}");
  });
});
