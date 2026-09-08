import type { ExtractionResult } from "@/lib/anthropic/types";
import { findMetric } from "@/lib/criteria";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";

const compact = (n: number): string =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

function unitCount(metrics: { label: string; value: string }[]): number | null {
  const units = findMetric(metrics, /^units?\b|number of units|unit count/i, /per|\/|price|\$/i);
  const n = units ? Number(units.value.replace(/[,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What the screen established about the deal, in two to four sentences, for
 * every Claude step that reads the OM after the extraction — ask-the-deal,
 * the broker-comp scrutiny, the market check, the reconciler: the deal's
 * strategy and, on a plan deal, the plan's headline figures, the all-in
 * basis per planned unit and the stated timeline. So an answer about "the
 * NOI", or a comp held against "the price", names which figure the OM's
 * number is. Null when the strategy is unknown: nothing established,
 * nothing asserted. Pure — no I/O — so it is testable and the worker can
 * use it.
 */
export function dealContextFor(extraction: ExtractionResult | null): string | null {
  const strategy = inferStrategy(extraction);
  if (strategy.kind === "unknown") return null;
  const plan = planSummary(extraction, strategy);
  const lines = [`Deal type: ${strategy.label}${strategy.summary ? ` — ${strategy.summary}` : "."}`];
  if (plan?.stabilizedNoi) {
    lines.push(
      `The OM's stabilized NOI of ${compact(plan.stabilizedNoi.value)} is the finished project's figure${
        plan.totalCost != null && plan.yieldOnCost != null
          ? ` — over ${compact(plan.totalCost)} of total cost it is a ${(plan.yieldOnCost * 100).toFixed(1)}% yield on cost`
          : ""
      }, not today's income and not a cap rate on the price.`,
    );
  }
  if (plan?.totalCost != null) {
    // The basis a comp or a per-unit norm is held against on a plan deal:
    // what a finished unit costs all-in — never the shell's or the land's
    // price over apartments that do not exist yet.
    const units = unitCount(extraction?.metrics ?? []);
    if (units != null) {
      lines.push(
        `Total cost is ${compact(plan.totalCost / units)} per planned unit (${units.toLocaleString("en-US")} units) — the basis to hold sale comps and per-unit norms against, never the ${
          plan.priceLabel === "Land cost" ? "land" : "shell's"
        } price.`,
      );
    }
  }
  if (plan?.timeline) lines.push(`Timeline as stated: ${plan.timeline.replace(/\.\s*$/, "")}.`);
  return lines.join(" ");
}
