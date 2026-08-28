"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadSupplement, signatureMismatch, downloadDealFile } from "@/lib/storage";
import { omSourceFor, omFromBuffer } from "@/lib/anthropic/om-source";
import { extractBov } from "@/lib/anthropic/bov-extract";
import { VALUATION_FIELDS, type ValuationField } from "@/lib/valuation/types";

const MAX_FILE = 32 * 1024 * 1024;

/** How each field is typed on the manual form. Percent fields are entered as
 *  whole numbers and stored as decimals, matching the engine everywhere else. */
const FIELD_KIND: Record<ValuationField, "usd" | "pct" | "years"> = {
  headlineValue: "usd",
  year1Noi: "usd",
  goingInCap: "pct",
  exitCap: "pct",
  holdYears: "years",
  rentGrowth: "pct",
  vacancyAssumption: "pct",
  capexDeduction: "usd",
  discountRate: "pct",
};

const COLUMN: Record<ValuationField, string> = {
  headlineValue: "headline_value",
  year1Noi: "year1_noi",
  goingInCap: "going_in_cap",
  exitCap: "exit_cap",
  holdYears: "hold_years",
  rentGrowth: "rent_growth",
  vacancyAssumption: "vacancy_assumption",
  capexDeduction: "capex_deduction",
  discountRate: "discount_rate",
};

/**
 * Parse one typed field. A BLANK INPUT IS NULL, not zero — that is the whole
 * discipline of this feature. Anything unparseable is also null rather than a
 * silent zero that would move the bridge.
 */
function parseField(raw: FormDataEntryValue | null, kind: "usd" | "pct" | "years"): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s%]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return kind === "pct" ? n / 100 : n;
}

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

/** Add a valuation the user types in by hand (their own underwriting, or a
 *  BOV whose PDF they don't have). */
export async function addManualValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  const sourceTypeRaw = String(formData.get("sourceType") ?? "broker");
  const sourceType = (["broker", "internal", "seller"] as const).includes(
    sourceTypeRaw as "broker",
  )
    ? sourceTypeRaw
    : "broker";
  if (!sourceLabel) redirect(`/deals/${dealId}/valuations?error=label`);

  const row: Record<string, unknown> = {
    deal_id: dealId,
    user_id: ctx.user.id,
    source_label: sourceLabel,
    source_type: sourceType,
    extracted: false,
    note: String(formData.get("note") ?? "").trim() || null,
  };
  for (const f of VALUATION_FIELDS) {
    row[COLUMN[f]] = parseField(formData.get(f), FIELD_KIND[f]);
  }

  const { error } = await ctx.supabase.from("valuations").insert(row);
  if (error) redirect(`/deals/${dealId}/valuations?error=save`);
  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}

/**
 * Upload a BOV PDF, extract it in ONE call, and store the result with a page
 * citation per field. Extraction failure is not fatal — the document is kept
 * and an empty valuation is created for the user to fill in by hand.
 */
export async function addValuationFromPdf(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/deals/${dealId}/valuations?error=file`);
  }
  if (file.size > MAX_FILE) {
    redirect(`/deals/${dealId}/valuations?error=size`);
  }

  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  if (signatureMismatch(file.name, buffer)) {
    redirect(`/deals/${dealId}/valuations?error=format`);
  }

  const docId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "bov.pdf";
  const path = `documents/${dealId}/${docId}-${safeName}`;
  await uploadSupplement(path, buffer, file.type);
  await ctx.supabase.from("deal_documents").insert({
    id: docId,
    deal_id: dealId,
    kind: "bov",
    filename: file.name,
    storage_path: path,
    content_type: file.type || null,
  });

  const fallbackLabel = String(formData.get("sourceLabel") ?? "").trim();

  const row: Record<string, unknown> = {
    deal_id: dealId,
    user_id: ctx.user.id,
    source_label: fallbackLabel || file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
    source_type: "broker",
    source_document_id: docId,
    extracted: false,
    citations: {},
    derived_fields: [],
  };

  try {
    const source = await omSourceFor(buffer, file.name);
    const bov = await extractBov(source);
    const citations: Record<string, { page: string; snippet: string }> = {};
    const derived: string[] = [];
    for (const f of VALUATION_FIELDS) {
      const field = bov.fields[f];
      row[COLUMN[f]] = field.value;
      if (field.value != null && field.page) {
        citations[f] = { page: field.page, snippet: field.snippet };
      }
      if (field.value != null && field.derived) derived.push(f);
    }
    row.source_label = fallbackLabel || bov.sourceLabel;
    row.source_type = bov.sourceType;
    row.extracted = true;
    row.citations = citations;
    row.derived_fields = derived;
    row.note = bov.take || null;
  } catch (err) {
    // The document is already attached; the user fills the fields in by hand.
    console.error("[bov] extraction failed", err);
    row.note = "Automatic extraction failed — fill the assumptions in by hand.";
  }

  const { error } = await ctx.supabase.from("valuations").insert(row);
  if (error) redirect(`/deals/${dealId}/valuations?error=save`);
  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}

/** Fill in or correct one valuation's fields. Blank still means null. */
export async function updateValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const valuationId = String(formData.get("valuationId") ?? "");
  if (!dealId || !valuationId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const label = String(formData.get("sourceLabel") ?? "").trim();
  if (label) patch.source_label = label;
  for (const f of VALUATION_FIELDS) {
    if (formData.has(f)) patch[COLUMN[f]] = parseField(formData.get(f), FIELD_KIND[f]);
  }

  await ctx.supabase
    .from("valuations")
    .update(patch)
    .eq("id", valuationId)
    .eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}

export async function deleteValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const valuationId = String(formData.get("valuationId") ?? "");
  if (!dealId || !valuationId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  await ctx.supabase.from("valuations").delete().eq("id", valuationId).eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}

/** Re-run extraction on an already-attached BOV document. */
export async function reextractValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const valuationId = String(formData.get("valuationId") ?? "");
  if (!dealId || !valuationId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const { data: valuation } = await ctx.supabase
    .from("valuations")
    .select("id, source_document_id")
    .eq("id", valuationId)
    .eq("deal_id", dealId)
    .maybeSingle();
  if (!valuation?.source_document_id) {
    redirect(`/deals/${dealId}/valuations?error=nodoc`);
  }

  const { data: doc } = await ctx.supabase
    .from("deal_documents")
    .select("storage_path, filename")
    .eq("id", valuation.source_document_id as string)
    .maybeSingle();
  if (!doc) redirect(`/deals/${dealId}/valuations?error=nodoc`);

  try {
    const buffer = await downloadDealFile(doc.storage_path as string);
    const bov = await extractBov(
      buffer.length > 0 ? await omSourceFor(buffer, String(doc.filename)) : omFromBuffer(buffer),
    );
    const patch: Record<string, unknown> = {
      extracted: true,
      source_type: bov.sourceType,
      note: bov.take || null,
      updated_at: new Date().toISOString(),
    };
    const citations: Record<string, { page: string; snippet: string }> = {};
    const derived: string[] = [];
    for (const f of VALUATION_FIELDS) {
      const field = bov.fields[f];
      patch[COLUMN[f]] = field.value;
      if (field.value != null && field.page) citations[f] = { page: field.page, snippet: field.snippet };
      if (field.value != null && field.derived) derived.push(f);
    }
    patch.citations = citations;
    patch.derived_fields = derived;
    await ctx.supabase.from("valuations").update(patch).eq("id", valuationId);
  } catch (err) {
    console.error("[bov] re-extraction failed", err);
    redirect(`/deals/${dealId}/valuations?error=extract`);
  }

  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}
