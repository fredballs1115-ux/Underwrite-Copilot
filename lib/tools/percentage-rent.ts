/**
 * Percentage rent, the breakpoint, and what the tenant can actually carry.
 *
 * The retail lease's own arithmetic. Three rules, and the middle one
 * changes the answer rather than shading it.
 *
 *   1. **The natural breakpoint is DERIVED, not negotiated.** It is the
 *      base rent divided by the percentage rate — the sales level at which
 *      the percentage rent would equal the base rent, so that above it the
 *      landlord participates and below it does not. A lease that states a
 *      breakpoint different from that number has an ARTIFICIAL one, which
 *      is a perfectly normal thing to negotiate and an easy thing to read
 *      past: below natural it starts the landlord's participation sooner,
 *      above natural it starts it later. This module derives the natural
 *      one always, says which the lease is using, and prices the gap.
 *
 *   2. **Percentage rent is owed on the YEAR'S sales, reconciled at year
 *      end.** A landlord who bills monthly against a twelfth of the
 *      breakpoint, with no true-up, collects on every strong month and
 *      refunds nothing for the weak ones — so a seasonal tenant pays on
 *      sales it never made over the year. On the seeded tenant that is
 *      real money on a lease whose annual figure is zero. The module
 *      computes both and names the difference, because the difference is
 *      invisible in any single month's statement.
 *
 *   3. **The occupancy cost ratio is the test of whether the rent is
 *      durable.** Base plus percentage plus the recoveries, over sales. A
 *      rent the tenant cannot carry is a rent that is renegotiated at the
 *      option or handed back, whatever the lease says — which is why a
 *      screening model wants the ratio and not just the rent. What counts
 *      as healthy is CATEGORY-specific (a jeweller and a restaurant are
 *      nowhere near each other), so the ceiling is an input with a
 *      default rather than a number this module asserts.
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

/** Whichever side a stated breakpoint moves the money toward. */
export type Favours = "landlord" | "tenant" | "neither";

export interface PercentageRentTerms {
  /** the annual base rent (minimum rent) */
  baseRent: number | null;
  /** the percentage of sales over the breakpoint, in % */
  ratePct: number | null;
  /** the breakpoint the lease STATES, or null to use the natural one */
  statedBreakpoint: number | null;
  /** the year's sales month by month, in the lease year's order */
  monthlySales: number[];
  /** CAM, taxes and insurance for the year — the rest of occupancy cost */
  recoveries: number | null;
  /** the premises, so the rents can be said per foot */
  tenantSf: number | null;
  /** the occupancy cost the analyst treats as the ceiling, in % */
  healthyCeilingPct: number | null;
}

export interface PercentageRentRead {
  /** base rent over the rate — always computed, whatever the lease says */
  naturalBreakpoint: number | null;
  /** the one the arithmetic below actually uses */
  breakpointUsed: number | null;
  /** true when the lease states something other than the natural one */
  artificial: boolean;
  /** which side an artificial breakpoint moves the money toward */
  favours: Favours;
  /** the year's sales */
  annualSales: number | null;
  /** sales above the breakpoint, never negative */
  overage: number | null;
  /** what is owed on the year — the correct figure */
  percentageRent: number | null;
  /** what a monthly bill with no year-end true-up would have collected */
  monthlyBasisRent: number | null;
  /** the second less the first: what the missing true-up costs the tenant */
  trueUpOwed: number | null;
  /** the months that breached a twelfth of the breakpoint */
  monthsOver: number;
  /** base + percentage + recoveries */
  totalOccupancyCost: number | null;
  /** that over sales, in % */
  occupancyCostPct: number | null;
  /** sales the tenant would need to reach the stated ceiling */
  salesToClearCeiling: number | null;
  /** base rent per SF, and all-in per SF */
  baseRentPsf: number | null;
  allInPsf: number | null;
  note: string | null;
}

const EMPTY: PercentageRentRead = {
  naturalBreakpoint: null,
  breakpointUsed: null,
  artificial: false,
  favours: "neither",
  annualSales: null,
  overage: null,
  percentageRent: null,
  monthlyBasisRent: null,
  trueUpOwed: null,
  monthsOver: 0,
  totalOccupancyCost: null,
  occupancyCostPct: null,
  salesToClearCeiling: null,
  baseRentPsf: null,
  allInPsf: null,
  note: null,
};

/**
 * The sales level at which percentage rent equals base rent.
 *
 * `base / rate`. Exported because it is the one figure a reader most often
 * wants on its own, and because a module that hides it invites a lease's
 * stated breakpoint to go unchallenged.
 */
export function naturalBreakpoint(
  baseRent: number | null,
  ratePct: number | null,
): number | null {
  if (!positive(baseRent) || !positive(ratePct)) return null;
  return baseRent / (ratePct / 100);
}

