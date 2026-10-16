// The walkthrough's tabs past the Overview (app/landing-interactive.tsx's
// `loadWalkthrough`): the deal page's own sections, its Buy box tab and the
// model's returns headline, with the comps table's subject tick read on the
// sample. Loaded when the walkthrough nears the screen or a tab is reached
// for, so the homepage's first load carries the Overview's components alone.
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { assetWords } from "@/lib/asset-words";
import { subjectBasis } from "@/lib/comp-detail";
import { condoUnitsOffered } from "@/lib/condo-units";
import { screenYearOf } from "@/lib/criteria";
import { inferStrategy } from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";

export {
  BrokerComps,
  ChallengerView,
  MarketCheck,
  Reconciliation,
  TermsView,
  VerdictView,
} from "./(app)/deals/[id]/deal-sections-view";
export { ReturnsHeadline } from "./(app)/deals/[id]/returns-headline";
export { SampleBuyBox } from "./sample-buy-box";

const extraction = SAMPLE_DEAL.extraction;

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
