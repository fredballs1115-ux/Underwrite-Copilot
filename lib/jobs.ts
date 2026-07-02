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
