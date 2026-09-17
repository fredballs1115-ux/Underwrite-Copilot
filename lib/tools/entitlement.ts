/**
 * The entitlement period: what waiting costs, and whether to option the
 * land instead of buying it.
 *
 * `land-residual` solves what the dirt is worth once it is entitled.
 * `zoning-envelope` says what the code allows. This is the stretch in
 * between — the twelve to thirty-six months of rezoning, site plan and
 * permits that a development pro forma covers as month zero, during which
 * the developer either owns the land and carries it, or holds an option
 * and does not.
 *
 * Four rules.
 *
 * Rule 1. THE CARRY RUNS ON THE LAND AND NOBODY BUDGETS IT. A pro forma
 * has one line called "land", and it is the purchase price. Twenty-four
 * months at 9% on a $6,000,000 site, with $60,000 a year of taxes and
 * insurance on the dirt, is $1,248,600 before a shovel moves — 20.8%
 * added to the land basis, invisible because there is no line for it.
 * Compounded, because interest on land is capitalised into the basis
 * rather than paid out of an income the site does not have.
 * `carryPerMonth` ($52,025) is the figure to put
 * against a delay, and it is the one number in this module that is not a
 * comparison.
 *
 * Rule 2. AN OPTION IS INSURANCE AND ITS PRICE HAS A CLOSED FORM. Set the
 * expected outcome of buying against the expected outcome of optioning
 * and everything about the finished building cancels — the land is worth
 * the same either way if the approval comes. What is left is
 *
 *     f* = (1 − p)(L − A) + C
 *
 * where `p` is the chance of approval, `L` the land price, `A` what the
 * land is worth WITHOUT the entitlement, and `C` the carry. Read it
 * aloud: an option is worth the carry you avoid, plus the probability-
 * weighted loss on land you would be stuck with. The identity a test
 * pins: where the land is worth what you paid whatever happens (L = A),
 * the option is worth EXACTLY the carry, whatever the odds.
 *
 * And the costs that fall on BOTH sides cancel: the consultants,
 * engineers and lawyers pursuing the entitlement are paid by whoever is
 * pursuing it, option or no option, so `entitlementSpend` is reported and
 * deliberately kept out of the break-even. Charging it against the option
 * is the same error `hold-or-sell` prices on selling costs.
 *
 * Rule 3. THE RISK IS A PROBABILITY, NOT A CONTINGENCY. A deck carries a
 * 10% contingency against a binary outcome, and shows the approved case.
 * `expectedValue` against `valueIfApproved` is the gap that framing hides,
 * and `breakEvenProbabilityPct` inverts the whole thing into the question
 * actually being asked: how sure would you have to be, at the fee you have
 * been quoted, before buying beats optioning.
 *
 * Rule 4. "APPLICABLE TO THE PURCHASE PRICE" IS ONE WORD AND IT MOVES THE
 * ANSWER. An applicable fee credits against the price on exercise, so it
 * is only spent when the deal dies; a non-applicable one is spent always.
 * The break-even for an applicable fee is
 *
 *     f* = (L − A) + C / (1 − p)
 *
 * which is strictly larger — and runs away as approval approaches
 * certainty, because a fee you always get back costs nothing. That is the
 * case the module refuses to put a number on rather than printing an
 * enormous one, and the note says why: nobody grants it.
 *
 * Pure, no I/O.
 */

/** Longer than this is a typo rather than an entitlement. */
export const MAX_MONTHS = 120;
/** Above this chance of approval an applicable fee has no finite break-even. */
export const CERTAINTY_PCT = 99;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return (Math.round(n * f) + 0) / f;
}

export type EntitlementTerms = {
  /** What the land costs. */
  landPrice: number | null;
  /** What it is worth WITHOUT the entitlement — the floor if refused. */
  asIsValue: number | null;
  /** What it is worth entitled — the prize. */
  entitledValue: number | null;
  /** How long the approval takes. */
  months: number | null;
  /** The cost of capital on the land while it is held, per year. */
  carryRatePct: number | null;
  /** Taxes, insurance, maintenance on the raw land, per year. */
  holdingCostsAnnual: number | null;
  /** Consultants, engineering, legal — spent by whoever pursues it. */
  entitlementSpend: number | null;
  /** The chance the approval comes. */
  approvalProbabilityPct: number | null;
  /** The option fee being quoted. */
  optionFee: number | null;
  /** Does the fee credit against the price on exercise? */
  feeApplicable: boolean;
};

