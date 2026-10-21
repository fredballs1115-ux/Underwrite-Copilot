"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  uploadOmPdf,
  removeStorageFiles,
  listDealPictureFiles,
  uploadSupplement,
  modelTmpPath,
  omStoragePath,
} from "@/lib/storage";
import type { DealVisualCache } from "@/lib/deal-location";
import { MAX_PICTURE_BYTES, clearOmPicture, picturePaths, storePicture } from "@/lib/deal-picture";
import { floodFramePaths } from "@/lib/flood-frame-core";
import { getBilling } from "@/lib/billing";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { dealLanding, moveBlock, moveBlockQuery, type DealWork } from "@/lib/personal-deal";
import { claimRecordComps, runRecordComps } from "@/lib/public-comps/run";
import {
  claimJob,
  releaseClaim,
  analysisWorkerEnabled,
  workerSchemaReady,
  newJobRow,
} from "@/lib/jobs";
import { parseStructuredAddress, typedAddress } from "@/lib/address";
import {
  STAGES,
  normalizeStage,
  parseStageHistory,
  type Stage,
} from "@/lib/stages";
import { SAMPLE_DEAL, sampleWork } from "@/lib/sample-deal";
import { sampleFixtureColumns } from "@/lib/sample-refresh";
import { refreshSampleDeal, syncSampleActuals } from "@/lib/sample-refresh-run";
import { OM_REPLACED, parseDealNotes, parseDealQa } from "@/lib/deals";
import { omFingerprint } from "@/lib/om-fingerprint";
import {
  factsFromForm,
  manualFactsProblem,
  buildManualExtraction,
  firstSignalFromExtraction,
} from "@/lib/manual-deal";
import { dealNameOf } from "@/lib/deal-name";
import { runAnalysis, runReconciliation } from "@/lib/anthropic/pipeline";
import { checkPdfOpens } from "@/lib/pdf-open";
import { capRefusalOf } from "@/lib/deal-allowance";
import { deadlineDay } from "@/lib/deadline-day";
import { currentOutcome, readOutcomeForm, withOutcome } from "@/lib/deal-outcome";
import { personName } from "@/lib/person";
import { writeStageGuarded } from "@/lib/stage-write";
import { readBulkStageForm, type BulkStageResult } from "@/lib/bulk-stage";
import { UPLOAD_MAX_BYTES } from "@/lib/upload-limit";
import { keepScreen } from "@/lib/screen-history";

// Claude's document limit is 32MB of raw PDF. Small OMs ride inline in the
// request; anything past the base64-inflation ceiling uploads once via the
// Files API and is referenced by id (lib/anthropic/om-source.ts), so the full
// 32MB — roughly 600 pages — is actually usable.
// The pipeline's oversized-file message reads the same constant.
const MAX_BYTES = UPLOAD_MAX_BYTES;

// Accepted formats for the buyer's own underwriting model (Phase 5 reconciler).
const MODEL_EXT = /\.(xlsx|xls|csv|pdf)$/i;

/** A deal's id: the database's uuid, nothing else. */
const DEAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything that can go wrong creating a deal, as codes the callers map to
 *  copy: the single form redirects with ?error=, the batch panel shows inline. */
export type CreateDealError =
  | "name"
  | "auth"
  | "limit"
  | "teamlimit"
  | "file"
  | "empty"
  | "pdf"
  | "size"
  | "locked"
  | "pages"
  | "save"
  | "upload";

export type CreateDealResult =
  // personal: a team member's deal filed in their own pipeline, where the
  // team does not see it (lib/personal-deal) — said where they land.
  | { ok: true; dealId: string; deduped?: boolean; personal?: boolean }
  | { ok: false; error: CreateDealError };

/**
 * The create-deal core shared by the single form and the batch panel: validate,
 * store the OM PDF, then kick off the background analysis. `after()` runs the
 * pipeline once the response is sent, so the request returns instantly and the
 * deal row shows progress. Returns codes instead of redirecting so each caller
 * can surface failures its own way.
 */
