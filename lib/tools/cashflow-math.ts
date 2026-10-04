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
//
// What the engine's scan cannot say is left to this module, without
// touching the engine: it looks from −90% to 500% and returns the FIRST
// root. So a strip whose cash flows change sign more than once can have
// more than one rate that solves it, and printing the lowest as "the IRR"
// is the confident wrong answer ([−100, 230, −132] is solved by 10% and by
// 20%); and a conventional strip whose one rate lies past the scan (600%
// on [−100, 700], −95% on [−100, 5]) was told it "changes sign more than
// once", which it does not. `signChanges` and `stripRoots` below count the
// sign changes and look for every rate in a far wider range, and the note
// says which case it is.

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
  /** annual IRR as a percent (15.2 = 15.2%), or null where no single rate
   *  solves the strip — none at all, or more than one */
  irrPct: number | null;
  /** every rate found that solves it, as percents, lowest first — two or
   *  more is a strip with no single IRR */
  irrRoots: number[];
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

/** The widest rate looked at, as a decimal: 100,000%. */
const ROOT_CEILING = 1000;
/** …and the lowest: −99.99%, raised where a long strip would overflow. */
const ROOT_FLOOR = -0.9999;

/** How many times the strip's sign changes, zeros skipped. */
export function signChanges(values: number[]): number {
  let changes = 0;
  let last = 0;
  for (const v of values) {
    if (v === 0) continue;
    if (last !== 0 && Math.sign(v) !== Math.sign(last)) changes += 1;
    last = v;
  }
  return changes;
}

/**
 * Every rate in the searched range at which the strip's NPV is zero, and
 * the range searched. Run in u = ln(1 + r), where a step means the same
 * relative move at −95% as at 600%, and the NPV is a polynomial in
 * x = e^−u evaluated by Horner's rule — no powers, so a fine grid stays
 * cheap on every keystroke. A sign change between grid points is bisected
 * to the rate. Two roots closer together than a step (about 0.1% near
 * zero) are not told apart, which is the engine's own resolution.
 */
export function stripRoots(values: number[]): { roots: number[]; low: number; high: number } {
  const n = values.length - 1;
  // x^n must stay finite at the low end: x = 1 / (1 + r) ≤ 10^(300 / n).
  const low = Math.max(ROOT_FLOOR, n > 0 ? Math.pow(10, -300 / n) - 1 : ROOT_FLOOR);
  const high = ROOT_CEILING;
  const npvAtU = (u: number) => {
    const x = Math.exp(-u);
    let acc = 0;
    for (let t = n; t >= 0; t -= 1) acc = acc * x + values[t];
    return acc;
  };
  const uLow = Math.log(1 + low);
  const uHigh = Math.log(1 + high);
  const step = 0.001;
  const steps = Math.ceil((uHigh - uLow) / step);
  const roots: number[] = [];
  let uPrev = uLow;
  let fPrev = npvAtU(uLow);
  if (fPrev === 0) roots.push(low);
  for (let i = 1; i <= steps; i += 1) {
    const u = Math.min(uHigh, uLow + i * step);
    const f = npvAtU(u);
    if (f === 0) {
      roots.push(Math.exp(u) - 1);
    } else if (fPrev !== 0 && fPrev * f < 0) {
      // Bisect the bracket down to the rate.
      let a = uPrev;
      let b = u;
      let fa = fPrev;
      for (let k = 0; k < 100; k += 1) {
        const m = (a + b) / 2;
        const fm = npvAtU(m);
        if (fm === 0) {
          a = m;
          b = m;
          break;
        }
        if (fa * fm < 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      roots.push(Math.exp((a + b) / 2) - 1);
    }
    uPrev = u;
    fPrev = f;
  }
  return { roots, low, high };
}

/** A rate as the note says it: −99.99%, 600%, 12.3%. */
function ratePctWords(r: number): string {
  const p = r * 100;
  const shown = Math.abs(p) >= 1000 ? Math.round(p).toLocaleString("en-US") : p.toFixed(p > -100 && p < -99 ? 2 : 1);
  return `${shown}%`;
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
    irrRoots: [],
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

  // The rate. One sign change has exactly one rate (Descartes' rule of
  // signs), so where the engine's scan does not reach it the wider search
  // does, and the engine's figure stands wherever it has one — the
  // workbook's. More than one sign change can have several rates, and then
  // none of them is "the" IRR.
  const changes = signChanges(values);
  const engineRate = irr(values);
  const found = stripRoots(values);
  const range = `between ${ratePctWords(found.low)} and ${ratePctWords(found.high)}`;
  let rate: number | null = engineRate;
  let irrRoots: number[];
  let rootNote = "";
  if (changes <= 1) {
    if (rate === null && found.roots.length > 0) rate = found.roots[0];
    irrRoots = rate === null ? [] : [rate * 100];
    if (rate === null) rootNote = `The rate is outside the range searched, ${range}.`;
  } else {
    irrRoots = found.roots.map((r) => r * 100);
    if (found.roots.length >= 2) {
      rate = null;
      const shown = found.roots.map(ratePctWords);
      const list = `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
      rootNote =
        `More than one rate solves this strip — ${list} ${shown.length === 2 ? "both" : "all"} do — ` +
        `because its cash flows change sign ${changes} times, so none of them is the IRR. Read the NPV at your own rate instead.`;
    } else if (found.roots.length === 1) {
      rate = engineRate ?? found.roots[0];
      rootNote = `The cash flows change sign ${changes} times, so the IRR may not be unique — ${ratePctWords(rate)} is the only rate found ${range}.`;
    } else {
      // The search finds a rate where the NPV CROSSES zero; one that only
      // touches it — [−100, 220, −121] is zero at 10% and below zero at
      // every other rate — is a double root no sign change reveals. So the
      // note says what the search found, never that no rate solves the
      // strip: it had said so of that one.
      rate = null;
      rootNote = `The NPV does not change sign at any rate ${range}, so no IRR is shown — with cash flows that change sign ${changes} times, it can touch zero without crossing it. Read the NPV at your own rate instead.`;
    }
  }
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
  if (rootNote) note = note ? `${note} ${rootNote}` : rootNote;

  return {
    irrPct,
    irrRoots,
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
