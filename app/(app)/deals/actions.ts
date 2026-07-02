"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOmPdf, removeStorageFiles } from "@/lib/storage";
import { getBilling } from "@/lib/billing";
import { jobInFlight } from "@/lib/jobs";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { runAnalysis, runReconciliation } from "@/lib/anthropic/pipeline";

// Keep PDFs comfortably under Claude's ~32MB per-request limit (base64 inflates
// the payload ~33%). Larger files will use the Files API in a later pass.
const MAX_BYTES = 22 * 1024 * 1024;

// Accepted formats for the buyer's own underwriting model (Phase 5 reconciler).
const MODEL_EXT = /\.(xlsx|xls|csv|pdf)$/i;

/**
 * Create a deal from the new-deal form: store the OM PDF, then kick off the
 * background analysis. `after()` runs the pipeline once the redirect response
 * is sent, so the page returns instantly and the deal screen shows progress.
 */
export async function createDeal(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const assetClass = String(formData.get("assetClass") ?? "auto");
  const file = formData.get("om");

  if (!name) redirect("/deals?error=name");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Free-tier deal cap (enforced server-side; the UI also prompts to upgrade).
  const billing = await getBilling(supabase, user.id);
  if (!billing.canCreateDeal) redirect("/deals?error=limit");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/deals?error=file");
  }
  if (file.type !== "application/pdf") {
    redirect("/deals?error=pdf");
  }
  if (file.size > MAX_BYTES) {
    redirect("/deals?error=size");
  }

  const { data: deal, error: insertErr } = await supabase
    .from("deals")
    .insert({ name, asset_class: assetClass, user_id: user.id })
    .select("id")
    .single();
  if (insertErr || !deal) redirect("/deals?error=save");

  const dealId = deal.id as string;
  const path = `${user.id}/${dealId}.pdf`;

  // If the upload or the follow-up writes fail, remove the half-created deal —
  // otherwise the user is stranded with a ghost row that eats a free slot.
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadOmPdf(path, buffer);

    const { error: pathErr } = await supabase
      .from("deals")
      .update({ om_storage_path: path })
      .eq("id", dealId);
    if (pathErr) throw new Error(pathErr.message);

    const { error: jobErr } = await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "extract", progress: 0 });
    if (jobErr) throw new Error(jobErr.message);
  } catch {
    await supabase.from("deals").delete().eq("id", dealId);
    await removeStorageFiles([path]);
    redirect("/deals?error=upload");
  }

  after(() => runAnalysis(dealId));

  redirect(`/deals/${dealId}`);
}

/**
 * Seed a fully-populated sample deal so a new user can explore every tab, the
 * model, and the verdict without an OM. No AI calls, no file — just the demo
 * dataset. Flagged `is_sample` so it never consumes a free slot (migration
 * 0006), and idempotent: a second click just opens the existing sample.
 */
export async function createSampleDeal() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already have one? Open it instead of inserting a duplicate.
  const { data: existing } = await supabase
    .from("deals")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_sample", true)
    .limit(1)
    .maybeSingle();
  if (existing) redirect(`/deals/${existing.id}`);

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      user_id: user.id,
      is_sample: true,
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      reconciliation: SAMPLE_DEAL.reconciliation,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      model: SAMPLE_DEAL.model,
    })
    .select("id")
    .single();
  if (error || !deal) redirect("/deals?error=save");

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

/** Rename a deal. RLS scopes the update to the caller's own deal. */
export async function renameDeal(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!dealId || !name) redirect(`/deals/${dealId}`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("deals")
    .update({ name: name.slice(0, 120), updated_at: new Date().toISOString() })
    .eq("id", dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  redirect(`/deals/${dealId}`);
}

/**
 * Delete a deal: sweep its Storage files (OM, documents, supplements), then
 * delete the row — analysis_jobs and deal_documents cascade in the DB. RLS
 * scopes every read/write to the caller's own deal.
 */
export async function deleteDeal(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path, supplements")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");

  // Collect every storage path this deal owns.
  const paths: string[] = [];
  if (deal.om_storage_path) paths.push(deal.om_storage_path as string);
  const supp = (deal.supplements as Record<
    string,
    { files?: { path: string }[] }
  > | null) ?? {};
  for (const tab of Object.values(supp))
    for (const f of tab.files ?? []) if (f.path) paths.push(f.path);
  const { data: docs } = await supabase
    .from("deal_documents")
    .select("storage_path")
    .eq("deal_id", dealId);
  for (const d of (docs ?? []) as { storage_path: string }[])
    if (d.storage_path) paths.push(d.storage_path);

  // Delete the row FIRST (checked) — a row pointing at deleted files is an
  // unrecoverable state, while orphaned storage objects are sweepable later.
  const { error: delErr } = await supabase
    .from("deals")
    .delete()
    .eq("id", dealId);
  if (delErr) redirect(`/deals/${dealId}?error=delete`);
  await removeStorageFiles(paths);

  revalidatePath("/deals");
  redirect("/deals?deleted=1");
}

/** Re-run (or first-run) the analysis for an existing deal that has an OM. */
export async function rerunAnalysis(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal?.om_storage_path) redirect(`/deals/${dealId}`);

  // Refuse to stack a second pipeline on a live job (double-click guard).
  if (await jobInFlight(supabase, dealId)) {
    redirect(`/deals/${dealId}?error=busy`);
  }

  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("deal_id", dealId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "queued", step: "extract", progress: 0, error: null })
      .eq("deal_id", dealId);
  } else {
    await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "extract", progress: 0 });
  }

  after(() => runAnalysis(dealId));
  redirect(`/deals/${dealId}`);
}

/**
 * Phase 5 — reconcile the deal against the buyer's own model. Takes the
 * uploaded model (Excel / CSV / PDF), kicks off the reconciler in the
 * background, and reuses the deal's job row so the existing progress UI shows
 * it. The raw model file is held in memory for the background run, not stored.
 */
export async function reconcileWithModel(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal?.om_storage_path) redirect(`/deals/${dealId}`);

  // Refuse to stack a second pipeline on a live job (double-click guard).
  if (await jobInFlight(supabase, dealId)) {
    redirect(`/deals/${dealId}?error=busy`);
  }

  const file = formData.get("model");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/deals/${dealId}?error=modelfile`);
  }
  if (!MODEL_EXT.test(file.name)) {
    redirect(`/deals/${dealId}?error=modeltype`);
  }
  if (file.size > MAX_BYTES) {
    redirect(`/deals/${dealId}?error=modelsize`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name;

  // Reuse the deal's single job row so the deal page treats the deal as
  // "active" and the existing poller surfaces the reconcile step.
  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("deal_id", dealId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", step: "reconcile", progress: 10, error: null })
      .eq("deal_id", dealId);
  } else {
    await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "reconcile",
      progress: 10,
    });
  }

  after(() => runReconciliation(dealId, { name, buffer }));
  redirect(`/deals/${dealId}`);
}
