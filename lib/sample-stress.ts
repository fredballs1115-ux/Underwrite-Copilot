// The sample deal's stress test — ONE build for every public surface that
// draws it on the sample (/demo's Overview and the homepage's walkthrough),
// and the build the signed-in sample deal's page agrees with
// (lib/sample-stress.test.ts holds the three to one StressTest). It goes
// through the deal page's own readers on the fixture, in the page's order:
// the sample's place (`placeDeal` on its stored address and the county that
// address names), its rent rules on the day, its one derivation
// (lib/sample-derive, actuals included, told the rules and the day, never
// seeded from today's rates — lib/model-market), the model's assumptions
// against today's published figures (`modelVsMarketFor`, the deal page's
// one read), its stored challenger, comps and market results, and its rent
// roll and T-12 read as the deal page reads them (lib/actuals/actuals-read).
// The published figures are evidence, never a rate seed. Pure: no I/O; the
// caller hands in the day and whatever figures it read (null where the read
// failed, which leaves the published rows unchecked, never a broken page).
import { actualsFromRows } from "@/lib/actuals/actuals-read";
import { shownAssetClass } from "@/lib/asset-class";
import { inferStrategy } from "@/lib/deal-strategy";
import { countyOf, placeDeal } from "@/lib/market-county";
import { modelVsMarketFor, type MarketReads, type ModelVsMarket } from "@/lib/model-vs-market";
import { regulationForDeal, type RegulationRead } from "@/lib/rent-regulation";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildStressTest } from "@/lib/stress-test";
import type { StressTest } from "@/lib/stress-test-types";
import type { DerivedModel } from "@/lib/underwrite/inputs";

/** Where the sample is (lib/market-county), answered as the deal page
 *  answers it — `placeDeal(address, countyOf(address, siteFlags))`: the
 *  sample's stored address names its county, so the answer is the same
 *  whether or not its site flags have answered. */
export function samplePlacement() {
  return placeDeal(SAMPLE_DEAL.address, countyOf(SAMPLE_DEAL.address, null));
}

/** The sample's rent rules, its derivation and the model's read against the
 *  published figures, each as the deal page makes it for the sample. */
export function sampleModelReads({ today, reads }: { today: string; reads: MarketReads | null }): {
  regulation: RegulationRead | null;
  derived: DerivedModel;
  modelVsMarket: ModelVsMarket | null;
} {
  const ex = SAMPLE_DEAL.extraction;
  const address = SAMPLE_DEAL.address;
  // The rent rules that reach the sample, read through the one call every
  // surface makes (lib/rent-regulation), on the page's day.
  const regulation = regulationForDeal({ extraction: ex, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class }, today);
  // One derivation with the demo workbook and the demo report
  // (lib/sample-derive), told what the deal page tells its derivation — the
  // rent rules and the day its dated readers read on. Neither reaches a
  // figure the model runs on.
  const noon = new Date(`${today}T12:00:00Z`);
  const derived = sampleDerivedInputs({ regulation, asOf: noon });
  const modelVsMarket = reads
    ? modelVsMarketFor({
        derived,
        extraction: ex,
        firstSignal: null,
        storedAssetClass: SAMPLE_DEAL.asset_class,
        metro: samplePlacement().live,
        reads,
        regulation,
      })
    : null;
  return { regulation, derived, modelVsMarket };
}

export function sampleStressTest({
  today,
  reads = null,
}: {
  /** the day the page is read, an ISO day */
  today: string;
  /** today's figures for the sample's market (lib/model-vs-market-read
   *  `todayReads` on `samplePlacement().live`); null where the read failed */
  reads?: MarketReads | null;
}): StressTest {
  const ex = SAMPLE_DEAL.extraction;
  const strategy = inferStrategy(ex, null);
  const shownClass = shownAssetClass(SAMPLE_DEAL.asset_class, ex) || null;
  const actuals = actualsFromRows(ex, strategy, shownClass, SAMPLE_DEAL.rentRoll, SAMPLE_DEAL.t12);
  const { derived, modelVsMarket } = sampleModelReads({ today, reads });
  // No recorded sales and no past screens: the sample's building and price
  // are invented, so no reader's records or screens are set against them,
  // and the signed-in sample's page hands in none either.
  return buildStressTest({
    extraction: ex,
    firstSignal: null,
    challenger: SAMPLE_DEAL.challenges,
    market: SAMPLE_DEAL.market,
    modelVsMarket,
    actuals,
    derived,
    storedAssetClass: SAMPLE_DEAL.asset_class,
    brokerComps: SAMPLE_DEAL.comps,
    readOn: today,
  });
}
