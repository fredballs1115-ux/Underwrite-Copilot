// The deal page's screen clock: how long the run on screen has been going.
// Pure, so the page and its test read one rule.

/** Longer than any screen runs. The rail shows only while the job row is
 *  fresh (a run heartbeats; a queued row older than the stall line reads as
 *  stalled), so a start further back than this is not this run's: a row
 *  claimed before claims restamped `created_at` still carries the deal's
 *  first screen's day, and a clock counting from it would read in days. */
export const MAX_RUN_MS = 2 * 60 * 60 * 1000;

/**
 * When the run was asked for, in ms: the job row's own claim where the page
 * has one (its created_at, restamped by every claim — lib/jobs `claimJob` —
 * so a worker's queue wait is counted), else the moment the page began
 * watching. Once the page has loaded, a reload mid-screen reads the time the
 * run has really taken, not a fresh 0:00 beside "typically 2–4 minutes". A
 * start more than `MAX_RUN_MS` before the page began watching is a row
 * stamped before the restamp, and the page's own moment stands in.
 */
export function runStartMs(startedAt: string | null | undefined, fallbackMs: number): number {
  const t = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(t)) return fallbackMs;
  return fallbackMs - t > MAX_RUN_MS ? fallbackMs : t;
}

/** m:ss from the start to now; never below 0:00, since the browser's clock
 *  and the database's can disagree by a few seconds. */
export function elapsedLabel(startMs: number, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
