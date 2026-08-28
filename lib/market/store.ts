import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parsePeriodRow,
  parsePipelineRow,
  parseSubmarketRow,
  parseDismissals,
  type Dismissal,
  type PipelineProperty,
  type Submarket,
  type SubmarketPeriod,
} from "./types";
import { applyExclusionRules } from "./exclusions";
import { submarketMetrics, type SubmarketMetrics } from "./metrics";

/**
 * Persistence for submarkets.
 *
 * Every read is RLS-scoped to the owner. There is no shared market dataset and
 * no cross-tenant read path here, by design — licensed market data belongs to
 * whoever licenses it, and users import their own exports into their own
 * account.
 */

const SUBMARKET_COLS =
  "id, user_id, name, metro, asset_class, exclusion_rules, supply_warning_months, notes, created_at";
const PERIOD_COLS =
  "id, submarket_id, period, inventory_sf, vacancy_pct, net_absorption_sf, under_construction_sf, asking_rent, rent_basis, source, unverified, source_url";
const PIPELINE_COLS =
  "id, submarket_id, name, address, sf, status, expected_delivery, subtype, owner_occupied, excluded, exclusion_reason, stale_flag, stale_reason, source, notes";

export async function listSubmarkets(
  supabase: SupabaseClient,
  userId: string,
): Promise<Submarket[]> {
  const { data } = await supabase
    .from("submarkets")
    .select(SUBMARKET_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as Record<string, unknown>[]).map(parseSubmarketRow);
}

export async function getSubmarket(
  supabase: SupabaseClient,
  id: string,
): Promise<Submarket | null> {
  const { data } = await supabase.from("submarkets").select(SUBMARKET_COLS).eq("id", id).maybeSingle();
  return data ? parseSubmarketRow(data as Record<string, unknown>) : null;
}

export async function getPeriods(
  supabase: SupabaseClient,
  submarketId: string,
): Promise<SubmarketPeriod[]> {
  const { data } = await supabase
    .from("submarket_periods")
    .select(PERIOD_COLS)
    .eq("submarket_id", submarketId)
    .order("period", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(parsePeriodRow);
}

export async function getPipeline(
  supabase: SupabaseClient,
  submarketId: string,
): Promise<PipelineProperty[]> {
  const { data } = await supabase
    .from("pipeline_properties")
    .select(PIPELINE_COLS)
    .eq("submarket_id", submarketId)
    .order("expected_delivery", { ascending: true, nullsFirst: false })
    .limit(2000);
  return ((data ?? []) as Record<string, unknown>[]).map(parsePipelineRow);
}

export interface SubmarketView {
  submarket: Submarket;
  periods: SubmarketPeriod[];
  /** exclusion rules and stale flags applied fresh — see applyExclusionRules */
  properties: PipelineProperty[];
  applied: ReturnType<typeof applyExclusionRules>;
  metrics: SubmarketMetrics;
}

/**
 * Everything the submarket page and the deal card need, with the exclusion
 * rules applied at READ time. Recomputing rather than trusting stored flags is
 * what makes a rule change take effect everywhere at once — and what makes
 * removing a rule actually un-exclude what it excluded.
 */
export async function loadSubmarketView(
  supabase: SupabaseClient,
  id: string,
  asOf = new Date().toISOString().slice(0, 10),
): Promise<SubmarketView | null> {
  const submarket = await getSubmarket(supabase, id);
  if (!submarket) return null;
  const [periods, raw] = await Promise.all([
    getPeriods(supabase, id),
    getPipeline(supabase, id),
  ]);
  const applied = applyExclusionRules(raw, submarket.exclusionRules, asOf);
  return {
    submarket,
    periods,
    properties: applied.properties,
    applied,
    metrics: submarketMetrics(periods, applied.properties),
  };
}

// ---------------------------------------------------------------------------
// Deal ↔ submarket link
// ---------------------------------------------------------------------------

export interface DealSubmarketLink {
  submarketId: string;
  dismissals: Dismissal[];
}

export async function getDealSubmarket(
  supabase: SupabaseClient,
  dealId: string,
): Promise<DealSubmarketLink | null> {
  const { data } = await supabase
    .from("deal_submarkets")
    .select("submarket_id, dismissals")
    .eq("deal_id", dealId)
    .maybeSingle();
  if (!data) return null;
  return {
    submarketId: String(data.submarket_id),
    dismissals: parseDismissals(data.dismissals),
  };
}
