import type { PlanSummary, StrategyKind } from "@/lib/deal-strategy";
import { withArticle } from "@/lib/article";

/**
 * Why a plan deal's cap slot holds its yield on total cost, as a tooltip on
 * the pipeline's card and list and the internal comps. A value-add, a
 * lease-up or a conversion of an occupied building can carry an in-place
 * cap — the memorandum's key terms print it — so the words never say the
 * deal has none: they had read "a plan deal has no going-in cap".
 */
export const PLAN_YOC_TITLE =
  "Yield on total cost — a plan deal is judged on its stabilized NOI over everything the plan costs, not on its in-place cap";

/**
 * How a plan deal is read, in one sentence under its facts on the shared
 * screen: judged on its yield on total cost. "A value-add deal has no
 * going-in cap" had stood beside the key terms' "Going-in cap rate 5.50%",
 * the memorandum's in-place cap, and a lender reads both lines; the
 * sentence now says which one the plan is judged on. A development has no
 * income in place to strike a cap on, so it is not named for one.
 */
export function planReadLine(kind: StrategyKind, label: string, landPrice: boolean): string {
  const notCap = kind === "development" ? "" : ", not on its in-place cap";
  return `${withArticle(label.toLowerCase(), true)} deal is judged on its yield on total cost${notCap}: the stabilized NOI is the finished project's figure, set over everything the plan costs — never a cap rate on the ${landPrice ? "land" : "acquisition"} price.`;
}

/** $21.0M / $850k / $400 — the compact money the plan's facts print in. */
export const moneyCompact = (n: number): string =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(1)}M`
    : Math.abs(n) >= 1e3
      ? `$${Math.round(n / 1e3)}k`
      : `$${Math.round(n)}`;

/**
 * A percent figure — a going-in cap, a yield on cost — as every surface that
 * shows a deal prints it: to two decimals, the precision an offering
 * memorandum states a cap in. The pipeline card prints the memorandum's
 * "5.45%"; the compare table had printed the same cap "5.5%", and the
 * meeting workbook a plan's "6.27%" yield as "6.30%".
 */
export const pctText = (pct: number): string => `${pct.toFixed(2)}%`;

/**
 * A plan's yield on cost as every surface that shows the deal prints it, and
 * as the Claude steps are handed it: to two decimals, the precision of the
 * caps and the basis-point spreads it stands beside. "11.67%" over a "6.00%"
 * reference cap is the grid's "+567 bps"; "11.7%" would make it 570, and a
 * verdict quoting "8.75%" beside a strip's "8.8%" showed one number rounded
 * two ways on one page.
 */
export const yieldOnCostText = (d: number): string => pctText(d * 100);

/**
 * The facts a plan is judged on, as label/value pairs — identical on every
 * surface that shows them (the deal page's plan strip, the shared screen a
 * partner or lender opens): the five figures, plus the all-in basis per
 * planned unit when the OM states the unit count. A blank is "not stated"
 * for a figure the OM should have carried and "—" for one that is only
 * derived from others; never zero.
 */
export function planFacts(plan: PlanSummary, noun = "unit"): [string, string][] {
  return [
    [
      // A forward purchase's NOI is the one the OM states at delivery (on a
      // build-to-suit, the lease's first year).
      plan.forward ? "NOI at delivery" : "Stabilized NOI",
      plan.stabilizedNoi ? moneyCompact(plan.stabilizedNoi.value) : "not stated",
    ],
    // A price the OM states for something other than the project — a
    // note, the land under a ground lease, a share of no stated percentage
    // (#415) — says so rather than "not stated". A share's price grossed up
    // beside the loan its entity carries is the equity's whole: the label
    // says so, and the loan is named beside the figure, never added to it —
    // and no total cost is struck on it (`costWithheld`, under the facts).
    [
      plan.priceLabel,
      (plan.price ?? plan.equityWhole) != null
        ? `${moneyCompact((plan.price ?? plan.equityWhole)!)}${plan.entityLoan != null ? `, the entity's ${moneyCompact(plan.entityLoan)} loan on top` : ""}`
        : (plan.priceWithheld ?? "not stated"),
    ],
    [
      // A value-add's program stated a door at a time (#460): the budget is
      // the doors times a door's cost, and the label says it was multiplied.
      plan.budget?.allIn ? "Budget (total cost less price)" : plan.budget?.program ? "Budget (doors × cost a door)" : "Budget",
      // An all-in total with no price stated: the works are inside it and
      // cannot be split out — the total cost row carries the figure. On a
      // forward purchase the developer funds the works: a budget the OM
      // states is the developer's, never added to the price.
      plan.budget
        ? plan.budget.isTotal
          ? "inside the stated total"
          : moneyCompact(plan.budget.budget)
        : plan.forward
          ? plan.developerBudget
            ? `${moneyCompact(plan.developerBudget.budget)}, the developer's`
            : "the developer's"
          : "not stated",
    ],
    ["Total cost", plan.totalCost != null ? moneyCompact(plan.totalCost) : "—"],
    ["Yield on cost", plan.yieldOnCost != null ? yieldOnCostText(plan.yieldOnCost) : "—"],
    // The basis a comp is held against on a plan deal — what a finished
    // unit costs all-in, in the class's own noun (a hotel's per key). Only
    // when the OM states the planned count.
    ...(plan.costPerUnit != null
      ? [[`Basis per ${noun} (all-in)`, moneyCompact(plan.costPerUnit)] as [string, string]]
      : []),
  ];
}
