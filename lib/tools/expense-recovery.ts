/**
 * The operating-expense reconciliation: what the tenant actually owes.
 *
 * The statement that lands every spring and that nobody checks. It is on
 * this page because the three things that move the most money in it are all
 * things a reader has to know to look for — none of them is visible in the
 * bottom line, and two of them change the answer rather than shading it.
 *
 *   1. **Gross-up, and the asymmetry.** Variable expenses scale with
 *      occupancy: a half-empty building spends less on cleaning, lifts and
 *      electricity than a full one. So a base year set while the building
 *      was 70% leased is artificially LOW, and as the building fills, the
 *      tenant is billed for its share of costs that exist only because
 *      other tenants arrived. The protection is to gross BOTH years up to a
 *      stated occupancy — 95% by convention — so the comparison is like for
 *      like. The error worth catching is doing it to ONE of them: grossing
 *      up the current year and leaving the base year at its actual is the
 *      single most expensive move in a reconciliation, and this module
 *      prices it rather than merely warning about it.
 *
 *   2. **A base year and an expense stop are not the same thing.** A base
 *      year is an OUTCOME — whatever the building happened to spend — and
 *      is therefore only as good as the year it was struck in. A stop is a
 *      negotiated number per foot, fixed in the lease, and cannot drift.
 *      They are quoted interchangeably and behave differently, so the
 *      caller states which one the lease has.
 *
 *   3. **A cap is cumulative or it is not**, and over a term the difference
 *      compounds. A **non-cumulative** cap measures each year against what
 *      was actually CHARGED last year, so unused headroom is lost — the
 *      tenant-friendly version. A **cumulative** cap measures against the
 *      base year compounded, so a quiet year banks room for a loud one.
 *      Both are called "a 5% cap" in a term sheet.
 *
 * Caps apply to CONTROLLABLE expenses only. Taxes, insurance and utilities
 * are conventionally carved out, which is why a 5% cap on a building whose
 * insurance doubled is worth much less than it sounds — so the cap is
 * applied to the controllable share and the carve-out is reported beside
 * it rather than buried.
 *
 * The answer is a reconciliation, not a total: the tenant's share less what
 * it already paid in monthly estimates, signed, because the useful sentence
 * is "you owe $18,000" or "you are owed $4,000" and not "your share was
 * $214,000".
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

/** What the lease gives the tenant as its floor. */
export type RecoveryBasis = "base year" | "expense stop";

/** How a cap on controllable expenses is measured. */
export type CapType = "none" | "cumulative" | "non-cumulative";

/** The convention almost every full-service lease grosses up to. */
export const GROSS_UP_TO = 95;

export interface ExpenseYear {
  /** expenses that do not move with occupancy — taxes, insurance, the roof */
  fixed: number | null;
  /** expenses that do — cleaning, lifts, utilities in the common areas */
  variable: number | null;
  /** how full the building actually was, in % */
  occupancyPct: number | null;
}

export interface RecoveryTerms {
  /** the tenant's premises */
  tenantSf: number | null;
  /** the building's rentable area */
  buildingSf: number | null;
  /** which floor the lease gives */
  basis: RecoveryBasis;
  /** the base year, when the lease has one */
  base: ExpenseYear;
  /** the stop in $ per SF, when the lease has one of those instead */
  stopPerSf: number | null;
  /** the year being reconciled */
  current: ExpenseYear;
  /** the occupancy both years are grossed up to, in % */
  grossUpToPct: number | null;
  /** the annual cap on controllable expenses, in % */
  capPct: number | null;
  capType: CapType;
  /** the share of expenses that is CONTROLLABLE, in % — the rest is carved
   *  out of the cap by convention */
  controllablePct: number | null;
  /** years between the base year and the year being reconciled */
  yearsSinceBase: number | null;
  /** what the tenant paid in monthly estimates over the year */
  estimatedPaid: number | null;
}

export interface RecoveryRead {
  /** the tenant's pro rata share, in % */
  sharePct: number | null;
  /** this year's expenses, grossed up to the stated occupancy */
  currentGrossedUp: number | null;
  /** what gross-up ADDED to this year */
  currentGrossUpAdj: number | null;
  /** the floor, grossed up the same way — or the stop times the building */
  baseGrossedUp: number | null;
  baseGrossUpAdj: number | null;
  /** the building-wide increase over the floor, never negative */
  increase: number | null;
  /** the cap's ceiling on the controllable part, null when uncapped */
  capCeiling: number | null;
  /** what the cap took off the bill */
  capSaved: number | null;
  /** the part of the increase the cap never touches */
  carvedOut: number | null;
  /** the increase after the cap */
  billable: number | null;
  /** the tenant's share of that */
  tenantShare: number | null;
  /** share less estimates — POSITIVE is owed by the tenant */
  dueFromTenant: number | null;
  /** the same bill with only the CURRENT year grossed up — the error */
  oneSidedShare: number | null;
  /** what that error would cost this tenant */
  oneSidedCost: number | null;
  note: string | null;
}

