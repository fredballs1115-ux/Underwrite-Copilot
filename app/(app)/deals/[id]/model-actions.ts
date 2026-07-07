"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  uploadSupplement,
  signatureMismatch,
  removeSupplementFile,
} from "@/lib/storage";
import { DOC_KIND_KEYS } from "@/lib/documents";
import { isPro } from "@/lib/billing";
import { claimJob } from "@/lib/jobs";
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
  // Surface a bad file instead of silently swallowing it — a user attaching a
  // 30MB rent roll deserves to know it was rejected, not to believe it worked.
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/deals/${dealId}?error=docfile`);
  }
  if (file.size > MAX_FILE) {
    redirect(`/deals/${dealId}?error=docsize`);
  }

  const supabase = await requireDeal(dealId);
  if (!supabase) return;

  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "file";
  const path = `documents/${dealId}/${id}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the name: reject a mislabeled known format early.
  if (signatureMismatch(file.name, buffer)) {
    redirect(`/deals/${dealId}?error=docformat`);
  }
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

  // Atomic claim (not a check-then-act read) so two overlapping triggers on
  // the same deal can't both schedule a run.
  const claim = await claimJob(supabase, dealId, "model");
  if (claim.outcome === "busy") return;
  if (claim.outcome === "none") {
    await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "model",
      progress: 5,
    });
  } else {
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", step: "model", progress: 5, error: null })
      .eq("deal_id", dealId);
  }

  after(() => runModelGeneration(dealId));
  revalidatePath(`/deals/${dealId}`);
}
