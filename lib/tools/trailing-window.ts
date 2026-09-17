// Which trailing window the memorandum chose, and what choosing it was worth — PURE.
//
// Every offering memorandum quotes a trailing figure, and every one of them
// picks WHICH trailing figure. "T-3 annualized" and "T-12" are both true
// statements about the same building; they are different numbers, and the
// seller quotes whichever is larger. Nothing on the summary page says a
// choice was made, which is what makes this the most common screening trap
// in the business and the hardest one to see — there is no error to catch,
// only a selection.
//
// Four rules, and the first two run in opposite directions.
//
// 1. ANNUALIZING A SHORT WINDOW ANNUALIZES ITS SEASONALITY TOO. Taking the
//    best quarter times four is not a run rate; it is the claim that every
//    quarter is the best quarter. The same arithmetic on the expense side
//    runs the other way, which is rule 3.
//
// 2. THE WINDOW IS THE ARGUMENT. The spread between the most and least
//    flattering window is the size of the claim being made, and at the
//    stated cap it is a dollar figure — the value the window choice is
//    worth. That is the number to argue about, and it is never printed.
//
// 3. FOR AN EXPENSE, FLATTERING MEANS LOWEST. This is the sign trap. A
//    seller annualizing three months of expenses wants the SMALLEST result,
//    and gets it by choosing a quarter that missed the tax bill — so the
//    check that matters on the expense side is not the spread but whether
//    the lump falls inside the window at all (`lumpOutsideShort`). A
//    building's taxes and insurance are paid in instalments; a quarter
//    between them annualizes a year with no taxes in it.
//
// 4. THE HONEST SHORT-WINDOW READ IS YEAR OVER YEAR, NOT ANNUALIZED. If
//    the last three months really are stronger, the way to show it is
//    against the SAME three months a year earlier, where the season is on
//    both sides of the comparison and cancels. That needs fifteen months of
//    history, which is exactly why a memorandum quoting T-3 rarely includes
//    it.
//
// The column is read by `readStrip` — the cash-flow card's reader — so the
// comma-as-thousands-mark trap stays solved in one place.

import { readStrip } from "@/lib/tools/cashflow-math";

/** What the pasted column is, which decides which direction flatters. */
export type TrailingKind = "noi" | "revenue" | "expense";

/** The windows a memorandum quotes, longest first. */
export const WINDOWS: readonly number[] = [12, 6, 3, 1] as const;

export interface WindowRead {
  /** how many months the window covers */
  months: number;
  /** "T-12", "T-3 annualized" */
  label: string;
  /** the raw sum over the window */
  sum: number;
  /** the sum scaled to a year */
  annualized: number;
  /** distance from T-12 as a percent, signed; 0 for T-12 itself */
  vsT12Pct: number;
}

export interface TrailingResult {
  /** the windows that fit in the months given, longest first */
  windows: WindowRead[];
  monthsGiven: number;
  /** the full trailing twelve, or null with under twelve months */
  t12: number | null;
  /**
   * The window a seller would quote — the largest annualized figure, or the
   * SMALLEST on an expense column. Null when only one window fits.
   */
  flattering: WindowRead | null;
  /** …and the one they would not. */
  unflattering: WindowRead | null;
  /** the dollar distance between those two, annualized */
  spread: number | null;
  /** …as a percent of the less flattering one */
  spreadPct: number | null;
  /**
   * What the window choice is worth at the stated cap — the spread
   * capitalised. Null on a revenue or expense column (neither capitalises
   * on its own) or without a cap.
   */
  valueSpread: number | null;
  /** the same three months a year earlier, annualized; null under 15 months */
  priorYearQuarter: number | null;
  /**
   * The last three months against those same three months — rule 4. The
   * honest read of whether the recent strength is a trend or a season.
   */
  yoyQuarterPct: number | null;
  /** the largest month as a multiple of the median month */
  lumpiness: number | null;
  /** which month that was, 1 = oldest */
  lumpiestMonth: number | null;
  /**
   * Whether the lumpiest month sits OUTSIDE the last three — rule 3. On an
   * expense column this is the finding: the short window annualizes a year
   * that never pays the bill.
   */
  lumpOutsideShort: boolean;
  /** what is missing, or what the figures say, in one sentence */
  note: string;
}

