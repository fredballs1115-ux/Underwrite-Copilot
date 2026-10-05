/**
 * A building on someone else's land.
 *
 * The ground lease is the one structure on this page where the standard
 * screening arithmetic does not merely mislead — it gives an answer that
 * is wrong by a multiple, and wrong in the optimistic direction.
 *
 * Four rules.
 *
 *   1. **A leasehold is a WASTING asset.** At expiry the building reverts
 *      to the fee owner and the leasehold is worth nothing. Its value is
 *      therefore the present value of the cash flows over the remaining
 *      term and NOTHING ELSE — no reversion, no terminal value. Take the
 *      leasehold's NOI and capitalise it at a fee-simple cap, which is
 *      what a screening model does by default, and you have valued a
 *      perpetuity that does not exist. The error is small at 99 years and
 *      catastrophic at 25, and this module prints both numbers side by
 *      side because the gap is the whole point.
 *
 *      Not all of that gap is the reversion. The capitalised figure is
 *      struck at the fee-simple cap and the term is discounted at another
 *      rate, so part of the gap would be there on a lease that NEVER ended:
 *      the same cash flows run on forever at the discount rate
 *      (`perpetualLeaseholdPv`) set against the cap's figure. That part is
 *      the two inputs disagreeing about the yield, not a finding about the
 *      lease, and the module reports it apart (`rateGapSharePct`) from the
 *      reversion — the cash flows after the term, at the same rate
 *      (`reversionSharePct`) — the way the sale-leaseback card splits its
 *      overpayment (4ba4dda). On the seed, 12.1% of the capitalised figure
 *      is the reversion and 6.6% the rates; the first version called all
 *      18.7% "a reversion the fee owner keeps", and with no growth, a 12%
 *      discount rate and a 5% cap it called 58.8% a reversion where the
 *      reversion is 0.5%. A lease run forever has a value only where the
 *      discount rate is above the NOI's growth and the rent's escalation;
 *      where it is not, the two parts cannot be told apart and the card
 *      says so rather than naming either.
 *
 *   2. **Ground rent coverage is the test the lender actually applies.**
 *      On an unsubordinated lease the ground rent sits SENIOR to the
 *      mortgage: miss it and the fee owner can terminate the lease, which
 *      extinguishes the building, the leasehold and the mortgage with it.
 *      A mortgage lender is therefore behind a landlord who holds the
 *      whole asset hostage, which is why ground-lease deals are quoted on
 *      NOI-to-ground-rent coverage and not on DSCR alone.
 *
 *   3. **A reset is an unhedged liability.** A ground rent that resets
 *      periodically to a percentage of THEN-CURRENT land value is not an
 *      escalation — it is an uncapped repricing, and in a market where
 *      land has run it can multiply. The module prices today's rent
 *      against the reset rent and says what coverage becomes — on the NOI
 *      of the year the reset lands, not today's, since the building's
 *      income has grown by then too — because a lease that covers 4× today
 *      and 1.2× after the reset is a different asset from the one in the
 *      memorandum. And the reset is IN the valuation: from the year it
 *      lands the leasehold pays the reset rent (escalating at the lease's
 *      rate from there) and the leased fee receives it. The reset rent is
 *      struck on the land value entered, held flat — there is no land
 *      growth input, and the note says so, because land that grows makes
 *      the reset dearer and the leasehold worth less than this. The first
 *      version announced the reset and valued the leasehold without it,
 *      and set the reset rent against today's NOI.
 *
 *   4. **Subordinated or not decides whether it is financeable at all.**
 *      A subordinated fee owner has agreed to stand behind the mortgage,
 *      so the lender can foreclose on the building without the landlord
 *      wiping it out. Unsubordinated is the common case and the harder
 *      one: lenders want the term to run well past the loan's maturity,
 *      with a wide margin, and the module says whether it does.
 *
 * The fee side is included because it is the mirror of the same lease and
 * takes one line: the leased fee is the ground rent plus the reversion of
 * the land — closer to a bond than to a building, which is exactly why
 * the two halves trade to different buyers at different rates.
 *
 * Pure, no I/O.
 */

import { usdExact } from "./format";
import { MAX_GROUND_LEASE_YEARS, heldTo } from "./limits";

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

