// What the pipeline's counts count: the rows its list would show. Pure and
// universal, so the client list and the server page read one rule.
//
// A dead deal stays out of the list until the reader asks for it (the
// "Show dead" toggle, or the stage filter set to Dead), and the verdict
// chips and the brokerage filter's counts had counted it anyway: a chip
// read "No-go 3" over a list that showed one, and a firm's "(4)" opened on
// three deals (the audit of 2026-10-19).

import { normalizeStage } from "@/lib/stages";

/** Whether the list draws a deal at this stage, by its own rule: a dead deal
 *  only once the reader asked for the dead — the toggle, or the stage filter
 *  set to Dead. */
export function shownInList(
  stage: string | null | undefined,
  { showDead = false, stageFilter = "all" }: { showDead?: boolean; stageFilter?: string } = {},
): boolean {
  return normalizeStage(stage) !== "dead" || showDead || stageFilter === "dead";
}

export interface VerdictCounts {
  pass: number;
  caution: number;
  pass_on: number;
  screening: number;
}

/** The verdict chips' counts, over the deals the list would show. */
export function verdictCountsOf(
  deals: readonly { verdict: string | null; stage: string | null | undefined }[],
  opts: { showDead?: boolean; stageFilter?: string } = {},
): VerdictCounts {
  const c: VerdictCounts = { pass: 0, caution: 0, pass_on: 0, screening: 0 };
  for (const d of deals) {
    if (!shownInList(d.stage, opts)) continue;
    if (d.verdict && d.verdict in c) c[d.verdict as keyof VerdictCounts]++;
    else if (!d.verdict) c.screening++;
  }
  return c;
}

/** A row the brokerage filter counts: one the list opens on (never a dead
 *  deal, which waits behind its toggle) and never the sample, whose
 *  memorandum is fictional. */
export function countsForFirms(row: { is_sample?: boolean | null; stage?: string | null }): boolean {
  return !row.is_sample && shownInList(row.stage);
}
