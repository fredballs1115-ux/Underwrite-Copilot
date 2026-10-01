/**
 * The deal's own model as an opinion of value — the "Our UW" column — laid
 * out the way a BOV states one, so the reconciler's identity holds for it:
 *
 *   value = NOI ÷ cap − capex deduction
 *
 * The value is the model's price and the deduction its Year-1 capital, so
 * the cap is struck on the price PLUS that capital: the all-in basis a BOV
 * capitalizes before it deducts. Struck on the price alone (the going-in cap
 * the deal page prints), the column counted the same capital twice — once
 * inside the cap and again as the deduction — and a broker opinion
 * identical to the model's read "Cap rate −$2.0M, Unexplained +$2.0M".
 * Where the model carries no Year-1 capital the two caps are one figure.
 *
 * Pure: no I/O.
 */
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import type { NamedValuation } from "./reconcile";

export interface ModelOpinion {
  valuation: NamedValuation;
  /** year-1 NOI over the price alone — the deal page's going-in cap, said
   *  beside the all-in one where the two differ; null without an NOI */
  capOnPrice: number | null;
  /** true where the opinion's cap is on the price plus Year-1 capital */
  allIn: boolean;
}

export function modelOpinion(inputs: UnderwriteInputs, sourceLabel = "Our UW"): ModelOpinion {
  const r = computeUnderwrite(inputs);
  const noi = r.cashFlow[0]?.noi ?? null;
  const capital = inputs.capitalImprovementsYr1;
  const allInBasis = inputs.purchasePrice + capital;
  const allIn = capital > 0;
  return {
    valuation: {
      sourceLabel,
      headlineValue: inputs.purchasePrice,
      year1Noi: noi,
      goingInCap: noi != null && allInBasis > 0 ? noi / allInBasis : null,
      exitCap: inputs.exitCapPct,
      holdYears: Math.round(inputs.holdMonths / 12),
      rentGrowth: inputs.rentGrowthPct,
      vacancyAssumption: inputs.vacancyPct,
      capexDeduction: capital,
      // The screening engine prices off cash flows and an exit cap, not a
      // discount rate — claiming one would be inventing an assumption.
      discountRate: null,
    },
    capOnPrice: noi != null && inputs.purchasePrice > 0 ? noi / inputs.purchasePrice : null,
    allIn,
  };
}