const EMPTY: RecoveryRead = {
  sharePct: null,
  currentGrossedUp: null,
  currentGrossUpAdj: null,
  baseGrossedUp: null,
  baseGrossUpAdj: null,
  increase: null,
  capCeiling: null,
  capSaved: null,
  carvedOut: null,
  billable: null,
  tenantShare: null,
  dueFromTenant: null,
  oneSidedShare: null,
  oneSidedCost: null,
  note: null,
};

/**
 * A year's expenses as if the building had been `to` per cent full.
 *
 * Only the variable part moves. The fixed part is the same whether the
 * building is empty or full, which is the whole reason the two are stated
 * separately — grossing up the total is the second most common error here
 * and it overstates every year it touches.
 */
export function grossUp(year: ExpenseYear, to: number): number | null {
  const fixed = real(year.fixed) ? year.fixed : 0;
  const variable = real(year.variable) ? year.variable : 0;
  if (!positive(year.occupancyPct)) return null;
  // Above the gross-up occupancy nothing is added: a building fuller than
  // 95% is already spending what a 95% building spends, and scaling it
  // DOWN would hand the tenant a discount the lease does not give.
  const factor = Math.max(1, to / year.occupancyPct);
  return fixed + variable * factor;
}

export function readRecovery(t: RecoveryTerms): RecoveryRead {
  if (!positive(t.tenantSf) || !positive(t.buildingSf)) {
    return { ...EMPTY, note: "Set the tenant's area and the building's." };
  }
  if (t.tenantSf > t.buildingSf) {
    return {
      ...EMPTY,
      note: "The premises cannot be larger than the building they are in.",
    };
  }
  const sharePct = (t.tenantSf / t.buildingSf) * 100;

  const to = positive(t.grossUpToPct) ? t.grossUpToPct : GROSS_UP_TO;
  const currentGrossedUp = grossUp(t.current, to);
  if (currentGrossedUp === null) {
    return {
      ...EMPTY,
      sharePct: round(sharePct, 4),
      note: "Set this year's expenses and how full the building was.",
    };
  }
  const currentActual =
    (real(t.current.fixed) ? t.current.fixed : 0) +
    (real(t.current.variable) ? t.current.variable : 0);
  const currentGrossUpAdj = currentGrossedUp - currentActual;

  // RULE TWO. The floor is whichever of the two the lease actually gives.
  // A stop is a number; a base year is a year, and has to be grossed up
  // the same way the current year was or the comparison is rigged.
  let baseGrossedUp: number;
  let baseGrossUpAdj: number;
  if (t.basis === "expense stop") {
    if (!positive(t.stopPerSf)) {
      return {
        ...EMPTY,
        sharePct: round(sharePct, 4),
        currentGrossedUp: round(currentGrossedUp),
        currentGrossUpAdj: round(currentGrossUpAdj),
        note: "Set the expense stop, in dollars per square foot.",
      };
    }
    // A stop is quoted per rentable foot of the BUILDING, so the
    // building-wide floor is the stop times the whole building — the same
    // basis the expenses themselves are on.
    baseGrossedUp = t.stopPerSf * t.buildingSf;
    baseGrossUpAdj = 0;
  } else {
    const g = grossUp(t.base, to);
    if (g === null) {
      return {
        ...EMPTY,
        sharePct: round(sharePct, 4),
        currentGrossedUp: round(currentGrossedUp),
        currentGrossUpAdj: round(currentGrossUpAdj),
        note: "Set the base year's expenses and how full the building was THEN — a base year struck in a half-empty building is the thing this card exists to catch.",
      };
    }
    baseGrossedUp = g;
    const baseActual =
      (real(t.base.fixed) ? t.base.fixed : 0) +
      (real(t.base.variable) ? t.base.variable : 0);
    baseGrossUpAdj = g - baseActual;
  }

  const increase = Math.max(0, currentGrossedUp - baseGrossedUp);

  // RULE THREE. The cap reaches the controllable part only. Taxes,
  // insurance and utilities are carved out by convention, which is why a
  // 5% cap is worth much less than it sounds in a year when the insurance
  // doubled — so the carve-out is reported rather than buried.
  const controllable = real(t.controllablePct)
    ? Math.min(100, Math.max(0, t.controllablePct))
    : 100;
  const cappable = increase * (controllable / 100);
  const carvedOut = increase - cappable;

  let capCeiling: number | null = null;
  let capSaved = 0;
  if (t.capType !== "none" && positive(t.capPct)) {
    const years = positive(t.yearsSinceBase) ? Math.floor(t.yearsSinceBase) : 1;
    const c = t.capPct / 100;
    const baseControllable = baseGrossedUp * (controllable / 100);
    // Cumulative banks the unused room and compounds off the base year;
    // non-cumulative measures one year at a time, so it is the allowance
    // for a SINGLE year however long ago the base was struck. Same words
    // in a term sheet, and over a term they are not the same money.
    const ceilingTotal =
      t.capType === "cumulative"
        ? baseControllable * Math.pow(1 + c, years)
        : baseControllable * (1 + c);
    capCeiling = Math.max(0, ceilingTotal - baseControllable);
    capSaved = Math.max(0, cappable - capCeiling);
  }

  const billable = increase - capSaved;
  const tenantShare = billable * (sharePct / 100);
  // Unstated estimates are none paid, not an unknown: a reconciliation
  // with no estimates against it is the whole share falling due, which is
  // a real arrangement and not a missing input.
  const paid = real(t.estimatedPaid) ? t.estimatedPaid : 0;

  // RULE ONE, priced. The same bill with the current year grossed up and
  // the base year left at its actual — the one-sided version. It is never
  // cheaper for the tenant, and on a base year struck in a soft building
  // it is the largest single number on the page.
  //
  // Exactly ONE thing changes: the base year's gross-up. The cap keeps the
  // ceiling it has here, which means it catches part of the inflated
  // increase and the error reported is the conservative one. A landlord
  // making this mistake would likely strike the cap off the ungrossed base
  // too, which is worse — being cautious about the size of an error this
  // names is the right way round.
  const baseActualOrStop =
    t.basis === "expense stop" ? baseGrossedUp : baseGrossedUp - baseGrossUpAdj;
  const oneSidedIncrease = Math.max(0, currentGrossedUp - baseActualOrStop);
  const oneSidedCappable = oneSidedIncrease * (controllable / 100);
  const oneSidedSaved =
    capCeiling === null ? 0 : Math.max(0, oneSidedCappable - capCeiling);
  const oneSidedShare = (oneSidedIncrease - oneSidedSaved) * (sharePct / 100);

  let note: string | null = null;
  if (increase === 0) {
    note =
      "This year's expenses are at or below the floor, so nothing is recoverable — the landlord absorbs the difference, and a reconciliation statement showing a balance due on these figures is wrong.";
  } else if (t.basis === "base year" && positive(t.base.occupancyPct) && t.base.occupancyPct < 80) {
    note = `The base year was struck at ${t.base.occupancyPct}% occupancy. That is the case gross-up exists for: without it this tenant pays for the building filling up.`;
  }

  // Every figure a reader can see is rounded ONCE, and the ones that are
  // differences of the others are taken from the rounded pair — the debt
  // schedule's rule. The card shows the honest share, the one-sided share
  // and the gap between them side by side; a reader subtracts the first
  // two and expects the third, and a set of figures that does not add up
  // reads as broken whatever the arithmetic behind it.
  const shownIncrease = round(increase);
  const shownCapSaved = round(capSaved);
  const shownShare = round(tenantShare);
  const shownOneSided = round(oneSidedShare);
  const shownCarvedOut = round(carvedOut);

  return {
    sharePct: round(sharePct, 4),
    currentGrossedUp: round(currentGrossedUp),
    currentGrossUpAdj: round(currentGrossUpAdj),
    baseGrossedUp: round(baseGrossedUp),
    baseGrossUpAdj: round(baseGrossUpAdj),
    increase: shownIncrease,
    capCeiling: capCeiling === null ? null : round(capCeiling),
    capSaved: shownCapSaved,
    carvedOut: shownCarvedOut,
    billable: shownIncrease - shownCapSaved,
    tenantShare: shownShare,
    dueFromTenant: shownShare - round(paid),
    oneSidedShare: shownOneSided,
    oneSidedCost: shownOneSided - shownShare,
    note,
  };
}
