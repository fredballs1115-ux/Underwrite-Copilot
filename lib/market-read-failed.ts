/**
 * What a market check says where the deal sits in a market the site reads
 * published figures for, and the check could read none of them — a database
 * blip on the rates, the benchmarks or the deal's own address. The check
 * then reasons from rules of thumb alone, and read exactly like a deal
 * outside the covered markets: nothing said the figures existed and were
 * not read that day, or that a re-screen would include them (research pass
 * 30). No imports, so the deal page (a client component), the shared screen
 * and the report say the one sentence.
 */

/** As the screen stores it on the check (`MarketResult.liveReadFailed`):
 *  the market whose figures it tried to read and whose they are, where the
 *  deal was placed before the read failed. */
export interface LiveReadFailed {
  market: string | null;
  grain?: "metro" | "state";
}

/** The sentence, or null where the figures were read (or there were none
 *  to read). */
export function liveReadFailedLine(failed: LiveReadFailed | null | undefined): string | null {
  if (!failed) return null;
  const whose = !failed.market
    ? "the deal's market"
    : failed.grain === "state"
      ? `the state of ${failed.market}`
      : `the ${failed.market} market`;
  return `The published figures for ${whose} could not be read when this check ran, so it reasoned from rules of thumb alone — re-screen to include them.`;
}
