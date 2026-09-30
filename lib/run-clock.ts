// The deal page's screen clock: how long the run on screen has been going.
// Pure, so the page and its test read one rule.

/**
 * When the run began, in ms: the job row's own start where the page has one
 * (its created_at, restamped by every claim — lib/jobs `claimJob`), else the
 * moment the page began watching. A reload mid-screen then reads the time
 * the run has really taken, never 0:00 beside "typically 2–4 minutes".
 */
export function runStartMs(startedAt: string | null | undefined, fallbackMs: number): number {
  const t = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(t) ? t : fallbackMs;
}

/** m:ss from the start to now; never below 0:00, since the browser's clock
 *  and the database's can disagree by a few seconds. */
export function elapsedLabel(startMs: number, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