/** The market's rough floor for a lender to look at an unsubordinated lease. */
export const TERM_MARGIN_YEARS = 10;

export interface GroundLeaseTerms {
  /** the building's NOI before the ground rent */
  noi: number | null;
  /** the ground rent payable this year */
  groundRent: number | null;
  /** annual escalation on the ground rent, in % */
  escalationPct: number | null;
  /** NOI growth assumed over the term, in % */
  noiGrowthPct: number | null;
  /** years left on the lease */
  yearsRemaining: number | null;
  /** the rate the leasehold's cash flows are discounted at, in % */
  discountRatePct: number | null;
  /** the cap a comparable FEE SIMPLE building would trade at, in % */
  feeSimpleCapPct: number | null;
  /** has the fee owner subordinated to the mortgage? */
  subordinated: boolean;
  /** the loan's remaining term, which the lease has to outlast */
  loanTermYears: number | null;
  /** years until the ground rent resets — the reset rent is paid from the
   *  year after; null where the lease does not say */
  yearsToReset: number | null;
  /** the reset rent as a percentage of land value */
  resetPctOfLand: number | null;
  /** today's land value, which the reset is struck against, held flat */
  landValue: number | null;
}

export interface GroundLeaseRead {
  /** NOI less the ground rent — what the leasehold actually earns */
  leaseholdNoi: number | null;
  /** NOI over ground rent, the lender's test */
  coverage: number | null;
  /** the present value of the term's cash flows, with no reversion — and
   *  with the reset, where one lands inside the term */
  leaseholdValue: number | null;
  /** the same with the reset left out, so its cost can be said apart */
  leaseholdValueBeforeReset: number | null;
  /** leasehold NOI capitalised as though it ran forever — the error */
  asIfPerpetual: number | null;
  /** how much of the perpetual figure is imaginary, as a % of it… */
  overstatementPct: number | null;
  /** …the share of that which is the reset… */
  resetSharePct: number | null;
  /** …the share that is the reversion: the cash flows after the term, at
   *  the same discount rate, which the fee owner keeps… */
  reversionSharePct: number | null;
  /** …and the share that would be there on a lease that never ended: the
   *  fee-simple cap against the discount rate, the inputs rather than the
   *  lease. These two are null where a lease run forever has no finite
   *  value at the discount rate. */
  rateGapSharePct: number | null;
  /** the leasehold's cash flows run on forever at the discount rate, the
   *  reset left out — null where the rate is not above the NOI's growth and
   *  the rent's escalation */
  asIfNeverEnding: number | null;
  /** the ground rent after the reset, where one is coming */
  resetRent: number | null;
  /** the year the reset rent is first paid; null where the lease gives no
   *  year, or the reset falls after the lease ends */
  resetYear: number | null;
  /** coverage once that rent is payable — on that year's NOI where the
   *  year is known, on today's (a reset struck today) where it is not */
  resetCoverage: number | null;
  /** the leased fee: the rent plus the land coming back */
  leasedFeeValue: number | null;
  /** true when the lease outlasts the loan by the market's margin */
  financeable: boolean;
  /** one sentence the analyst can act on */
  note: string;
}

const EMPTY: GroundLeaseRead = {
  leaseholdNoi: null,
  coverage: null,
  leaseholdValue: null,
  leaseholdValueBeforeReset: null,
  asIfPerpetual: null,
  overstatementPct: null,
  resetSharePct: null,
  reversionSharePct: null,
  rateGapSharePct: null,
  asIfNeverEnding: null,
  resetRent: null,
  resetYear: null,
  resetCoverage: null,
  leasedFeeValue: null,
  financeable: false,
  note: "",
};

/** A reset the term reaches: the rent paid from the year after `afterYears`. */
export interface RentReset {
  afterYears: number;
  rent: number;
}

/**
 * The ground rent payable in year `t`: today's rent escalating, or — from
 * the year after a reset — the reset rent, escalating at the lease's rate
 * from there.
 */
function rentInYear(groundRent: number, e: number, t: number, reset: RentReset | null): number {
  if (reset !== null && t > reset.afterYears) {
    return reset.rent * Math.pow(1 + e, t - reset.afterYears - 1);
  }
  return groundRent * Math.pow(1 + e, t - 1);
}

