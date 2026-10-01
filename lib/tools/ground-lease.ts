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
  /** …and the share of that which is the reset rather than the reversion */
  resetSharePct: number | null;
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

  // Taken from the rounded pairs, so the figures on the card reconcile: the
  // overstatement is the reversion's share and the reset's, and the two add
  // up to it.
  const overstatementPct =
    asIfPerpetual !== null && asIfPerpetual > 0
      ? round(((asIfPerpetual - leaseholdValue) / asIfPerpetual) * 100, 1)
      : null;
  const reversionPct =
    asIfPerpetual !== null && asIfPerpetual > 0
      ? round(((asIfPerpetual - leaseholdValueBeforeReset) / asIfPerpetual) * 100, 1)
      : null;
  const resetSharePct =
    reset === null || overstatementPct === null || reversionPct === null
      ? null
      : round(overstatementPct - reversionPct, 1);

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
  if (overstatementPct !== null && overstatementPct > 0) {
    const split =
      resetSharePct !== null && resetSharePct > 0 && reversionPct !== null
        ? `${reversionPct.toFixed(1)}% of that figure is a reversion the fee owner keeps, and ${resetSharePct.toFixed(1)}% is the rent reset in year ${resetYear}.`
        : `${overstatementPct}% of that figure is a reversion the fee owner keeps.`;
    notes.push(
      `Capitalising the leasehold's NOI as though it ran forever says ` +
        `${usd(asIfPerpetual!)}; over ${years} years it is worth ` +
        `${usd(leaseholdValue)} — ${split}`,
    );
  } else if (leaseholdValue <= 0) {
    notes.push(
      "The ground rent consumes the building over the remaining term: the leasehold is worth nothing at any discount rate.",
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
    resetRent,
    resetYear,
    resetCoverage,
    leasedFeeValue,
    financeable,
    note: notes.join(" "),
  };
}

/** A percent as typed, without a trailing ".0". */
function trimmed(n: number): string {
  return String(round(n, 2));
}
