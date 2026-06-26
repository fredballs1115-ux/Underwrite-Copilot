"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  uploadSupplement,
  removeSupplementFile,
} from "@/lib/storage";
import { DOC_KIND_KEYS } from "@/lib/documents";
import { isPro } from "@/lib/billing";
import { runModelGeneration } from "@/lib/model/build-model";

const MAX_FILE = 22 * 1024 * 1024;

async function requireDeal(dealId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();
  if (!data) return null;
  return supabase;
}

/** Attach a source document (OM, rent roll, T-12, …) to the deal. */
export async function addDealDocument(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "other");
  const kind = DOC_KIND_KEYS.has(kindRaw) ? kindRaw : "other";
  const file = formData.get("file");
  if (!dealId) return;
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE) return;

  const supabase = await requireDeal(dealId);
  if (!supabase) return;

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "file";
  const path = `documents/${dealId}/${id}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadSupplement(path, buffer, file.type);

  await supabase.from("deal_documents").insert({
    id,
    deal_id: dealId,
    kind,
    filename: file.name,
    storage_path: path,
    content_type: file.type || null,
  });
  revalidatePath(`/deals/${dealId}`);
}

/** Remove a source document from the deal's document set. */
export async function removeDealDocument(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const docId = String(formData.get("docId") ?? "");
  if (!dealId || !docId) return;

  const supabase = await requireDeal(dealId);
  if (!supabase) return;

  const { data: doc } = await supabase
    .from("deal_documents")
    .select("id, storage_path")
    .eq("id", docId)
    .eq("deal_id", dealId)
    .maybeSingle();
  if (doc) {
    await removeSupplementFile((doc as { storage_path: string }).storage_path);
    await supabase.from("deal_documents").delete().eq("id", docId);
  }
  revalidatePath(`/deals/${dealId}`);
}

/** Kick off model generation in the background, reusing the deal's job row. */
export async function generateModel(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const supabase = await requireDeal(dealId);
  if (!supabase) return;

  // Pro-only feature (UI hides the button for free users; this is the backstop).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isPro(supabase, user.id))) return;

  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("deal_id", dealId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", step: "model", progress: 5, error: null })
      .eq("deal_id", dealId);
  } else {
    await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "model",
      progress: 5,
    });
  }

  after(() => runModelGeneration(dealId));
  revalidatePath(`/deals/${dealId}`);
}
