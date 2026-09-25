import { floodContextLine, type SiteFlagsResult } from "@/lib/site-flags/core";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { askingPriceOf, inferStrategy, planSummary } from "@/lib/deal-strategy";
import { assetWords } from "@/lib/asset-words";
import { interestContextLine, readInterest } from "@/lib/interest";
import { assumableContextLine, readAssumable } from "@/lib/assumable-debt";
import { portfolioContextLine, readPortfolio } from "@/lib/portfolio";

const compact = (n: number): string =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

/**
 * What the screen established about the deal, in two to four sentences, for
 * every Claude step that reads the OM after the extraction — ask-the-deal,
 * the broker-comp scrutiny, the market check, the reconciler: the deal's
 * strategy and, on a plan deal, the plan's headline figures, the all-in
 * basis per planned unit and the stated timeline. So an answer about "the
 * NOI", or a comp held against "the price", names which figure the OM's
 * number is. A portfolio OM adds a line naming its properties, the markets
 * they sit in and the largest (lib/portfolio). Null when the strategy is
 * unknown and the OM offers one property: nothing established, nothing
 * asserted. Pure — no I/O — so it is testable and the worker can
 * use it.
 */
export function dealContextFor(
  extraction: ExtractionResult | null,
  site?: { flood?: SiteFlagsResult["flood"] } | null,
): string | null {
  const strategy = inferStrategy(extraction);
  // A portfolio is said whatever the strategy: several properties in one
  // OM change what every whole-deal figure means (lib/portfolio).
  const portfolio = readPortfolio(extraction);
  // What is being sold is said FIRST whatever the strategy (#414): a note's
  // price or a share's changes what every figure after it means.
  const interest = readInterest(extraction, askingPriceOf(extraction));
  // The seller's loan, where it is offered for assumption (#417): its terms
  // as stated and what its value turns on, right after what is being sold.
  const assumable = readAssumable(extraction, null);
  // FEMA's flood zone at the building, where the site lookup has answered
  // by the time the step runs (#426): a Special Flood Hazard Area is a
  // premium in the expense line and a lender's condition.
  const flood = floodContextLine(site?.flood);
  const head = [
    ...(interest ? [interestContextLine(interest)] : []),
    ...(assumable ? [assumableContextLine(assumable)] : []),
    ...(flood ? [flood] : []),
  ];
  const tail = [...(portfolio ? [portfolioContextLine(portfolio)] : [])];
  if (strategy.kind === "unknown") return head.length || tail.length ? [...head, ...tail].join(" ") : null;
  const plan = planSummary(extraction, strategy);
  const lines = [`Deal type: ${strategy.label}${strategy.summary ? ` — ${strategy.summary}` : "."}`];
  if (plan?.stabilizedNoi) {
    lines.push(
      `The OM's stabilized NOI of ${compact(plan.stabilizedNoi.value)} is the finished project's figure${
        plan.totalCost != null && plan.yieldOnCost != null
          ? ` — over ${compact(plan.totalCost)} of total cost it is ${withArticle(`${(Math.round(plan.yieldOnCost * 1000) / 10).toFixed(1)}%`)} yield on cost`
          : ""
      }, not today's income and not a cap rate on the price.`,
    );
  }
  if (plan?.costPerUnit != null && plan.units != null) {
    // The basis a comp or a per-unit norm is held against on a plan deal:
    // what a finished unit costs all-in — never the shell's or the land's
    // price over apartments that do not exist yet.
    // In the class's own noun (lib/asset-words): a hotel's plan is costed
    // per key, a student deal's per bed.
    const noun = assetWords(extraction?.assetClass).noun ?? { one: "unit", many: "units" };
    lines.push(
      `Total cost is ${compact(plan.costPerUnit)} per planned ${noun.one} (${plan.units.toLocaleString("en-US")} ${noun.many}) — the basis to hold sale comps and per-${noun.one} norms against, never the ${
        plan.kind === "development" ? "land" : "shell's"
      } price.`,
    );
  }
  if (plan?.timeline) lines.push(`Timeline as stated: ${plan.timeline.replace(/\.\s*$/, "")}.`);
  return [...head, ...lines, ...tail].join(" ");
}
