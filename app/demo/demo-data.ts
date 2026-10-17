// The sample deal as the signed-in sample deal's page reads it
// (app/(app)/deals/[id]/page.tsx, top to bottom), for /demo: the sections'
// data and the research panel's props, each through the deal page's own
// readers on the fixture. Pure but for the clock the caller hands in and the
// figures it has read (lib/model-vs-market-read, lib/debt-index-read), so a
// render test builds exactly what the page draws.

import type { DebtSeeds } from "@/lib/debt-index";
import type { TodayReads } from "@/lib/model-vs-market-read";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buyBoxLines, findGoingInCap } from "@/lib/criteria";
import { buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { constructionSeedFor } from "@/lib/model-market";
import { screeningCompareModel } from "@/lib/underwrite/report-grid";
import { seedBenchmarks, seedRules } from "@/lib/research-data";
import { assessPlausibility, inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { isTenancyInCommon } from "@/lib/interest";
import { capSlotWithheld, modelReturnsRead } from "@/lib/compare-interest";
import { basisTag, shownAssetClass } from "@/lib/pipeline-slots";
import { regulationForDeal, rulesSizeText } from "@/lib/rent-regulation";
import { placeDeal } from "@/lib/market-county";
import { modelVsMarketFor } from "@/lib/model-vs-market";
import { metroDemand } from "@/lib/metro-demand";
import type { ResearchPanelProps } from "@/app/(app)/deals/[id]/research-panel";
import type { RegulatoryRule, Benchmark } from "@/lib/research";
import type { DemoData } from "./sections";

/** Where the sample is (lib/market-county), answered as the deal page
 *  answers it: the sample carries no site flags, so no county. */
export function samplePlacement() {
  return placeDeal(SAMPLE_DEAL.address, null);
}

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
  // One derivation with the demo workbook and the demo report
  // (lib/sample-derive): actuals included, never seeded from today's rates.
  const derived = sampleDerivedInputs();
  const placement = samplePlacement();

  // The model's assumptions against the published figures and the market
  // check's demand card, off the deal page's one read of today's figures.
  const regulation = regulationForDeal(
    { extraction: ex, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class },
    today,
  );
  const modelRead = reads
    ? modelVsMarketFor({
        derived,
        extraction: ex,
        firstSignal: null,
        storedAssetClass: SAMPLE_DEAL.asset_class,
        metro: placement.live,
        reads,
        regulation,
      })
    : null;
  const demand = reads && placement.live ? metroDemand(reads.rates, shownClass || null) : null;

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

  // The OM's NOI against the T-12, through the deal page's own picker.
  const omPick = pickOmNoi(ex.metrics, strategy.kind);
  const t12Noi = SAMPLE_DEAL.t12.summary.noi;

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
    actuals: {
      rentRoll: { asOf: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary },
      t12: { periodEnd: SAMPLE_DEAL.t12.period_end_date, summary: SAMPLE_DEAL.t12.summary },
      noiComparison:
        omPick && t12Noi != null && Number.isFinite(t12Noi) && t12Noi !== 0 ? compareNoi(omPick.noi, t12Noi, omPick) : null,
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
