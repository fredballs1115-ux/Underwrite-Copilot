// A pasted strip of cash flows, read — PURE.
//
// The single most common reason an analyst leaves a screening tool mid-call
// is to paste a column of numbers into Excel and read the IRR off the
// bottom. This is that, without the detour.
//
// It answers with the four figures that column is worth — the rate, the
// multiple, the profit, when the money comes back — and then with the one
// nothing else here does: HOW MUCH OF THE RETURN IS THE EXIT. A 17% IRR
// that is 30% residual and a 17% IRR that is 75% residual are different
// deals wearing the same number, and which one it is decides how hard to
// argue about the exit cap. That split is an IC-memo staple and it is
// exactly the arithmetic a spreadsheet makes tedious.
//
// ONE IRR IN THIS CODEBASE. `irr` comes from lib/underwrite/engine — the
// same function behind the Excel export, whose formulas are recalculated
// against it in CI — so the figure this page shows and the figure the
// workbook shows can never disagree. (lib/model/compute has a second,
// coarser copy for the model tab; a third here would be worse than either.)

import { irr } from "@/lib/underwrite/engine";
import { readFigure } from "@/lib/money";

/** One year of the strip, with the running total beside it. */
export interface StripRow {
  /** 0 for the initial outflow, then 1, 2, 3… */
  year: number;
  flow: number;
  cumulative: number;
}

export interface StripRead {
  values: number[];
  /** tokens that were not numbers, kept so the page can say what it ignored */
  skipped: string[];
}

/**
 * Read a column somebody pasted.
 *
 * Excel's clipboard is tab- and newline-separated; a CSV is comma-separated;
 * and a number's thousands separator is ALSO a comma. So the separator is
 * decided by what the text contains: if there is a line break or a tab, the
 * commas in it are grouping and only line breaks and tabs split. Otherwise
 * commas split. Getting this backwards turns "1,200,000" into three years.
 *
 * Accounting negatives — "(1,200,000)" — are the other shape a spreadsheet
 * produces, and they are converted before the figure is read. Everything
 * else goes through `readFigure` (lib/money), so "$1.2M" works here for the
 * same reason it works in every other field on the page.
 */
