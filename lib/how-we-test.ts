// The methodology page's own data (2026-10-19, the refocus): what /how-we-test
// says that lib/stress-test-types' STRESS_METHODS does not. The sections are
// the table's, drawn from it and never copied by hand; this file holds the
// rest — how an evidence item is marked by its kind, the publishers the
// figures come from with the notices their terms ask for, the cadence rule
// and what a stress test cannot do — so the view draws words and a test
// holds the words to the code. Pure: no I/O, nothing server-only.

import { BLS_NOTICE, FRED_NOTICE } from "@/lib/data-notices";
import { HVS_RATES_URL } from "@/lib/hvs-tables";
import { COVERAGE_SUMMARY } from "@/lib/public-comps/core";
import { REALTOR_CREDIT, REALTOR_SOURCE_URL } from "@/lib/realtor";
import { RESEARCH_STALE_DAYS } from "@/lib/research-age";
import { NOI_IN_LINE_BAND } from "@/lib/actuals/in-line-band";
import {
  BASIS_STRETCH_PCT,
  BASIS_UNSUPPORTED_PCT,
  DEBT_UNSUPPORTED_BPS,
  EXIT_CAP_UNSUPPORTED_BPS,
  EXPENSE_GROWTH_UNSUPPORTED_PTS,
  IRR_MOVE_STRETCH_BPS,
  NOI_UNSUPPORTED_SHARE,
  PREMIUM_UNSUPPORTED_SHARE,
  RENT_GROWTH_UNSUPPORTED_PTS,
  SAME,
  SAME_SHARE,
  TAX_UNSUPPORTED_SHARE,
  VACANCY_UNSUPPORTED_PTS,
  YOC_MOVE_STRETCH_PTS,
} from "@/lib/stress-test";
import { STRESS_METHODS, type EvidenceKind, type StressKey, type StressMethod, type StressVerdict } from "@/lib/stress-test-types";
import { BASE_RATE_WHY, DECISION_SCORES, NOT_YET_SCORABLE, PURCHASE_IS_DECISION, RECORD_FLOOR, RESCREEN_RULE, SCORED_BY, SCORED_BY_TOO, TRADE_DATE_RULE, VACANCY_MEASURE_RULE, marginWords } from "@/lib/track-record";
import { snapshotThreshold } from "@/lib/stress-snapshot";
import { ZORI_CREDIT, ZORI_SOURCE_URL } from "@/lib/zori";
import { SCREENING_MODEL_LINES, SCREENING_RULE_HREF } from "@/lib/screening-model-words";

export { STRESS_METHODS };

/** The page's title, its one h1 and its metadata's. */
export const HOW_WE_TEST_TITLE = "How the stress test is struck";

/**
 * The phrase live-verify greps in the served HTML
 * (.github/workflows/live-verify.yml greps "The arithmetic is run in code,
 * never by the AI."): one JS string rendered as one text node, so React's
 * `<!-- -->` never lands inside it (lib/live-verify-markers.test.ts's rule).
 * It is scoped to the stress test, since the call's ranges and the
 * challenger's critique carry figures of the AI's own reading
 * (`WHO_DOES_WHAT.ai`); the grepped sentence stays whole inside it.
 */
export const HOW_WE_TEST_MARKER =
  "In the stress test, every return, re-run, comparison and verdict word is computed. The arithmetic is run in code, never by the AI.";

/** What the AI does and what code does, each a short list. */
export const WHO_DOES_WHAT = {
  ai: {
    heading: "The AI reads",
    items: [
      "the memorandum, the rent roll, the T-12 and the model you add",
      "names each assumption and the page it comes from",
      "names the question the figure raises for the broker",
      "grades each of the memorandum's comps by how comparable it is to the subject, never by its price against the ask",
      "writes the call, its ranges and the critique: their figures are its reading of the documents, not the engine's",
    ],
  },
  code: {
    heading: "Code runs",
    items: [
      "the lookup: the one published figure, document or rule of thumb that decides it, the rest shown beside it",
      "the median of the comps graded clean, three or more, or none",
      "the arithmetic: the gap in the assumption's own unit",
      "the verdict word, from the gap and the row's own threshold",
      "the re-run: the return again with the evidence's figure in the OM's place",
    ],
  },
} as const;

/** The four verdict words, each one line, the thresholds read off
 *  lib/stress-test's own constants. */
