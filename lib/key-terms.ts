// The rows a "Key terms" block leads with. A memo's first block and the
// shared screen's grid show a handful of the OM's figures — and the ones a
// reader needs first are the deal-defining ones: what it costs, what it
// yields, how big it is. Flagged rows used to sort first and the block was
// cut at four, so a memo could open on four speculative pro-forma figures
// and never state the asking price. The head is read by the shared readers
// (the same price, cap, count and plan rows every other surface uses), then
// the flagged rows, then the rest.
import { findGoingInCap, parseMoney } from "./criteria";
import {
  capitalBudgetFromMetrics,
  findPriceMetric,
  isPlanDeal,
  noiFigures,
  priceRowIsLand,
  unitCountRow,
  type StrategyKind,
} from "./deal-strategy";

export interface KeyTermMetric {
  label: string;
  value: string;
  flagged?: boolean;
  page?: string;
  basis?: string;
}

/**
 * `metrics` in the order a key-terms block should show them, cut to `limit`:
 * the price (or a development's land cost) first; then, on a stabilized
 * asset, the going-in cap — or, on a plan deal, the stabilized NOI and the
 * budget or total cost the plan is judged on; then the unit count; then the
 * flagged rows; then everything else in the OM's order. Rows that are not
 * objects (analysis output can carry nulls) are dropped.
 */
export function keyTermRows<M extends KeyTermMetric>(
  metrics: ReadonlyArray<M | null | undefined>,
  kind: StrategyKind,
  limit = 8,
): M[] {
  const rows = metrics.filter((m): m is M => !!m && typeof m === "object");
  const head: M[] = [];
  const lead = (row: { label: string; value: string } | null | undefined) => {
    const hit = row ? rows.find((m) => m === row || (m.label === row.label && m.value === row.value)) : undefined;
    if (hit && !head.includes(hit)) head.push(hit);
  };
  const price = findPriceMetric(rows, kind);
  lead(price);
  if (isPlanDeal(kind)) {
    const stabilized = noiFigures(rows).find((f) => f.kind === "stabilized");
    if (stabilized) lead(rows.find((m) => m.label === stabilized.label));
    const priceValue = price ? parseMoney(price.value) : null;
    const budget = capitalBudgetFromMetrics(
      rows,
      priceValue != null && priceValue > 0 ? priceValue : null,
      !priceRowIsLand(price),
    );
    if (budget) lead(rows.find((m) => m.label === budget.label));
  } else {
    lead(findGoingInCap(rows));
  }
  lead(unitCountRow(rows));
  const rest = rows.filter((m) => !head.includes(m));
  return [...head, ...rest.filter((m) => m.flagged), ...rest.filter((m) => !m.flagged)].slice(0, limit);
}
