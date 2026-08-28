/**
 * The forward-looking layer of the BOV Reconciler.
 *
 * Comparing two brokers' assumptions tells you where they disagree. It does
 * NOT tell you which one you should believe. The honest answer to "who's
 * right" is: neither — but one of these prices implies a return you'd accept
 * and one doesn't. So run each valuation's assumption set through the user's
 * OWN model at that valuation's headline price and report the levered IRR a
 * buyer would actually earn.
 *
 * Anything the valuation doesn't state falls back to the user's own model and
 * is listed as a substitution. A null is never silently a zero, and the UI is
 * expected to show the substitution list next to the number.
 *
 * Pure: no I/O, no LLM.
 */
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { resolveGoingInCap, type NamedValuation } from "./reconcile";

export interface Substitution {
  label: string;
  reason: string;
}

export interface ImpliedReturns {
  ok: boolean;
  /** why the run couldn't happen, when ok is false */
  error?: string;
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  leveredEquityMultiple: number | null;
  /** year-1 NOI ÷ this valuation's headline price */
  goingInCapPct: number | null;
  year1Noi: number | null;
  /** the assumption set actually run, so the UI can show it or export it */
  assumptions: UnderwriteInputs | null;
  substitutions: Substitution[];
}

/** Scale every revenue and expense line by `k`. The engine's NOI is
 *  homogeneous of degree one in those lines (vacancy and the management fee
 *  are proportional, and capex sits below NOI), so this lands year-1 NOI
 *  exactly on the target without touching the deal's expense structure. */
function scaleIncome(inputs: UnderwriteInputs, k: number): UnderwriteInputs {
  return {
    ...inputs,
    inPlaceRentAnnual: inputs.inPlaceRentAnnual * k,
    expenseRecoveriesAnnual: inputs.expenseRecoveriesAnnual * k,
    otherRevenueAnnual: inputs.otherRevenueAnnual * k,
    expenseLines: inputs.expenseLines.map((l) => ({ ...l, annual: l.annual * k })),
  };
}

/**
 * Run one valuation through the user's model.
 *
 * @param base the user's own derived assumption set for this deal — the source
 *             of everything the BOV is silent on (debt terms above all)
 */
export function impliedReturns(
  base: UnderwriteInputs,
  valuation: NamedValuation,
): ImpliedReturns {
  const empty: ImpliedReturns = {
    ok: false,
    leveredIrrPct: null,
    unleveredIrrPct: null,
    leveredEquityMultiple: null,
    goingInCapPct: null,
    year1Noi: null,
    assumptions: null,
    substitutions: [],
  };

  if (valuation.headlineValue == null || valuation.headlineValue <= 0) {
    return { ...empty, error: `${valuation.sourceLabel} states no headline value, so there is no price to underwrite.` };
  }

  const substitutions: Substitution[] = [];
  const borrow = (label: string, reason: string) => substitutions.push({ label, reason });

  let inputs: UnderwriteInputs = { ...base, purchasePrice: valuation.headlineValue };

  // Non-income levers first: vacancy changes NOI, so the income scaling below
  // has to happen last or it would miss its target.
  if (valuation.vacancyAssumption != null) {
    inputs = { ...inputs, vacancyPct: valuation.vacancyAssumption };
  } else {
    borrow("Vacancy", "not stated — your model's assumption");
  }

  if (valuation.rentGrowth != null) {
    inputs = { ...inputs, rentGrowthPct: valuation.rentGrowth };
  } else {
    borrow("Rent growth", "not stated — your model's assumption");
  }

  const exitCap = valuation.exitCap ?? null;
  if (exitCap != null && exitCap > 0) {
    inputs = { ...inputs, exitCapPct: exitCap };
  } else {
    const goingIn = resolveGoingInCap(valuation);
    if (goingIn.value != null) {
      inputs = { ...inputs, exitCapPct: goingIn.value };
      borrow(
        "Exit cap",
        `not stated — held flat at the ${goingIn.basis} going-in cap of ${(goingIn.value * 100).toFixed(2)}%`,
      );
    } else {
      borrow("Exit cap", "not stated — your model's assumption");
    }
  }

  if (valuation.holdYears != null && valuation.holdYears > 0) {
    inputs = { ...inputs, holdMonths: Math.round(valuation.holdYears * 12) };
  } else {
    borrow("Hold period", "not stated — your model's assumption");
  }

  if (valuation.capexDeduction != null) {
    inputs = { ...inputs, capitalImprovementsYr1: valuation.capexDeduction };
  } else {
    borrow("Capex / TI-LC", "not stated — your model's assumption");
  }

  // Debt is never in a BOV — it's the buyer's, not the broker's. Say so once
  // rather than letting the levered IRR read as the broker's own claim.
  borrow("Debt terms", "brokers don't quote your leverage — your LTC, rate and amortization");

  // Income: land year-1 NOI exactly on the valuation's figure.
  if (valuation.year1Noi != null) {
    const baseNoi = computeUnderwrite(inputs).cashFlow[0]?.noi ?? 0;
    if (baseNoi > 0) {
      inputs = scaleIncome(inputs, valuation.year1Noi / baseNoi);
    } else {
      return {
        ...empty,
        error:
          "Your model's year-1 NOI is zero or negative, so it can't be re-based onto this valuation's NOI.",
        substitutions,
      };
    }
  } else {
    borrow("Year-1 NOI", "not stated — your model's income, at this price");
  }

  const result = computeUnderwrite(inputs);
  const year1Noi = result.cashFlow[0]?.noi ?? null;

  return {
    ok: true,
    leveredIrrPct: result.returns.leveredIrrPct,
    unleveredIrrPct: result.returns.unleveredIrrPct,
    leveredEquityMultiple: result.returns.leveredEquityMultiple,
    goingInCapPct: result.returns.goingInCapPct,
    year1Noi,
    assumptions: inputs,
    substitutions,
  };
}
