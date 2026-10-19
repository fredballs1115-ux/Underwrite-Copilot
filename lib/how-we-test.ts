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
import { STRESS_METHODS, type EvidenceKind, type StressMethod } from "@/lib/stress-test-types";
import { ZORI_CREDIT, ZORI_SOURCE_URL } from "@/lib/zori";

export { STRESS_METHODS };

/** The page's title, its one h1 and its metadata's. */
export const HOW_WE_TEST_TITLE = "How each assumption is tested";

/**
 * The phrase live-verify greps in the served HTML: one JS string rendered
 * as one text node, so React's `<!-- -->` never lands inside it
 * (lib/live-verify-markers.test.ts's rule).
 */
export const HOW_WE_TEST_MARKER = "The arithmetic is run in code, never by the AI.";

/** What the AI does and what code does, each a short list. */
export const WHO_DOES_WHAT = {
  ai: {
    heading: "The AI reads",
    items: [
      "the memorandum, the rent roll, the T-12 and the model you add",
      "names each assumption and the page it comes from",
      "names the question the figure raises for the broker",
    ],
  },
  code: {
    heading: "Code runs",
    items: [
      "the lookup: which published figure, document or rule of thumb speaks to it",
      "the arithmetic: the gap in the assumption's own unit",
      "the re-run: the return again with the evidence's figure in the OM's place",
    ],
  },
} as const;

/**
 * The kind an `against` item is marked by, read off the table's own words
 * — a rule of thumb where the item names itself one, a published figure
 * where it names a publisher, an index, a survey or the reader's own past
 * screens (other memoranda's asks in the market, not this deal's document:
 * lib/stress-test files them so), the deal's documents where it names the
 * memorandum, the rent roll or the T-12 — and null where the words name
 * none of the three (the lender tests, the break-even, the challenger's
 * words), which the page leaves unmarked rather than guesses.
 */
export function evidenceKindOf(item: string): EvidenceKind | null {
  if (/rule of thumb|class's norm/i.test(item)) return "rule_of_thumb";
  if (
    /\bFRED\b|\bBLS\b|Census|Zillow|Realtor|tracker|Treasury|\bindex\b|\bindexes\b|\bCPI\b|breakeven|public property records|published allowance|consumer prices|producer price|past screens/i.test(
      item,
    )
  ) {
    return "published";
  }
  // "The going-in cap: …" is the memorandum's own figure; "a going-in cap
  // under the all-in rate" (negative leverage) is arithmetic, left unmarked.
  if (/memorandum|deal's own|deal's T-12|rent roll|T-12|^The going-in cap\b|achieved premium|stated tax abatement/i.test(item)) {
    return "document";
  }
  return null;
}

/** The kind's mark on the page. */
export const KIND_LABEL: Record<EvidenceKind, string> = {
  published: "Published figure",
  document: "The deal's documents",
  rule_of_thumb: "Rule of thumb",
  om_internal: "The memorandum against itself",
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
    reads: "the Housing Vacancy Survey's rental vacancy for each metro area, with its margin of error, and the regions'",
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
    reads: `recorded sales from the government records the site reads today (${COVERAGE_SUMMARY}), a median only from three sales up`,
    href: null,
    notice: null,
  },
];

/** The cadence rule, as the public market pages state it. */
export const CADENCE_RULE = {
  heading: "A figure is dated, and stale by its own cadence",
  lines: [
    "Every published figure carries the day or period it is for and a link to its source.",
    "A daily series is stale in days, a monthly one in weeks, a quarterly one in months: each is judged by its own cadence, never one threshold for all.",
    "A stale figure still shows with its date, and is set against nothing.",
    `A research print is stale past ${RESEARCH_STALE_DAYS} days from the day it was read.`,
  ],
} as const;

/** What a stress test cannot do, each one line. */
export const CANNOT: readonly { heading: string; line: string }[] = [
  {
    heading: "Not a forecast",
    line: "A trailing year is what the assumption is asked to beat; nothing here says where rents, caps or rates go.",
  },
  {
    heading: "Not investment advice",
    line: "A first-pass screen for an analyst to check against the documents, never a reason to buy or pass.",
  },
  {
    heading: "A metro figure is the metro's",
    line: "Never the submarket's and never the building's: a published figure is said as whose it is, and a submarket's vacancy is not read.",
  },
  {
    heading: "Licensed data is not read",
    line: "Broker cap-rate surveys and private price indexes are licensed, so no cap range from one is read, and the research tracker says so where it has none.",
  },
];