export const VERDICT_WORDS: readonly { word: StressVerdict; line: string }[] = [
  {
    word: "holds",
    line: "The OM's figure sits at the one figure that decides the row, within its margin, or on its conservative side. No re-run is drawn on it. A row held only to a rule of thumb says so and is never drawn green.",
  },
  {
    word: "stretched",
    line: `Past the deciding figure by less than the row's threshold; or at it, where the re-run lowers the levered IRR by ${IRR_MOVE_STRETCH_BPS} bps or more, or a plan's yield on cost by ${YOC_MOVE_STRETCH_PTS} points or more.`,
  },
  { word: "unsupported", line: "Past the deciding figure by more than the row's threshold, below. Every other piece on the row is shown beside it and decides nothing." },
  { word: "unchecked", line: "The OM states no figure, no evidence with a figure could be read for the deal, or nothing on file can test it (an insurance premium at or over the seller's own T-12 premium, with no quote for a new owner)." },
];

const pctOf = (share: number) => `${Math.round(share * 100)}%`;

/**
 * How each row picks the ONE figure it is held to, and its threshold, one
 * line a key: what lib/stress-test does (its orders are lib/stress-deciders'),
 * each figure its constant.
 */
export const VERDICT_RULES: Record<StressKey, string> = {
  // lib/stress-test's price row: a median of three trades or more decides,
  // the comps graded clean first, then the recorded sales; under three, no
  // median, and the row stands unchecked, the comps named with their count.
  basis: `Held to the median of three or more trades: the comps graded clean, else the recorded sales. Under three, unchecked, the comps named with their count; your past screens' asks never decide. Holds up to ${BASIS_STRETCH_PCT}% over it; unsupported past ${BASIS_UNSUPPORTED_PCT}%.`,
  exit_cap: `Held to the higher of the OM's going-in cap and its own pro forma cap, else the published cap range's low end; no expansion over the hold is added. More than ${Math.round(SAME * 100)} bps tighter is stretched, and ${EXIT_CAP_UNSUPPORTED_BPS} bps or more unsupported.`,
  debt: `Held to the lender's quote on file where one is, unsupported past ${DEBT_UNSUPPORTED_BPS} bps under it; else to today's index plus the class's screening spread: stretched under it, unsupported only past ${DEBT_UNSUPPORTED_BPS} bps under it and the bare index too.`,
  noi: `Held to the T-12 alone, else the OM's own in-place NOI. Holds within ${pctOf(NOI_IN_LINE_BAND)} or under it; unsupported past ${pctOf(NOI_UNSUPPORTED_SHARE)} over the T-12, stretched at most against the OM's own figure.`,
  // lib/stress-deciders' VACANCY_ORDER: a stabilized figure by the market,
  // then the class's norm, never the deal's documents (an economic one meets
  // the market's doors as a floor); today's by its own measure's document.
  vacancy: `A stabilized vacancy is held to the market (metro survey, tracker's low read, region, state), then the class's norm, never the rent roll or T-12; one in dollars meets the market's doors as a floor. Unsupported ${VACANCY_UNSUPPORTED_PTS} points past it.`,
  // lib/rent-growth-decider's order, one line.
  // Where the series' history holds two years or more, the lower of its
  // trailing year and its average decides: said in the method's limits
  // (GROWTH_HISTORY_LIMIT), this line held to one thought.
  rent_growth: `Held to the figure for its kind of rent: Zillow's apartment rents, else all-homes, else CPI rent; a house, all-homes first; a park, student or mixed-use building, the closest, named so; commercial, its lessors' index. Unsupported past ${RENT_GROWTH_UNSUPPORTED_PTS} points over it.`,
  expense_growth: `Held to all-items CPI, the higher of its year and its average where its history holds two years; to core CPI only where all-items is not fresh. Core, the insurance index and the breakeven are beside it. Unsupported past ${EXPENSE_GROWTH_UNSUPPORTED_PTS} points under it.`,
  taxes: `Held to the OM's implied reset bill, else its unabated bill, else the T-12's bill where the OM's is over ${pctOf(SAME_SHARE)} under it. Holds within ${pctOf(SAME_SHARE)} or over it; past ${pctOf(TAX_UNSUPPORTED_SHARE)} under the unabated bill is unsupported; the reset bill and the T-12's read stretched at most.`,
  insurance: `Held to the seller's own T-12 premium where the OM's sits more than ${pctOf(SAME_SHARE)} under it: stretched, never more: it is the seller's history, not a new owner's quote. At or over it, unchecked: no new owner's quote is on file, and the index decides nothing.`,
  market_rent: `Held to the median of three or more of the memorandum's lease comps graded clean, on the class's yardstick; under three, unchecked, the comps named. Holds up to ${BASIS_STRETCH_PCT}% over it; unsupported past ${BASIS_UNSUPPORTED_PCT}%.`,
  opex: `Held to the T-12's expenses on the OM figure's footing, less the taxes and insurance it states; with no T-12, to the class's ratio, a rule of thumb, stretched at most. Holds within ${pctOf(NOI_IN_LINE_BAND)} under it or over it; unsupported past ${pctOf(NOI_UNSUPPORTED_SHARE)} under it.`,
  renovation_premium: `Held to the achieved premium: holds within ${pctOf(SAME_SHARE)}, unsupported past ${pctOf(PREMIUM_UNSUPPORTED_SHARE)} over it. With none stated, unchecked: the break-even is shown beside it, saying whether the program pays at the OM's own premium.`,
  other: "No verdict is struck: the row carries the challenger's words.",
};

