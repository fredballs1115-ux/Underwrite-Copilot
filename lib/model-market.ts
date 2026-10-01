// What the day's market lends a deal's model — and the one deal it lends
// nothing to.
//
// Every surface that derives a deal's model seeds its loan rate from today's
// rates table (lib/debt-index: the Treasury tenor nearest the hold plus the
// class's screening spread), so the page and the workbook print one rate for
// one deal on one day. The sample deal is the exception, and has been in
// words since the seeding shipped: its figures are pinned — the demo runs it
// unseeded at the flat 6.00% (lib/sample-derive), and its own sentences
// quote returns at that rate — so a signed-in reader's sample moved its IRR
// with the Treasury every day while /demo held still. Every surface asks
// here, with the row's `is_sample`, instead of reading the index itself, and
// a test holds them to it. Pure.

import {
  constructionSeed,
  ratesPromptLine,
  type DebtSeeds,
  type PermanentSpread,
  type RateSeed,
} from "@/lib/debt-index";
import type { MarketForModel } from "@/lib/underwrite/inputs";

/** The index the model's loan rate is seeded from — today's for a real deal,
 *  none for the sample, whose model keeps the flat default and its note. */
export function modelMarketFor(isSample: boolean | null | undefined, seeds: DebtSeeds): MarketForModel {
  return { debtIndex: isSample ? null : seeds.permanent };
}

/** The construction panel's starting rate: today's floating index plus the
 *  construction spread for a real deal, none for the sample. */
export function constructionSeedFor(isSample: boolean | null | undefined, seeds: DebtSeeds): RateSeed | null {
  return isSample ? null : constructionSeed(seeds);
}

/** Today's rates, dated, for a Claude step that sets the model's loan rate
 *  (the first-draft model's reconciliation) — none for the sample. With the
 *  deal's class spread (lib/underwrite/inputs `permanentLoanSpread`) the
 *  line names the spread the site's model adds, as its screening default. */
export function modelRatesLine(
  isSample: boolean | null | undefined,
  seeds: DebtSeeds,
  holdMonths: number,
  spread?: PermanentSpread | null,
): string | null {
  return isSample ? null : ratesPromptLine(seeds, holdMonths, spread);
}
