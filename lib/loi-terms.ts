// What the letter of intent drafts — PURE, and the one reader the deal
// page's LOI panel and the LOI route share, so the panel never promises a
// clause the download lacks.
//
// The deal's kind shapes the paper: a conversion or a development carries an
// entitlements contingency, and every plan deal's diligence names the work
// (lib/loi). The kind is inferred WITH the deal's first signal, as the deal
// page infers it everywhere else. The route had read the extraction alone,
// so a deal its first signal called a conversion read "conversion" on the
// panel — which said the draft "carries an entitlements contingency" — and
// "stabilized" in the route, whose .docx carried no such clause.
//
// The page computes this on the server and hands the panel plain data; the
// route computes it from the same row.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { inferStrategy, isPlanDeal, type StrategyKind } from "@/lib/deal-strategy";

export interface LoiTerms {
  /** the deal's plan, where it has one: a conversion or a development gets
   *  an entitlements contingency and a diligence clause that names the
   *  work, a value-add or a lease-up names the work only. Null on a
   *  stabilized asset, and on a deal nothing has read yet. */
  plan: { kind: StrategyKind; label: string } | null;
}

/** The letter's terms for a deal: its extraction and its first signal, as
 *  the deal row holds them. */
export function loiTermsFor(
  extraction: ExtractionResult | null | undefined,
  signal: FirstSignal | null | undefined,
): LoiTerms {
  const strategy = inferStrategy(extraction ?? null, signal ?? null);
  return {
    plan: isPlanDeal(strategy.kind) ? { kind: strategy.kind, label: strategy.label } : null,
  };
}
