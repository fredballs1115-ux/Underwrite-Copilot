// What the screening model is, said one way wherever a reader meets it: the
// derived model (lib/underwrite/inputs `deriveUnderwriteInputs`) the stress
// test re-runs, the sensitivity playground moves, and the Excel workbook and
// the full report carry. It had been called "the OM underwrite model", which
// read as the memorandum's own model; it is not (an investor's walkthrough,
// 2026-10-20). Its growth and its exit are never more optimistic than the
// memorandum (the owner's rule of 2026-10-20, lib/model-evidence): where the
// published figure the stress test decides each by and the memorandum's
// stated figure both stand, the more cautious of the two — the lower rent
// growth, the higher expense growth, the higher exit cap; else the one that
// stands; else a screening default — and the sample deal, whose figures are
// pinned, at the defaults whatever its memorandum says.
//
// The figures below are lib/underwrite/inputs' defaults and bands, typed
// here because this module is drawn by client components and loads nothing;
// lib/screening-model-words.test.ts holds them, and the rule, to the
// derivation itself.
//
// No imports: client-safe.

/** The model's name, as a sentence carries it. */
export const SCREENING_MODEL = "the screening model";

/** How a real deal's growth and exit are set, with the conditions a
 *  published figure must meet to count. */
export const SCREENING_RULE =
  "never more optimistic than the memorandum: rent growth at the lower of the memorandum's stated rate and the published figure the stress test decides it by, expense growth at the higher of the two — either only inside −5% to +15% a year, the published one only where it is fresh — either alone where only one stands, else 3.0% a year; the exit at the higher of the memorandum's stated exit and the cap the stress test decides it by — the going-in cap where the price buys the building as it stands, else the research tracker's cap range at its low end where that range is fresh, dated, for the whole stock and read beside a fresh 10-year Treasury — either alone where only one stands, else the going-in cap it states or 6.0%";

/** The sample's clause: its figures are pinned. */
export const SCREENING_SAMPLE_CLAUSE = "the sample deal, its figures pinned, keeps 3.0% and its going-in cap";

/** How its growth and its exit are set, each named with its figure, the
 *  sample's clause last. */
export const SCREENING_DEFAULTS = `${SCREENING_RULE}; ${SCREENING_SAMPLE_CLAUSE}`;

/** What it runs on, then how its growth and exit are set: where a page
 *  introduces it. */
export const SCREENING_MODEL_IS = `the memorandum's price and terms, the rent roll's and T-12's figures where the deal has them, and for growth and the exit: ${SCREENING_DEFAULTS}`;

/** The same, short, for a line that names the model beside another: a real
 *  deal's, and the sample's — whose growth and exit are pinned, so no
 *  sentence on /demo or the homepage says it runs a published figure. */
export const SCREENING_GROWTH_EXIT_SHORT =
  "its growth and exit at the more cautious of the published figures the stress test decides by and the memorandum's own — never more optimistic than the memorandum — else screening defaults";
export const SCREENING_GROWTH_EXIT_SAMPLE = "the sample's growth pinned at 3.0% a year and its exit at its going-in cap";

/** The workbook's download, and the way to it on a plan without it. */
export const SCREENING_MODEL_DOWNLOAD = "Download the screening model (.xlsx)";
export const SCREENING_MODEL_UPGRADE = "Upgrade to Pro to download the screening model (.xlsx)";
