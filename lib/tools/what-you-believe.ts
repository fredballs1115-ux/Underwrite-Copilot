/**
 * What you would have to believe.
 *
 * Every other calculation on this page takes assumptions and returns a
 * number. This one runs backwards: it takes the PRICE, the return you
 * need, and the exit you expect, and reports the growth rate that would
 * have to be true for the deal to work.
 *
 * That inversion is the most useful sanity check in screening, because a
 * pro forma is a set of assumptions chosen to reach a conclusion, and the
 * honest question is never "what does this model say" but "what is this
 * model assuming, and is it a thing that happens". A deal that pencils at
 * 3% NOI growth and a deal that pencils at 9% look identical on a
 * summary page.
 *
 * Four rules.
 *
 *   1. **The exit capitalises the FORWARD NOI.** A buyer at the end of
 *      year five is buying year six's income, so the exit value is next
 *      year's NOI over the exit cap. Capitalising the TRAILING year
 *      understates the exit by a full year of growth, which makes every
 *      deal look worse than it is and, worse, by an amount that varies
 *      with the growth rate being solved for. The convention is stated
 *      because it moves the answer.
 *
 *   2. **Solve, do not scan.** The net present value of the stream AT THE
 *      TARGET RATE is monotone in the growth rate, so the growth that
 *      makes it zero is exactly the growth at which the IRR equals the
 *      target. Bisecting that is exact and cheap. The claim is checkable,
 *      and a test checks it: build the stream at the solved growth, run
 *      it through `irr` — the shared one behind the Excel export — and
 *      the answer comes back as the target.
 *
 *   3. **The required growth is a CLAIM, not a verdict.** This module
 *      says what you would have to believe; whether the market will do it
 *      is not arithmetic. The benchmark to judge it against is an input,
 *      and the words it puts on the gap ("at market", "a stretch",
 *      "heroic") are about the DISTANCE from that benchmark, never about
 *      the market itself.
 *
 *   4. **Cap compression is not a plan.** The same deal can be made to
 *      work by assuming a lower exit cap instead of higher growth, so the
 *      module solves that lever too — and flags the case that should stop
 *      a screening: an exit cap required to be BELOW the going-in cap.
 *      That is betting on the market re-rating rather than on the
 *      building earning more, and it is the assumption most likely to be
 *      buried in a model rather than argued for.
 *
 * **The return here is UNLEVERED**, and that is not a detail. Most stated
 * targets are levered: a 12% levered IRR on 60% debt is a far smaller ask
 * than a 12% unlevered one, and typing a levered target into an unlevered
 * solve makes every deal look heroic. The card says so in as many words.
 * Debt is deliberately out of scope — `sizeLoan` and `readDebt` already
 * do that, and folding a capital structure in here would turn one honest
 * question into four assumptions.
 *
 * Pure, no I/O.
 */

// No `irr` import here on purpose: the solve works on the NPV at the
// target rate, which is cheaper and exact. The agreement WITH the shared
// `irr` is the test's job — it rebuilds the stream at the solved rate and
// runs it through the engine's own function, so the check is against the
// real thing rather than against a copy kept here.

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

/** How far past the benchmark the required growth sits. */
export type Reach = "at market" | "a stretch" | "heroic";

/** Above the benchmark by this many points and it stops being a forecast. */
export const STRETCH_POINTS = 1;
export const HEROIC_POINTS = 3;

export interface BeliefInputs {
  /** what you are paying */
  price: number | null;
  /** year one's NOI, before any growth */
  noi: number | null;
  /** years held */
  holdYears: number | null;
  /** the cap the building is sold at */
  exitCapPct: number | null;
  /** the return the equity needs, in % */
  targetIrrPct: number | null;
  /** cost of sale as a % of the exit price */
  sellingCostPct: number | null;
  /** the growth an analyst would call ordinary here, in % */
  marketGrowthPct: number | null;
}

export interface BeliefRead {
  /** NOI over price — where the deal starts */
  goingInCapPct: number | null;
  /** the headline: the NOI growth the target return requires, in % */
  requiredGrowthPct: number | null;
  /** year N+1's NOI at that growth — what the buyer capitalises */
  exitNoi: number | null;
  /** the exit price it implies, net of the cost of sale */
  exitPrice: number | null;
  /** the OTHER lever: the exit cap that works at market growth, in % */
  requiredExitCapPct: number | null;
  /** that cap against the going-in cap, in basis points (negative = compression) */
  capShiftBps: number | null;
  /** required growth less the benchmark, in percentage points */
  aboveMarketBy: number | null;
  /** how far past the benchmark that is */
  reach: Reach | null;
  /** one sentence the analyst can act on */
  note: string;
}

const EMPTY: BeliefRead = {
  goingInCapPct: null,
  requiredGrowthPct: null,
  exitNoi: null,
  exitPrice: null,
  requiredExitCapPct: null,
  capShiftBps: null,
  aboveMarketBy: null,
  reach: null,
  note: "",
};

/**
 * The unlevered stream a hold produces at a given growth rate.
 *
 * Year one is the going-in NOI; year t is that grown t−1 times. The sale
 * lands in the final year and capitalises the FORWARD NOI — year N+1 —
 * because that is the income the next buyer is purchasing (rule 1).
 *
 * Exported so a test can run it through the shared `irr` rather than
 * trusting the solver that produced the rate.
 */
