import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { HOLD_MONTHS, deriveUnderwriteInputs, type DerivedModel } from "@/lib/underwrite/inputs";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { modelMarketFor } from "@/lib/model-market";
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
  return (await currentDealModel(supabase, dealId, dealName, extraction))?.inputs ?? null;
}

/**
 * The same derivation with its sources and meta — for a caller that says
 * where each input came from — seeded for the hold the caller's own model
 * runs on: the Treasury tenor nearest it (lib/debt-index), so a ten-year
 * workbook prices its loan off the 10-year where the deal page's five-year
 * model prices off the 5-year. Null before the deal is screened.
 */
export async function currentDealModel(
  supabase: SupabaseClient,
  dealId: string,
  dealName: string,
  extraction: ExtractionResult | null,
  holdMonths: number = HOLD_MONTHS,
): Promise<DerivedModel | null> {
  if (!extraction) return null;

  // The same rate read as the deal page: the current set's all-in rate is
  // today's index plus the class spread, so a version saved last month and
  // the set on the page today differ by the rate the market moved — which
  // the bridge then names as a driver, as it should. Never on the sample,
  // whose figures are pinned (lib/model-market): its row says which it is,
  // read beside the rest, so no caller has to remember to ask.
  const [rrRes, t12Res, debt, dealRes] = await Promise.all([
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
    liveDebtSeeds(holdMonths),
    supabase.from("deals").select("is_sample").eq("id", dealId).maybeSingle(),
  ]);
  const isSample = !!(dealRes.data as { is_sample?: boolean | null } | null)?.is_sample;

  const rrSummary = (rrRes.data?.summary as RentRollSummary | null) ?? null;
  const t12Summary = (t12Res.data?.summary as T12Summary | null) ?? null;

  return deriveUnderwriteInputs(
    extraction,
    dealName,
    {
      rentRoll: rrSummary
        ? { summary: rrSummary, asOf: (rrRes.data?.as_of_date as string | null) ?? null }
        : null,
      t12: t12Summary
        ? { summary: t12Summary, periodEnd: (t12Res.data?.period_end_date as string | null) ?? null }
        : null,
    },
    modelMarketFor(isSample, debt),
  );
}
