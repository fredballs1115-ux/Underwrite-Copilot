// The sample deal as the signed-in sample deal's page reads it
// (app/(app)/deals/[id]/page.tsx, top to bottom), for /demo: the sections'
// data and the research panel's props, each through the deal page's own
// readers on the fixture. Pure but for the clock the caller hands in and the
// figures it has read (lib/model-vs-market-read, lib/debt-index-read), so a
// render test builds exactly what the page draws.

import { cache } from "react";
import type { DebtSeeds } from "@/lib/debt-index";
import type { TodayReads } from "@/lib/model-vs-market-read";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { actualsFromRows } from "@/lib/actuals/actuals-read";
import { buyBoxLines, findGoingInCap } from "@/lib/criteria";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { constructionSeedFor } from "@/lib/model-market";
import { screeningCompareModel } from "@/lib/underwrite/report-grid";
import { seedBenchmarks, seedRules } from "@/lib/research-data";
import { assessPlausibility, inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { isTenancyInCommon } from "@/lib/interest";
import { capSlotWithheld, modelReturnsRead } from "@/lib/compare-interest";
import { basisTag, shownAssetClass } from "@/lib/pipeline-slots";
import { rulesSizeText } from "@/lib/rent-regulation";
import { readValueAdd } from "@/lib/value-add";
import { modelReadsWithheld } from "@/lib/underwrite/report-grid";
import { metroDemand } from "@/lib/metro-demand";
import { marketPictureFor, pictureIsCheckedMarket, type MarketPicture } from "@/lib/market-picture";
import { sampleModelReads, samplePlacement, sampleStressTest } from "@/lib/sample-stress";
import type { ResearchPanelProps } from "@/app/(app)/deals/[id]/research-panel";
import type { RegulatoryRule, Benchmark } from "@/lib/research";
import type { MetroDemand } from "@/lib/metro-demand";
import type { StressTest } from "@/lib/stress-test-types";
import type { SampleFinancials, SampleOverview } from "@/app/landing-interactive";
import type { SampleBuyBoxData } from "@/app/sample-buy-box";
import type { DemoData } from "./sections";

export function sampleDemoData({
  today,
  reads,
  debt,
}: {
  /** the day the page is read, an ISO day */
  today: string;
  /** today's figures for the sample's market, null where the read failed */
  reads: TodayReads | null;
  /** today's debt indices (lib/debt-index-read) */
  debt: DebtSeeds;
}): {
  data: DemoData;
  research: ResearchPanelProps & { rules: RegulatoryRule[]; benchmarks: Benchmark[] };
} {
  const noon = new Date(`${today}T12:00:00Z`);
  const ex = SAMPLE_DEAL.extraction;
  const address = SAMPLE_DEAL.address;
  const strategy = inferStrategy(ex, null);
  const shownClass = shownAssetClass(SAMPLE_DEAL.asset_class, ex);
  const placement = samplePlacement();

  // The rent rules, the one derivation (lib/sample-derive: actuals
  // included, never seeded from today's rates, told the rules and the day)
  // and the model's assumptions against the published figures, off the deal
  // page's one read of today's figures — the same reads the stress test is
  // built on (lib/sample-stress).
  const { derived, modelVsMarket: modelRead } = sampleModelReads({ today, reads });
  const demand = reads && placement.live ? metroDemand(reads.rates, shownClass || null) : null;
  // The photograph the market check opens on, read as the deal page reads
  // it for the sample (page.tsx `marketPicture`): its address, the market
  // its memorandum names, the market it is placed in and its county. It is
  // the market whose figures the check read only where the check stored
  // them, which the sample's never did.
  const marketPicture = marketPictureFor(address, ex.market ?? null, placement.briefed ?? placement.read, placement.county);
  const marketPictureCheckReads = pictureIsCheckedMarket(marketPicture, SAMPLE_DEAL.market.liveBrief ?? null, placement.live);

  // The sample is never seeded (lib/model-market): its rate seeds are what
  // the readers answer for a sample, as the deal page asks them.
  const rateSeeds = {
    permanent: derived.meta.rateSeed ?? null,
    construction: constructionSeedFor(true, debt),
  };

  // The buy box, against the public sample's box (lib/buy-box-chip), read
  // as the deal page's header and its Buy box tab read it.
  const checkSource = dealCheckSource(ex, null, address);
  const boxRead = buyBoxRead(SAMPLE_DEAL.asset_class, checkSource, SAMPLE_DEMO_BOX);

  const data: DemoData = {
    extraction: ex,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    reconciliation: SAMPLE_DEAL.reconciliation,
    market: SAMPLE_DEAL.market,
    verdict: SAMPLE_DEAL.verdict,
    model: SAMPLE_DEAL.model,
    // The model card's read of what the price buys, as the deal page hands
    // it to its card (page.tsx `modelInterest`).
    modelInterest: modelReturnsRead(
      ex,
      { ...SAMPLE_DEAL.model.returns, holdYears: SAMPLE_DEAL.model.holdYears },
      noon,
    ),
    // The rent roll and the T-12 against the OM, through the deal page's one
    // reader (lib/actuals/actuals-read, which its actuals card, the report
    // and the memo read), on the deal's kind and its one class.
    actuals: actualsFromRows(ex, strategy, shownClass || null, SAMPLE_DEAL.rentRoll, SAMPLE_DEAL.t12) ?? {
      rentRoll: null,
      t12: null,
      noiComparison: null,
      noiNote: null,
      assetClass: shownClass || null,
    },
    buyBox: { checks: boxRead.checks, mandate: boxRead.mandate, scope: "personal", provisional: false, hasBox: true },
    boxLines: buyBoxLines(SAMPLE_DEMO_BOX, { exchange: false }),
    playground: {
      inputs: derived.inputs,
      dealAssetClass: SAMPLE_DEAL.asset_class,
      checkSource,
      box: SAMPLE_DEMO_BOX,
      strategy: derived.meta.strategy ?? null,
      sources: derived.sources,
      interest: modelReturnsRead(ex, screeningCompareModel(derived.inputs), noon),
      occupancyPct: derived.meta.occupancyPct ?? null,
      findings: assessPlausibility(ex, strategy),
      buildingPriced: !derived.meta.interest?.basisWithheld,
      priceLabel: derived.meta.priceLabel ?? null,
      sharePct: derived.meta.grossedUpSharePct ?? null,
      shareNoun: isTenancyInCommon(ex) ? "interest" : "share",
    },
    underwrite: derived.inputs,
    underwriteSources: derived.sources,
    rateSeeds,
    strategy,
    modelVsMarket: modelRead,
    demand,
    marketPicture,
    marketPictureCheckReads,
    // The OM's assumptions tested (lib/sample-stress): the same derivation,
    // the same read of today's figures, the sample's stored results — the
    // one build the homepage's walkthrough draws too.
    stressTest: sampleStressTest({ today, reads }),
    // The renovation program under the header, as the deal page draws it
    // on the sample (page.tsx `ValueAddPanel`): the memorandum's program,
    // and the derived model's exit cap and read wherever the model's reads
    // stand (`shown`, lib/underwrite/report-grid `modelReadsWithheld`).
    valueAdd: (() => {
      const shown = modelReadsWithheld(derived.inputs, derived.sources, isPlanDeal(strategy.kind)) ? null : derived;
      return {
        program: readValueAdd(ex),
        exitCapPct: shown ? shown.inputs.exitCapPct : null,
        modelLine: shown?.meta.valueAdd?.read ?? "",
      };
    })(),
  };

  // The research panel's props, read as the deal page reads them for its
  // `ResearchPanel`; its rows are the checked-in files, which is what a
  // visitor reads (lib/research-read: the tables are a signed-in reader's).
  const capWithheld = capSlotWithheld(ex);
  const summaryCap = isPlanDeal(strategy.kind) ? null : (findGoingInCap(ex.metrics)?.value ?? null);
  const yearBuiltRaw = ex.metrics.find((m) => /\byear built\b/i.test(m.label))?.value.match(/\d{4}/)?.[0];
  const yearBuiltNum = yearBuiltRaw ? Number(yearBuiltRaw) : null;
  const research = {
    address,
    placement,
    census: null,
    sizeText: rulesSizeText(ex, shownClass),
    basis: basisTag(ex, strategy.kind, SAMPLE_DEAL.asset_class),
    capText: capWithheld ? null : summaryCap,
    capWithheld,
    planLabel: isPlanDeal(strategy.kind) ? strategy.label : null,
    yearBuilt: yearBuiltNum != null && yearBuiltNum >= 1700 && yearBuiltNum <= 2100 ? yearBuiltNum : null,
    sectorFields: null,
    assetClass: shownClass || null,
    rateSeed: rateSeeds.permanent,
    tenYear: debt.tenYear,
    survey30: debt.survey30,
    rules: seedRules(),
    benchmarks: seedBenchmarks(),
  };

  return { data, research };
}

/**
 * `sampleDemoData`, built once a render for one day, one read of today's
 * figures and one set of debt indices (React's `cache`, keyed on the three
 * arguments as they are: the cached read hands every caller the same
 * object): the homepage's header chip and its walkthrough draw one build.
 */
export const sampleDemoDataOnce = cache((today: string, reads: TodayReads | null, debt: DebtSeeds) =>
  sampleDemoData({ today, reads, debt }),
);

/**
 * The homepage walkthrough's props, picked from /demo's own build: the two
 * pages draw the sample's tabs from one set of reads, never a second copy
 * (lib/sample-tabs.test.ts holds the homepage to it). Only what the
 * walkthrough draws past the sample's stored results, which its client module
 * carries already, so the page's payload holds no second copy of the deal.
 */
export function walkthroughData(data: DemoData): {
  buyBox: SampleBuyBoxData;
  financials: SampleFinancials;
  overview: SampleOverview;
  stressTest: StressTest | null;
  demand: MetroDemand | null;
  marketPicture: MarketPicture | null;
  marketPictureCheckReads: boolean;
} {
  return {
    buyBox: { panel: data.buyBox, lines: data.boxLines },
    financials: {
      underwrite: data.underwrite,
      underwriteSources: data.underwriteSources ?? null,
      rateSeeds: data.rateSeeds,
      strategy: data.strategy,
      modelVsMarket: data.modelVsMarket,
      modelInterest: data.modelInterest,
    },
    overview: { actuals: data.actuals, playground: data.playground },
    stressTest: data.stressTest,
    demand: data.demand,
    marketPicture: data.marketPicture,
    marketPictureCheckReads: data.marketPictureCheckReads,
  };
}
