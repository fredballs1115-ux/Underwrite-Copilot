/**
 * What the document a deal was screened from IS, by its own pages — the
 * first signal's read (lib/anthropic/first-signal). A lease, a rent roll or
 * a T-12 uploaded as the OM ran all six model calls and stored a call on a
 * document that is not a deal, and nothing said so (research pass 30). The
 * deal page now WARNS; the screen is never stopped or refused on this read,
 * which is a single fast pass and can be wrong — whether any kind should
 * stop a screen is the owner's call, once the read has been checked against
 * real memoranda. No imports: the deal page and its test read one list.
 */

/** The kinds the first signal names. */
export const DOCUMENT_KINDS = [
  "offering_memorandum",
  "flyer_or_teaser",
  "bov",
  "lease",
  "rent_roll",
  "operating_statement",
  "appraisal",
  "loan_document",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** A stored kind, or null for anything else — a signal read before the kind
 *  was asked, or a deal typed in by hand, says nothing. */
export function documentKindOf(raw: unknown): DocumentKind | null {
  return typeof raw === "string" && (DOCUMENT_KINDS as readonly string[]).includes(raw) ? (raw as DocumentKind) : null;
}

/** What each kind is called, and where it belongs on the deal instead. */
const SAID: Record<Exclude<DocumentKind, "offering_memorandum" | "flyer_or_teaser" | "other">, { what: string; instead?: string }> = {
  bov: {
    what: "a broker's opinion of value",
    instead: "a BOV is read on the deal's Valuations page, where it is set against your own model",
  },
  lease: { what: "a lease", instead: "the lease can be kept with the deal under Documents" },
  rent_roll: {
    what: "a rent roll",
    instead: "add the rent roll on the Overview, where it re-bases the model on what the building collects",
  },
  operating_statement: {
    what: "an operating statement",
    instead: "add a T-12 on the Overview, where it re-bases the model on what the building earned",
  },
  appraisal: { what: "an appraisal" },
  loan_document: { what: "a loan document", instead: "the loan's papers can be kept with the deal under Documents" },
};

/** The deal page's warning for the kind the first signal read, or null for
 *  an offering memorandum and for a kind nothing read. */
export function documentKindWarning(raw: unknown): string | null {
  const kind = documentKindOf(raw);
  if (!kind || kind === "offering_memorandum") return null;
  if (kind === "flyer_or_teaser") {
    return "This reads as a flyer or a teaser, not a full offering memorandum — the screen reads only what it states, and a teaser states little. Upload the full OM with Replace OM when the broker sends it.";
  }
  if (kind === "other") {
    return "This doesn't read as an offering memorandum — the screen reads it as one all the same, so its call may judge a document that is no deal. Upload the OM with Replace OM.";
  }
  const { what, instead } = SAID[kind];
  return `This reads as ${what}, not an offering memorandum — the screen reads it as one all the same, so its call may judge a document that is no deal. Upload the OM with Replace OM${instead ? `; ${instead}` : ""}.`;
}
