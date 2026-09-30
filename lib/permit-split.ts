// Where a metro's or a state's multi-unit permits come from, said the same
// way on every surface that prints them: the market brief's permits line,
// the deal page's and the demo's supply line, and the market page's supply
// picture. No imports, so a client component can take it without the series
// table riding along.
//
// The Census Bureau's Building Permits Survey does publish permits by the
// size of the building for metros, states and counties. What is true of the
// figures here is narrower: they are read from FRED, and FRED carries only
// the total and the single-family series for a metro or a state (probed
// 2026-09-23 — `BP5FH` and `BP24FH` exist for none; only the nation has
// `PERMIT5`), so the units in buildings of two or more are the total less the
// single-family series. The first wording, "the only split published for a
// metro or a state", said more than that and was not true.

/** Why the multi-unit figure is a subtraction: the source it is read from. */
export const NO_MULTI_UNIT_SERIES = "FRED carries no multi-unit series for a metro or a state";

/** The clause the market brief's permits line carried before, word for word. */
const RETIRED_SPLIT_CLAUSE = "the total less the single-family series, the only split published for a metro or a state";

/**
 * A stored brief line as it should read today. A market check stores the
 * lines it was handed (`MarketResult.liveBrief.lines`), so a screen run
 * before the wording changed still carries the retired clause; the surfaces
 * that print stored lines — the deal page's fold, the report, the verdict's
 * brief — read them through this, which changes that clause and nothing
 * else: every figure, date and source in the line stays as it was stored.
 */
export function currentBriefLine(line: string): string {
  return line.includes(RETIRED_SPLIT_CLAUSE)
    ? line.replace(RETIRED_SPLIT_CLAUSE, `the total less the single-family series, since ${NO_MULTI_UNIT_SERIES}`)
    : line;
}
