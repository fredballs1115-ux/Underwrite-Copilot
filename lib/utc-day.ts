import { datedLong } from "@/lib/debt-index";

/**
 * "Oct 1, 2026 UTC" from a timestamp or an ISO day, or null: the day it falls
 * on in UTC, said so. A feed's or a job's day is UTC's, and a bare day read
 * as the reader's was a day late for anything published in a US evening — an
 * item a publisher dated 9pm Eastern on Sep 30 is Oct 1 in UTC (the audit of
 * 2026-10-04). Every such date prints through here: /market's weekday intel
 * and its latest digest, the pipeline's news strip and the /news page's
 * scored feed. (A countdown to a deal's own date counts from the reader's
 * day instead — lib/reader-day.)
 */
export function dayOf(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const at = Date.parse(ts);
  return Number.isFinite(at) ? `${datedLong(new Date(at).toISOString().slice(0, 10))} UTC` : null;
}
