// How long this account's screens take — measured, or not said at all.
//
// The deal page's progress rail used to promise "a full screen typically
// takes 2–4 minutes" and a side job "usually a minute or two", figures no
// run had ever been held to. Every screen's ledger is stored on its job row
// (`analysis_jobs.usage`, migration 0035, lib/anthropic/usage), and a
// screen that finished in one attempt carries its own time (`wallMs`: its
// wait for a turn, its model calls and everything between them, to the
// moment it was marked done — never the ledger's `ms`, which sums the calls
// alone; a failed or resumed run carries none). Where the reader's own account has at
// least three finished screens with one, the rail says their median,
// rounded to what a person would say; with fewer, it says no duration — the
// run's own clock already shows the time it has taken. Pure: the page makes
// the one small read and hands the figures in.

import { MEDIAN_FLOOR } from "@/lib/public-comps/core";

/** The newest finished screens the page reads for the figure. */
export const SCREEN_DURATION_SAMPLE = 20;

/** The median of the runs' stored wall-clocks, in ms, or null under three
 *  (the site's median floor, lib/public-comps `MEDIAN_FLOOR`). A value that
 *  is not a positive number — a ledger that recorded no call — is no run. */
export function typicalScreenMs(values: readonly unknown[]): number | null {
  const ms = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (ms.length < MEDIAN_FLOOR) return null;
  const mid = Math.floor(ms.length / 2);
  return ms.length % 2 ? ms[mid] : (ms[mid - 1] + ms[mid]) / 2;
}

/** The median as a person says it: "under a minute", "about a minute",
 *  "about 3 minutes" — whole minutes past a minute and a half, since a
 *  run's time moves by more than seconds from one OM to the next. Null
 *  with no figure. The rail says it as "Your screens usually take …". */
export function typicalScreenPhrase(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 45_000) return "under a minute";
  if (ms < 90_000) return "about a minute";
  return `about ${Math.round(ms / 60_000)} minutes`;
}

/** How far past its usual time a run must go before the rail says so:
 *  twice the reader's own median, so the line marks a run that is notably
 *  slow, not the half of all runs that land past a median. */
export const LONGER_THAN_USUAL = 2;

/**
 * Whether the run on screen is taking longer than the reader's screens
 * usually do: past `LONGER_THAN_USUAL` times their measured median. Never
 * without a measured median — the rail claims no duration it has not
 * measured, so with fewer than three runs it says nothing of the kind. A
 * step can run for many minutes (the SDK retries an overloaded call twice,
 * ten minutes each), and the rail said "Your screens usually take about 3
 * minutes" under it all the while (research pass 30).
 */
export function longerThanUsual(elapsedMs: number, typicalMs: number | null | undefined): boolean {
  if (typicalMs == null || !Number.isFinite(typicalMs) || typicalMs <= 0) return false;
  return Number.isFinite(elapsedMs) && elapsedMs > LONGER_THAN_USUAL * typicalMs;
}

/** A job the progress rail draws as the six-step screen — not a comp
 *  search, a model build or the reconciler, which run on their own. */
export function isScreenJob(step: string | null | undefined): boolean {
  return step !== "reconcile" && step !== "model" && step !== "comps_search";
}
