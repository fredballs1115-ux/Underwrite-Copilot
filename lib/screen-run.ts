/**
 * What a screen's job row says about the results stored beside it.
 *
 * The pipeline writes each result to the deal as its step finishes, so a run
 * that fails midway leaves a MIXED generation: the steps before the failure
 * hold this run's results, the steps from it onward still hold the previous
 * screen's. Nothing in the deal row records that — the job row does: its
 * status is "error" and its step names where the run stopped. Pure, and
 * shared by the deal page, the pipeline list, the memo and report routes
 * and the shared screen, so every surface reads a failed run the same way.
 */

/** The automatic pass, in order. Each step rewrites the result named beside it. */
export const SCREEN_STEPS = [
  "signal",
  "extract",
  "challenge",
  "comps",
  "market",
  "verdict",
] as const;
export type ScreenStep = (typeof SCREEN_STEPS)[number];

/** The five stored results a screen writes, in the order it writes them. */
export type ResultKey = "extraction" | "challenges" | "comps" | "market" | "verdict";

/** The result each step writes — the first signal writes none of the five. */
const WRITES: Record<ScreenStep, ResultKey | null> = {
  signal: null,
  extract: "extraction",
  challenge: "challenges",
  comps: "comps",
  market: "market",
  verdict: "verdict",
};

export interface JobLike {
  status: string | null | undefined;
  step: string | null | undefined;
  /** the row's last write — a live run keeps it fresh */
  updated_at?: string | null;
}

/** A job that hasn't written progress in this long is presumed dead: a
 *  crashed background task must never wedge the deal forever. The server's
 *  reclaim, the deal page's stall banner and the pipeline list all use it. */
export const STALE_MS = 10 * 60 * 1000;

/**
 * The results a FAILED screen never reached, so they still belong to the
 * previous screen: every result from the failing step onward. A first screen
 * has nothing behind it and nothing to mark; a failure in a job that is not
 * a screen (a comp search, a model build, the reconciler's own step) rewrote
 * none of the five and marks nothing. The reconciler's second step is the
 * verdict, so a reconcile that fails there marks the verdict alone.
 */
export function staleAfterFailure(job: JobLike | null | undefined): Set<ResultKey> {
  const out = new Set<ResultKey>();
  if (!job || job.status !== "error") return out;
  // No step at all means the run died before its first write.
  const step = job.step ?? "signal";
  const idx = (SCREEN_STEPS as readonly string[]).indexOf(step);
  if (idx < 0) return out;
  for (const s of SCREEN_STEPS.slice(idx)) {
    const key = WRITES[s];
    if (key) out.add(key);
  }
  return out;
}

export type ListJobStatus = "running" | "stalled" | "failed" | null;

/**
 * The pipeline list's status for a deal's latest job: a live run, a run that
 * stopped writing progress (its process died — a deploy, most often), or a
 * failure that left the verdict behind. A failure that never touched the
 * verdict (a comp search, say) leaves the verdict pill alone.
 */
export function listJobStatus(
  job: JobLike | null | undefined,
  hasVerdict: boolean,
  now: number = Date.now(),
): ListJobStatus {
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") {
    const t = job.updated_at ? Date.parse(job.updated_at) : NaN;
    return Number.isFinite(t) && now - t > STALE_MS ? "stalled" : "running";
  }
  if (job.status === "error") {
    if (!hasVerdict) return "failed";
    return staleAfterFailure(job).has("verdict") ? "failed" : null;
  }
  return null;
}