/**
 * The kind an `against` item is marked by, read off the table's own words
 * — a rule of thumb where the item names itself one (the reader's
 * own past asks among them, other memoranda's asking prices: lib/
 * stress-test files them so), a published figure where it names a
 * publisher, an index or a survey, the OM against itself where it names
 * the memorandum's own figures (its comps, its going-in cap, its in-place
 * NOI, its tax bill, its abatement, its achieved premium — lib/stress-test
 * files each `om_internal`, as the panel marks it), the deal's documents
 * where it names the rent roll or the T-12 — and null where the words name
 * none of these (the lender tests, the break-even, the challenger's
 * words), which the page leaves unmarked rather than guesses.
 */
export function evidenceKindOf(item: string): EvidenceKind | null {
  if (/rule of thumb|class's norm/i.test(item)) return "rule_of_thumb";
  if (
    /\bFRED\b|\bBLS\b|Census|Zillow|Realtor|tracker|Treasury|\bindex\b|\bindexes\b|\bCPI\b|breakeven|public property records|published allowance|consumer prices|producer price/i.test(
      item,
    )
  ) {
    return "published";
  }
  // "The going-in cap: …" is the memorandum's own figure; "a going-in cap
  // under the all-in rate" (negative leverage) is arithmetic, left unmarked.
  if (/\bmemorandum\b|memorandum's|^The going-in cap\b|^The higher of the OM's going-in cap\b|^The OM's pro forma cap\b|achieved premium|stated tax abatement/i.test(item)) return "om_internal";
  if (/deal's own|deal's T-12|rent roll|T-12/i.test(item)) return "document";
  return null;
}

/** The kind's mark on the page: the stress-test panel's own words for it
 *  (app/stress-test-panel `KIND`), so a reader meets one name a kind. */
export const KIND_LABEL: Record<EvidenceKind, string> = {
  published: "A published figure",
  document: "The deal's own document",
  rule_of_thumb: "A rule of thumb",
  om_internal: "The OM against itself",
};

/** Whether the engine runs the return again on this method's evidence —
 *  the table's own words say "re-run" where it does. */
export function engineReruns(method: Pick<StressMethod, "engine">): boolean {
  return /\bre-run\b/.test(method.engine);
}

export interface Publisher {
  name: string;
  /** what the site reads from it, one line */
  reads: string;
  /** the publisher's own page, where the site links one */
  href: string | null;
  /** the notice or credit its terms ask the site to print */
  notice: string | null;
}

/** The publishers the stress test's published figures come from, each with
 *  the notice its terms ask for where lib/data-notices holds one, or the
 *  credit the feed's reader prints. */
export const PUBLISHERS: readonly Publisher[] = [
  {
    name: "FRED",
    reads: "the Treasury curve, SOFR, the price indexes, bank lending standards and each metro's jobs, permits and house prices, as the channel the series come through",
    href: "https://fred.stlouisfed.org",
    notice: FRED_NOTICE,
  },
  {
    name: "BLS",
    reads: "the rent sitting tenants pay for three metros, read from the BLS's own API; every other BLS figure comes through FRED",
    href: "https://www.bls.gov",
    notice: BLS_NOTICE,
  },
  {
    name: "Census Bureau",
    reads: "the Housing Vacancy Survey's rental vacancy for each metro area, with its margin of error, and for each Census region",
    href: HVS_RATES_URL,
    notice: null,
  },
  {
    name: "Zillow Research",
    reads: "asking rents against a year ago, all homes and apartments alone, and the home value index, for each metro",
    href: ZORI_SOURCE_URL,
    notice: ZORI_CREDIT,
  },
  {
    name: "Realtor.com",
    reads: "the for-sale market each month: list prices, listings and days on market against a year ago",
    href: REALTOR_SOURCE_URL,
    notice: REALTOR_CREDIT,
  },
  {
    name: "The research tracker",
    reads: "vacancy bands and cap ranges a named research house printed, each with its period, read on a stated day and said to be a research print, not a feed",
    href: "/market",
    notice: null,
  },
  {
    name: "Public property records",
    // COVERAGE_SUMMARY's labels carry their own brackets ("New Jersey
    // (statewide)"), so the list follows a colon, never another pair.
    reads: `recorded sales from the government records the site reads today, a median only from three sales up: ${COVERAGE_SUMMARY}`,
    href: null,
    notice: null,
  },
];

/** The cadence rule, as the public market pages state it. */
export const CADENCE_RULE = {
  heading: "A figure is dated, and stale by its own cadence",
  lines: [
    // What a StressEvidence carries (lib/stress-test-types): a publisher and
    // an `asOf` on every published figure but the reader's own past screens,
    // and an `href` only on recorded sales, where the provider gives one.
    "A published figure names its publisher and the day or period it is for (your own past screens, pooled across days, carry no date); a recorded sale links to its record where the source gives one.",
    "A daily series is stale in days, a monthly one in weeks, a quarterly one in months: each is judged by its own cadence, never one threshold for all.",
    "A stale figure still shows with its date, and is set against nothing.",
    `A research print is stale past ${RESEARCH_STALE_DAYS} days from the day it was read.`,
  ],
} as const;

/**
 * The model each row's return is re-run on (lib/underwrite/inputs, the rule
 * lib/model-evidence runs): the whole rule, which the playground's and the
 * workbook note's "how it works" links land on (`SCREENING_RULE_HREF`'s
 * anchor), a line a thought (lib/screening-model-words, held there to the
 * model itself).
 */
export const SCREENING_MODEL_SECTION = {
  id: SCREENING_RULE_HREF.split("#")[1],
  heading: "The model a stabilized deal's rows re-run from",
  lines: SCREENING_MODEL_LINES,
} as const;

/** What a stress test cannot do, each one line. */
export const CANNOT: readonly { heading: string; line: string }[] = [
  {
    heading: "Not a forecast",
    line: "A trailing year is what the assumption is asked to beat, and the screening model's growth and exit are read off one: a stance, more cautious than the OM only where its own figure is the more optimistic; nothing here says where rents, caps or rates go.",
  },
  {
    heading: "Not investment advice",
    line: "A first-pass screen for an analyst to check against the documents, never a reason to buy or pass.",
  },
  // lib/stress-test: a plan deal (lib/deal-strategy `isPlanDeal`) re-runs
  // its yield on total cost (`measure: "yield_on_cost"`), never the levered
  // return; a placeholder price, an assumed NOI (`modelReadsWithheld`) or a
  // price that buys no building (`basisWithheldOf`) re-runs nothing.
  {
    heading: "No levered return on a plan",
    line: "A value-add, lease-up, conversion or development deal is judged on its yield on total cost: its key assumptions are set against their evidence, and the yield is re-run where the OM states its stabilized NOI and total cost, never a levered return.",
  },
  {
    heading: "No return is re-run on a figure nobody stated",
    line: "Where the price is a placeholder or the year-one NOI assumed, or the price buys no building (a note, a position, the land, a share that cannot be grossed up), the gaps stand and no return is re-run.",
  },
  {
    heading: "A metro figure is the metro's",
    line: "Never the submarket's and never the building's: a published figure is said as whose it is, and a submarket's vacancy is not read.",
  },
  // The research tracker's cap ranges and vacancy bands are a brokerage's
  // published research (data/research/metros.json, each figure's house,
  // area and period in its `cap_read` / `vacancy_read`), and the exit and
  // vacancy rows read them; a licensed survey database is never read.
  {
    heading: "Licensed databases are not read",
    line: "Published broker research is read: each cap range or vacancy band on the research tracker is dated, its house named where the file records one. Licensed survey databases are not read.",
  },
];

/** Whether the screen was right: scored, never claimed (lib/track-record's
 *  rules, its floor and its lists of what can score a row imported; the
 *  margins lib/stress-snapshot's `snapshotThreshold` — `rowThreshold`'s
 *  survey margin applies to a vacancy the survey decided, which no later
 *  document scores, so the page names none). */
const margin = (key: StressKey) => {
  const t = snapshotThreshold(key);
  return t ? marginWords(t).replace("-point", " points") : "";
};

export const TRACK_RECORD = {
  heading: "Whether it is right",
  lines: [
    "Each row of the stress test, holds included, is scored where a later figure can speak to it: the code's verdict and the evidence figure that decided it, kept with the verdict, set against what arrived on the deal after that verdict.",
    "What can arrive: a rent roll or T-12 uploaded after the verdict and dated after it (the roll's as-of, the T-12's period end), a Dead decision with its reason, a reported trade, the price a Closed deal was bought at.",
    SCORED_BY,
    SCORED_BY_TOO,
    DECISION_SCORES,
    PURCHASE_IS_DECISION,
    NOT_YET_SCORABLE,
    "A row read stretched or unsupported is right where the later figure lands past the OM's figure on the buyer's bad side by more than the row's own margin, and wrong where it lands within that margin, or better for the buyer.",
    "A row that held is right where the later figure lands within that margin of the OM's figure, or better for the buyer, and wrong, a false hold, where it lands past it on the buyer's bad side. An unchecked row is not scored.",
    `The margin is the row's own tolerance, the one its verdict was struck by, kept with it: ${margin("vacancy")} on a vacancy, ${margin("noi")} of the OM's NOI, ${margin("basis")} of its price.`,
    "A row kept before its tolerance was carried keeps the margin it was stored with.",
    "A screen made before its stress test was kept with the verdict has no rows to score: its challenges are scored on the challenger's own figures, and the record says the rows were not snapshotted.",
    // lib/track-record `scoreScreen`'s `admit`: refused where the document's
    // own day is on or before the verdict's.
    "A document the screen itself read is never scored: the challenger was handed it. Nor is a T-12 whose period ended, or a rent roll dated, on or before the verdict's day, only uploaded later.",
    "A T-12 whose period ends after the verdict's day is scored even where most of its months precede the verdict, and each row it scores says how many do.",
    TRADE_DATE_RULE,
    // lib/anthropic/pipeline: a document is read on a screen, and a re-screen
    // writes the screen it replaces to deals.prior_screen, over the last, and
    // appends it to screen_snapshots (migration 0038), every one kept.
    RESCREEN_RULE,
    "Taxes and insurance are never scored by a document: a seller's T-12 cannot show a new owner's tax bill or premium.",
    "On a plan deal a T-12 or rent roll is the building before the plan is done, so it scores neither the OM's NOI nor its stated vacancy.",
    // lib/track-record `laterFor` / `otherMeasure`: the stress test's own
    // doors-and-dollars rule, scored the same way.
    `${VACANCY_MEASURE_RULE} A document of the other measure is named on the row, with why; an older screen's challenge is read in the OM figure's measure.`,
    "A stabilized vacancy the market's figure decided is not scored by a later rent roll or T-12: a document's vacancy is the building's today, not a test of the assumption.",
    "A decision is a direction, not a verdict on the OM's figure: it is counted apart and in no share.",
    // lib/track-record `gapCaptured` and `accountRecord`'s base rate: shown,
    // never scored (the owner's decision of 2026-10-21).
    "Beside right or wrong, a flagged row scored on figures says how much of the gap between the OM's figure and the evidence's the later figure covered. It is shown, never scored.",
    `The record also says the base rate: how many scored rows, whatever their verdict, landed past the OM's figure on the buyer's bad side by more than the row's margin, a share only from ${RECORD_FLOOR}.`,
    BASE_RATE_WHY,
    `No share is printed under ${RECORD_FLOOR} scored rows: until then the record is a start, not a record. A share is always printed with its count beside it ("3 of 5 rows").`,
    "The sample deal has no worked case: nothing on it postdates its screen, and none is faked.",
  ],
} as const;

/**
 * The words of the scoring rule's picture on /how-we-test (its track: the
 * OM's figure, the row's margin past it on the buyer's bad side, a later
 * figure; and where right and wrong fall for a flag and for a hold) — the
 * rule as lib/track-record `scoreTestRow` strikes it, drawn with no deal's
 * figures.
 */
export const SCORING_RULE = {
  caption: "The rule, drawn: no deal's figures.",
  axis: { better: "Better for the buyer", worse: "Worse for the buyer" },
  row: "The row",
  flag: "A flag (stretched or unsupported)",
  hold: "A hold",
  om: "The OM's figure",
  margin: "The row's own margin, on the buyer's bad side of it",
  later: "A later figure, here past the margin",
  right: "Right: a flag the later figure lands past the margin; a hold it lands within, or better",
  wrong: "Wrong: a flag it lands within the margin, or better; a hold it lands past",
} as const;

// The headline's method (lib/stress-test-types `HEADLINE_METHOD`, held to
// lib/stress-test `stressHeadline` by lib/stress-test.test.ts): the page's
// "The headline" section draws it, never a copy.
export { HEADLINE_METHOD } from "@/lib/stress-test-types";
