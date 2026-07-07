"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOmPdf, removeStorageFiles } from "@/lib/storage";
import { getBilling } from "@/lib/billing";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { claimJob, releaseClaim } from "@/lib/jobs";
import { parseStructuredAddress } from "@/lib/address";
import {
  STAGES,
  normalizeStage,
  parseStageHistory,
  type Stage,
} from "@/lib/stages";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { runAnalysis, runReconciliation } from "@/lib/anthropic/pipeline";

// Keep PDFs comfortably under Claude's ~32MB per-request limit (base64 inflates
// the payload ~33%). Larger files will use the Files API in a later pass.
const MAX_BYTES = 22 * 1024 * 1024;

// Accepted formats for the buyer's own underwriting model (Phase 5 reconciler).
const MODEL_EXT = /\.(xlsx|xls|csv|pdf)$/i;

/** Everything that can go wrong creating a deal, as codes the callers map to
 *  copy: the single form redirects with ?error=, the batch panel shows inline. */
export type CreateDealError =
  | "name"
  | "auth"
  | "limit"
  | "teamlimit"
  | "file"
  | "pdf"
  | "size"
  | "save"
  | "upload";

export type CreateDealResult =
  | { ok: true; dealId: string; deduped?: boolean }
  | { ok: false; error: CreateDealError };

/**
 * The create-deal core shared by the single form and the batch panel: validate,
 * store the OM PDF, then kick off the background analysis. `after()` runs the
 * pipeline once the response is sent, so the request returns instantly and the
 * deal row shows progress. Returns codes instead of redirecting so each caller
 * can surface failures its own way.
 */
async function createDealCore(formData: FormData): Promise<CreateDealResult> {
  const name = String(formData.get("name") ?? "").trim();
  const assetClass = String(formData.get("assetClass") ?? "auto");
  const file = formData.get("om");

  if (!name) return { ok: false, error: "name" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  // Deal caps (also enforced by a DB trigger): personal free cap, or the
  // team's trial/plan when the user is on a team.
  const billing = await getBilling(supabase, user.id);
  if (!billing.canCreateDeal) {
    return { ok: false, error: billing.team ? "teamlimit" : "limit" };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "file" };
  }
  // Accept when the browser says PDF, says nothing (some drag sources report an
  // empty type for a real PDF), or the name ends in .pdf — then let the magic
  // bytes below be the real gate.
  const looksPdf =
    file.type === "application/pdf" ||
    file.type === "" ||
    /\.pdf$/i.test(file.name);
  if (!looksPdf) {
    return { ok: false, error: "pdf" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "size" };
  }
  // Trust the bytes, not the browser-declared MIME: a renamed non-PDF wastes
  // an upload + a full Claude run failing at extraction. Reject anything
  // without the %PDF- signature up front.
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return { ok: false, error: "pdf" };
  }

  // Idempotency: a raced double-submit (fast double-click, back-then-resubmit)
  // would otherwise create duplicate deals and duplicate Claude runs. If an
  // identically-named deal for this user appeared in the last 15s, treat this
  // as the same intent and go to it instead of creating a twin.
  const { data: recent } = await supabase
    .from("deals")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("name", name)
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.id) return { ok: true, dealId: recent.id as string, deduped: true };

  // On a team, new deals land in the shared pipeline while the team plan or
  // trial allows it; otherwise fall back to a personal deal so a personal-Pro
  // (or under-cap) member is never blocked by the team's spent trial.
  const teamAllowed =
    !!billing.team &&
    (billing.team.active || billing.team.dealCount < TEAM_TRIAL_DEALS);
  const { data: deal, error: insertErr } = await supabase
    .from("deals")
    .insert({
      name,
      asset_class: assetClass,
      user_id: user.id,
      team_id: teamAllowed ? billing.team!.id : null,
    })
    .select("id")
    .single();
  if (insertErr || !deal) return { ok: false, error: "save" };

  const dealId = deal.id as string;
  const path = `${user.id}/${dealId}.pdf`;

  // Optional property address from the autocomplete: the structured pick
  // when the user selected a suggestion, else the raw text as a bare label.
  // Best-effort separate update so a pre-0011 schema can't sink the create.
  const structured = parseStructuredAddress(formData.get("address"));
  const rawText = String(formData.get("addressText") ?? "").trim().slice(0, 160);
  const address =
    structured ??
    (rawText
      ? { label: rawText, street: "", city: "", state: "", zip: "", county: "", submarket: "" }
      : null);
  if (address) {
    try {
      await supabase.from("deals").update({ address }).eq("id", dealId);
    } catch {
      // pre-0011 schema — the deal still works without the address column
    }
  }

  // If the upload or the follow-up writes fail, remove the half-created deal —
  // otherwise the user is stranded with a ghost row that eats a free slot.
  try {
    await uploadOmPdf(path, buffer);

    const { error: pathErr } = await supabase
      .from("deals")
      .update({ om_storage_path: path })
      .eq("id", dealId);
    if (pathErr) throw new Error(pathErr.message);

    const { error: jobErr } = await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "signal", progress: 0 });
    if (jobErr) throw new Error(jobErr.message);
  } catch {
    await supabase.from("deals").delete().eq("id", dealId);
    await removeStorageFiles([path]);
    return { ok: false, error: "upload" };
  }

  after(() => runAnalysis(dealId));

  return { ok: true, dealId };
}

