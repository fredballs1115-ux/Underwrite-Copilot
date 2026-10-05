"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadSupplement, signatureMismatch, downloadDealFile, documentPath } from "@/lib/storage";
import { omSourceFor, omFromBuffer } from "@/lib/anthropic/om-source";
import { extractBov } from "@/lib/anthropic/bov-extract";
import {
  VALUATION_FIELDS,
  citationsAfterEdit,
  parseValuationRow,
  type ValuationField,
} from "@/lib/valuation/types";
import {
  diffValuationForm,
  extractedFields,
  readValuationForm,
  type FieldRefusal,
} from "@/lib/valuation/form";

const MAX_FILE = 32 * 1024 * 1024;

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

/** A posted field as text, or null where the form did not post it. A BLANK
 *  INPUT IS NULL, not zero, and a figure the form cannot read is refused
 *  with a sentence (lib/valuation/form) — never a silent null. */
const postedField = (formData: FormData) => (field: ValuationField): string | null =>
  formData.has(field) ? String(formData.get(field) ?? "") : null;

/** Back to the page with a refused field's code; the page builds the
 *  sentence from the field's own label. */
const refusedUrl = (dealId: string, field: ValuationField, refusal: FieldRefusal) =>
  `/deals/${dealId}/valuations?error=field&field=${field}&why=${refusal}`;

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

  const form = readValuationForm(postedField(formData));
  if (form.refused) redirect(refusedUrl(dealId, form.refused.field, form.refused.refusal));

  const row: Record<string, unknown> = {
    deal_id: dealId,
    user_id: ctx.user.id,
    source_label: sourceLabel,
    source_type: sourceType,
    extracted: false,
    note: String(formData.get("note") ?? "").trim() || null,
  };
  for (const f of VALUATION_FIELDS) {
    row[COLUMN[f]] = form.values[f];
  }

  const { error } = await ctx.supabase.from("valuations").insert(row);
  if (error) {
    console.error("[bov] manual valuation insert failed", error.message);
    redirect(`/deals/${dealId}/valuations?error=save`);
  }
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
  const path = documentPath(dealId, docId, file.name, "bov.pdf");
  await uploadSupplement(path, buffer, file.type, { kind: "deal", dealId });
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
    const read = extractedFields(bov.fields);
    for (const f of VALUATION_FIELDS) row[COLUMN[f]] = read.values[f];
    row.source_label = fallbackLabel || bov.sourceLabel;
    row.source_type = bov.sourceType;
    row.extracted = true;
    row.citations = read.citations;
    row.derived_fields = read.derived;
    row.note = [bov.take, read.note].filter(Boolean).join(" ") || null;
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

/**
 * Fill in or correct one valuation's fields. Blank still means null.
 *
 * Only the fields the user changed are written, and each one becomes the
 * user's: its page citation and its "derived" mark go — they described the
 * document's figure, not this one — and an edited mark takes their place.
 * The write's error is read and said; nothing is reported saved that wasn't.
 */
export async function updateValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const valuationId = String(formData.get("valuationId") ?? "");
  if (!dealId || !valuationId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const { data: stored, error: readError } = await ctx.supabase
    .from("valuations")
    .select("*")
    .eq("id", valuationId)
    .eq("deal_id", dealId)
    .maybeSingle();
  if (readError || !stored) {
    if (readError) console.error("[bov] valuation read failed", readError.message);
    redirect(`/deals/${dealId}/valuations?error=update`);
  }
  const current = parseValuationRow(stored as Record<string, unknown>);

  const edit = diffValuationForm(current, postedField(formData));
  if (edit.refused) redirect(refusedUrl(dealId, edit.refused.field, edit.refused.refusal));

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  const label = String(formData.get("sourceLabel") ?? "").trim();
  if (label) patch.source_label = label;
  for (const f of edit.edited) patch[COLUMN[f]] = edit.changes[f] ?? null;
  if (edit.edited.length) {
    patch.citations = citationsAfterEdit((stored as Record<string, unknown>).citations, edit.edited, now);
    patch.derived_fields = current.derivedFields.filter((f) => !edit.edited.includes(f));
  }

  const { error } = await ctx.supabase
    .from("valuations")
    .update(patch)
    .eq("id", valuationId)
    .eq("deal_id", dealId);
  if (error) {
    console.error("[bov] valuation update failed", error.message);
    redirect(`/deals/${dealId}/valuations?error=update`);
  }
  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}

export async function deleteValuation(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const valuationId = String(formData.get("valuationId") ?? "");
  if (!dealId || !valuationId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  const { error } = await ctx.supabase.from("valuations").delete().eq("id", valuationId).eq("deal_id", dealId);
  if (error) {
    console.error("[bov] valuation delete failed", error.message);
    redirect(`/deals/${dealId}/valuations?error=delete`);
  }
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

  // A refused write is said after the try: a redirect thrown inside it would
  // be caught as an extraction failure.
  let writeFailed = false;
  try {
    const buffer = await downloadDealFile(doc.storage_path as string, { kind: "deal", dealId });
    const bov = await extractBov(
      buffer.length > 0 ? await omSourceFor(buffer, String(doc.filename)) : omFromBuffer(buffer),
    );
    const read = extractedFields(bov.fields);
    const patch: Record<string, unknown> = {
      extracted: true,
      source_type: bov.sourceType,
      note: [bov.take, read.note].filter(Boolean).join(" ") || null,
      updated_at: new Date().toISOString(),
    };
    for (const f of VALUATION_FIELDS) patch[COLUMN[f]] = read.values[f];
    patch.citations = read.citations;
    patch.derived_fields = read.derived;
    const { error } = await ctx.supabase.from("valuations").update(patch).eq("id", valuationId).eq("deal_id", dealId);
    if (error) {
      console.error("[bov] re-extraction write failed", error.message);
      writeFailed = true;
    }
  } catch (err) {
    console.error("[bov] re-extraction failed", err);
    redirect(`/deals/${dealId}/valuations?error=extract`);
  }
  if (writeFailed) redirect(`/deals/${dealId}/valuations?error=extractsave`);

  revalidatePath(`/deals/${dealId}/valuations`);
  redirect(`/deals/${dealId}/valuations`);
}
