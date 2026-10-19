import type { T12Summary } from "./types";

/**
 * The T-12 drawn as one bar from the effective gross income down to the net
 * operating income: each operating expense line the statement states a
 * segment, what is left the NOI. Pure. Null wherever the picture would say
 * something the statement does not:
 *
 *   - no EGI, no NOI, or an NOI of nothing or less (a bar cannot draw a
 *     loss as a part of the income);
 *   - an expense line of less than nothing (a credit is no part of the
 *     income);
 *   - expense lines that do not add to the stated total within 1% — the
 *     statement's own figures disagree, and no "other" segment is made up to
 *     close the gap;
 *   - EGI less the expenses off the NOI by more than 1% of the NOI: the
 *     figures do not tie.
 *
 * A line the statement does not state is absent, never a zero; a line it
 * states as zero takes no width and is not drawn. With no lines and a stated
 * total, the total is one segment. A derived NOI stays marked derived.
 */
export interface T12Bar {
  egi: number;
  /** the expense segments, in the statement's order */
  expenses: { label: string; amount: number }[];
  /** the expenses' total the bar draws */
  totalOpex: number;
  noi: number;
  noiDerived: boolean;
}

/** How far two of a statement's figures may sit apart and still tie. */
export const T12_TIE = 0.01;

export function t12Bar(st: T12Summary | null | undefined): T12Bar | null {
  if (!st) return null;
  const { egi, noi } = st;
  if (egi == null || noi == null || !Number.isFinite(egi) || !Number.isFinite(noi)) return null;
  if (!(egi > 0) || !(noi > 0) || noi > egi) return null;
  const lines = st.opex ?? [];
  if (lines.some((l) => !Number.isFinite(l.amount) || l.amount < 0)) return null;
  const lineSum = lines.reduce((s, l) => s + l.amount, 0);
  let totalOpex: number;
  let expenses: { label: string; amount: number }[];
  if (lines.length > 0) {
    if (st.totalOpex != null) {
      if (!Number.isFinite(st.totalOpex) || Math.abs(lineSum - st.totalOpex) > T12_TIE * Math.abs(st.totalOpex)) return null;
    }
    totalOpex = lineSum;
    expenses = lines.filter((l) => l.amount > 0).map((l) => ({ label: l.label, amount: l.amount }));
  } else {
    if (st.totalOpex == null || !Number.isFinite(st.totalOpex) || st.totalOpex < 0) return null;
    totalOpex = st.totalOpex;
    expenses = totalOpex > 0 ? [{ label: "Operating expenses", amount: totalOpex }] : [];
  }
  if (Math.abs(egi - totalOpex - noi) > T12_TIE * noi) return null;
  return { egi, expenses, totalOpex, noi, noiDerived: st.noiDerived };
}
