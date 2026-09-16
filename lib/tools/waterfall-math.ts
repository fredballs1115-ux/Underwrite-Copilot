/**
 * Splitting a deal's cash between the LP and the GP.
 *
 * This is the calculation an acquisitions analyst most reliably leaves a
 * screening tool to do, because it is the one a deal page cannot show: the
 * property's IRR is not anybody's IRR. A deal at 16% with an 8% preferred
 * return and a 20% promote over it pays the LP something closer to 14% and
 * the GP something closer to 30%, and which of those numbers is "the
 * return" depends entirely on which side of the table you sit.
 *
 * The structure implemented is the standard JV waterfall with an IRR
 * LOOKBACK, distributed period by period:
 *
 *   1. the preferred return, paid to the LP until its IRR reaches the pref
 *   2. each promote tier in turn, splitting cash at that tier's ratio until
 *      the LP's IRR reaches the tier's hurdle
 *   3. everything above the last hurdle at the last tier's ratio
 *
 * "IRR lookback" means each hurdle is measured on the LP's ACTUAL cash — its
 * contributions and everything it has been paid, including what it is being
 * paid right now — rather than on an accrual account kept alongside. That is
 * both the market convention and the only version that is checkable: the
 * LP's realised IRR at a hurdle boundary equals the hurdle, which is what
 * the tests assert.
 *
 * Return OF capital is not a separate step here. It falls out of the pref
 * tier: an IRR of 8% is not reached until every dollar in has come back
 * plus 8% on it, so a tier-1 distribution is return of capital and pref at
 * once. Structures that pay capital back ahead of pref distribute the same
 * total in a different order, and at a screening level the split is what
 * matters.
 *
 * Pure, no I/O.
 */

import { irr } from "@/lib/underwrite/engine";

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

/** One promote tier: a hurdle, and the LP's share of cash above it. */
export interface Tier {
  /** the LP IRR that must be reached before this tier's split applies, in % */
  hurdlePct: number;
  /** the LP's share of cash distributed in this tier, 0–100 */
  lpSharePct: number;
}

export interface WaterfallTerms {
  /** the DEAL's cash flows, year 0 negative — the same column the cash-flow
   *  strip reads */
  cashFlows: number[];
  /** the LP's share of the equity cheque, 0–100 */
  lpEquityPct: number | null;
  /** the preferred return, as an IRR, in % */
  prefPct: number | null;
  /** the promote tiers above the pref, ascending by hurdle */
  tiers: Tier[];
}

/** What one side of the table put in and got back. */
export interface Side {
  contributed: number;
  distributed: number;
  profit: number;
  irrPct: number | null;
  multiple: number | null;
}

export interface WaterfallRead {
  lp: Side;
  gp: Side;
  /** the deal's own IRR, before any split */
  dealIrrPct: number | null;
  /** what the GP earned ABOVE its pro-rata share of the equity — the promote */
  promote: number;
  /** the promote as a share of the deal's total profit, 0–100 */
  promoteSharePct: number | null;
  /** the LP's IRR less the deal's, in percentage points — always ≤ 0 */
  lpDragPts: number | null;
  /** how much was distributed in each tier, pref first */
  byTier: { label: string; total: number; toLp: number; toGp: number }[];
  note: string | null;
}

const EMPTY: WaterfallRead = {
  lp: { contributed: 0, distributed: 0, profit: 0, irrPct: null, multiple: null },
  gp: { contributed: 0, distributed: 0, profit: 0, irrPct: null, multiple: null },
  dealIrrPct: null,
  promote: 0,
  promoteSharePct: null,
  lpDragPts: null,
  byTier: [],
  note: null,
};

/**
 * The cash the LP needs at period `t` to bring its IRR to exactly `ratePct`,
 * given what it has already put in and taken out.
 *
 * It is the future value, at `t` and at the hurdle rate, of the LP's cash
 * flows so far — negative if the LP is still behind (it needs that much) and
 * positive if it is already ahead (this tier is finished).
 */
function cashToReachHurdle(lpFlows: number[], t: number, ratePct: number): number {
  const r = ratePct / 100;
  let pv = 0;
  for (let j = 0; j <= t && j < lpFlows.length; j++) pv += lpFlows[j] / Math.pow(1 + r, j);
  // A negative PV means the LP is short by that much in today's money;
  // compounded forward to t, that is the cheque that closes the gap.
  return -pv * Math.pow(1 + r, t);
}

const pctOf = (n: number, pct: number) => n * (pct / 100);

