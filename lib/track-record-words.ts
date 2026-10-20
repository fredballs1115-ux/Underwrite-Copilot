// The track record's scope, in the words every surface that draws it says
// (lib/track-record re-exports them). No imports: the deal page's card is
// drawn inside a client component, and lib/track-record reaches the stress
// test's tables.

/**
 * Why no document scores a taxes or an insurance challenge. A seller's T-12
 * is the seller's operating history: its tax line is struck on the seller's
 * assessment, never the bill a sale may reset, and its premium is the
 * seller's expiring policy, never the quote a new owner gets — the stress
 * test's own tax row refuses it as evidence for the same reason. No document
 * kind on the deal is the buyer's own bill or quote, so these challenges are
 * scored by no document at all.
 */
export const TAX_INSURANCE_NOT_SCORED = "A seller's T-12 cannot show a new owner's tax bill or premium, so taxes and insurance challenges are not scored by documents.";

/** What a document must be to score a challenge: uploaded after the verdict
 *  AND dated after it. */
export const DOCUMENT_DATE_RULE =
  "A rent roll or T-12 scores a challenge only where its own date — the roll's as-of, the T-12's period end — falls after the verdict, not merely its upload.";

/** What the deal page's card scores against, in one sentence. */
export const CARD_SCOPE =
  "Each challenge is scored only against what arrived after the verdict: a rent roll or T-12 dated after it (its as-of or period end, not only its upload), your decision, a reported trade. A document the screen read is not evidence of it.";
