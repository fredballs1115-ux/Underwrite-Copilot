// The sample deal's underwriting inputs — ONE derivation for every public
// entry point that runs the fixture through the model: the demo page, the
// demo workbook download and the demo report PDF. The sample carries a rent
// roll and a T-12, and the whole point of the actuals feature is that the
// T-12 outranks the OM's narrative; a public deliverable that derived
// without them ran the deck's story instead (5.71% cap, an 11.8% IRR and a
// sensitivity page that cleared the hurdle) while the page beside it ran the
// actuals (5.45%, 9.3%, and did not). Pure: no I/O.
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";

/** The sample's actuals, in the shape deriveUnderwriteInputs takes. */
export const SAMPLE_ACTUALS = {
  rentRoll: {
    summary: SAMPLE_DEAL.rentRoll.summary,
    asOf: SAMPLE_DEAL.rentRoll.as_of_date,
  },
  t12: {
    summary: SAMPLE_DEAL.t12.summary,
    periodEnd: SAMPLE_DEAL.t12.period_end_date,
  },
} as const;

/** The sample deal's derived model inputs, actuals included. */
export function sampleDerivedInputs() {
  return deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name, SAMPLE_ACTUALS);
}
