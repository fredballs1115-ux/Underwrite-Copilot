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

/*
 * The model's lines where a page introduces it beside its returns — the
 * sensitivity playground, the first-draft card's workbook note, the
 * homepage's FAQ (an investor's walkthrough, 2026-10-20: the whole rule,
 * one 190-word sentence, appeared twice on /demo and the homepage). Three
 * short lines there; the whole rule on /how-we-test only
 * (`SCREENING_MODEL_LINES`, its "model" section, which the "how it works"
 * link lands on).
 */

/** What the model is built on. */
export const SCREENING_BUILT_ON = "Built on the OM's price and terms, and the rent roll and T-12 where the deal has them.";

/** A real deal's growth and exit, short, before its "how it works" link. */
export const SCREENING_GROWTH_EXIT_LINE = "Growth and the exit run the more cautious of the stress test's deciding figure and the OM's, else a default";

/** Where the whole rule is: /how-we-test's "model" section. */
export const SCREENING_RULE_HREF = "/how-we-test#model";
export const SCREENING_RULE_LINK_WORDS = "how it works";

/** The sample's line, its pinned figures read off its own derived model
 *  (the playground's inputs, the sample's derivation) — never typed. */
export function sampleScreeningPinned(inputs: { rentGrowthPct: number; expenseGrowthPct: number; exitCapPct: number }): string {
  const g = (inputs.rentGrowthPct * 100).toFixed(1);
  const e = (inputs.expenseGrowthPct * 100).toFixed(1);
  const growth = g === e ? `${g}% growth` : `${g}% rent growth, ${e}% expense growth`;
  return `The sample's figures are pinned: ${growth} and an exit at its ${(inputs.exitCapPct * 100).toFixed(2)}% going-in cap.`;
}

/** The whole rule, as /how-we-test's "model" section says it: a line a
 *  thought, each under the page's 260 characters. */
export const SCREENING_MODEL_LINES: readonly string[] = [
  "On a stabilized deal a row re-runs the screening model's return; a plan deal's rows re-run its yield on total cost, not the model.",
  "The screening model is built on the OM's price and terms, and the rent roll's and T-12's figures where the deal has them.",
  "Rent growth runs at the lower of the OM's stated rate and the published figure the stress test decides it by; expense growth at the higher of the two.",
  "Either only inside −5% to +15% a year, the published one only where it is fresh. Where only one stands, that one; where neither does, 3.0% a year.",
  "The exit runs at the higher of the OM's stated exit and the cap the stress test decides it by: the going-in cap where the price buys the building as it stands.",
  "Else the research tracker's cap range at its low end, where that range is fresh, dated, for the whole stock and read beside a fresh 10-year Treasury.",
  "Where only one of the exits stands, that one; where neither does, the going-in cap the OM states, or 6.0%.",
  "So the model is never more optimistic than the OM, and more cautious than it only where the OM's own figure is the more optimistic one.",
  "Read off a trailing year, it is a stance, not a forecast: nothing here says where rents, caps or rates go.",
  "The sample deal's figures are pinned: it keeps 3.0% growth and its going-in cap, whatever its OM says and whatever today's figures read.",
];

/** The workbook's download, and the way to it on a plan without it. */
export const SCREENING_MODEL_DOWNLOAD = "Download the screening model (.xlsx)";
export const SCREENING_MODEL_UPGRADE = "Upgrade to Pro to download the screening model (.xlsx)";
