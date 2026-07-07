import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A job that hasn't been touched in this long is considered dead — a crashed
// background task must never wedge the deal forever.
const STALE_MS = 10 * 60 * 1000;

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
 */
export async function claimJob(
  supabase: SupabaseClient,
  dealId: string,
  step: string,
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
      status: "queued",
      step,
      progress: 0,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (live && stale) {
    // Reclaim only if it's still the same wedged state we observed.
    query = query.eq("status", priorStatus).eq("updated_at", existing.updated_at);
  } else {
    query = query.in("status", ["done", "error"]);
  }
  const { data: claimed } = await query.select("id");
  return claimed && claimed.length > 0
    ? { outcome: "claimed", priorStatus }
    : { outcome: "busy", priorStatus };
}

/** Release a claim taken by claimJob when the run is aborted before it
 *  starts (e.g. the upload failed) — otherwise the deal reads "queued"
 *  with no runner until the stale timeout. */
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
    .eq("status", "queued");
}