async function createDealCore(formData: FormData): Promise<CreateDealResult> {
  // The one cap every name is stored under (lib/deal-name): the upload had
  // stored a name of any length (research pass 42).
  const name = dealNameOf(formData.get("name"));
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

  // No file chosen arrives as an empty File with no name; a file that is
  // chosen and empty (0 bytes) has its name, and is said as empty — not
  // "choose a PDF", and not a retry of the same empty file.
  if (!(file instanceof File) || (file.size === 0 && !file.name)) {
    return { ok: false, error: "file" };
  }
  if (file.size === 0) return { ok: false, error: "empty" };
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
  // A memorandum the screen cannot read at all is refused here, before it
  // becomes a deal and takes a free slot (lib/pdf-open): one that asks for a
  // password to open, or one longer than the analysis reads in one pass. A
  // broker's "secured" copy opens without asking and goes ahead.
  const opens = await checkPdfOpens(buffer);
  if (opens.verdict === "password") return { ok: false, error: "locked" };
  if (opens.verdict === "too_long") return { ok: false, error: "pages" };

  // Idempotency: a raced double-submit (fast double-click, back-then-resubmit)
  // would otherwise create duplicate deals and duplicate Claude runs. If an
  // identically-named deal for this user appeared in the last 15s, treat this
  // as the same intent and go to it instead of creating a twin.
  const { data: recent } = await supabase
    .from("deals")
    .select("id, created_at, team_id")
    .eq("user_id", user.id)
    .eq("name", name)
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.id) {
    return { ok: true, dealId: recent.id as string, deduped: true, personal: !!billing.team && !recent.team_id };
  }

  // On a team, new deals land in the shared pipeline while the team plan or
  // trial allows it; otherwise fall back to a personal deal so a personal-Pro
  // (or under-cap) member is never blocked by the team's spent trial — and
  // say so, since the shared pipeline will not show it.
  const teamAllowed =
    !!billing.team &&
    (billing.team.active || billing.team.dealCount < TEAM_TRIAL_DEALS);
  const filed = await fileDeal(
    supabase,
    { name, asset_class: assetClass, user_id: user.id },
    teamAllowed ? billing.team!.id : null,
  );
  // The database's own cap refusal is the plan's limit, said as one — a
  // double-submit or a second tab the read above let through.
  if (!("id" in filed)) return { ok: false, error: filed.refusal ?? "save" };
  const personal = !!billing.team && !filed.teamFiled;

  const dealId = filed.id;
  const path = omStoragePath(user.id, dealId);

  // Optional property address from the autocomplete: the structured pick
  // when the user selected a suggestion, else the typed line with the
  // street, city and state it names read out (#441).
  // Best-effort separate update so a pre-0011 schema can't sink the create.
  const structured = parseStructuredAddress(formData.get("address"));
  const rawText = String(formData.get("addressText") ?? "").trim().slice(0, 160);
  const address = structured ?? (rawText ? typedAddress(rawText) : null);
  if (address) {
    try {
      await supabase.from("deals").update({ address }).eq("id", dealId);
    } catch {
      // pre-0011 schema — the deal still works without the address column
    }
    // Auto-comps: an address is all the public record needs — pull recorded
    // sales in the background the moment a building goes in.
    after(async () => {
      if (await claimRecordComps(dealId)) await runRecordComps(dealId);
    });
  }

  // Worker handoff only when the flag is on AND migration 0016 is actually
  // live — otherwise fall back to the in-process path (the probe logs). A
  // failed payload insert here would be destructive: the catch below deletes
  // the deal and its uploaded OM.
  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));

  // If the upload or the follow-up writes fail, remove the half-created deal —
  // otherwise the user is stranded with a ghost row that eats a free slot.
  try {
    await uploadOmPdf(path, buffer, { kind: "deal", dealId });

    const { error: pathErr } = await supabase
      .from("deals")
      .update({ om_storage_path: path })
      .eq("id", dealId);
    if (pathErr) throw new Error(pathErr.message);

    // In worker mode the queued row IS the handoff — the worker service
    // claims it and runs the pipeline.
    const { error: jobErr } = await supabase.from("analysis_jobs").insert(
      newJobRow(
        dealId,
        "signal",
        workerMode
          ? { workerPayload: { kind: "screen", requestedBy: user.id }, snapshotPrior: true }
          : undefined,
      ),
    );
    if (jobErr) throw new Error(jobErr.message);
  } catch {
    await supabase.from("deals").delete().eq("id", dealId);
    await removeStorageFiles([path], { kind: "deal", dealId });
    return { ok: false, error: "upload" };
  }

  // The screen's emails go to whoever asked for it (lib/email).
  if (!workerMode) after(() => runAnalysis(dealId, { requestedBy: user.id }));

  return { ok: true, dealId, personal };
}

/** Create a deal from the new-deal form, then land on it — saying so where
 *  a team member's deal went into their own pipeline. */
