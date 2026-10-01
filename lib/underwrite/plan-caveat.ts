/**
 * On a plan deal (value-add, lease-up, conversion, development) the screening
 * model books the budget in year 1 and runs year-1 income as modelled, so its
 * returns are not the plan's — the full report omits its IRR page for that
 * reason. The deal page's sensitivity playground says it over the returns,
 * and the workbook's Deal Summary under its headline tiles.
 *
 * A plain module, no imports and no "use client": the workbook is a server
 * module, and a value exported beside a client component is, on the server,
 * a client reference rather than the string (lib/client-reference.test.ts).
 */
const PLAN_RETURNS_CORE =
  "On a plan deal these returns run the screening model — the budget booked in year 1, year-1 income as modelled — not the plan's return, which is judged on its yield on cost. The full report leaves them out for that reason";

/** The deal page's sentence, over the returns its max bid is solved on. */
export const PLAN_RETURNS_CAVEAT = `${PLAN_RETURNS_CORE}, and a bid solved on them is a screening figure.`;

/** The workbook's, which solves no bid: the same sentence without the bid. */
export const PLAN_RETURNS_CAVEAT_WORKBOOK = `${PLAN_RETURNS_CORE}.`;