/**
 * The present value of a leasehold: the term's cash flows and nothing
 * after them.
 *
 * Exported because it is the claim the module exists to make, and a
 * test pins it against a hand-built schedule rather than trusting the
 * closed form — the NOI and the rent grow at different rates, so there
 * is no single annuity factor that covers it.
 */
export function leaseholdPv(
  noi: number,
  groundRent: number,
  noiGrowth: number,
  escalation: number,
  years: number,
  discount: number,
  reset: RentReset | null = null,
): number {
  const g = noiGrowth / 100;
  const e = escalation / 100;
  const r = discount / 100;
  let pv = 0;
  for (let t = 1; t <= years; t += 1) {
    // Year 1 is today's figures; each later year grows from there.
    const cash = noi * Math.pow(1 + g, t - 1) - rentInYear(groundRent, e, t, reset);
    pv += cash / Math.pow(1 + r, t);
  }
  return pv;
}

/**
 * The same leasehold if it NEVER ended: its cash flows — the NOI growing at
 * its rate, the rent escalating at its own — run on forever at the same
 * discount rate. The counterfactual that tells the reversion apart from the
 * rates: set against the capitalised figure it is what the cap and the
 * discount rate disagree about, and set against the term's value it is the
 * reversion, the cash flows after the term. Two growing perpetuities, so a
 * closed form, `noi / (r − g) − rent / (r − e)`; null where the discount
 * rate is not above both growth rates, since then a lease run forever has no
 * finite value. A test pins it to `leaseholdPv` run thousands of years.
 */
export function perpetualLeaseholdPv(
  noi: number,
  groundRent: number,
  noiGrowth: number,
  escalation: number,
  discount: number,
): number | null {
  const g = noiGrowth / 100;
  const e = escalation / 100;
  const r = discount / 100;
  if (!(r > g) || !(r > e)) return null;
  return noi / (r - g) - groundRent / (r - e);
}

/**
 * Whether the term never gets ahead: every running total of its cash flows,
 * from year 1, at or below zero.
 *
 * That is what "worth nothing at ANY discount rate" needs, and it is more
 * than a value at or below zero at the rate entered. Summed by parts, the
 * value at a rate r ≥ 0 is the running totals weighted by x^t(1 − x) and
 * the last by x^n, with x = 1/(1 + r) — every weight at or above zero — so
 * totals that never rise above zero give a value at or below zero at every
 * rate. A lease whose early years pay and whose later years do not is
 * different: at a high enough rate the early years win, so its value is
 * below zero only at some rates, and the card says so at the rate entered.
 */
function neverAhead(
  noi: number,
  groundRent: number,
  growth: number,
  escalation: number,
  years: number,
  reset: RentReset | null,
): boolean {
  const g = growth / 100;
  const e = escalation / 100;
  let total = 0;
  for (let t = 1; t <= years; t += 1) {
    total += noi * Math.pow(1 + g, t - 1) - rentInYear(groundRent, e, t, reset);
    if (total > 0) return false;
  }
  return true;
}

