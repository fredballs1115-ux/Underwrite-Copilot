import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { countyOf, placeDeal } from "@/lib/market-county";
import { modelEvidenceFor } from "@/lib/model-evidence";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import { t12SummaryOf } from "@/lib/actuals/analyze";
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
  /** the day the model's dated readers read on: the reader's where the
   *  caller reads the time-zone cookie (the rent-roll workbook), else the
   *  UTC day's noon (research pass 40) */
  asOf: Date = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`),
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
    supabase.from("deals").select("is_sample, address, site_flags, asset_class, first_signal").eq("id", dealId).maybeSingle(),
  ]);
  const row = (dealRes.data as {
    is_sample?: boolean | null;
    address?: unknown;
    site_flags?: SiteFlagsResult | null;
    asset_class?: string | null;
    first_signal?: FirstSignal | null;
  } | null) ?? null;
  const isSample = !!row?.is_sample;

  // The figures the model's growth and exit run at (lib/model-evidence): the
  // stress test's deciding figures off today's published figures, read
  // through the deal page's own cached reads for the market the page places
  // the deal in (#447), else the memorandum's own. A failed read leaves the
  // memorandum's figures; the sample is handed none (lib/model-market).
  const address = addressUpgrade(row?.address, extraction) ?? (row?.address as StructuredAddress | null) ?? null;
  const metro = placeDeal(address, countyOf(address, row?.site_flags ?? null)).live;
  let reads: TodayReads | null = null;
  if (!isSample) {
    try {
      reads = await todayReads(metro);
    } catch (err) {
      console.warn(`bridge live figures read failed for ${dealId}:`, err instanceof Error ? err.message : err);
    }
  }
  const evidence = modelEvidenceFor({
    extraction,
    firstSignal: row?.first_signal ?? null,
    storedAssetClass: row?.asset_class ?? null,
    metro,
    reads,
  });

  const rrSummary = (rrRes.data?.summary as RentRollSummary | null) ?? null;
  const t12Summary: T12Summary | null = t12SummaryOf(t12Res.data?.summary);

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
    modelMarketFor(isSample, debt, evidence),
    { asOf },
  );
}
