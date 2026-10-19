// The sample deal's stress test — ONE build for every public surface that
// draws it on the sample (/demo's Overview and the homepage's walkthrough),
// through the deal page's own readers on the fixture: the sample's one
// derivation (lib/sample-derive, actuals included, never seeded from today's
// rates), its stored challenger, comps and market results, and its rent roll
// and T-12 read as the deal page reads them (lib/actuals/actuals-read). Pure:
// no I/O; the caller hands in the day and whatever published figures it read.
import { actualsFromRows } from "@/lib/actuals/actuals-read";
import { shownAssetClass } from "@/lib/asset-class";
import { inferStrategy } from "@/lib/deal-strategy";
import type { ModelVsMarket } from "@/lib/model-vs-market";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildStressTest } from "@/lib/stress-test";
import type { StressTest } from "@/lib/stress-test-types";
import type { DerivedModel } from "@/lib/underwrite/inputs";

export function sampleStressTest({
  today,
  derived = sampleDerivedInputs(),
  modelVsMarket = null,
}: {
  /** the day the page is read, an ISO day */
  today: string;
  /** the sample's derivation, where the caller already made it with the
   *  rent rules and the day (app/demo/demo-data); the plain one otherwise */
  derived?: DerivedModel;
  /** the model's assumptions against the published figures, where the
   *  caller read them today; null on a surface that reads none */
  modelVsMarket?: ModelVsMarket | null;
}): StressTest {
  const ex = SAMPLE_DEAL.extraction;
  const strategy = inferStrategy(ex, null);
  const shownClass = shownAssetClass(SAMPLE_DEAL.asset_class, ex) || null;
  const actuals = actualsFromRows(ex, strategy, shownClass, SAMPLE_DEAL.rentRoll, SAMPLE_DEAL.t12);
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
