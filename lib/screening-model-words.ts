// What the screening model is, said one way wherever a reader meets it: the
// derived model (lib/underwrite/inputs `deriveUnderwriteInputs`) the stress
// test re-runs, the sensitivity playground moves, and the Excel workbook and
// the full report carry. It had been called "the OM underwrite model", which
// read as the memorandum's own model; it is not: its growth and its exit are
// screening defaults whatever the memorandum projects (an investor's
// walkthrough, 2026-10-20).
//
// The figures below are lib/underwrite/inputs' defaults, typed here because
// this module is drawn by client components and loads nothing;
// lib/screening-model-words.test.ts holds them to the derivation itself.
//
// No imports: client-safe.

/** The model's name, as a sentence carries it. */
export const SCREENING_MODEL = "the screening model";

/** Its defaults, each named with its figure. */
export const SCREENING_DEFAULTS =
  "rent and expense growth at 3.0% a year whatever the memorandum projects, and the exit at its going-in cap (6.0% where it states none)";

/** What it runs on, then its defaults: where a page introduces it. */
export const SCREENING_MODEL_IS = `the memorandum's price and terms, the rent roll's and T-12's figures where the deal has them, and screening defaults for growth and the exit: ${SCREENING_DEFAULTS}`;

/** The workbook's download, and the way to it on a plan without it. */
export const SCREENING_MODEL_DOWNLOAD = "Download the screening model (.xlsx)";
export const SCREENING_MODEL_UPGRADE = "Upgrade to Pro to download the screening model (.xlsx)";
