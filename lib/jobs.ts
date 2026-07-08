import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A job that hasn't been touched in this long is considered dead — a crashed
// background task must never wedge the deal forever.
const STALE_MS = 10 * 60 * 1000;

/**
 * ANALYSIS_WORKER=1 hands the pipeline to the dedicated worker service: the
 * web app only enqueues jobs (with a payload describing the run) and the
 * worker claims and executes them. Requires migration 0016 and a running
 * worker — see worker/README.md. Unset, the web app runs analyses in-process
 * via after(), exactly as before.
 */
export function analysisWorkerEnabled(): boolean {
  return process.env.ANALYSIS_WORKER === "1";
}

// Cached result of the 0016 schema probe. `true` is cached for the process
// lifetime (schemas don't unmigrate); `false` re-probes after a minute so
// running the migration heals the app without a redeploy.
let schemaProbe: { ok: boolean; at: number } | null = null;

/**
 * True when analysis_jobs has the 0016 columns the worker handoff writes.
 * The enqueue paths gate on analysisWorkerEnabled() AND this, so flipping
 * the env flag before running the migration degrades to the in-process
 * path (with a loud log) instead of failing every deal creation — the
 * failure there was destructive: the catch deletes the deal and its OM.
 */
export async function workerSchemaReady(
  supabase: SupabaseClient,
): Promise<boolean> {
  if (schemaProbe && (schemaProbe.ok || Date.now() - schemaProbe.at < 60_000)) {
    return schemaProbe.ok;
  }
  const { error } = await supabase
    .from("analysis_jobs")
    .select("payload, attempts")
    .limit(1);
  const ok = !error;
  if (!ok) {
    console.error(
      "[jobs] ANALYSIS_WORKER=1 but analysis_jobs is missing the 0016 columns " +
        "(run supabase/migrations/0016_worker_jobs.sql) — running analyses " +
        `in-process until it lands. Probe error: ${error?.message}`,
    );
  }
  schemaProbe = { ok, at: Date.now() };
  return ok;
}

/** What an enqueued job tells the worker to run. `snapshotPrior` and
 *  `completed` (the resume checkpoint) are managed by the enqueue/claim
 *  helpers and the pipeline respectively. */
export interface WorkerPayload {
  kind: "screen" | "reconcile";
  /** reconcile only — the model file parked in Storage for the worker */
  model?: { name: string; path: string };
}

/** Build an analysis_jobs insert row. ONE place composes the worker payload
 *  (typed — a payload typo would otherwise surface only as the worker
 *  mis-running a job). Omit `workerPayload` for in-process rows: the insert
 *  then touches no 0016 columns and stays safe on a pre-0016 schema. */
export function newJobRow(
  dealId: string,
  step: string,
  opts?: {
    status?: "queued" | "running";
    progress?: number;
    workerPayload?: WorkerPayload;
    /** only meaningful with workerPayload; defaults to false — inserts have
     *  no known-complete prior generation to diff against */
    snapshotPrior?: boolean;
  },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    deal_id: dealId,
    status: opts?.status ?? "queued",
    step,
    progress: opts?.progress ?? 0,
  };
  if (opts?.workerPayload) {
    row.payload = {
      ...opts.workerPayload,
      snapshotPrior: opts.snapshotPrior ?? false,
      completed: [],
    };
  }
  return row;
}

/**
 * True when the deal already has a live (non-stale) analysis job. Trigger
 * actions check this before starting a pipeline so a double-click or an
 * overlapping trigger can't run two pipelines that clobber the same job row.
 */
export async function jobInFlight(
  supabase: SupabaseClient,
  dealId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("analysis_jobs")
    .select("status, updated_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const active = data.status === "queued" || data.status === "running";
  if (!active) return false;
  const updated = new Date(data.updated_at as string).getTime();
  return isFinite(updated) ? Date.now() - updated < STALE_MS : true;
}

export interface JobClaim {
  outcome: "claimed" | "busy" | "none";
  /** the status the row held BEFORE the claim (null when outcome="none") —
   *  "done" means the stored results are one coherent, completed generation */
  priorStatus: string | null;
}

/**
 * Atomically claim the deal's job row for a new run. Unlike jobInFlight (a
 * plain read, fine for UI but check-then-act), the claim is a single
 * conditional UPDATE — two concurrent triggers can't both win, so two
 * pipelines can never interleave writes on the same deal.
 *
 * Stale jobs (crashed runs that stopped heartbeating) are reclaimable.
 *
 * `workerPayload` (worker mode only) is written onto the row alongside the
 * claim, with `snapshotPrior` derived here — only a COMPLETED prior
 * generation is safe to diff against — and `attempts` reset for the new run.
 * Pass `null` to CLEAR the payload instead: in-process job types (comp
 * search, model generation) claim with null in worker mode so the row never
 * carries a stale payload the worker could mistake for a handoff. Omit it
 * entirely (undefined) outside worker mode and the update touches no 0016
 * columns.
 *
 * `claimTo` is the status the row lands in. "queued" (default) makes it
 * immediately claimable by the worker; work that must NOT be picked up —
 * replace-OM during its upload, and every in-process job type — claims
 * straight to "running" so the worker never sees a claimable row.
 */
export async function claimJob(
  supabase: SupabaseClient,
  dealId: string,
  step: string,
  workerPayload?: WorkerPayload | null,
  claimTo: "queued" | "running" = "queued",
): Promise<JobClaim> {
  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id, status, updated_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) return { outcome: "none", priorStatus: null };

  const priorStatus = existing.status as string;
  const live = priorStatus === "queued" || priorStatus === "running";
  const updated = new Date(existing.updated_at as string).getTime();
  const stale = !isFinite(updated) || Date.now() - updated >= STALE_MS;
  if (live && !stale) return { outcome: "busy", priorStatus };

  // The WHERE clause re-checks the observed state inside the UPDATE itself,
  // so the decision and the write are one statement — a racing claimant's
  // update changes the row and this one matches zero rows.
  let query = supabase
    .from("analysis_jobs")
    .update({
      status: claimTo,
      step,
      progress: 0,
      error: null,
      updated_at: new Date().toISOString(),
      ...(workerPayload !== undefined
        ? {
            payload: workerPayload
              ? {
                  ...workerPayload,
                  snapshotPrior: priorStatus === "done",
                  completed: [],
                }
              : null,
            attempts: 0,
          }
        : {}),
    })
    .eq("id", existing.id);
  if (live && stale) {
    // Reclaim only if it's still the same wedged state we observed.
    query = query.eq("status", priorStatus).eq("updated_at", existing.updated_at);
  } else {
    query = query.in("status", ["done", "error"]);
  }
  const { data: claimed, error: claimErr } = await query.select("id");
  if (claimErr) {
    // Never silent: an errored claim reads as "busy" to the caller, and a
    // schema-shaped failure (missing 0016 columns) would otherwise look like
    // permanent contention with no trace anywhere.
    console.error(`[jobs] claim update failed for deal ${dealId}: ${claimErr.message}`);
  }
  return claimed && claimed.length > 0
    ? { outcome: "claimed", priorStatus }
    : { outcome: "busy", priorStatus };
}

/** Release a claim taken by claimJob when the run is aborted before it
 *  starts (e.g. the upload failed) — otherwise the deal reads "queued"
 *  with no runner until the stale timeout. Covers "running" too, for claims
 *  held in that state through an upload (see claimTo). */
export async function releaseClaim(
  supabase: SupabaseClient,
  dealId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("analysis_jobs")
    .update({
      status: "error",
      error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("deal_id", dealId)
    .in("status", ["queued", "running"]);
}