export type EntitlementRead = {
  /** Interest plus holding costs over the period — the invisible line. */
  carryCost: number | null;
  carryPerMonth: number | null;
  /** The carry as a share of the land price. */
  carryAsPctOfLand: number | null;
  /** What the entitlement is pursued with, on either path. */
  entitlementSpend: number | null;
  /** The fee at which buying and optioning are worth the same. */
  breakEvenOptionFee: number | null;
  /** The quoted fee against that — negative is cheap. */
  feeVsBreakEven: number | null;
  /** Expected outcome of buying the land outright. */
  expectedValueBuying: number | null;
  /** Expected outcome of taking the option at the quoted fee. */
  expectedValueOptioning: number | null;
  /** The deck's number: the approved case, buying. */
  valueIfApproved: number | null;
  /** The other branch, which the deck does not show. */
  valueIfRefused: number | null;
  /** How far the expectation sits below the case being pitched. */
  expectedVsApproved: number | null;
  /** At the quoted fee, the certainty at which buying starts to win. */
  breakEvenProbabilityPct: number | null;
  /**
   * The fee is under the carry it avoids, so the option wins at EVERY
   * probability — certainty included. There is no crossing to report, and
   * that is the finding rather than the absence of one: it is why land is
   * optioned rather than bought.
   */
  optionWinsAtAnyOdds: boolean;
  /** Which path the numbers favour at the quoted fee. */
  favours: "option" | "buy" | null;
  /** An applicable fee at near-certainty has no finite break-even. */
  applicableAtCertainty: boolean;
  /** Even approved, the entitled value does not cover the land and carry. */
  deadEvenApproved: boolean;
  note: string;
};

const EMPTY: Omit<EntitlementRead, "note"> = {
  carryCost: null,
  carryPerMonth: null,
  carryAsPctOfLand: null,
  entitlementSpend: null,
  breakEvenOptionFee: null,
  feeVsBreakEven: null,
  expectedValueBuying: null,
  expectedValueOptioning: null,
  valueIfApproved: null,
  valueIfRefused: null,
  expectedVsApproved: null,
  breakEvenProbabilityPct: null,
  optionWinsAtAnyOdds: false,
  favours: null,
  applicableAtCertainty: false,
  deadEvenApproved: false,
};

/**
 * The fee at which the two paths are worth the same.
 *
 * Exported because it is the module's whole claim, and a test drives it
 * across the probability range rather than asserting one figure.
 */
export function breakEvenFee(
  landPrice: number,
  asIsValue: number,
  carryCost: number,
  probabilityPct: number,
  applicable: boolean,
): number | null {
  const p = Math.min(Math.max(probabilityPct, 0), 100) / 100;
  const spread = landPrice - asIsValue;
  if (!applicable) return (1 - p) * spread + carryCost;
  // An applicable fee comes back on exercise, so at certainty it is free
  // and there is no fee high enough to tip the comparison. Refused rather
  // than printed as an enormous number.
  if (1 - p <= 0) return null;
  return spread + carryCost / (1 - p);
}

export function readEntitlement(t: EntitlementTerms): EntitlementRead {
  if (!positive(t.landPrice)) {
    return { ...EMPTY, note: "Give the land price — everything here is measured against it." };
  }
  if (!positive(t.months)) {
    return { ...EMPTY, note: "Give the months the entitlement takes; that period is the whole cost." };
  }
  if (t.months > MAX_MONTHS) {
    return {
      ...EMPTY,
      note: `${t.months} months is a typo rather than an entitlement — nothing past ${MAX_MONTHS} is run.`,
    };
  }

  const years = t.months / 12;
  const rate = real(t.carryRatePct) ? t.carryRatePct : 0;
  const holding = real(t.holdingCostsAnnual) ? t.holdingCostsAnnual : 0;

  // Rule 1. Compounded, because the interest on land is capitalised into
  // the basis rather than paid out of an income the site does not have.
  const interest = t.landPrice * ((1 + rate / 100) ** years - 1);
  const carryCost = round(interest + holding * years);
  const spend = real(t.entitlementSpend) ? round(t.entitlementSpend) : 0;

  const asIs = real(t.asIsValue) ? t.asIsValue : null;
  const entitled = real(t.entitledValue) ? t.entitledValue : null;
  const pPct = real(t.approvalProbabilityPct)
    ? Math.min(Math.max(t.approvalProbabilityPct, 0), 100)
    : null;
  const fee = real(t.optionFee) ? t.optionFee : null;

  const carry: Omit<EntitlementRead, "note"> = {
    ...EMPTY,
    carryCost,
    carryPerMonth: round(carryCost / t.months),
    carryAsPctOfLand: round((carryCost / t.landPrice) * 100, 1),
    entitlementSpend: spend,
  };

  if (asIs === null || entitled === null || pPct === null) {
    return {
      ...carry,
      note: noteFor(carry, t),
    };
  }

  const p = pPct / 100;
  const breakEven = breakEvenFee(t.landPrice, asIs, carryCost, pPct, t.feeApplicable);
  const applicableAtCertainty = t.feeApplicable && pPct >= CERTAINTY_PCT;

  // Rule 3. Both branches, and the expectation between them. Everything
  // is stated net of the land price and the costs actually borne.
  const valueIfApproved = round(entitled - t.landPrice - carryCost - spend);
  const valueIfRefused = round(asIs - t.landPrice - carryCost - spend);
  const buying = round(p * valueIfApproved + (1 - p) * valueIfRefused);

  // Optioning: the carry is never borne, the entitlement spend always is,
  // and the fee is spent always unless it credits on exercise.
  const optioning =
    fee === null
      ? null
      : round(
          p * (entitled - t.landPrice + (t.feeApplicable ? fee : 0)) - fee - spend,
        );

  const read: Omit<EntitlementRead, "note"> = {
    ...carry,
    breakEvenOptionFee: breakEven === null ? null : round(breakEven),
    feeVsBreakEven: fee === null || breakEven === null ? null : round(fee - breakEven),
    expectedValueBuying: buying,
    expectedValueOptioning: optioning,
    valueIfApproved,
    valueIfRefused,
    expectedVsApproved: round(buying - valueIfApproved),
    // At the quoted fee, the certainty at which buying starts to win.
    // Solved from the same identity: buying beats optioning once
    // (1 − p)(L − A) falls below f − C.
    breakEvenProbabilityPct: (() => {
      if (fee === null || t.feeApplicable) return null;
      const spread = t.landPrice - asIs;
      if (spread <= 0) return null;
      const q = 1 - (fee - carryCost) / spread;
      return q > 1 || q < 0 ? null : round(q * 100, 1);
    })(),
    // A fee under the carry beats owning at EVERY probability, certainty
    // included — the option costs less than the waiting it replaces. The
    // crossing genuinely does not exist there, and reporting only a null
    // hid the reason land gets optioned in the first place.
    optionWinsAtAnyOdds:
      fee !== null && !t.feeApplicable && t.landPrice - asIs > 0 && fee < carryCost,
    deadEvenApproved: entitled - t.landPrice - carryCost - spend <= 0,
    favours:
      optioning === null ? null : optioning > buying ? "option" : optioning < buying ? "buy" : null,
    applicableAtCertainty,
  };

  return { ...read, note: noteFor(read, t) };
}

