/**
 * What a screen's job row says about the results stored beside it.
 *
 * The pipeline writes each result to the deal as its step finishes, so a run
 * that fails midway leaves a MIXED generation: the steps before the failure
 * hold this run's results, the steps from it onward still hold the previous
 * screen's. So does a run still GOING — a re-screen rewrites the terms
 * first and the verdict last, and for the minutes between, the deal holds
 * this run's terms beside the last run's call. Nothing in the deal row
 * records either — the job row does: its status and the step it has
 * reached. Pure, and shared by the deal page, the pipeline list, the memo
 * and report routes and the shared screen, so every surface reads a failed
 * or a running screen the same way (`previousScreenResults`).
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
  if (!job || job.status !== "error") return new Set();
  return fromStep(job.step);
}

/** Whether the job is a run still in flight — queued, or running (a stalled
 *  one included: its results are as mixed as a live one's until it is
 *  reclaimed or fails). */
export function isLiveJob(job: JobLike | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/**
 * The results a screen still RUNNING has not rewritten yet, so they still
 * belong to the previous screen: the same line a failure draws — every
 * result from the step in progress onward (a step is written as its step
 * finishes, and the job names the step it is in). A queued run has
 * rewritten nothing. On a first screen those results are simply absent,
 * so marking them marks nothing. Found by the research pass of 2026-09-30:
 * during a re-screen the memo, the report and the shared screen printed
 * the run's new terms under the previous run's verdict, as one screen.
 */
export function staleWhileRunning(job: JobLike | null | undefined): Set<ResultKey> {
  if (!job || !isLiveJob(job)) return new Set();
  return fromStep(job.step);
}

/**
 * Every stored result that belongs to a previous screen: the steps a failed
 * run never reached, and the steps a live run has not reached yet. The one
 * rule each surface asks — the deal page marks them and leaves them out of
 * its count of finished steps, and the memo, the report and the shared
 * screen never pair a result of this run with a verdict of the last.
 */
export function previousScreenResults(job: JobLike | null | undefined): Set<ResultKey> {
  return new Set([...staleAfterFailure(job), ...staleWhileRunning(job)]);
}

/**
 * `previousScreenResults`, held to the results the deal actually stores. A
 * first screen has no previous screen: a result it never reached is simply
 * absent, and nothing is the previous screen's. The deal page said "the
 * results it did not reach still show below, marked as the previous
 * screen's" over a first screen that had stored nothing at all (research
 * pass 30).
 */
export function storedPreviousResults(
  job: JobLike | null | undefined,
  stored: Partial<Record<ResultKey, unknown>>,
): ResultKey[] {
  return [...previousScreenResults(job)].filter((k) => stored[k] != null);
}

/**
 * Why the latest SCREEN stopped before its end, if it did: it failed before
 * one of the five results. Null for a finished run, one still going, and a
 * job that is no screen (a comp search, a model build). The deal page reads
 * it for its empty sections, which then point at the reason at the top of
 * the page instead of saying the screen "hasn't run" and offering a second
 * button for the one beside the failure.
 */
export function screenStopped(job: JobLike | null | undefined): "failed" | null {
  return staleAfterFailure(job).size > 0 ? "failed" : null;
}

/**
 * Why the stored verdict is the previous screen's, if it is: the latest
 * screen failed before it reached the verdict, or a screen still running
 * has not reached it yet. The memo and the report refuse to print it
 * beside terms the run has already rewritten, the shared screen marks it,
 * and the pipeline shows the run instead of the call it will replace.
 */
export function verdictBehind(job: JobLike | null | undefined): "failed" | "running" | null {
  if (staleAfterFailure(job).has("verdict")) return "failed";
  if (staleWhileRunning(job).has("verdict")) return "running";
  return null;
}

/** The day a verdict was written ("Sep 12, 2026"), read in UTC so the
 *  server's render and the browser's agree; null for a verdict saved before
 *  the pipeline stamped one, or a stamp that does not parse. */
export function screenedOn(generatedAt: string | null | undefined): string | null {
  if (!generatedAt) return null;
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The results from a step onward — no step at all means the run died, or
 *  has not started, before its first write; a step that is not a screen's
 *  (a comp search, a model build, the reconciler's own) rewrote none of
 *  the five and marks nothing. */
function fromStep(step: string | null | undefined): Set<ResultKey> {
  const out = new Set<ResultKey>();
  const idx = (SCREEN_STEPS as readonly string[]).indexOf(step ?? "signal");
  if (idx < 0) return out;
  for (const s of SCREEN_STEPS.slice(idx)) {
    const key = WRITES[s];
    if (key) out.add(key);
  }
  return out;
}

export type ListJobStatus = "running" | "stalled" | "failed" | null;

/**
 * The pipeline list's status for a deal's latest job: a live screen, a run
 * that stopped writing progress (its process died — a deploy, most often),
 * or a failure that left the verdict behind. A job that rewrites none of the
 * five results — a comp search, a model build, the reconciler before its
 * verdict step — is no screen: live, it leaves the call alone, since the
 * card shows a running screen in the verdict's place (a re-screen's terms
 * are rewriting under the old call); failed, it touches the pill only on a
 * deal with no verdict.
 */
export function listJobStatus(
  job: JobLike | null | undefined,
  hasVerdict: boolean,
  now: number = Date.now(),
): ListJobStatus {
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") {
    if (staleWhileRunning(job).size === 0) return null;
    const t = job.updated_at ? Date.parse(job.updated_at) : NaN;
    return Number.isFinite(t) && now - t > STALE_MS ? "stalled" : "running";
  }
  if (job.status === "error") {
    if (!hasVerdict) return "failed";
    return staleAfterFailure(job).has("verdict") ? "failed" : null;
  }
  return null;
}
