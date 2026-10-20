// What the screening model is, said one way wherever a reader meets it: the
// derived model (lib/underwrite/inputs `deriveUnderwriteInputs`) the stress
// test re-runs, the sensitivity playground moves, and the Excel workbook and
// the full report carry. It had been called "the OM underwrite model", which
// read as the memorandum's own model; it is not (an investor's walkthrough,
// 2026-10-20). Its growth and its exit run, in order, at the published
// figure the stress test decides each row by, else the memorandum's stated
// figure, else a screening default (the owner's rule of 2026-10-20,
// "published evidence first", lib/model-evidence) — and the sample deal,
// whose figures are pinned, at the defaults whatever its memorandum says.
//
// The figures below are lib/underwrite/inputs' defaults, typed here because
// this module is drawn by client components and loads nothing;
// lib/screening-model-words.test.ts holds them, and the order, to the
// derivation itself.
//
// No imports: client-safe.

/** The model's name, as a sentence carries it. */
export const SCREENING_MODEL = "the screening model";

/** How its growth and its exit are set, each named with its figure. */
export const SCREENING_DEFAULTS =
  "rent and expense growth at the published figure the stress test decides each by where it is fresh, else the memorandum's stated rate, else 3.0% a year; the exit at its going-in cap where the price buys the building as it stands, else the research tracker's cap range at its low end, else the memorandum's stated exit, else the going-in cap it states or 6.0%; the sample deal, its figures pinned, keeps 3.0% and its going-in cap";

/** What it runs on, then how its growth and exit are set: where a page
 *  introduces it. */
export const SCREENING_MODEL_IS = `the memorandum's price and terms, the rent roll's and T-12's figures where the deal has them, and for growth and the exit: ${SCREENING_DEFAULTS}`;

/** The workbook's download, and the way to it on a plan without it. */
export const SCREENING_MODEL_DOWNLOAD = "Download the screening model (.xlsx)";
export const SCREENING_MODEL_UPGRADE = "Upgrade to Pro to download the screening model (.xlsx)";