export function readGroundLease(input: GroundLeaseTerms): GroundLeaseRead {
  const {
    noi,
    groundRent,
    escalationPct,
    noiGrowthPct,
    yearsRemaining,
    discountRatePct,
    feeSimpleCapPct,
    subordinated,
    loanTermYears,
    yearsToReset,
    resetPctOfLand,
    landValue,
  } = input;

  if (!positive(noi)) {
    return { ...EMPTY, note: "Enter the building's NOI, before the ground rent." };
  }
  if (!positive(groundRent)) {
    return {
      ...EMPTY,
      note: "Enter the ground rent. Without it this is an ordinary fee-simple building.",
    };
  }

  const leaseholdNoi = round(noi) - round(groundRent);
  const coverage = round(noi / groundRent, 2);
  const growth = real(noiGrowthPct) ? noiGrowthPct : 0;
  const esc = real(escalationPct) ? escalationPct : 0;
  // Held to the longest the card runs (lib/tools/limits).
  const years = positive(yearsRemaining)
    ? Math.max(1, Math.round(heldTo(yearsRemaining, MAX_GROUND_LEASE_YEARS)))
    : null;

  // The reset needs no discount rate, so it answers early — it is often the
  // only figure a reader came for. It is struck on the land value entered,
  // held flat. Where the lease gives its year, coverage is read on THAT
  // year's NOI, which has grown by then; where it does not, the figure is a
  // reset struck today, on today's NOI, and said so.
  const resetAfter =
    real(yearsToReset) && yearsToReset >= 0 ? Math.round(yearsToReset) : null;
  const resetPriced = positive(landValue) && positive(resetPctOfLand);
  // A reset the lease reaches only after it has ended changes nothing.
  const resetPastTerm = resetPriced && resetAfter !== null && years !== null && resetAfter >= years;
  let resetRent: number | null = null;
  let resetYear: number | null = null;
  let resetCoverage: number | null = null;
  if (resetPriced && !resetPastTerm) {
    resetRent = round(landValue * (resetPctOfLand / 100));
    resetYear = resetAfter === null ? null : resetAfter + 1;
    const noiThen = resetAfter === null ? noi : noi * Math.pow(1 + growth / 100, resetAfter);
    resetCoverage = resetRent > 0 ? round(noiThen / resetRent, 2) : null;
  }
  // The reset the valuation can place: a year the lease states, inside it.
  const reset: RentReset | null =
    resetRent !== null && resetAfter !== null ? { afterYears: resetAfter, rent: resetRent } : null;

  const financeable =
    subordinated ||
    (positive(yearsRemaining) &&
      positive(loanTermYears) &&
      yearsRemaining >= loanTermYears + TERM_MARGIN_YEARS);

  const base = {
    ...EMPTY,
    leaseholdNoi,
    coverage,
    resetRent,
    resetYear,
    resetCoverage,
    financeable,
  };

  if (years === null || !positive(discountRatePct)) {
    return {
      ...base,
      note:
        `The ground rent is covered ${coverage}×. ` +
        "Enter the years remaining and a discount rate to value the leasehold.",
    };
  }

  const leaseholdValueBeforeReset = round(
    leaseholdPv(noi, groundRent, growth, esc, years, discountRatePct),
  );
  const leaseholdValue =
    reset === null
      ? leaseholdValueBeforeReset
      : round(leaseholdPv(noi, groundRent, growth, esc, years, discountRatePct, reset));

  const asIfPerpetual = positive(feeSimpleCapPct)
    ? round(leaseholdNoi / (feeSimpleCapPct / 100))
    : null;

  // The same cash flows with no end, at the same rate, the reset left out
  // since its cost is said apart: what tells the reversion from the rates.
  const neverEnding = perpetualLeaseholdPv(noi, groundRent, growth, esc, discountRatePct);
  const asIfNeverEnding = neverEnding === null ? null : round(neverEnding);

  // Taken from the rounded pairs, so the figures on the card reconcile: the
  // overstatement is the reset's share, the reversion's and the rates', and
  // the three add up to it. The gap before the reset is the reversion and
  // the rates together; the rates' share is the capitalised figure against
  // the lease that never ended, and the reversion is what is left.
  const overstatementPct =
    asIfPerpetual !== null && asIfPerpetual > 0
      ? round(((asIfPerpetual - leaseholdValue) / asIfPerpetual) * 100, 1)
      : null;
  const beforeResetPct =
    asIfPerpetual !== null && asIfPerpetual > 0
      ? round(((asIfPerpetual - leaseholdValueBeforeReset) / asIfPerpetual) * 100, 1)
      : null;
  const resetSharePct =
    reset === null || overstatementPct === null || beforeResetPct === null
      ? null
      : round(overstatementPct - beforeResetPct, 1);
  const rateGapSharePct =
    asIfPerpetual !== null && asIfPerpetual > 0 && asIfNeverEnding !== null
      ? round(((asIfPerpetual - asIfNeverEnding) / asIfPerpetual) * 100, 1)
      : null;
  const reversionSharePct =
    rateGapSharePct === null || beforeResetPct === null ? null : round(beforeResetPct - rateGapSharePct, 1);

  // The leased fee is the mirror: the rent for the term — the same rent,
  // reset and all — then the land back. Discounted at the same rate, which
  // understates it if anything — a leased fee is the safer half and usually
  // trades tighter.
  let leasedFeeValue: number | null = null;
  if (positive(landValue)) {
    const r = discountRatePct / 100;
    const e = esc / 100;
    let pv = 0;
    for (let t = 1; t <= years; t += 1) {
      pv += rentInYear(groundRent, e, t, reset) / Math.pow(1 + r, t);
    }
    pv += landValue / Math.pow(1 + r, years);
    leasedFeeValue = round(pv);
  }

  const usd = usdExact;
  const notes: string[] = [];
  if (leaseholdValue <= 0) {
    // A leasehold worth nothing is said as what it is — the building's
    // income over the term does not cover the ground rent — and never as a
    // share of the capitalised figure: against a value below zero that share
    // runs past 100% ("2043.9% of that figure is a reversion"), and a share
    // of a figure that is itself below zero means nothing. The figure is the
    // shared writer's, the minus sign outside the dollar.
    const rate = `${trimmed(discountRatePct)}%`;
    const cash = `the term's cash flows come to ${usd(leaseholdValue)}`;
    if (neverAhead(noi, groundRent, growth, esc, years, reset)) {
      notes.push(
        "The ground rent consumes the building over the remaining term: the leasehold is worth " +
          `nothing at any discount rate, and at ${rate} ${cash}.`,
      );
    } else {
      const opening =
        asIfPerpetual !== null && asIfPerpetual > 0
          ? `Capitalising the leasehold's NOI as though it ran forever says ${usd(asIfPerpetual)}, but over`
          : "Over";
      notes.push(
        `${opening} ${years} years, discounted at ${rate}, the building's income does not cover ` +
          `the ground rent: ${cash}, so the leasehold is worth nothing.`,
      );
    }
  } else if (overstatementPct !== null && overstatementPct > 0) {
    notes.push(
      `Capitalising the leasehold's NOI as though it ran forever says ` +
        `${usd(asIfPerpetual!)}; over ${years} years it is worth ` +
        `${usd(leaseholdValue)} — ` +
        gapSplit({
          overstatementPct,
          beforeResetPct,
          resetPct: resetYear === null ? null : resetSharePct,
          resetYear,
          reversionPct: reversionSharePct,
          ratePct: rateGapSharePct,
          neverEnding: asIfNeverEnding,
          capPct: feeSimpleCapPct as number,
          discountPct: discountRatePct,
          growing: growth !== 0 || esc !== 0,
        }),
    );
  }
  if (resetCoverage !== null && resetRent !== null) {
    // The timing is part of the risk as well as the arithmetic: a reset
    // two years out lands inside most hold periods and one twenty years out
    // does not, and the NOI it is set against has grown in between.
    const struck = `${trimmed(resetPctOfLand as number)}% of the ${usd(round(landValue as number))} land value, held flat as no land growth is entered`;
    notes.push(
      resetYear === null
        ? `Struck today, the reset would take the rent to ${usd(resetRent)} — ${struck} — and coverage from ${coverage}× to ${resetCoverage}×; the lease's reset year is not entered, so the leasehold is valued without it.`
        : resetAfter === 0
          ? `The reset takes the rent to ${usd(resetRent)} now — ${struck} — and coverage from ${coverage}× to ${resetCoverage}×.`
          : `In ${resetAfter} ${resetAfter === 1 ? "year" : "years"} the reset takes the rent to ${usd(resetRent)} — ${struck} — and coverage from ${coverage}× today to ${resetCoverage}× on that year's NOI.`,
    );
  } else if (resetPastTerm) {
    notes.push(`The reset in ${resetAfter} years falls after the lease ends, so it changes nothing here.`);
  }
  if (!subordinated) {
    notes.push(
      financeable
        ? `The fee is unsubordinated, so the ground rent is senior to the mortgage — the term clears the loan by the ${TERM_MARGIN_YEARS}-year margin lenders look for.`
        : `The fee is unsubordinated AND the term does not clear the loan by ${TERM_MARGIN_YEARS} years. A default on the ground rent terminates the lease and the mortgage with it, which is the version lenders decline.`,
    );
  }

  return {
    leaseholdNoi,
    coverage,
    leaseholdValue,
    leaseholdValueBeforeReset,
    asIfPerpetual,
    overstatementPct,
    resetSharePct,
    reversionSharePct,
    rateGapSharePct,
    asIfNeverEnding,
    resetRent,
    resetYear,
    resetCoverage,
    leasedFeeValue,
    financeable,
    note: notes.join(" "),
  };
}

