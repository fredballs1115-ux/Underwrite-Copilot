/**
 * The failures that are the DOCUMENT's: a retry reads the same file the same
 * way, so the way on is another file — Replace OM. The deal page offered "Try
 * again" under every one of them, beneath a sentence naming Replace OM, and
 * each retry paid the first signal's cache write (the largest single item of
 * a screen) for the same answer (research pass 30; Material's rule: never
 * offer "Try again" where the operation can be seen to fail). Like the
 * operator's failures beside them (./operator-failures), the sentences live
 * here with no imports but lib/pdf's page cap, so the deal page (a client
 * component) and the screen-stopped email can tell them apart. The pipeline
 * and lib/anthropic/failure write them; nothing else may.
 */
import { MAX_OM_PAGES } from "@/lib/pdf";

/** A deck with no figures in it — a teaser, a cover letter, pages too faint
 *  to read — read from its text layer and again from its pages. */
export const NO_FIGURES_FAILURE =
  "We couldn't read any figures out of this PDF, from its text or its pages — check it is the offering memorandum rather than a teaser or a cover letter, or upload a clearer copy with Replace OM.";

/** The provider refused the request as too large (a 413). */
export const TOO_LARGE_FAILURE =
  "The analysis service refused this document as too large — upload a smaller PDF with Replace OM.";

/**
 * Every 400 the provider gives a PDF it will not read — a secured copy, an
 * invalid file, one too long for a single request — reads alike until the
 * provider's own words are read (research pass 30's B1, which waits on the
 * wording printed from the runner), and a passing fault reads the same: so
 * Replace OM is offered beside the retry, never in its place.
 */
export const REJECTED_FAILURE =
  "The analysis service could not accept this document — if it is a secured copy, save an unlocked one (print it to PDF) and upload it with Replace OM; otherwise try again.";

/** The OM is gone from our file storage (the object is not there): a retry
 *  reads nothing again, so the way on is the file uploaded again. */
export const STORAGE_MISSING_FAILURE =
  "The OM is missing from our file storage — upload it again with Replace OM.";

/** A deal with neither an OM nor typed facts: nothing to screen. */
export const NO_OM_FAILURE =
  "No OM file is attached to this deal — upload one, or enter the deal's facts by hand.";

/** A deck past the pages the analysis service reads in one pass. */
export function pageCapFailure(pages: number): string {
  return `This OM runs ${pages.toLocaleString("en-US")} pages — the analysis service reads up to about ${MAX_OM_PAGES} in one pass. Split off the financial sections and upload those with Replace OM.`;
}

/** The model declined to read the document at the step named. */
export function refusalFailure(what: string): string {
  return `${what} was declined by the model — the document may hold content it will not analyze.`;
}

const PAGE_CAP = /^This OM runs [\d,]+ pages — the analysis service reads up to about \d+ in one pass\./;
const REFUSAL = / was declined by the model — the document may hold content it will not analyze\.$/;
// Matched by its opening, so a failure stored under the earlier remedy
// ("try a smaller PDF") reads the same way.
const TOO_LARGE = /^The analysis service refused this document as too large\b/;

/** What the deal page offers under a document's failure: another copy of the
 *  memorandum in its place, that beside a retry (a 400 that may yet pass), or
 *  a first memorandum for a deal that has none. */
export type DocumentRemedy = "replace" | "replace_or_retry" | "attach";

/** The remedy a stored failure's own sentence calls for, where the failure
 *  is the document's; null for anything a retry may fix, and for the
 *  operator's (./operator-failures). */
export function documentFailure(message: string | null | undefined): DocumentRemedy | null {
  const m = (message ?? "").trim();
  if (!m) return null;
  if (m === NO_OM_FAILURE) return "attach";
  if (m === REJECTED_FAILURE) return "replace_or_retry";
  if (m === NO_FIGURES_FAILURE || m === STORAGE_MISSING_FAILURE || TOO_LARGE.test(m) || PAGE_CAP.test(m) || REFUSAL.test(m)) {
    return "replace";
  }
  return null;
}
