"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { downloadDealFile, signatureMismatch, uploadSupplement } from "@/lib/storage";
import {
  headerSignature,
  readGrid,
  suggestMapping,
  toLeases,
  type ColumnMapping,
} from "@/lib/rentroll/parse";
import { CANONICAL_FIELDS, type CanonicalKey } from "@/lib/rentroll/schema";
import { validateLeases } from "@/lib/rentroll/validate";
import { getRentRollImport, saveMapping, savedMappingFor, saveProfile } from "@/lib/rentroll/store";
import { defaultProfileFor } from "@/lib/rentroll/profiles";

const MAX_FILE = 32 * 1024 * 1024;

async function requireDeal(dealId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("deals").select("id").eq("id", dealId).maybeSingle();
  if (!data) return null;
  return { supabase, user };
}

const num = (raw: FormDataEntryValue | null): number | null => {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s%]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * Upload a rent roll. The FILE goes to the deal's own storage path (client
 * data, RLS-scoped, never logged); only the normalized rows are stored in the
 * database.
 *
 * If this user has already confirmed a mapping for a file with this header
 * shape, it is applied straight away — the second upload from the same broker
 * is one click.
 */
export async function uploadRentRoll(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/deals/${dealId}/rent-roll?error=file`);
  if (file.size > MAX_FILE) redirect(`/deals/${dealId}/rent-roll?error=size`);

  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  if (signatureMismatch(file.name, buffer)) redirect(`/deals/${dealId}/rent-roll?error=format`);

  let grid;
  try {
    grid = await readGrid(file.name, buffer);
  } catch {
    redirect(`/deals/${dealId}/rent-roll?error=parse`);
  }
  if (!grid.length) redirect(`/deals/${dealId}/rent-roll?error=empty`);

  const suggested = suggestMapping(grid);
  const signature = headerSignature(grid, suggested.headerRow);
  const saved = await savedMappingFor(ctx.supabase, ctx.user.id, signature);
  const mapping = saved ?? suggested;

  const parsed = toLeases(grid, mapping);
  const nra = num(formData.get("nra"));
  const issues = validateLeases(parsed.leases, { nra });

  const docId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "rent-roll";
  const path = `documents/${dealId}/${docId}-${safeName}`;
  await uploadSupplement(path, buffer, file.type);
  await ctx.supabase.from("deal_documents").insert({
    id: docId,
    deal_id: dealId,
    kind: "rent_roll",
    filename: file.name,
    storage_path: path,
    content_type: file.type || null,
  });

  const asOf = String(formData.get("asOf") ?? "").trim();
  const { data, error } = await ctx.supabase
    .from("rent_roll_imports")
    .insert({
      deal_id: dealId,
      user_id: ctx.user.id,
      source_document_id: docId,
      filename: file.name,
      as_of_date: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
      mapping,
      leases: parsed.leases,
      issues,
      nra,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`/deals/${dealId}/rent-roll?error=save`);
  revalidatePath(`/deals/${dealId}/rent-roll`);
  redirect(`/deals/${dealId}/rent-roll?import=${data.id}${saved ? "" : "&confirm=1"}`);
}

/**
 * Re-apply a corrected mapping to the SAME uploaded file and, when asked,
 * remember it for next time. The file is re-read from storage rather than
 * re-uploaded, so correcting three columns costs nothing.
 */
export async function confirmMapping(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const importId = String(formData.get("importId") ?? "");
  if (!dealId || !importId) return;

  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const record = await getRentRollImport(ctx.supabase, importId);
  if (!record) redirect(`/deals/${dealId}/rent-roll?error=notfound`);

  const { data: doc } = await ctx.supabase
    .from("deal_documents")
    .select("storage_path, filename")
    .eq("id", record.sourceDocumentId ?? "")
    .maybeSingle();
  if (!doc) redirect(`/deals/${dealId}/rent-roll?error=nodoc`);

  const buffer = await downloadDealFile(doc.storage_path as string);
  const grid = await readGrid(String(doc.filename), buffer);

  const headerRow = num(formData.get("headerRow"));
  const columns: Partial<Record<CanonicalKey, number>> = {};
  const monthly: CanonicalKey[] = [];
  for (const f of CANONICAL_FIELDS) {
    const raw = String(formData.get(`col_${f.key}`) ?? "");
    if (raw === "" || raw === "-1") continue; // deliberately unmapped
    const col = Number(raw);
    if (Number.isFinite(col) && col >= 0) columns[f.key] = col;
    if (formData.get(`monthly_${f.key}`) === "on") monthly.push(f.key);
  }

  const mapping: ColumnMapping = {
    columns,
    monthly,
    headerRow: headerRow != null && headerRow >= 0 ? headerRow : record.mapping.headerRow,
    confidence: {},
  };

  const parsed = toLeases(grid, mapping);
  const nra = num(formData.get("nra")) ?? record.nra;
  const issues = validateLeases(parsed.leases, { nra });
  const asOf = String(formData.get("asOf") ?? "").trim();

  await ctx.supabase
    .from("rent_roll_imports")
    .update({
      mapping,
      leases: parsed.leases,
      issues,
      nra,
      as_of_date: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : record.asOfDate,
    })
    .eq("id", importId)
    .eq("deal_id", dealId);

  if (formData.get("remember") === "on") {
    await saveMapping(
      ctx.supabase,
      ctx.user.id,
      headerSignature(grid, mapping.headerRow),
      String(formData.get("mappingName") ?? "") || record.filename,
      mapping,
    );
  }

  revalidatePath(`/deals/${dealId}/rent-roll`);
  redirect(`/deals/${dealId}/rent-roll?import=${importId}`);
}

/** Save (or update) a market leasing profile the user reuses across deals. */
export async function saveLeasingProfile(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const assetClass = String(formData.get("assetClass") ?? "office");
  const base = defaultProfileFor(assetClass);
  const pct = (key: string, fallback: number) => {
    const v = num(formData.get(key));
    return v == null ? fallback : v / 100;
  };
  const plain = (key: string, fallback: number) => num(formData.get(key)) ?? fallback;

  await saveProfile(
    ctx.supabase,
    ctx.user.id,
    {
      name: String(formData.get("name") ?? "").trim() || base.name,
      assetClass,
      renewalProbability: pct("renewalProbability", base.renewalProbability),
      marketRentPsf: plain("marketRentPsf", base.marketRentPsf),
      escalationPct: pct("escalationPct", base.escalationPct),
      termYears: plain("termYears", base.termYears),
      renewalTiPsf: plain("renewalTiPsf", base.renewalTiPsf),
      newTiPsf: plain("newTiPsf", base.newTiPsf),
      renewalLcPct: pct("renewalLcPct", base.renewalLcPct),
      newLcPct: pct("newLcPct", base.newLcPct),
      downtimeMonths: plain("downtimeMonths", base.downtimeMonths),
      renewalFreeRentMonths: plain("renewalFreeRentMonths", base.renewalFreeRentMonths),
      newFreeRentMonths: plain("newFreeRentMonths", base.newFreeRentMonths),
    },
    String(formData.get("profileId") ?? "") || undefined,
  );

  revalidatePath(`/deals/${dealId}/rent-roll`);
  redirect(`/deals/${dealId}/rent-roll`);
}

export async function deleteRentRollImport(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const importId = String(formData.get("importId") ?? "");
  if (!dealId || !importId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;
  await ctx.supabase.from("rent_roll_imports").delete().eq("id", importId).eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}/rent-roll`);
  redirect(`/deals/${dealId}/rent-roll`);
}
