/**
 * The brokerage scorecard's footnote: how its fit rate is counted. The rule
 * is lib/brokerage's `brokerScorecard`: a deal is judged where every
 * criterion of the buy box was checked, or where it misses one outright;
 * a fit or a near-miss with criteria left unchecked is counted apart
 * (`partial`), never in the rate.
 */
export function scorecardNote(unnamed: number): string {
  const tail = unnamed > 0 ? ` ${unnamed} deal${unnamed === 1 ? " names" : "s name"} no firm.` : "";
  return (
    "Firms as each memorandum names its listing team; a deal co-listed by two firms counts for each. " +
    "A deal is judged only where the screen could check every criterion of your buy box, or where it misses one outright; " +
    "a fit or near-miss with criteria left unchecked is counted apart. " +
    `The Go calls are over the deals with a call.${tail}`
  );
}
