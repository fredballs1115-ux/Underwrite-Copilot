import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColumnMapping } from "./parse";
import type { Lease } from "./schema";
import type { ValidationIssue } from "./validate";
import { defaultProfileFor, normalizeProfile, type MarketLeasingProfile, type ProfileDraft } from "./profiles";

/** Persistence for the rent roll engine: imports, saved column mappings, and
 *  market leasing profiles. Rent roll rows are client data — nothing here is
 *  logged, and every read is RLS-scoped to the caller. */

export interface RentRollImport {
  id: string;
  dealId: string;
  userId: string;
  sourceDocumentId: string | null;
  filename: string;
  asOfDate: string | null;
  mapping: ColumnMapping;
  leases: Lease[];
  issues: ValidationIssue[];
  nra: number | null;
  createdAt: string;
}

const IMPORT_COLS =
  "id, deal_id, user_id, source_document_id, filename, as_of_date, mapping, leases, issues, nra, created_at";

function parseImport(row: Record<string, unknown>): RentRollImport {
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    userId: String(row.user_id),
    sourceDocumentId: row.source_document_id ? String(row.source_document_id) : null,
    filename: String(row.filename ?? "rent roll"),
    asOfDate: row.as_of_date ? String(row.as_of_date).slice(0, 10) : null,
    mapping: (row.mapping ?? { columns: {}, monthly: [], headerRow: 0, confidence: {} }) as ColumnMapping,
    leases: Array.isArray(row.leases) ? (row.leases as Lease[]) : [],
    issues: Array.isArray(row.issues) ? (row.issues as ValidationIssue[]) : [],
    nra: typeof row.nra === "number" ? row.nra : row.nra ? Number(row.nra) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** The deal's most recent rent roll import, or null. */
export async function latestRentRollImport(
  supabase: SupabaseClient,
  dealId: string,
): Promise<RentRollImport | null> {
  const { data } = await supabase
    .from("rent_roll_imports")
    .select(IMPORT_COLS)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? parseImport(data as Record<string, unknown>) : null;
}

export async function getRentRollImport(
  supabase: SupabaseClient,
  importId: string,
): Promise<RentRollImport | null> {
  const { data } = await supabase
    .from("rent_roll_imports")
    .select(IMPORT_COLS)
    .eq("id", importId)
    .maybeSingle();
  return data ? parseImport(data as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Saved column mappings
// ---------------------------------------------------------------------------

/** A mapping the user already confirmed for this header shape, if any. */
export async function savedMappingFor(
  supabase: SupabaseClient,
  userId: string,
  signature: string,
): Promise<ColumnMapping | null> {
  if (!signature) return null;
  const { data } = await supabase
    .from("rent_roll_mappings")
    .select("mapping")
    .eq("user_id", userId)
    .eq("header_signature", signature)
    .maybeSingle();
  return (data?.mapping as ColumnMapping | undefined) ?? null;
}

/** Remember a confirmed mapping so the next file from the same source is one
 *  click. Upserts on (user, header signature). */
export async function saveMapping(
  supabase: SupabaseClient,
  userId: string,
  signature: string,
  name: string,
  mapping: ColumnMapping,
): Promise<void> {
  if (!signature) return;
  await supabase.from("rent_roll_mappings").upsert(
    {
      user_id: userId,
      header_signature: signature,
      name: name.slice(0, 80) || "Saved mapping",
      mapping,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,header_signature" },
  );
}

// ---------------------------------------------------------------------------
// Market leasing profiles
// ---------------------------------------------------------------------------

const PROFILE_COLS =
  "id, name, asset_class, renewal_probability, market_rent_psf, escalation_pct, term_years, renewal_ti_psf, new_ti_psf, renewal_lc_pct, new_lc_pct, downtime_months, renewal_free_rent_months, new_free_rent_months";

const n = (v: unknown, fallback: number): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
};

function parseProfile(row: Record<string, unknown>, fallback: ProfileDraft): MarketLeasingProfile {
  return {
    id: String(row.id),
    name: String(row.name ?? fallback.name),
    assetClass: String(row.asset_class ?? fallback.assetClass),
    renewalProbability: n(row.renewal_probability, fallback.renewalProbability),
    marketRentPsf: n(row.market_rent_psf, fallback.marketRentPsf),
    escalationPct: n(row.escalation_pct, fallback.escalationPct),
    termYears: n(row.term_years, fallback.termYears),
    renewalTiPsf: n(row.renewal_ti_psf, fallback.renewalTiPsf),
    newTiPsf: n(row.new_ti_psf, fallback.newTiPsf),
    renewalLcPct: n(row.renewal_lc_pct, fallback.renewalLcPct),
    newLcPct: n(row.new_lc_pct, fallback.newLcPct),
    downtimeMonths: n(row.downtime_months, fallback.downtimeMonths),
    renewalFreeRentMonths: n(row.renewal_free_rent_months, fallback.renewalFreeRentMonths),
    newFreeRentMonths: n(row.new_free_rent_months, fallback.newFreeRentMonths),
  };
}

/** The user's saved profiles, newest first. Empty is normal — the asset-class
 *  default stands in until they save one. */
export async function listProfiles(
  supabase: SupabaseClient,
  userId: string,
  assetClass: string,
): Promise<MarketLeasingProfile[]> {
  const { data } = await supabase
    .from("market_leasing_profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const fallback = defaultProfileFor(assetClass);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => parseProfile(r, fallback));
}

export async function saveProfile(
  supabase: SupabaseClient,
  userId: string,
  draft: ProfileDraft,
  id?: string,
): Promise<void> {
  const p = normalizeProfile(draft);
  const row = {
    user_id: userId,
    name: p.name,
    asset_class: p.assetClass,
    renewal_probability: p.renewalProbability,
    market_rent_psf: p.marketRentPsf,
    escalation_pct: p.escalationPct,
    term_years: p.termYears,
    renewal_ti_psf: p.renewalTiPsf,
    new_ti_psf: p.newTiPsf,
    renewal_lc_pct: p.renewalLcPct,
    new_lc_pct: p.newLcPct,
    downtime_months: p.downtimeMonths,
    renewal_free_rent_months: p.renewalFreeRentMonths,
    new_free_rent_months: p.newFreeRentMonths,
    updated_at: new Date().toISOString(),
  };
  if (id) await supabase.from("market_leasing_profiles").update(row).eq("id", id).eq("user_id", userId);
  else await supabase.from("market_leasing_profiles").insert(row);
}