const EMPTY: TrailingResult = {
  windows: [],
  monthsGiven: 0,
  t12: null,
  flattering: null,
  unflattering: null,
  spread: null,
  spreadPct: null,
  valueSpread: null,
  priorYearQuarter: null,
  yoyQuarterPct: null,
  lumpiness: null,
  lumpiestMonth: null,
  lumpOutsideShort: false,
  note: "Paste a column of monthly figures — oldest first.",
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function windowLabel(months: number): string {
  return months === 12 ? "T-12" : `T-${months} annualized`;
}

export interface TrailingInput {
  /** the monthly figures, OLDEST FIRST — the order a statement prints in */
  monthly: number[];
  kind: TrailingKind;
  /** the cap the memorandum quotes, as a percent; null for no value read */
  capPct?: number | null;
}

/**
 * Read the windows out of a column of monthly figures.
 *
 * `monthly` is oldest first, which is the order an operating statement
 * prints in and therefore the order a paste arrives in. Every window is
 * taken off the END of the array, so a column with more than twelve months
 * in it keeps its history for the year-over-year read rather than being
 * truncated.
 */
export function readTrailing(t: TrailingInput): TrailingResult {
  const monthly = t.monthly.filter(real);
  const n = monthly.length;
  if (n === 0) return EMPTY;

  const fits = WINDOWS.filter((w) => w <= n);
  if (fits.length === 0) {
    return {
      ...EMPTY,
      monthsGiven: n,
      note: `${n} month${n === 1 ? "" : "s"} is not a window — one month at least.`,
    };
  }

  const sumOf = (months: number) =>
    monthly.slice(n - months).reduce((a, b) => a + b, 0);

  const t12 = n >= 12 ? round(sumOf(12)) : null;

  const windows: WindowRead[] = fits.map((months) => {
    const sum = sumOf(months);
    const annualized = round((sum * 12) / months);
    return {
      months,
      label: windowLabel(months),
      sum: round(sum),
      annualized,
      // Every displayed figure is rounded once and the comparisons are taken
      // from the rounded pair — the debt schedule's rule, so the card's own
      // percentages agree with its own dollars.
      vsT12Pct: t12 !== null && t12 !== 0 ? round1(((annualized - t12) / Math.abs(t12)) * 100) : 0,
    };
  });

  // Rule 3's sign. A seller quoting revenue or NOI wants the biggest figure;
  // a seller quoting expenses wants the smallest. Reading this one way for
  // both is how an expense column gets called conservative when it is the
  // opposite.
  const better = (a: WindowRead, b: WindowRead) =>
    t.kind === "expense" ? a.annualized < b.annualized : a.annualized > b.annualized;

  let flattering: WindowRead | null = null;
  let unflattering: WindowRead | null = null;
  if (windows.length > 1) {
    flattering = windows.reduce((best, w) => (better(w, best) ? w : best));
    unflattering = windows.reduce((worst, w) => (better(worst, w) ? w : worst));
  }

  const spread =
    flattering && unflattering
      ? Math.abs(flattering.annualized - unflattering.annualized)
      : null;
  const base = unflattering ? Math.abs(unflattering.annualized) : 0;
  const spreadPct = spread !== null && base > 0 ? round1((spread / base) * 100) : null;

  // Rule 2, said in dollars. Only an NOI column capitalises: a revenue line
  // and an expense line are each half of one, and dividing either by a cap
  // rate on its own states a value the building does not have.
  const capPct = real(t.capPct) && t.capPct > 0 ? t.capPct : null;
  const valueSpread =
    t.kind === "noi" && spread !== null && capPct !== null
      ? round(spread / (capPct / 100))
      : null;

  // Rule 4. The same three months a year earlier — months 13, 14 and 15 back.
  const priorYearQuarter =
    n >= 15 ? round((monthly.slice(n - 15, n - 12).reduce((a, b) => a + b, 0) * 12) / 3) : null;
  const lastQuarter = n >= 3 ? (sumOf(3) * 12) / 3 : null;
  const yoyQuarterPct =
    priorYearQuarter !== null && lastQuarter !== null && priorYearQuarter !== 0
      ? round1(((round(lastQuarter) - priorYearQuarter) / Math.abs(priorYearQuarter)) * 100)
      : null;

  // Rule 3's check. A month several times the median is a tax instalment or
  // an insurance premium, not a level of spending — and whether it lands in
  // the short window decides whether that window means anything.
  const med = median(monthly);
  let lumpiness: number | null = null;
  let lumpiestMonth: number | null = null;
  if (med !== 0) {
    let bestIdx = 0;
    for (let i = 1; i < n; i++) {
      if (Math.abs(monthly[i]) > Math.abs(monthly[bestIdx])) bestIdx = i;
    }
    lumpiness = round2(Math.abs(monthly[bestIdx]) / Math.abs(med));
    lumpiestMonth = bestIdx + 1;
  }
  const shortWindow = Math.min(3, n);
  const lumpOutsideShort =
    lumpiestMonth !== null && lumpiness !== null && lumpiness >= 2 && n > shortWindow
      ? lumpiestMonth <= n - shortWindow
      : false;

  const noun = t.kind === "expense" ? "expenses" : t.kind === "revenue" ? "revenue" : "NOI";
  let note: string;
  if (n < 12) {
    note = `${n} months — under a full year, so there is no T-12 to compare the short windows against.`;
  } else if (lumpOutsideShort && t.kind === "expense") {
    note = `The largest month is month ${lumpiestMonth} of ${n}, ${lumpiness}× the median — outside the last three, so annualizing the last quarter's ${noun} never carries that bill.`;
  } else if (flattering && flattering.months !== 12) {
    note = `${flattering.label} is the figure a seller quotes here; T-12 is the only window holding a full seasonal cycle.`;
  } else {
    note = `T-12 is already the most flattering window, so the short windows are not the argument on this column.`;
  }

  return {
    windows,
    monthsGiven: n,
    t12,
    flattering,
    unflattering,
    spread,
    spreadPct,
    valueSpread,
    priorYearQuarter,
    yoyQuarterPct,
    lumpiness,
    lumpiestMonth,
    lumpOutsideShort,
    note,
  };
}

/** Read a pasted column and run it, in one call — what the card does. */
export function readTrailingText(
  raw: string,
  kind: TrailingKind,
  capPct?: number | null,
): TrailingResult & { skipped: string[] } {
  const { values, skipped } = readStrip(raw);
  return { ...readTrailing({ monthly: values, kind, capPct }), skipped };
}
