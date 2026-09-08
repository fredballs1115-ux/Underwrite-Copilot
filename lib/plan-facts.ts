import type { PlanSummary } from "@/lib/deal-strategy";

/** $21.0M / $850k / $400 — the compact money the plan's facts print in. */
export const moneyCompact = (n: number): string =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(1)}M`
    : Math.abs(n) >= 1e3
      ? `$${Math.round(n / 1e3)}k`
      : `$${Math.round(n)}`;

/**
 * The facts a plan is judged on, as label/value pairs — identical on every
 * surface that shows them (the deal page's plan strip, the shared screen a
 * partner or lender opens): the five figures, plus the all-in basis per
 * planned unit when the OM states the unit count. A blank is "not stated"
 * for a figure the OM should have carried and "—" for one that is only
 * derived from others; never zero.
 */
export function planFacts(plan: PlanSummary): [string, string][] {
  return [
    [
      "Stabilized NOI",
      plan.stabilizedNoi ? moneyCompact(plan.stabilizedNoi.value) : "not stated",
    ],
    [plan.priceLabel, plan.price != null ? moneyCompact(plan.price) : "not stated"],
    [
      plan.budget?.allIn ? "Budget (total cost less price)" : "Budget",
      // An all-in total with no price stated: the works are inside it and
      // cannot be split out — the total cost row carries the figure.
      plan.budget
        ? plan.budget.isTotal
          ? "inside the stated total"
          : moneyCompact(plan.budget.budget)
        : "not stated",
    ],
    ["Total cost", plan.totalCost != null ? moneyCompact(plan.totalCost) : "—"],
    [
      "Yield on cost",
      plan.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : "—",
    ],
    // The basis a comp is held against on a plan deal — what a finished
    // unit costs all-in. Only when the OM states the planned unit count.
    ...(plan.costPerUnit != null
      ? [["Basis per unit (all-in)", moneyCompact(plan.costPerUnit)] as [string, string]]
      : []),
  ];
}