export function readStrip(raw: string): StripRead {
  const text = raw.trim();
  if (!text) return { values: [], skipped: [] };
  const structured = /[\n\r\t]/.test(text);
  const tokens = text
    .split(structured ? /[\n\r\t]+/ : /[\n\r\t,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const values: number[] = [];
  const skipped: string[] = [];
  for (const token of tokens) {
    // "(1,200)" is how a spreadsheet writes a negative.
    const signed = /^\(.*\)$/.test(token) ? `-${token.slice(1, -1)}` : token;
    const n = readFigure(signed);
    if (n === null) skipped.push(token);
    else values.push(n);
  }
  return { values, skipped };
}

export interface StripResult {
  /** annual IRR as a percent (15.2 = 15.2%), or null when there is no root */
  irrPct: number | null;
  /** net present value at the discount rate given, or null without one */
  npv: number | null;
  /** total in / total out */
  equityMultiple: number | null;
  /** everything returned less everything invested */
  profit: number | null;
  invested: number;
  returned: number;
  /**
   * When the cumulative total first crosses zero, interpolated within the
   * year — "3.4 years" rather than "year 4", because the difference between
   * month 2 and month 11 of a year is most of a year.
   */
  paybackYears: number | null;
  /** share of the return that is the interim cash flow, 0–100 */
  fromCashFlowPct: number | null;
  /** …and the share that is the sale. The two sum to 100. */
  fromResidualPct: number | null;
  rows: StripRow[];
  /** why a figure is missing, in a sentence, when it is */
  note: string;
}

export interface StripOptions {
  /** the rate the NPV is taken at, as a percent; null for no NPV */
  discountPct?: number | null;
  /**
   * How much of the FINAL year's figure is the sale rather than operations.
   * Without it the split cannot be computed, because nothing in a bare
   * column says where the building was sold — which is the honest answer,
   * not a guess.
   */
  residual?: number | null;
}

/** Present value of `amount` received at `year`, at a decimal rate. */
function pv(amount: number, year: number, rate: number): number {
  return amount / Math.pow(1 + rate, year);
}

export function analyzeStrip(values: number[], opts: StripOptions = {}): StripResult {
  const rows: StripRow[] = [];
  let running = 0;
  for (const [i, flow] of values.entries()) {
    running += flow;
    rows.push({ year: i, flow, cumulative: running });
  }

  const invested = values.reduce((a, v) => a + (v < 0 ? -v : 0), 0);
  const returned = values.reduce((a, v) => a + (v > 0 ? v : 0), 0);

  const empty: StripResult = {
    irrPct: null,
    npv: null,
    equityMultiple: null,
    profit: null,
    invested,
    returned,
    paybackYears: null,
    fromCashFlowPct: null,
    fromResidualPct: null,
    rows,
    note: "",
  };

  if (values.length < 2) {
    return { ...empty, note: "Paste at least two figures — an outflow and what comes back." };
  }
  // A rate needs money going both ways. All-positive or all-negative is a
  // list, not an investment, and reporting the scan floor as a rate would
  // be the kind of confident wrong answer this whole layer avoids.
  if (invested === 0 || returned === 0) {
    return {
      ...empty,
      profit: returned - invested,
      note:
        invested === 0
          ? "Every figure is positive, so there is nothing invested to earn a return on. The first year is normally negative."
          : "Every figure is negative, so nothing comes back — there is no rate to compute.",
    };
  }

  const rate = irr(values);
  const irrPct = rate === null ? null : rate * 100;

  const d = opts.discountPct;
  const npv =
    d === null || d === undefined || !Number.isFinite(d) || d <= -100
      ? null
      : values.reduce((acc, cf, t) => acc + pv(cf, t, d / 100), 0);

  // Payback, interpolated. The crossing is the year the cumulative turns
  // positive; the fraction is how far into that year's flow it happens.
  let paybackYears: number | null = null;
  for (const row of rows) {
    if (row.cumulative >= 0 && row.year > 0) {
      const before = rows[row.year - 1].cumulative;
      paybackYears = row.flow === 0 ? row.year : row.year - 1 + -before / row.flow;
      break;
    }
  }

  // The split. At the IRR the present value of every inflow equals what was
  // put in, so each inflow's PV is its honest share of the return — which is
  // what makes this the standard partition rather than a ratio of raw
  // dollars (those over-credit the far-away sale, which is the whole point).
  let fromCashFlowPct: number | null = null;
  let fromResidualPct: number | null = null;
  let note = "";
  const residual = opts.residual;
  if (rate !== null && residual !== null && residual !== undefined && residual > 0) {
    const lastYear = values.length - 1;
    const lastFlow = values[lastYear];
    if (residual > lastFlow) {
      note = "The sale proceeds are larger than the final year's whole figure — check which is which.";
    } else {
      const pvInflows = values.reduce((acc, cf, t) => acc + (cf > 0 ? pv(cf, t, rate) : 0), 0);
      if (pvInflows > 0) {
        const pvResidual = pv(residual, lastYear, rate);
        fromResidualPct = (pvResidual / pvInflows) * 100;
        fromCashFlowPct = 100 - fromResidualPct;
      }
    }
  }
  if (rate === null) {
    note =
      note ||
      "No single rate solves this strip — it changes sign more than once, so the IRR is ambiguous.";
  }

  return {
    irrPct,
    npv,
    equityMultiple: invested > 0 ? returned / invested : null,
    profit: returned - invested,
    invested,
    returned,
    paybackYears,
    fromCashFlowPct,
    fromResidualPct,
    rows,
    note,
  };
}