function usd(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function noteFor(x: Omit<EntitlementRead, "note">, t: EntitlementTerms): string {
  // Rule 4's refusal first: there is no fee to talk about.
  if (x.applicableAtCertainty) {
    return `At ${t.approvalProbabilityPct}% the fee is applicable and therefore free — it credits against a price you are certain to pay — so no fee is high enough to make buying the better path, and there is no break-even to report. Which is why an applicable fee at that certainty is not something a seller grants.`;
  }

  if (x.carryCost === null || x.carryPerMonth === null) {
    return "Give the land price and the months the approval takes.";
  }

  // A site that loses money even with the approval in hand is not an
  // option question at all, and saying which path loses less would be
  // answering the wrong one.
  if (x.deadEvenApproved && x.valueIfApproved !== null) {
    return `Even WITH the approval the site is ${usd(x.valueIfApproved)} under water — the entitled value does not cover the land, the carry and the work. No option structure fixes that; it is a price problem, and ${usd(x.carryCost)} of the shortfall is the carry alone.`;
  }

  // Then the comparison, where there is one.
  if (x.breakEvenOptionFee !== null && x.feeVsBreakEven !== null && x.favours !== null) {
    const cheap = x.feeVsBreakEven < 0;
    const prob = x.optionWinsAtAnyOdds
      ? ` The fee is under the carry it replaces, so there is no crossing at all: the option wins at every probability, certainty included. That is why land is optioned rather than bought.`
      : x.breakEvenProbabilityPct === null
        ? ""
        : ` Put the other way: at that fee you would have to be ${x.breakEvenProbabilityPct}% sure of the approval before buying outright starts to win.`;
    return `The option breaks even at ${usd(x.breakEvenOptionFee)} — the carry you avoid, plus the probability-weighted loss on land you would be left holding. The quoted fee is ${usd(x.feeVsBreakEven)} ${cheap ? "BELOW" : "above"} that, so the numbers favour ${x.favours === "option" ? "the option" : "buying"}.${prob}`;
  }

  // Then rule 3's gap, where the branches are known but no fee is quoted.
  if (x.expectedVsApproved !== null && x.valueIfApproved !== null) {
    return `The approved case is worth ${usd(x.valueIfApproved)} and that is the figure a deck shows; across both branches the expectation is ${usd(x.expectedVsApproved)} lower. A contingency percentage cannot describe a binary outcome — quote the option fee to price it instead.`;
  }

  // Then rule 1 on its own, which is the finding even with nothing else given.
  return `${usd(x.carryCost)} of carry over ${t.months} months — ${usd(x.carryPerMonth)} a month, ${x.carryAsPctOfLand}% on top of the land price, and there is no line for it in the budget. Give what the land is worth un-entitled, what it is worth approved, and the odds, and the option can be priced against it.`;
}
