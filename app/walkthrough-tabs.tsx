// The walkthrough's tabs past the Overview (app/landing-interactive.tsx's
// `loadWalkthrough`): the deal page's own sections, its Buy box tab, its debt
// sizer and its first-draft model card, with the comps table's subject tick
// read on the sample. Loaded when the walkthrough nears the screen or a tab
// is reached for, so the homepage's first load carries the Overview's
// components alone.
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { assetWords } from "@/lib/asset-words";
import { subjectBasis } from "@/lib/comp-detail";
import { condoUnitsOffered } from "@/lib/condo-units";
import { screenYearOf } from "@/lib/criteria";
import { inferStrategy } from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";
import { shownAssetClass } from "@/lib/asset-class";
import { actualsFromRows } from "@/lib/actuals/actuals-read";

export {
  BrokerComps,
  ChallengerView,
  MarketCheck,
  Reconciliation,
  TermsView,
  VerdictView,
} from "./(app)/deals/[id]/deal-sections-view";
export { SampleBuyBox } from "./sample-buy-box";
export { SampleModelCard } from "./sample-model-card";
export { DebtSizer } from "./(app)/deals/[id]/debt-sizer";
export { SourceDocumentsView } from "./(app)/deals/[id]/source-documents";

const extraction = SAMPLE_DEAL.extraction;

/** The sample's rent roll and T-12, read as the signed-in sample's
 *  Documents tab and the public report read them (lib/sample-cover
 *  `sampleActuals`: the seeded row's kind — no first signal — and class),
 *  so the walkthrough's Documents tab lists them with their own dates. */
export const SAMPLE_DOCUMENT_ACTUALS = actualsFromRows(
  extraction,
  inferStrategy(extraction, null),
  shownAssetClass(SAMPLE_DEAL.asset_class, extraction) || null,
  SAMPLE_DEAL.rentRoll,
  SAMPLE_DEAL.t12,
);

/** The comps table's subject tick, read as the deal page reads it
 *  (deal-view's `compSubject`): the building's basis by the deal's kind. */
export const COMP_SUBJECT = subjectBasis(
  extraction.metrics,
  inferStrategy(extraction).kind,
  screenYearOf(extraction),
  interestOf(extraction),
  extraction.assetClass,
  condoUnitsOffered(extraction),
);

/** What a unit is called on the sample (lib/asset-words), for the comps'
 *  captions. */
export const COMP_NOUN = assetWords(extraction.assetClass).noun?.one;
