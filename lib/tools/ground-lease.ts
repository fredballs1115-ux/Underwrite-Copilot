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
 *      against the reset rent and says what coverage becomes, because a
 *      lease that covers 4× today and 1.2× after the reset is a different
 *      asset from the one in the memorandum.
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
  /** years until the ground rent resets; null for no reset */
  yearsToReset: number | null;
  /** the reset rent as a percentage of land value */
  resetPctOfLand: number | null;
  /** today's land value, which the reset would be struck against */
  landValue: number | null;
}

export interface GroundLeaseRead {
  /** NOI less the ground rent — what the leasehold actually earns */
  leaseholdNoi: number | null;
  /** NOI over ground rent, the lender's test */
  coverage: number | null;
  /** the present value of the term's cash flows, with no reversion */
  leaseholdValue: number | null;
  /** leasehold NOI capitalised as though it ran forever — the error */
  asIfPerpetual: number | null;
  /** how much of the perpetual figure is imaginary, as a % of it */
  overstatementPct: number | null;
  /** the ground rent after the reset, where one is coming */
  resetRent: number | null;
  /** coverage once that rent is payable */
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
  asIfPerpetual: null,
  overstatementPct: null,
  resetRent: null,
  resetCoverage: null,
  leasedFeeValue: null,
  financeable: false,
  note: "",
};

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
): number {
  const g = noiGrowth / 100;
  const e = escalation / 100;
  const r = discount / 100;
  let pv = 0;
  for (let t = 1; t <= years; t += 1) {
    // Year 1 is today's figures; each later year grows from there.
    const cash = noi * Math.pow(1 + g, t - 1) - groundRent * Math.pow(1 + e, t - 1);
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

  // The reset needs no term and no discount rate, so it answers early —
  // it is often the only figure a reader came for.
  let resetRent: number | null = null;
  let resetCoverage: number | null = null;
  if (positive(landValue) && positive(resetPctOfLand)) {
    resetRent = round(landValue * (resetPctOfLand / 100));
    resetCoverage = resetRent > 0 ? round(noi / resetRent, 2) : null;
  }

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
    resetCoverage,
    financeable,
  };

  if (!positive(yearsRemaining) || !positive(discountRatePct)) {
    return {
      ...base,
      note:
        `The ground rent is covered ${coverage}×. ` +
        "Enter the years remaining and a discount rate to value the leasehold.",
    };
  }

  const years = Math.max(1, Math.round(yearsRemaining));
  const growth = real(noiGrowthPct) ? noiGrowthPct : 0;
  const esc = real(escalationPct) ? escalationPct : 0;

  const leaseholdValue = round(
    leaseholdPv(noi, groundRent, growth, esc, years, discountRatePct),
  );

  const asIfPerpetual = positive(feeSimpleCapPct)
    ? round(leaseholdNoi / (feeSimpleCapPct / 100))
    : null;

  // Taken from the rounded pair, so the figures on the card reconcile.
  const overstatementPct =
    asIfPerpetual !== null && asIfPerpetual > 0
      ? round(((asIfPerpetual - leaseholdValue) / asIfPerpetual) * 100, 1)
      : null;

  // The leased fee is the mirror: the rent for the term, then the land
  // back. Discounted at the same rate, which understates it if anything —
  // a leased fee is the safer half and usually trades tighter.
  let leasedFeeValue: number | null = null;
  if (positive(landValue)) {
    const r = discountRatePct / 100;
    const e = esc / 100;
    let pv = 0;
    for (let t = 1; t <= years; t += 1) {
      pv += (groundRent * Math.pow(1 + e, t - 1)) / Math.pow(1 + r, t);
    }
    pv += landValue / Math.pow(1 + r, years);
    leasedFeeValue = round(pv);
  }

  const notes: string[] = [];
  if (overstatementPct !== null && overstatementPct > 0) {
    notes.push(
      `Capitalising the leasehold's NOI as though it ran forever says ` +
        `$${asIfPerpetual!.toLocaleString("en-US")}; over ${years} years it is worth ` +
        `$${leaseholdValue.toLocaleString("en-US")} — ${overstatementPct}% of that figure is a reversion ` +
        "the fee owner keeps.",
    );
  } else if (leaseholdValue <= 0) {
    notes.push(
      "The ground rent consumes the building over the remaining term: the leasehold is worth nothing at any discount rate.",
    );
  }
  if (resetCoverage !== null && resetRent !== null && resetRent > groundRent) {
    // The timing is part of the risk rather than part of the arithmetic:
    // the rent is struck at land value whenever it comes, but a reset two
    // years out and one twenty years out are different assets, and the
    // near one lands inside most hold periods.
    const when = positive(yearsToReset)
      ? `In ${Math.round(yearsToReset)} years the reset takes`
      : "The reset takes";
    notes.push(
      `${when} the rent to $${resetRent.toLocaleString("en-US")} and coverage from ` +
        `${coverage}× to ${resetCoverage}×.`,
    );
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
    asIfPerpetual,
    overstatementPct,
    resetRent,
    resetCoverage,
    leasedFeeValue,
    financeable,
    note: notes.join(" "),
  };
}