export function holdStream(
  price: number,
  noi: number,
  growthPct: number,
  years: number,
  exitCapPct: number,
  sellingCostPct: number,
): number[] {
  const g = growthPct / 100;
  const out: number[] = [-price];
  for (let t = 1; t <= years; t += 1) {
    out.push(noi * Math.pow(1 + g, t - 1));
  }
  const forwardNoi = noi * Math.pow(1 + g, years);
  const gross = forwardNoi / (exitCapPct / 100);
  out[years] += gross * (1 - sellingCostPct / 100);
  return out;
}

/** Present value of that stream at a rate — zero exactly when IRR = rate. */
function npvAt(stream: number[], ratePct: number): number {
  const r = ratePct / 100;
  return stream.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
}

/**
 * Bisect a monotone function to a tolerance.
 *
 * Returns null when the bracket does not contain a crossing — which is a
 * real answer ("no growth rate in this range gets there"), not a failure
 * to be papered over with the nearest endpoint.
 */
function solve(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-7,
): number | null {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  for (let i = 0; i < 200 && b - a > tol; i += 1) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fa * fm < 0) {
      b = m;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

export function readBelief(input: BeliefInputs): BeliefRead {
  const {
    price,
    noi,
    holdYears,
    exitCapPct,
    targetIrrPct,
    sellingCostPct,
    marketGrowthPct,
  } = input;

  if (!positive(price)) {
    return { ...EMPTY, note: "Enter the price you are paying." };
  }
  if (!positive(noi)) {
    return { ...EMPTY, note: "Enter year one's NOI." };
  }

  const goingInCapPct = round((noi / price) * 100, 2);

  if (!positive(holdYears) || !positive(exitCapPct) || !positive(targetIrrPct)) {
    return {
      ...EMPTY,
      goingInCapPct,
      note:
        `The deal starts at a ${goingInCapPct}% cap. ` +
        "Enter the hold, the exit cap and the return you need.",
    };
  }

  const years = Math.max(1, Math.round(holdYears));
  const sale = real(sellingCostPct) ? sellingCostPct : 0;

  // Rule 2: NPV at the target rate is monotone in growth, so its zero is
  // the growth at which the IRR equals the target.
  const atGrowth = (g: number) =>
    npvAt(holdStream(price, noi, g, years, exitCapPct, sale), targetIrrPct);

  const solvedGrowth = solve(atGrowth, -50, 50);
  const requiredGrowthPct = solvedGrowth === null ? null : round(solvedGrowth, 2);

  // The other lever, at the growth an analyst would call ordinary. NPV
  // FALLS as the exit cap rises (a higher cap is a lower exit price), so
  // the bracket runs the other way round.
  let requiredExitCapPct: number | null = null;
  if (positive(marketGrowthPct) || marketGrowthPct === 0) {
    const atCap = (c: number) =>
      npvAt(
        holdStream(price, noi, marketGrowthPct ?? 0, years, c, sale),
        targetIrrPct,
      );
    const solvedCap = solve(atCap, 0.25, 30);
    requiredExitCapPct = solvedCap === null ? null : round(solvedCap, 2);
  }

  const capShiftBps =
    requiredExitCapPct === null
      ? null
      : round((requiredExitCapPct - goingInCapPct) * 100);

  let exitNoi: number | null = null;
  let exitPrice: number | null = null;
  if (requiredGrowthPct !== null) {
    const g = requiredGrowthPct / 100;
    exitNoi = round(noi * Math.pow(1 + g, years));
    exitPrice = round((exitNoi / (exitCapPct / 100)) * (1 - sale / 100));
  }

  let aboveMarketBy: number | null = null;
  let reach: Reach | null = null;
  if (requiredGrowthPct !== null && real(marketGrowthPct)) {
    aboveMarketBy = round(requiredGrowthPct - marketGrowthPct, 2);
    reach =
      aboveMarketBy >= HEROIC_POINTS
        ? "heroic"
        : aboveMarketBy >= STRETCH_POINTS
          ? "a stretch"
          : "at market";
  }

  const notes: string[] = [];
  if (requiredGrowthPct === null) {
    notes.push(
      `No growth rate up to 50% a year reaches a ${targetIrrPct}% return at this price. ` +
        "The exit cap or the price has to move, not the operations.",
    );
  } else {
    notes.push(
      `This deal needs NOI to grow ${requiredGrowthPct}% a year for ${years} years ` +
        `to return ${targetIrrPct}%.`,
    );
    if (reach !== null && aboveMarketBy !== null) {
      notes.push(
        reach === "at market"
          ? `That is within a point of the ${marketGrowthPct}% you called ordinary.`
          : `That is ${aboveMarketBy} points above the ${marketGrowthPct}% you called ordinary — ${reach}.`,
      );
    }
  }
  // Rule 4: the flag that should stop a screening.
  if (capShiftBps !== null && capShiftBps < 0) {
    notes.push(
      `Taking the growth at market instead, the exit cap has to be ${requiredExitCapPct}% — ` +
        `${Math.abs(capShiftBps)} basis points TIGHTER than the ${goingInCapPct}% you are buying at. ` +
        "That is a bet on the market re-rating, not on the building.",
    );
  } else if (capShiftBps !== null) {
    notes.push(
      `At market growth the exit cap can be as wide as ${requiredExitCapPct}% and still clear the target.`,
    );
  }

  return {
    goingInCapPct,
    requiredGrowthPct,
    exitNoi,
    exitPrice,
    requiredExitCapPct,
    capShiftBps,
    aboveMarketBy,
    reach,
    note: notes.join(" "),
  };
}
