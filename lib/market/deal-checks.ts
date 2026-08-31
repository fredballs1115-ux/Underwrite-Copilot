import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import { assumptionWarnings, memoLinesFor, type AssumptionWarning } from "./checks";
import { getDealSubmarket, loadSubmarketView, type SubmarketView } from "./store";

/**
 * The deal-side entry point for Phase 4: everything the submarket card and the
 * PDF memo need, resolved in one place so the card the analyst saw and the
 * memo they exported can never disagree.
 */
export interface DealSubmarketCheck {
  view: SubmarketView;
  warnings: AssumptionWarning[];
  /** the overrides, phrased for the memo */
  memoLines: string[];
}

export async function dealSubmarketCheck(
  supabase: SupabaseClient,
  dealId: string,
  dealName: string,
  extraction: ExtractionResult | null,
): Promise<DealSubmarketCheck | null> {
  const link = await getDealSubmarket(supabase, dealId);
  if (!link) return null;

  const [view, assumptions] = await Promise.all([
    loadSubmarketView(supabase, link.submarketId),
    currentDealAssumptions(supabase, dealId, dealName, extraction),
  ]);
  if (!view || !assumptions) return null;

  const warnings = assumptionWarnings(
    assumptions,
    view.metrics,
    view.submarket,
    link.dismissals,
  );
  return { view, warnings, memoLines: memoLinesFor(warnings) };
}

/** Just the memo lines — a cheap call for the export path. Never throws: a
 *  memo must render even when the market data is unreachable. */
export async function dealOverrideLines(
  supabase: SupabaseClient,
  dealId: string,
  dealName: string,
  extraction: ExtractionResult | null,
): Promise<string[]> {
  try {
    const check = await dealSubmarketCheck(supabase, dealId, dealName, extraction);
    return check?.memoLines ?? [];
  } catch {
    return [];
  }
}