export function readPercentageRent(t: PercentageRentTerms): PercentageRentRead {
  if (!positive(t.baseRent)) {
    return { ...EMPTY, note: "Set the annual base rent." };
  }
  if (!positive(t.ratePct)) {
    return {
      ...EMPTY,
      note: "Set the percentage of sales over the breakpoint — without it there is no breakpoint to derive.",
    };
  }

  // RULE ONE. Always derived, then compared with whatever the lease says.
  const natural = naturalBreakpoint(t.baseRent, t.ratePct)!;
  const stated = positive(t.statedBreakpoint) ? t.statedBreakpoint : null;
  const breakpoint = stated ?? natural;
  // A stated figure within a dollar of the derived one is the natural
  // breakpoint written down, not an artificial one.
  const artificial = stated !== null && Math.abs(stated - natural) > 1;
  const favours: Favours = !artificial
    ? "neither"
    : stated! < natural
      ? "landlord"
      : "tenant";

  const sales = t.monthlySales.filter((n) => real(n) && n >= 0);
  if (sales.length === 0) {
    return {
      ...EMPTY,
      naturalBreakpoint: round(natural),
      breakpointUsed: round(breakpoint),
      artificial,
      favours,
      note: "Paste the year's sales, month by month — the monthly shape is what the year-end true-up exists for.",
    };
  }
  const annualSales = sales.reduce((a, b) => a + b, 0);

  const overage = Math.max(0, annualSales - breakpoint);
  const percentageRent = overage * (t.ratePct / 100);

  // RULE TWO. The same lease billed monthly against a twelfth of the
  // breakpoint, with no year-end reconciliation. Each month stands alone,
  // so a month under the line contributes nothing to offset a month over
  // it — which is exactly the asymmetry a seasonal tenant lives with.
  const monthlyBreak = breakpoint / 12;
  let monthlyBasisRent = 0;
  let monthsOver = 0;
  for (const m of sales) {
    if (m > monthlyBreak) {
      monthsOver += 1;
      monthlyBasisRent += (m - monthlyBreak) * (t.ratePct / 100);
    }
  }

  const recoveries = real(t.recoveries) && t.recoveries > 0 ? t.recoveries : 0;
  const shownPercentage = round(percentageRent);
  const shownMonthly = round(monthlyBasisRent);
  const totalOccupancyCost = t.baseRent + shownPercentage + recoveries;
  const occupancyCostPct =
    annualSales > 0 ? (totalOccupancyCost / annualSales) * 100 : null;

  // RULE THREE. The sales that would bring the ratio to the ceiling the
  // caller set. Solved rather than approximated, because percentage rent
  // is itself a function of sales: above the breakpoint,
  //   cost(S) = base + rate·(S − B) + recoveries
  // and cost(S) = ceiling·S gives
  //   S = (base + recoveries − rate·B) / (ceiling − rate).
  // Below the breakpoint the cost is flat, so it is the simple ratio.
  const ceiling = positive(t.healthyCeilingPct) ? t.healthyCeilingPct : 10;
  const c = ceiling / 100;
  const r = t.ratePct / 100;
  const flatCost = t.baseRent + recoveries;
  let salesToClearCeiling: number | null = null;
  const flatAnswer = c > 0 ? flatCost / c : null;
  if (flatAnswer !== null && flatAnswer <= breakpoint) {
    // The ceiling is reached before the landlord ever participates.
    salesToClearCeiling = flatAnswer;
  } else if (c > r) {
    salesToClearCeiling = (flatCost - r * breakpoint) / (c - r);
  }
  // A ceiling at or below the percentage rate can never be reached: every
  // extra dollar of sales adds at least `rate` of itself to the cost, so
  // the ratio stops falling. Reported as null rather than as a number.

  const baseRentPsf = positive(t.tenantSf) ? t.baseRent / t.tenantSf : null;
  const allInPsf = positive(t.tenantSf) ? totalOccupancyCost / t.tenantSf : null;

  let note: string | null = null;
  if (sales.length !== 12) {
    note = `${sales.length} months of sales, not twelve — the annual figures below cover only what was pasted.`;
  } else if (shownMonthly > shownPercentage) {
    note =
      "Billed monthly with no year-end true-up, this lease collects percentage rent the year's sales do not support. The reconciliation is the tenant's protection, and its absence is worth reading the lease for.";
  } else if (overage === 0) {
    note =
      "Sales are below the breakpoint, so no percentage rent is owed on the year. The base rent stands alone.";
  }

  return {
    naturalBreakpoint: round(natural),
    breakpointUsed: round(breakpoint),
    artificial,
    favours,
    annualSales: round(annualSales),
    overage: round(overage),
    percentageRent: shownPercentage,
    monthlyBasisRent: shownMonthly,
    trueUpOwed: shownMonthly - shownPercentage,
    monthsOver,
    totalOccupancyCost: round(totalOccupancyCost),
    occupancyCostPct: occupancyCostPct === null ? null : round(occupancyCostPct, 2),
    salesToClearCeiling:
      salesToClearCeiling === null || salesToClearCeiling < 0
        ? null
        : round(salesToClearCeiling),
    baseRentPsf: baseRentPsf === null ? null : round(baseRentPsf, 2),
    allInPsf: allInPsf === null ? null : round(allInPsf, 2),
    note,
  };
}