/** Clauses joined as a sentence joins them: "A", "A, and B", "A, B, and C". */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * What the gap between the capitalised figure and the term's value is made
 * of, each part said only where it is there — 4ba4dda's rule on the
 * sale-leaseback card: the reversion the fee owner keeps, the rent reset,
 * and what a lease that never ended would show too, which is the cap and
 * the discount rate disagreeing about the yield rather than anything about
 * the lease. A part that runs the other way is said as giving some back, so
 * the parts said add up to the gap.
 */
function gapSplit(x: {
  overstatementPct: number;
  beforeResetPct: number | null;
  resetPct: number | null;
  resetYear: number | null;
  reversionPct: number | null;
  ratePct: number | null;
  neverEnding: number | null;
  capPct: number;
  discountPct: number;
  growing: boolean;
}): string {
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const cap = `${trimmed(x.capPct)}%`;
  const rate = `${trimmed(x.discountPct)}%`;
  const growth = x.growing ? ", with the growth entered," : "";
  const reset = x.resetPct;
  // The term worth more than the capitalised figure until the reset lands:
  // the whole gap is the reset, said as such.
  if (reset !== null && reset > 0 && x.beforeResetPct !== null && x.beforeResetPct <= 0) {
    return `${pct(x.overstatementPct)} under that figure, and the whole gap is the rent reset in year ${x.resetYear}: without it the term would be worth more than the capitalised figure.`;
  }
  const resetClause = reset !== null && reset > 0 ? `${pct(reset)} is the rent reset in year ${x.resetYear}` : null;
  const resetBack = reset !== null && reset < 0 ? ` The rent reset in year ${x.resetYear} gives ${pct(-reset)} back.` : "";

  // A lease run forever has no finite value at this rate, so the reversion
  // and the rates cannot be told apart — and neither is named alone.
  if (x.reversionPct === null || x.ratePct === null) {
    const together = `${pct(x.beforeResetPct ?? x.overstatementPct)} of that figure is the reversion and the rates together`;
    return (
      `${joinClauses(resetClause ? [together, resetClause] : [together])}: at a discount rate no higher than the NOI's ` +
      `growth or the rent's escalation, a lease that never ended has no finite value, so the two cannot be told apart.${resetBack}`
    );
  }

  // A part past the whole figure is possible only beside one that gives
  // some back, and is said as a size rather than as a slice of the figure.
  const parts: string[] = [];
  if (x.reversionPct > 0) {
    parts.push(
      x.reversionPct > 100
        ? `the reversion the fee owner keeps is worth ${pct(x.reversionPct)} of that figure`
        : `${pct(x.reversionPct)} of that figure is a reversion the fee owner keeps`,
    );
  }
  if (resetClause) parts.push(resetClause);
  if (x.ratePct > 0) {
    parts.push(
      x.ratePct > 100
        ? `a lease that never ended would sit ${pct(x.ratePct)} under that figure`
        : `${pct(x.ratePct)} would be there on a lease that never ended`,
    );
  }
  if (parts.length === 0) return `${pct(x.overstatementPct)} under that figure.${resetBack}`;
  let said = joinClauses(parts);
  said +=
    x.ratePct > 0
      ? `: the ${cap} cap and the ${rate} discount rate${growth} disagree about the yield — the inputs, not the lease.`
      : ".";
  if (x.ratePct < 0 && x.neverEnding !== null) {
    said += ` The rates give ${pct(-x.ratePct)} back: at ${rate}${growth} a lease that never ended would be worth ${usdExact(x.neverEnding)}, more than the ${cap} cap says.`;
  }
  if (x.reversionPct < 0) {
    said += ` The lease's end gives ${pct(-x.reversionPct)} back: run on past it at ${rate}, the leasehold would lose money.`;
  }
  return said + resetBack;
}

/** A percent as typed, without a trailing ".0". */
function trimmed(n: number): string {
  return String(round(n, 2));
}
