// A submarket series' period (stored as a full date, "2025-03-31") in words.
// Pure and import-free, so the trend chart, the submarket page and the deal
// page's submarket card say one period one way — the two "as of" lines had
// printed the stored ISO date raw beside a chart axis that said "Mar 2025".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A period on the axis, as its month and year: "Mar 2025" — the axis had
 *  printed the raw "2025-03". Anything else is shown as stored. */
export function periodMonth(period: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : period;
}

/** A period's full day: "Mar 31, 2025"; a period with no day, its month. */
export function periodDay(period: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(period);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[3])}, ${m[1]}` : periodMonth(period);
}
