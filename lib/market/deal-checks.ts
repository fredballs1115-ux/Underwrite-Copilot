import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import { inferStrategy } from "@/lib/deal-strategy";
import { dealGoingInCap } from "@/lib/model-vs-market";
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

  const [view, assumptions, signalRes] = await Promise.all([
    loadSubmarketView(supabase, link.submarketId),
    currentDealAssumptions(supabase, dealId, dealName, extraction),
    // The first signal, read beside the rest: where the documents state no
    // going-in cap, its own is the one the exit is set against — the rule
    // the model's market read follows (`dealGoingInCap`).
    supabase.from("deals").select("first_signal").eq("id", dealId).maybeSingle(),
  ]);
  if (!view || !assumptions) return null;
  const firstSignal =
    ((signalRes.data as { first_signal?: FirstSignal | null } | null)?.first_signal as FirstSignal | null) ?? null;

  // The deal's strategy shapes the wording: a conversion or development is
  // part of the pipeline it is being warned about, not a bystander to it. Its
  // going-in cap is what the exit cap is set against — none on a plan deal
  // or a note, where the warning says nothing about compression.
  const warnings = assumptionWarnings(
    assumptions,
    view.metrics,
    view.submarket,
    link.dismissals,
    inferStrategy(extraction, firstSignal).kind,
    dealGoingInCap(extraction, firstSignal),
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