/** Create a deal from the new-deal form, then land on it. */
export async function createDeal(formData: FormData) {
  const result = await createDealCore(formData);
  if (result.ok) redirect(`/deals/${result.dealId}`);
  if (result.error === "auth") {
    // Round-trip through login BACK to an error state — landing without an
    // error would read as success and clear the localStorage draft.
    redirect(`/login?next=${encodeURIComponent("/deals?error=auth")}`);
  }
  redirect(`/deals?error=${result.error}`);
}

/**
 * One file of a batch upload (call-for-offers triage). The batch panel calls
 * this once per OM, sequentially, so each request stays within the normal
 * upload size and every existing gate — caps, magic bytes, idempotency —
 * applies per deal. Returns the outcome instead of redirecting.
 */
export async function createDealFromBatch(
  formData: FormData,
): Promise<CreateDealResult> {
  return createDealCore(formData);
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

/** Track where a deal sits in YOUR process — independent of the verdict.
 *  RLS lets the creator or any teammate move it. Every change is appended to
 *  the deal's stage history with its date. */
export async function setStage(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  // A change made from a pipeline row returns to the pipeline; from the deal
  // page it stays on the deal.
  const backTo =
    formData.get("next") === "pipeline" ? "/deals" : `/deals/${dealId}`;
  if (!dealId || !STAGES.includes(stage as Stage)) {
    redirect(dealId ? backTo : "/deals");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read the current stage + history so the change is logged with its date.
  const { data: current } = await supabase
    .from("deals")
    .select("stage, stage_history")
    .eq("id", dealId)
    .maybeSingle();
  if (!current) redirect(backTo);
  if (normalizeStage(current!.stage as string) === stage) redirect(backTo);

  const history = [
    ...parseStageHistory(current!.stage_history),
    { stage: stage as Stage, at: new Date().toISOString() },
  ];

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("deals")
    .update({ stage, stage_history: history, updated_at: now })
    .eq("id", dealId);
  if (error) {
    // Pre-0013 schema: the history column may not exist yet — the stage value
    // itself should still save where the old constraint allows it.
    const { error: retryErr } = await supabase
      .from("deals")
      .update({ stage, updated_at: now })
      .eq("id", dealId);
    if (retryErr) redirect(`/deals/${dealId}?error=stage`);
  }
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  redirect(backTo);
}

/** Set or clear the broker's call-for-offers date. */
export async function setOffersDue(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const raw = String(formData.get("offersDue") ?? "").trim();
  if (!dealId) redirect("/deals");
  // Empty clears the deadline; otherwise require a plain ISO date.
  const offersDue =
    raw === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
  if (offersDue === undefined) redirect(`/deals/${dealId}?error=deadline`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("deals")
    .update({ offers_due: offersDue, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) redirect(`/deals/${dealId}?error=deadline`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  redirect(`/deals/${dealId}`);
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

  // Atomic claim — a double-click or a concurrent teammate trigger gets
  // "busy" instead of a second pipeline interleaving with this one.
  const claim = await claimJob(supabase, dealId, "signal");
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "signal", progress: 0 });
    if (insErr) redirect(`/deals/${dealId}?error=busy`);
  }

  // Snapshot for the retrade diff only when the stored results are a
  // coherent, completed generation — never after a failed/partial run.
  after(() => runAnalysis(dealId, { snapshotPrior: claim.priorStatus === "done" }));
  redirect(`/deals/${dealId}`);
}

/**
 * Retrade: swap in a reissued OM and re-screen. Brokers cut price and resend
 * the deck constantly — this overwrites the stored OM (same storage path) and
 * runs the full pipeline again. The pipeline snapshots the previous results
 * first, so the deal page then shows exactly what moved since the last screen.
 */
export async function replaceOm(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this read — a deal the caller can't see comes back null.
  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path, user_id, team_id, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");
  // The sample deal is cap-exempt demo data — attaching a real OM to it would
  // mint a free extra screening slot.
  if (deal.is_sample) redirect(`/deals/${dealId}`);

  // Replacing the OM destroys the original upload (same path, no history) —
  // gate it like deletion: the deal's creator, or the team owner. A teammate
  // who can't delete the deal shouldn't be able to vaporize its source doc.
  if (deal.user_id !== user.id) {
    const { data: team } = deal.team_id
      ? await supabase
          .from("teams")
          .select("owner_id")
          .eq("id", deal.team_id)
          .maybeSingle()
      : { data: null };
    if (!team || team.owner_id !== user.id) {
      redirect(`/deals/${dealId}?error=ompermission`);
    }
  }

  const file = formData.get("om");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/deals/${dealId}?error=omfile`);
  }
  const looksPdf =
    file.type === "application/pdf" ||
    file.type === "" ||
    /\.pdf$/i.test(file.name);
  if (!looksPdf) {
    redirect(`/deals/${dealId}?error=ompdf`);
  }
  if (file.size > MAX_BYTES) {
    redirect(`/deals/${dealId}?error=omsize`);
  }
  // Verify the %PDF- signature, not just the browser-declared MIME.
  const replacementBytes = Buffer.from(await file.arrayBuffer());
  if (!replacementBytes.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    redirect(`/deals/${dealId}?error=ompdf`);
  }

  // Claim the run BEFORE the multi-second upload — the claim is a single
  // conditional UPDATE, so a concurrent replace/re-run on the same deal gets
  // "busy" instead of a second pipeline interleaving writes with this one.
  const claim = await claimJob(supabase, dealId, "signal");
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "signal", progress: 0 });
    if (insErr) redirect(`/deals/${dealId}?error=busy`);
  }

  // Keep the same storage path (upsert) so every reference — signed URLs,
  // the pipeline download, deletion cleanup — stays valid.
  const path = (deal.om_storage_path as string) ?? `${user.id}/${dealId}.pdf`;
  try {
    await uploadOmPdf(path, replacementBytes);
  } catch {
    // Release the claim or the deal reads "queued" with no runner.
    await releaseClaim(
      supabase,
      dealId,
      "The replacement upload didn't complete — the stored OM is unchanged.",
    );
    redirect(`/deals/${dealId}?error=omupload`);
  }
  if (!deal.om_storage_path) {
    await supabase.from("deals").update({ om_storage_path: path }).eq("id", dealId);
  }

  // Only diff against results from a COMPLETED previous run — snapshotting
  // after a failed run would pair a half-new extraction with an old verdict.
  after(() => runAnalysis(dealId, { snapshotPrior: claim.priorStatus === "done" }));
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

  // Validate the file BEFORE claiming, so a rejected upload can't leave the
  // job row wedged in a claimed state.
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

  // Atomic claim (not a check-then-act read): two concurrent triggers on the
  // same deal can't both win, so two pipelines never interleave writes.
  const claim = await claimJob(supabase, dealId, "reconcile");
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "reconcile",
      progress: 10,
    });
    if (insErr) redirect(`/deals/${dealId}?error=busy`);
  } else {
    // We own the row now — surface the reconcile step immediately.
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", step: "reconcile", progress: 10, error: null })
      .eq("deal_id", dealId);
  }

  after(() => runReconciliation(dealId, { name, buffer }));
  redirect(`/deals/${dealId}`);
}