export async function createDeal(formData: FormData) {
  const result = await createDealCore(formData);
  if (result.ok) redirect(dealLanding(result.dealId, !!result.personal));
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

/** Inline state for the manual-entry forms (useActionState) — errors render
 *  next to the fields instead of bouncing through a redirect, so nothing the
 *  user typed is ever lost. */
export type ManualDealState = { error: string } | null;

/** The typed-facts form's words for a plan's limit — the app's own check
 *  and the database's refusal alike. */
const MANUAL_LIMIT = "You’ve reached the free-plan deal limit. Upgrade to Pro for unlimited deals.";
/**
 * Insert a new deal: on the reader's team while its plan or trial allows
 * (`teamId`), else as the reader's own. Where the database refuses the
 * team's insert for its trial — another insert took the last slot between
 * the allowance read and this write — the deal is filed again as the
 * reader's own, which the personal cap then decides; refused there too, both
 * pools are in use, and the refusal is the team's limit. So "your personal
 * free deals are all in use" is said only where they are (the batch-2
 * audit: a raced team insert had said it with the reader's own slots free).
 */
async function fileDeal(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  row: Record<string, unknown>,
  teamId: string | null,
): Promise<{ id: string; teamFiled: boolean } | { refusal: "limit" | "teamlimit" | null }> {
  const insert = (team_id: string | null) => supabase.from("deals").insert({ ...row, team_id }).select("id").single();
  const first = await insert(teamId);
  if (first.data && !first.error) return { id: first.data.id as string, teamFiled: teamId !== null };
  const refusal = capRefusalOf(first.error);
  if (teamId === null || refusal !== "teamlimit") return { refusal };
  const again = await insert(null);
  if (again.data && !again.error) return { id: again.data.id as string, teamFiled: false };
  const second = capRefusalOf(again.error);
  return { refusal: second === "limit" ? "teamlimit" : second };
}

const MANUAL_TEAM_LIMIT =
  "Your team’s trial deals and your personal free deals are all in use — start the Team plan or upgrade to Pro.";

/**
 * Create a deal from TYPED facts — no OM. The facts become a normal
 * ExtractionResult (plus an instant first signal), so the buy box, mandate
 * score, playground, and workbook all light up; the analysis pipeline then
 * runs its manual branch (challenger + market check against a synthesized
 * fact sheet, comps handed to the user's own tools). Same caps, idempotency,
 * and team routing as the upload path.
 */
export async function createManualDeal(
  _prev: ManualDealState,
  formData: FormData,
): Promise<ManualDealState> {
  const facts = factsFromForm(formData);
  const problem = manualFactsProblem(facts);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/deals")}`);
  }

  const billing = await getBilling(supabase, user.id);
  if (!billing.canCreateDeal) {
    return { error: billing.team ? MANUAL_TEAM_LIMIT : MANUAL_LIMIT };
  }

  // Same 15s idempotency window as the upload path — a double-click can't
  // mint twin deals and twin Claude runs.
  const { data: recent } = await supabase
    .from("deals")
    .select("id, team_id")
    .eq("user_id", user.id)
    .eq("name", facts.name)
    .gte("created_at", new Date(Date.now() - 15_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.id) redirect(dealLanding(recent.id as string, !!billing.team && !recent.team_id));

  // A structured autocomplete pick fills the market for the pipeline table
  // and geography checks, and so does a typed line, from the city and state
  // it names (#441).
  const structured = parseStructuredAddress(formData.get("address"));
  const address = structured ?? (facts.address ? typedAddress(facts.address) : null);
  if (!facts.market && address?.state) {
    facts.market = [address.city, address.state].filter(Boolean).join(", ");
  }

  const extraction = buildManualExtraction(facts);
  const firstSignal = firstSignalFromExtraction(extraction);

  const teamAllowed =
    !!billing.team &&
    (billing.team.active || billing.team.dealCount < TEAM_TRIAL_DEALS);
  const filed = await fileDeal(
    supabase,
    { name: facts.name, asset_class: facts.assetClass, user_id: user.id, extraction, first_signal: firstSignal },
    teamAllowed ? billing.team!.id : null,
  );
  if (!("id" in filed)) {
    // The database's own cap refusal is the plan's limit, never "try again".
    const cap = filed.refusal;
    return {
      error: cap === "teamlimit" ? MANUAL_TEAM_LIMIT : cap === "limit" ? MANUAL_LIMIT : "Couldn’t save the deal. Please try again.",
    };
  }
  const personal = !!billing.team && !filed.teamFiled;
  const dealId = filed.id;

  // Best-effort separate update so a pre-0011 schema can't sink the create.
  if (address) {
    try {
      await supabase.from("deals").update({ address }).eq("id", dealId);
    } catch {
      // the deal still works without the address column
    }
    after(async () => {
      if (await claimRecordComps(dealId)) await runRecordComps(dealId);
    });
  }

  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const { error: jobErr } = await supabase.from("analysis_jobs").insert(
    newJobRow(
      dealId,
      "signal",
      workerMode ? { workerPayload: { kind: "screen", requestedBy: user.id } } : undefined,
    ),
  );
  if (jobErr) {
    // No storage to sweep — just remove the half-created row.
    await supabase.from("deals").delete().eq("id", dealId);
    return { error: "Couldn’t start the screen. Please try again." };
  }

  if (!workerMode) after(() => runAnalysis(dealId, { requestedBy: user.id }));
  redirect(dealLanding(dealId, personal));
}

/**
 * Edit a manual deal's typed facts and re-screen. Only for deals with no OM
 * (an uploaded OM is the source of truth — facts come from extraction there).
 * Snapshots the OLD facts + verdict first so the deal page shows exactly what
 * moved, then rebuilds the extraction and runs the pipeline's manual branch.
 */
export async function updateManualFacts(
  _prev: ManualDealState,
  formData: FormData,
): Promise<ManualDealState> {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return { error: "Something went wrong — reload and try again." };

  const facts = factsFromForm(formData);
  const problem = manualFactsProblem(facts);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path, is_sample, extraction, verdict, challenges")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return { error: "This deal is no longer available." };
  if (deal.is_sample || deal.om_storage_path) {
    return {
      error:
        "This deal has an OM behind it — its facts come from the document, so re-screen from the OM instead.",
    };
  }

  // Claim the run BEFORE writing anything, held at "running" so the worker
  // can't pick the job up while the extraction is mid-rewrite (same pattern
  // as replace-OM). A losing concurrent trigger gets "busy".
  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const claim = await claimJob(
    supabase,
    dealId,
    "signal",
    workerMode ? { kind: "screen", requestedBy: user.id } : undefined,
    workerMode ? "running" : "queued",
  );
  if (claim.outcome === "busy") {
    return { error: "A screen is already running on this deal — give it a minute to finish." };
  }
  if (claim.outcome === "error") {
    return { error: "Couldn’t start the re-screen just now — nothing changed. Try again in a moment." };
  }
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase.from("analysis_jobs").insert(
      newJobRow(
        dealId,
        "signal",
        workerMode
          ? { status: "running", workerPayload: { kind: "screen", requestedBy: user.id } }
          : undefined,
      ),
    );
    if (insErr) {
      return { error: "Couldn’t start the re-screen. Please try again." };
    }
  }

  // Retrade watch for typed facts: the pipeline's manual branch never
  // snapshots (the extraction it sees is already the NEW facts), so the
  // before/after is captured here — only against a COMPLETED generation —
  // with the challenges this re-screen replaces, as the pipeline's own
  // snapshot keeps them, so the track record (lib/track-record) can score
  // the earlier screen's challenges against what arrived after its verdict.
  if (deal.extraction && deal.verdict) {
    const kept = {
      at: new Date().toISOString(),
      extraction: deal.extraction,
      verdict: deal.verdict,
      challenges: deal.challenges ?? null,
    };
    try {
      await supabase
        .from("deals")
        .update({
          prior_screen: {
            at: kept.at,
            extraction: deal.extraction,
            verdict: deal.verdict,
            challenges: deal.challenges ?? null,
          },
        })
        .eq("id", dealId);
    } catch {
      // pre-0010 schema — the re-screen proceeds without the diff
    }
    // Every screen kept (migration 0038), so a later re-screen never drops a
    // row the track record scored against this one. Best-effort: it never
    // throws, and before the table exists it logs and moves on.
    await keepScreen(supabase, dealId, kept);
  }

  const structured = parseStructuredAddress(formData.get("address"));
  if (!facts.market && structured) {
    facts.market = [structured.city, structured.state].filter(Boolean).join(", ");
  }
  const extraction = buildManualExtraction(facts);
  const firstSignal = firstSignalFromExtraction(extraction);

  const { error: updateErr } = await supabase
    .from("deals")
    .update({
      name: facts.name,
      asset_class: facts.assetClass,
      extraction,
      first_signal: firstSignal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId);
  if (updateErr) {
    await releaseClaim(
      supabase,
      dealId,
      "The fact update didn’t save — the stored facts are unchanged.",
    );
    return { error: "Couldn’t save the changes. Please try again." };
  }
  const structuredUpdate = structured
    ? { address: structured }
    : facts.address
      ? { address: typedAddress(facts.address) }
      : null;
  if (structuredUpdate) {
    // Only a CHANGED address invalidates the stored comps — a facts save
    // that round-trips the same address must not wipe the result and re-hit
    // the geocoder + government portal for identical inputs.
    let priorLabel: string | null = null;
    try {
      const { data: prior } = await supabase
        .from("deals")
        .select("address")
        .eq("id", dealId)
        .maybeSingle();
      priorLabel =
        ((prior?.address as { label?: string } | null)?.label ?? null);
      await supabase.from("deals").update(structuredUpdate).eq("id", dealId);
    } catch {
      // pre-0011 schema — carry on
    }
    const newLabel = structuredUpdate.address.label;
    if (newLabel && newLabel !== priorLabel) {
      after(async () => {
        // force: an edited address invalidates whatever was pulled before
        if (await claimRecordComps(dealId, true)) await runRecordComps(dealId);
      });
    }
  }

  if (workerMode) {
    // New facts are in place — hand the held row to the worker.
    await supabase
      .from("analysis_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("status", "running")
      .eq("step", "signal")
      .eq("progress", 0);
  } else {
    after(() => runAnalysis(dealId, { snapshotPrior: false, requestedBy: user.id }));
  }
  revalidatePath(`/deals/${dealId}`);
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

  // Already have one? Open it instead of inserting a duplicate — after
  // topping up anything the fixture gained since it was created (a sample
  // made before the actuals existed self-heals on the next open).
  const { data: existing } = await supabase
    .from("deals")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_sample", true)
    .limit(1)
    .maybeSingle();
  if (existing) {
    // Self-healing sample: a row seeded from an older fixture is written
    // again whole — every column the seed writes, its rent roll and T-12 —
    // so it shows what the homepage and /demo show (lib/sample-refresh).
    await refreshSampleDeal(existing.id as string);
    await syncSampleActuals(existing.id as string);
    await seedSampleWork(existing.id as string);
    redirect(`/deals/${existing.id}`);
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      user_id: user.id,
      is_sample: true,
      // The fixture's columns, its extraction stamped with the fixture's
      // edition (lib/sample-refresh); the address is written below.
      ...sampleFixtureColumnsWithoutAddress(),
    })
    .select("id")
    .single();
  if (error || !deal) redirect("/deals?error=save");

  // Two clicks can both pass the check above (the empty pipeline offers
  // the sample from its card and its button) and no index holds one sample
  // a reader. The earliest row is the sample: a later one deletes itself
  // and opens it, so whichever insert lost, the reader keeps one.
  const { data: samples } = await supabase
    .from("deals")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_sample", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  const first = (samples?.[0]?.id as string | undefined) ?? (deal.id as string);
  if (first !== deal.id) {
    await supabase.from("deals").delete().eq("id", deal.id);
    redirect(`/deals/${first}`);
  }

  // Neighborhood-level address (real submarket, fictional building) so the
  // regulation panel and the recorded-sales pull demo on REAL Philadelphia
  // data. Best-effort like every address write; comps pull rides after().
  try {
    await supabase
      .from("deals")
      .update({ address: SAMPLE_DEAL.address })
      .eq("id", deal.id);
    const sampleId = deal.id as string;
    after(async () => {
      if (await claimRecordComps(sampleId)) await runRecordComps(sampleId);
    });
  } catch {
    // pre-0011 schema — the sample still works address-less
  }

  await syncSampleActuals(deal.id as string);
  await seedSampleWork(deal.id as string);

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

/** The fixture's deal columns but its address, which the insert leaves to
 *  its own best-effort write. */
function sampleFixtureColumnsWithoutAddress() {
  const { address, ...rest } = sampleFixtureColumns();
  void address;
  return rest;
}

/**
 * The sample's lower half (signed-in gaps, H7): three Ask answers from its
 * fictional memorandum, the verdict's next steps as tasks and one note in
 * the decision log (lib/sample-deal `sampleWork`), so the panels a deal
 * grows into are not a row of empty states on the deal a new reader learns
 * the product on. Each is the sample's, never a person's: the answers name
 * no asker, the note is by the sample with no author id, and the tasks were
 * created by no one and are assigned to no one — so they are written with
 * the service role (a task's insert policy asks for the writer as its
 * creator). Once only: the sample cannot be asked (it has no PDF), so an Ask
 * thread on it is this seed's, and a sample that has one is left alone —
 * a task or a note the reader removed is never put back. The notes and the
 * tasks are each added only where the deal has none. Best-effort, like the
 * actuals: a failed read writes nothing and the next open tries again.
 */
async function seedSampleWork(dealId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const [row, tasks] = await Promise.all([
      admin.from("deals").select("qa, notes, is_sample").eq("id", dealId).maybeSingle(),
      admin.from("deal_tasks").select("id", { count: "exact", head: true }).eq("deal_id", dealId),
    ]);
    const deal = row.data as { qa?: unknown; notes?: unknown; is_sample?: boolean } | null;
    if (row.error || tasks.error || !deal?.is_sample) return;
    if (Array.isArray(deal.qa) && deal.qa.length > 0) return;
    const work = sampleWork(new Date().toISOString());
    // The tasks first, the thread last: the thread is what says the seed
    // ran, so a write that fails before it leaves the next open to try.
    if ((tasks.count ?? 0) === 0) {
      const { error } = await admin.from("deal_tasks").insert(
        work.tasks.map((t) => ({ deal_id: dealId, title: t.title, source: t.source, created_by: null })),
      );
      if (error) return;
    }
    const notes = parseDealNotes(deal.notes);
    await admin
      .from("deals")
      .update({ qa: work.qa, ...(notes.length === 0 ? { notes: work.notes } : {}) })
      .eq("id", dealId)
      .eq("is_sample", true);
  } catch {
    // the sample still opens; its panels show their empty states
  }
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

  // Read the current stage + history so the change is logged with its date,
  // and write it only onto the row as read: a change a teammate made in
  // between is read again and kept, never written over (lib/stage-write,
  // audit C8, L4).
  const now = new Date().toISOString();
  const written = await writeStageGuarded(supabase, dealId, (current) => {
    if (normalizeStage(current.stage as string) === stage) return { skip: "unchanged" };
    const history = [...parseStageHistory(current.stage_history), { stage: stage as Stage, at: now }];
    return { patch: { stage, stage_history: history, updated_at: now } };
  });
  if (!written.ok && written.why !== "error") {
    if (written.why === "conflict") redirect(`/deals/${dealId}?error=stage`);
    redirect(backTo);
  }
  if (!written.ok) {
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

/** Move several deals to one stage — the pipeline's select mode, "Move to
 *  stage…" and "Mark dead". The single change's own rules, deal by deal:
 *  the reader's session client, so row-level security decides who may see
 *  and write each deal (its creator, or any teammate); the same guarded
 *  write (lib/stage-write), each change appended to the deal's history with
 *  its date; never the sample deal. A deal the reader cannot see, the
 *  sample, and a write that did not land are counted as refused, never
 *  written around. `BULK_STAGE_MAX` deals at most (lib/bulk-stage). */
export async function bulkSetStage(formData: FormData): Promise<BulkStageResult> {
  const form = readBulkStageForm(formData);
  if (!form.ok) return form;
  const { stage, ids } = form;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  // Which of them the reader may read at all, and which is a sample: a row
  // RLS hides is not in the answer, and is refused without a write.
  const { data: rows, error: readError } = await supabase
    .from("deals")
    .select("id, is_sample")
    .in("id", ids);
  if (readError) return { ok: true, stage, changed: 0, unchanged: 0, refused: ids.length, settled: [] };
  const writable = new Set(
    ((rows ?? []) as { id: string; is_sample?: boolean | null }[])
      .filter((r) => !r.is_sample)
      .map((r) => String(r.id).toLowerCase()),
  );
  const targets = ids.filter((id) => writable.has(id));

  let changed = 0;
  let unchanged = 0;
  const moved: string[] = [];
  const settled: string[] = [];
  const now = new Date().toISOString();
  // A few at a time: fifty deals one after another is a long wait, fifty at
  // once a burst the database need not take.
  for (let at = 0; at < targets.length; at += BULK_STAGE_BATCH) {
    const results = await Promise.all(
      targets.slice(at, at + BULK_STAGE_BATCH).map(async (dealId) => {
        const written = await writeStageGuarded(supabase, dealId, (current) => {
          if (normalizeStage(current.stage as string) === stage) return { skip: "unchanged" };
          const history = [...parseStageHistory(current.stage_history), { stage, at: now }];
          return { patch: { stage, stage_history: history, updated_at: now } };
        });
        return { dealId, written };
      }),
    );
    for (const { dealId, written } of results) {
      if (written.ok) {
        changed++;
        moved.push(dealId);
        settled.push(dealId);
      } else if (written.why === "unchanged") {
        unchanged++;
        settled.push(dealId);
      }
    }
  }

  for (const dealId of moved) revalidatePath(`/deals/${dealId}`);
  // A deal already at the stage means the reader's list was behind the
  // database (another tab, a teammate): the list is read again for it too.
  if (moved.length > 0 || unchanged > 0) revalidatePath("/deals");
  return { ok: true, stage, changed, unchanged, refused: ids.length - changed - unchanged, settled };
}

/** How many deals a bulk change writes at once. */
const BULK_STAGE_BATCH = 5;

/** Why a dead deal died, and what it — or a closed one — traded at
 *  (research pass 24, B4): stored on the stage-history entry that ended the
 *  deal (lib/deal-outcome), which every later stage change keeps. A deal
 *  whose move to Dead or Closed was not recorded has no entry to carry it,
 *  and is refused rather than given a move on a day nobody made. */
export async function setDealOutcome(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Who reports a trade: their account, and the name their profile gives
  // (else their email's local part, lib/person `personName` — never the
  // whole address, which the account page promises teammates do not see) —
  // the card says "your profile's name" and the deal page names a
  // teammate's account as the team knows it today (audit C8, L4). A
  // profile that cannot be read leaves the email's local part.
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
  const reporterName = personName((profile as { full_name?: string | null } | null)?.full_name ?? null, user!.email ?? null, "") || null;

  const form = readOutcomeForm(
    {
      reason: formData.get("reason") as string | null,
      price: formData.get("price") as string | null,
      buyer: formData.get("buyer") as string | null,
      date: formData.get("date") as string | null,
    },
    { id: user!.id, name: reporterName },
    new Date().toISOString(),
  );
  if (!form.ok) redirect(`/deals/${dealId}?error=outcome${form.error}`);
  // The reason and the trade are two forms on the card: a field the form
  // did not send keeps what is recorded — a tap on a reason never clears a
  // reported trade, nor a saved trade the reason. Built on the row as read,
  // and written only onto it: a stage change made in between is read again
  // and kept, never put back (lib/stage-write).
  const written = await writeStageGuarded(supabase, dealId, (current) => {
    const recorded = parseStageHistory(current.stage_history);
    const existing = currentOutcome(current.stage as string | null, recorded);
    const outcome = {
      reason: formData.has("reason") ? form.outcome.reason : (existing?.reason ?? null),
      trade: formData.has("price") ? form.outcome.trade : (existing?.trade ?? null),
    };
    const history = withOutcome(current.stage as string | null, recorded, outcome);
    if (!history) return { skip: "refused" };
    return { patch: { stage_history: history, updated_at: new Date().toISOString() } };
  });
  if (!written.ok && written.why === "missing") redirect(`/deals/${dealId}`);
  if (!written.ok) redirect(`/deals/${dealId}?error=outcome`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/analytics");
  redirect(`/deals/${dealId}`);
}

/** Set or clear the broker's call-for-offers date. */
export async function setOffersDue(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const raw = String(formData.get("offersDue") ?? "").trim();
  if (!dealId) redirect("/deals");
  // Empty clears the deadline; otherwise a real day between 2000 and 2100
  // (lib/deadline-day) — a date field reports 0002 on the way to 2027, and
  // this had stored it.
  const offersDue = raw === "" ? null : (deadlineDay(raw) ?? undefined);
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

/** Rename a deal. RLS scopes the update to the caller's own deal. The
 *  sample keeps its name: the name is what marks it as the sample on every
 *  list, and a renamed sample read there as a real deal. The deal page
 *  offers it no Rename; this refuses one sent anyway. */
export async function renameDeal(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const name = dealNameOf(formData.get("name"));
  if (!dealId || !name) redirect(`/deals/${dealId}`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal || (deal as { is_sample?: boolean }).is_sample) redirect(`/deals/${dealId}`);

  await supabase
    .from("deals")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  redirect(`/deals/${dealId}`);
}

/**
 * Move a deal between the reader's own pipeline and their team's — "Share
 * with team" and "Make personal" on the deal's menu (lib/personal-deal). The
 * creator's alone: migration 0007's protect_deal_identity refuses anyone but
 * the creator or the team's owner a change of team, and a team owner taking
 * a member's deal out of the pipeline would hand it to someone else's own
 * pipeline, so the menu and this action offer it to the creator only. The
 * sample stays where it is. The move is counted against the cap of the
 * pipeline it lands in, as an insert there would be: the allowance is read
 * first (lib/billing, the create actions' own rule), and migration 0036's
 * update trigger refuses one the read let through, said in the same words.
 */
export async function moveDeal(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const to = String(formData.get("to") ?? "");
  // A deal's id is a UUID; anything else goes nowhere near a query or the
  // redirect built from it (audit C7, L13).
  if (!DEAL_ID.test(dealId)) redirect("/deals");
  const back = `/deals/${dealId}`;
  if (to !== "team" && to !== "personal") redirect(back);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, user_id, team_id, is_sample, notes, qa, supplements")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");
  const row = deal as {
    user_id: string;
    team_id: string | null;
    is_sample?: boolean;
    notes?: unknown;
    qa?: unknown;
    supplements?: unknown;
  };
  if (row.is_sample) redirect(back);
  if (row.user_id !== user!.id) redirect(`${back}?error=movepermission`);
  // Already where it was asked to go: nothing to do, nothing to say.
  if ((to === "team") === !!row.team_id) redirect(back);

  const billing = await getBilling(supabase, user!.id);
  let teamId: string | null = null;
  if (to === "team") {
    if (!billing.team) redirect(`${back}?error=movenoteam`);
    if (!(billing.team!.active || billing.team!.dealCount < TEAM_TRIAL_DEALS)) {
      redirect(`${back}?error=moveteamlimit`);
    }
    teamId = billing.team!.id;
  } else if (!(billing.plan === "pro" || billing.dealCount < billing.dealLimit)) {
    redirect(`${back}?error=movelimit`);
  }

  // What the move carries (lib/personal-deal `moveBlock`): someone else's
  // tasks, notes, files, Ask questions or source documents never cross into
  // a pipeline that would show them to people who could not see them, or out
  // of one that would hide them from the people who added them. Read with
  // the reader's own session — the creator can read every one of these
  // tables' rows for their deal, and the destination team's roster as its
  // member. A read that fails refuses rather than moves blind.
  const work = await readDealWork(supabase, dealId, row);
  if (!work) redirect(`${back}?error=movefail`);
  let members: Set<string> | undefined;
  if (to === "team") {
    const { data: roster, error: rosterErr } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId!);
    if (rosterErr || !roster) redirect(`${back}?error=movefail`);
    members = new Set((roster as { user_id: string }[]).map((m) => m.user_id));
  }
  const block = moveBlock(to, work!, { creatorId: user!.id, creatorEmail: user!.email ?? null, members });
  if (block) {
    redirect(`${back}?error=${to === "team" ? "moveteamwork" : "movepersonalwork"}&${moveBlockQuery(block)}`);
  }

  // `.select` so a write row-level security matched nothing for — 204 and
  // no error, as PostgREST answers — reads as the failure it is.
  const { data: moved, error } = await supabase
    .from("deals")
    .update({ team_id: teamId, updated_at: new Date().toISOString() })
    .eq("id", dealId)
    .select("id");
  if (error) {
    const refusal = capRefusalOf(error);
    redirect(
      `${back}?error=${refusal === "teamlimit" ? "moveteamlimit" : refusal === "limit" ? "movelimit" : "movefail"}`,
    );
  }
  if (!moved || moved.length === 0) redirect(`${back}?error=movefail`);
  revalidatePath(back);
  revalidatePath("/deals");
  redirect(`${back}?moved=${to}`);
}

/** Everything on a deal a move carries, with who added each where that is
 *  recorded (lib/personal-deal `DealWork`), or null where a read failed. */
async function readDealWork(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dealId: string,
  row: { notes?: unknown; qa?: unknown; supplements?: unknown },
): Promise<DealWork | null> {
  const [tasks, documents] = await Promise.all([
    supabase.from("deal_tasks").select("created_by, assignee_user_id").eq("deal_id", dealId),
    supabase.from("deal_documents").select("id").eq("deal_id", dealId),
  ]);
  if (tasks.error || documents.error) return null;
  const supp = (row.supplements && typeof row.supplements === "object" ? row.supplements : {}) as Record<
    string,
    { notes?: { byId?: unknown }[]; files?: { byId?: unknown }[] } | null
  >;
  const idOf = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const tabs = Object.values(supp).filter((t): t is NonNullable<typeof t> => !!t && typeof t === "object");
  return {
    tasks: ((tasks.data ?? []) as { created_by: string | null; assignee_user_id: string | null }[]).map((t) => ({
      createdBy: t.created_by,
      assignee: t.assignee_user_id,
    })),
    logNotes: parseDealNotes(row.notes),
    tabNotes: tabs.flatMap((t) => (Array.isArray(t.notes) ? t.notes : []).map((n) => ({ byId: idOf(n?.byId) }))),
    files: tabs.flatMap((t) => (Array.isArray(t.files) ? t.files : []).map((f) => ({ byId: idOf(f?.byId) }))),
    ask: parseDealQa(row.qa).map((e) => ({ by: e.by })),
    documents: (documents.data ?? []).length,
  };
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
    .select("id, user_id, om_storage_path, supplements, photo")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");

  // Collect every storage path this deal owns. Each is checked against the
  // deal's own shapes before the service role removes it — a path on the row
  // that names another deal's object is skipped, never swept.
  const scope = { kind: "deal", dealId } as const;
  const paths: string[] = [
    ...picturePaths((deal.photo as DealVisualCache | null) ?? null),
    ...floodFramePaths((deal.photo as DealVisualCache | null) ?? null),
  ];
  if (deal.om_storage_path) {
    paths.push(deal.om_storage_path as string);
    // A worker-mode reconcile may have parked a model file here; removing a
    // path that doesn't exist is a no-op, so always sweep it.
    paths.push(modelTmpPath(deal.om_storage_path as string));
  }
  paths.push(modelTmpPath(omStoragePath(deal.user_id as string, dealId)));
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

  // Delete the row FIRST, and sweep only once a row was actually deleted.
  // The delete policy is creator-or-team-owner, and PostgREST answers a
  // DELETE that matched nothing with 204 and no error — so without the row
  // count, a teammate's refused delete would still sweep the creator's files
  // out from under the surviving row. (A row pointing at deleted files is
  // unrecoverable; orphaned storage objects are sweepable later.)
  const { data: gone, error: delErr } = await supabase
    .from("deals")
    .delete()
    .eq("id", dealId)
    .select("id");
  if (delErr) redirect(`/deals/${dealId}?error=delete`);
  if (!gone || gone.length === 0) redirect(`/deals/${dealId}?error=deletepermission`);
  // The deal's picture folders are listed too, not only the files its photo
  // cache names: a picture whose record another write lost is still the
  // deal's (lib/storage `listDealPictureFiles`, research pass 39).
  const listed = await listDealPictureFiles(dealId).catch(() => [] as string[]);
  await removeStorageFiles([...new Set([...paths, ...listed])], scope);

  revalidatePath("/deals");
  redirect("/deals?deleted=1");
}

/** Re-run (or first-run) the analysis for an existing deal that has an OM —
 *  or a manual deal's typed facts (its stored extraction is the source). */
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
    .select("id, om_storage_path, extraction, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  // Screenable = has an OM, or has typed facts (manual). The sample deal is
  // static demo data — nothing to run.
  if (!deal || deal.is_sample || (!deal.om_storage_path && !deal.extraction)) {
    redirect(`/deals/${dealId}`);
  }

  // Atomic claim — a double-click or a concurrent teammate trigger gets
  // "busy" instead of a second pipeline interleaving with this one. In worker
  // mode the claim also writes the run payload; the worker takes it from here.
  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  // A retry of a FAILED worker run keeps the steps that finished (the same
  // OM, the same checkpoints): the failing step and the ones after it re-run.
  // The run records who asked: any member may re-screen a team deal, and
  // the screen's emails go to them (lib/email).
  const claim = await claimJob(
    supabase,
    dealId,
    "signal",
    workerMode ? { kind: "screen", requestedBy: user.id } : undefined,
    "queued",
    { keepCheckpoints: true },
  );
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  // A claim the database did not take, or a row it would not insert, is a
  // start that failed — never "a screen is already running" (research pass 30).
  if (claim.outcome === "error") redirect(`/deals/${dealId}?error=startfail`);
  if (claim.outcome === "none") {
    // No prior job row means no completed prior generation to diff against.
    const { error: insErr } = await supabase.from("analysis_jobs").insert(
      newJobRow(
        dealId,
        "signal",
        workerMode ? { workerPayload: { kind: "screen", requestedBy: user.id } } : undefined,
      ),
    );
    if (insErr) redirect(`/deals/${dealId}?error=startfail`);
  }

  // Snapshot for the retrade diff only when the stored results are a
  // coherent, completed generation — never after a failed/partial run.
  if (!workerMode) {
    after(() => runAnalysis(dealId, { snapshotPrior: claim.priorStatus === "done", requestedBy: user.id }));
  }
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
    .select("id, om_storage_path, user_id, team_id, is_sample, photo")
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
  if (!(file instanceof File) || (file.size === 0 && !file.name)) {
    redirect(`/deals/${dealId}?error=omfile`);
  }
  if (file.size === 0) redirect(`/deals/${dealId}?error=omempty`);
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
  // The upload's own check (lib/pdf-open): a replacement the screen cannot
  // read is refused before the old OM is replaced and a run is claimed.
  const replacementOpens = await checkPdfOpens(replacementBytes);
  if (replacementOpens.verdict === "password") redirect(`/deals/${dealId}?error=omlocked`);
  if (replacementOpens.verdict === "too_long") redirect(`/deals/${dealId}?error=ompages`);

  // Claim the run BEFORE the multi-second upload — the claim is a single
  // conditional UPDATE, so a concurrent replace/re-run on the same deal gets
  // "busy" instead of a second pipeline interleaving writes with this one.
  // In worker mode the claim lands directly in "running": a "queued" row is
  // claimable the instant it exists, and the worker must never pick this job
  // up mid-upload and screen the OLD bytes. It flips to "queued" (claimable)
  // only once the new OM is in place; if this web process dies mid-upload,
  // the held row goes stale and is reclaimable like any crashed run.
  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const claim = await claimJob(
    supabase,
    dealId,
    "signal",
    workerMode ? { kind: "screen", requestedBy: user.id } : undefined,
    workerMode ? "running" : "queued",
  );
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  // Before the upload: the stored OM is untouched (research pass 30).
  if (claim.outcome === "error") redirect(`/deals/${dealId}?error=startfail`);
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase.from("analysis_jobs").insert(
      newJobRow(
        dealId,
        "signal",
        workerMode
          ? { status: "running", workerPayload: { kind: "screen", requestedBy: user.id } }
          : undefined,
      ),
    );
    if (insErr) redirect(`/deals/${dealId}?error=startfail`);
  }

  // Keep the same storage path (upsert) so every reference — signed URLs,
  // the pipeline download, deletion cleanup — stays valid. A manual deal
  // getting its first OM takes the creator's folder, whoever uploads it.
  // The upload refuses a path that is not this deal's own (a stored path
  // naming another deal's object never gets written over).
  const path =
    (deal.om_storage_path as string | null) ?? omStoragePath(deal.user_id as string, dealId);
  try {
    await uploadOmPdf(path, replacementBytes, { kind: "deal", dealId, only: ["om"] });
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
  // A new deck may have a new cover: forget the picture lifted from the old
  // one, so the next view finds this one's. A picture the reader uploaded
  // is theirs and stays.
  await clearOmPicture(supabase, dealId, (deal.photo as DealVisualCache | null) ?? null);
  // Ask's answers stay on the thread — it only grows (migration 0036) — so
  // the thread is told the memorandum changed, through the same append Ask
  // writes with: an answer before this marker, or stamped with another
  // deck's fingerprint, reads as asked of the earlier memorandum, its pages
  // that deck's (lib/deals `parseDealQa`). A deal with no OM before has no
  // answers to mark. Best-effort: the new deck is in place either way.
  if (deal.om_storage_path) {
    try {
      const { error: markErr } = await supabase.rpc("append_deal_qa", {
        p_deal: dealId,
        p_entry: { at: new Date().toISOString(), event: OM_REPLACED, om: omFingerprint(replacementBytes) },
      });
      if (markErr) console.error(`[replaceOm] the Ask thread of ${dealId} was not marked: ${markErr.message}`);
    } catch (err) {
      console.error(`[replaceOm] the Ask thread of ${dealId} was not marked:`, err);
    }
  }

  // Only diff against results from a COMPLETED previous run — snapshotting
  // after a failed run would pair a half-new extraction with an old verdict.
  if (workerMode) {
    // New bytes are in place — hand the held row to the worker.
    await supabase
      .from("analysis_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("status", "running")
      .eq("step", "signal")
      .eq("progress", 0);
  } else {
    after(() => runAnalysis(dealId, { snapshotPrior: claim.priorStatus === "done", requestedBy: user.id }));
  }
  redirect(`/deals/${dealId}`);
}

/**
 * The reader's own photograph of the building — "that's not the building",
 * or "I have a better shot". Replaces whatever the deal shows first: the
 * cover lifted from the memorandum, or an earlier upload. The bytes never
 * serve as uploaded; sharp re-encodes them into the two stored sizes
 * (lib/deal-picture), which is also what refuses a file that is not a
 * picture. Anyone who can read the deal can put a picture on it — a
 * teammate correcting the photo is help, not harm, and the cover it
 * replaces came out of a file they can already open.
 */
export async function replacePicture(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, photo, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");
  if (deal.is_sample) redirect(`/deals/${dealId}`);

  const file = formData.get("picture");
  if (!(file instanceof File) || file.size === 0) redirect(`/deals/${dealId}?error=picture`);
  if (file.size > MAX_PICTURE_BYTES) redirect(`/deals/${dealId}?error=picturesize`);
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await storePicture(supabase, dealId, (deal.photo as DealVisualCache | null) ?? null, bytes, "upload");
  } catch {
    redirect(`/deals/${dealId}?error=picture`);
  }
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
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
    .select("id, user_id, om_storage_path")
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

  // Worker mode: the worker can't be handed an in-memory Buffer, so the model
  // is parked in the private Storage bucket (creator's folder, fixed name per
  // deal) and referenced from the job payload. The worker deletes it the
  // moment the run reaches a terminal state; in-process runs never store it.
  // The slot is minted from the deal's own ids, never read off a column.
  const workerMode =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const tmpPath = workerMode
    ? modelTmpPath(omStoragePath(deal.user_id as string, dealId))
    : null;

  // Atomic claim (not a check-then-act read): two concurrent triggers on the
  // same deal can't both win, so two pipelines never interleave writes. The
  // claim comes BEFORE the upload, holds the row at "running" (un-claimable),
  // and already carries the parked-file path — the fixed per-deal path may
  // only ever be written by the claim owner. A losing concurrent submit gets
  // "busy" WITHOUT having overwritten (or cleaned up) the winner's file, and
  // the worker can't pick the job up until the bytes are actually in place.
  const claim = await claimJob(
    supabase,
    dealId,
    "reconcile",
    workerMode && tmpPath
      ? { kind: "reconcile", model: { name, path: tmpPath } }
      : undefined,
    workerMode ? "running" : "queued",
  );
  if (claim.outcome === "busy") {
    redirect(`/deals/${dealId}?error=busy`);
  }
  if (claim.outcome === "error") redirect(`/deals/${dealId}?error=reconcilestartfail`);
  if (claim.outcome === "none") {
    const { error: insErr } = await supabase.from("analysis_jobs").insert(
      workerMode && tmpPath
        ? newJobRow(dealId, "reconcile", {
            status: "running",
            workerPayload: { kind: "reconcile", model: { name, path: tmpPath } },
          })
        : newJobRow(dealId, "reconcile", { status: "running", progress: 10 }),
    );
    if (insErr) redirect(`/deals/${dealId}?error=reconcilestartfail`);
  } else if (!workerMode) {
    // We own the row now — surface the reconcile step immediately.
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", step: "reconcile", progress: 10, error: null })
      .eq("deal_id", dealId);
  }

  if (workerMode && tmpPath) {
    try {
      await uploadSupplement(tmpPath, buffer, "application/octet-stream", {
        kind: "deal",
        dealId,
        only: ["model-tmp"],
      });
    } catch {
      // We own the claim — release it or the deal reads busy with no runner.
      await releaseClaim(
        supabase,
        dealId,
        "Your model didn't finish uploading — nothing was changed.",
      );
      redirect(`/deals/${dealId}?error=modelupload`);
    }
    // Bytes are in place — hand the held row to the worker.
    await supabase
      .from("analysis_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("status", "running")
      .eq("step", "reconcile")
      .eq("progress", 0);
  }

  if (!workerMode) after(() => runReconciliation(dealId, { name, buffer }));
  redirect(`/deals/${dealId}`);
}

/**
 * Decision log — append a note to the deal. Notes live as a jsonb array on
 * the deal row (migration 0017); RLS scopes the write to deals the caller
 * can see, and the author's email is stamped so teams see who said what.
 */
export async function addDealNote(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  // Array.from splits by code point, so the cap can't shear an emoji in half.
  const text = Array.from(String(formData.get("text") ?? "").trim())
    .slice(0, 500)
    .join("");
  if (!dealId) redirect("/deals");
  if (!text) redirect(`/deals/${dealId}?error=noteempty`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const note = {
    at: new Date().toISOString(),
    by: user.email ?? "unknown",
    // Stable identity for deletes — emails change, ids don't.
    byId: user.id,
    text,
  };

  // Atomic jsonb append (RPC from 0017) so two teammates writing at once
  // never lose each other's notes. Falls back to read-modify-write when the
  // function hasn't been migrated yet.
  const { error: rpcErr } = await supabase.rpc("append_deal_note", {
    p_deal: dealId,
    p_note: note,
  });
  if (rpcErr) {
    const { data: deal, error: readErr } = await supabase
      .from("deals")
      .select("id, notes")
      .eq("id", dealId)
      .maybeSingle();
    if (readErr) redirect(`/deals/${dealId}?error=note`);
    if (!deal) redirect("/deals");
    const notes = parseDealNotes(deal.notes);
    notes.push(note);
    const { error } = await supabase
      .from("deals")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("id", dealId);
    if (error) redirect(`/deals/${dealId}?error=note`);
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

/** Remove one of the caller's OWN notes (identified by its timestamp). */
export async function deleteDealNote(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const at = String(formData.get("at") ?? "");
  if (!dealId || !at) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, notes, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");

  // Identity: the stamped user id when present (survives email changes),
  // else the write-time email for notes from before byId existed; the
  // sample deal's own seeded note is its reader's to remove
  // (lib/note-remove, the decision log's rule too).
  const { mayRemoveNote } = await import("@/lib/note-remove");
  const reader = { userId: user.id, userEmail: user.email ?? "unknown" };
  const notes = parseDealNotes(deal.notes).filter(
    (n) => !(n.at === at && mayRemoveNote(n, reader, deal.is_sample === true)),
  );
  const { error } = await supabase
    .from("deals")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) redirect(`/deals/${dealId}?error=notedelete`);

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
