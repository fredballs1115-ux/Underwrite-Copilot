// The pipeline's getting-started checklist, read from the account's own
// deals rather than taken on trust. Pure: the page reads the rows and their
// latest job rows and hands them in.
import { verdictBehind, type JobLike } from "@/lib/screen-run";

/** A deal as the "Screen your first OM" step reads it. */
export interface ScreenedFacts {
  isSample: boolean;
  /** the stored memorandum's path — null on a deal typed in by hand */
  omPath: string | null;
  /** a verdict is stored: some screen of the deal reached its last step */
  hasVerdict: boolean;
  /** the deal's latest job row */
  job: JobLike | null | undefined;
}

/**
 * Whether a deal's memorandum has been screened: an OM behind it and a
 * verdict no later run is still replacing. The step ticked for any deal
 * that was not the sample — a deal typed in by hand, or an upload whose
 * screen had barely started. Never the sample; never a deal typed in by
 * hand (no memorandum); never a first screen still running or one that
 * failed (no verdict yet); and never a verdict the latest run has not
 * reached (lib/screen-run `verdictBehind`), since on a typed-in deal whose
 * OM was attached later that verdict is the typed facts' screen's, and
 * nothing stored says which it is — a deal screened again counts once its
 * new verdict lands.
 */
export function screenedAnOm(d: ScreenedFacts): boolean {
  return !d.isSample && !!d.omPath && d.hasVerdict && verdictBehind(d.job) === null;
}
