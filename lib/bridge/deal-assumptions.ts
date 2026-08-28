import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import type { Assumptions } from "./model";

/**
 * The deal's CURRENT assumption set, derived exactly the way the deal page and
 * the Excel export derive it (OM extraction + property actuals + documented
 * class defaults). One place, so a version snapshot can never drift from the
 * numbers the user is looking at.
 *
 * Returns null when there's no extraction yet — an un-screened deal has no
 * assumptions to version.
 */
export async function currentDealAssumptions(
  supabase: SupabaseClient,
  dealId: string,
  dealName: string,
  extraction: ExtractionResult | null,
): Promise<Assumptions | null> {
  if (!extraction) return null;

  const [rrRes, t12Res] = await Promise.all([
    supabase
      .from("deal_rent_rolls")
      .select("as_of_date, summary")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("deal_t12_statements")
      .select("period_end_date, summary")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rrSummary = (rrRes.data?.summary as RentRollSummary | null) ?? null;
  const t12Summary = (t12Res.data?.summary as T12Summary | null) ?? null;

  return deriveUnderwriteInputs(extraction, dealName, {
    rentRoll: rrSummary
      ? { summary: rrSummary, asOf: (rrRes.data?.as_of_date as string | null) ?? null }
      : null,
    t12: t12Summary
      ? { summary: t12Summary, periodEnd: (t12Res.data?.period_end_date as string | null) ?? null }
      : null,
  }).inputs;
}