export function runWaterfall(t: WaterfallTerms): WaterfallRead {
  const flows = t.cashFlows;
  if (flows.length < 2) {
    return { ...EMPTY, note: "Paste at least two periods — the equity in, then what comes back." };
  }
  const equity = -flows[0];
  if (!(equity > 0)) {
    return { ...EMPTY, note: "The first period is the equity going in, so it must be negative." };
  }
  if (!positive(t.lpEquityPct) || t.lpEquityPct > 100) {
    return { ...EMPTY, note: "Set the LP's share of the equity, between 0 and 100." };
  }
  if (!real(t.prefPct) || t.prefPct < 0) {
    return { ...EMPTY, note: "Set the preferred return." };
  }
  // A tier's LP share outside 0–100 is not a lopsided split, it is a typo,
  // and the arithmetic takes it literally: 120% to the LP pays the GP
  // NEGATIVE dollars, and a negative share hands the GP more than the tier
  // holds. Both render as a bar with a negative width. Refuse rather than
  // clamp — clamping to 100 would silently answer a different question.
  if (t.tiers.some((x) => real(x.lpSharePct) && (x.lpSharePct < 0 || x.lpSharePct > 100))) {
    return { ...EMPTY, note: "A tier's LP share is a share of that tier, so it sits between 0 and 100." };
  }

  const lpShareOfEquity = t.lpEquityPct / 100;
  // The tiers, in the order cash passes through them. The pref is simply the
  // first tier — but it splits PRO RATA, not 100% to the LP. A GP with 10%
  // of the equity is entitled to 10% of the money coming back; what makes
  // the tier a "preferred return" is that the LP must REACH that IRR before
  // anyone's share changes. Paying the pref tier entirely to the LP would
  // mean the GP's co-investment earned nothing until the pref was cleared,
  // which is not what a term sheet says and leaves no promote to measure.
  const ladder: Tier[] = [
    { hurdlePct: t.prefPct, lpSharePct: t.lpEquityPct },
    ...[...t.tiers]
      .filter((x) => real(x.hurdlePct) && real(x.lpSharePct))
      .sort((a, b) => a.hurdlePct - b.hurdlePct),
  ];
  // Above the last hurdle, cash keeps splitting at the last tier's ratio.
  const residualSplit = ladder[ladder.length - 1].lpSharePct;

  const lpFlows: number[] = [];
  const gpFlows: number[] = [];
  const tierTotals = ladder.map(() => ({ total: 0, toLp: 0, toGp: 0 }));
  const residual = { total: 0, toLp: 0, toGp: 0 };

  for (let period = 0; period < flows.length; period++) {
    const cf = flows[period];
    if (period === 0 || cf < 0) {
      // Capital in — split pro rata by the equity shares, always.
      lpFlows[period] = cf * lpShareOfEquity;
      gpFlows[period] = cf * (1 - lpShareOfEquity);
      continue;
    }

    let available = cf;
    let toLp = 0;
    let toGp = 0;

    for (let i = 0; i < ladder.length && available > 0; i++) {
      const tier = ladder[i];
      // What the LP still needs to reach THIS hurdle, measured on its real
      // cash including anything paid to it earlier this period.
      const withPending = [...lpFlows];
      withPending[period] = (withPending[period] ?? 0) + toLp;
      const lpNeeds = cashToReachHurdle(withPending, period, tier.hurdlePct);
      if (lpNeeds <= 0) continue; // already past this hurdle

      // Total cash it takes to hand the LP that much at this tier's split.
      const share = tier.lpSharePct / 100;
      if (share <= 0) continue; // a 0%-to-LP tier can never reach a hurdle
      const tierCash = Math.min(available, lpNeeds / share);
      const lpCut = pctOf(tierCash, tier.lpSharePct);
      const gpCut = tierCash - lpCut;

      toLp += lpCut;
      toGp += gpCut;
      available -= tierCash;
      tierTotals[i].total += tierCash;
      tierTotals[i].toLp += lpCut;
      tierTotals[i].toGp += gpCut;
    }

    // Anything left is above every hurdle.
    if (available > 0) {
      const lpCut = pctOf(available, residualSplit);
      toLp += lpCut;
      toGp += available - lpCut;
      residual.total += available;
      residual.toLp += lpCut;
      residual.toGp += available - lpCut;
    }

    lpFlows[period] = (lpFlows[period] ?? 0) + toLp;
    gpFlows[period] = (gpFlows[period] ?? 0) + toGp;
  }

  for (let i = 0; i < flows.length; i++) {
    lpFlows[i] = lpFlows[i] ?? 0;
    gpFlows[i] = gpFlows[i] ?? 0;
  }

  const lp = sideOf(lpFlows);
  const gp = sideOf(gpFlows);
  const dealIrr = irr(flows);
  const dealProfit = flows.reduce((s, x) => s + x, 0);

  // The promote is what the GP took ABOVE its pro-rata share — the only
  // honest definition, because a GP co-investing 10% is entitled to 10% of
  // everything before any promote is earned.
  const gpProRata = pctOf(lp.distributed + gp.distributed, (1 - lpShareOfEquity) * 100);
  const promote = Math.max(0, gp.distributed - gpProRata);

  const byTier = ladder.map((tier, i) => ({
    label:
      i === 0
        ? `Preferred return, ${trim(tier.hurdlePct)}% — pro rata`
        : `To ${trim(ladder[i].hurdlePct)}% — ${trim(tier.lpSharePct, 0)}/${trim(100 - tier.lpSharePct, 0)}`,
    ...tierTotals[i],
  }));
  if (residual.total > 0.5) {
    byTier.push({
      label: `Above ${trim(ladder[ladder.length - 1].hurdlePct)}% — ${trim(residualSplit, 0)}/${trim(100 - residualSplit, 0)}`,
      ...residual,
    });
  }

  return {
    lp,
    gp,
    dealIrrPct: dealIrr === null ? null : round(dealIrr * 100, 2),
    promote: round(promote),
    promoteSharePct: dealProfit > 0 ? round((promote / dealProfit) * 100, 1) : null,
    lpDragPts:
      dealIrr !== null && lp.irrPct !== null ? round(lp.irrPct - dealIrr * 100, 2) : null,
    byTier: byTier.filter((x) => x.total > 0.5),
    note: null,
  };
}

function sideOf(flows: number[]): Side {
  const contributed = -flows.filter((x) => x < 0).reduce((s, x) => s + x, 0);
  const distributed = flows.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const r = irr(flows);
  return {
    contributed: round(contributed),
    distributed: round(distributed),
    profit: round(distributed - contributed),
    irrPct: r === null ? null : round(r * 100, 2),
    multiple: contributed > 0 ? round(distributed / contributed, 2) : null,
  };
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  // Negative zero is a real value here — a GP with none of the equity
  // contributes `-10_000_000 * 0`, which is -0 — and it would print as
  // "$-0". Normalise it at the one place every figure passes through.
  return r === 0 ? 0 : r;
}

function trim(n: number, places = 2): string {
  const s = n.toFixed(places);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
