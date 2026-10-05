// Whether the deal's screen is still reading the memorandum's figures — the
// one moment a missing figure in the deal's header is "not read yet" rather
// than "not stated". Pure; the page asks it and draws a quiet shimmer in the
// figure's place (app/(app)/deals/[id]/deal-hero), where a finished screen's
// missing figure keeps its dash.

import { STALE_MS, staleWhileRunning, type JobLike } from "@/lib/screen-run";

/**
 * True while a live screen has not yet rewritten the extraction the header's
 * figures come from — queued, on its first signal, or extracting (lib/screen-
 * run's own line, `staleWhileRunning`). Once the terms are written, a figure
 * still missing is one the memorandum does not state, and the header says so
 * with its dash, whatever else the run is doing. A job that is no screen (a
 * comp search, a model build, the reconciler) reads no figures, and a run
 * that has stopped writing progress (`STALE_MS`) is reading nothing.
 */
export function readingMemorandum(job: JobLike | null | undefined, now: number = Date.now()): boolean {
  if (!job || (job.status !== "queued" && job.status !== "running")) return false;
  const t = job.updated_at ? Date.parse(job.updated_at) : NaN;
  if (Number.isFinite(t) && now - t > STALE_MS) return false;
  return staleWhileRunning(job).has("extraction");
}
