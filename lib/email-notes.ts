/**
 * What the account page says beside its two email switches — which process
 * sends each email, and what each switch promises — held to what is sent.
 * Two things had been untrue:
 *
 *   - The "Paused" note read only the web service's setup, while the Monday
 *     digest is always sent by the background worker (worker/index.ts), and
 *     so are the screen emails once screens run there (ANALYSIS_WORKER=1):
 *     the web service's setup speaks for neither. The note now covers only
 *     what this service sends, and each email the worker sends says so.
 *   - "One if a screen fails before its verdict, saying why": a screen whose
 *     run is cut off with no error to report (a process killed part way)
 *     only reads as stalled (lib/screen-run `listJobStatus`), and no email
 *     goes. The promise now says so.
 *
 * Pure, no imports: the page hands in whether this service's email setup is
 * on (lib/email-send `emailEnabled`) and whether screens run in the worker.
 */

/** Said of an email the background worker sends. */
export const WORKER_SENDS =
  "Sent by our background worker, so it goes out only where the worker has the email settings too.";

export interface EmailNotes {
  /** the "Paused" line — only where THIS service sends an email and cannot */
  paused: string | null;
  /** what the screen emails' switch promises */
  analysis: string;
  /** under the screen emails' switch where the worker sends them */
  analysisSentBy: string | null;
  /** what the digest's switch promises */
  digest: string;
  /** under the digest's switch: the worker always sends it */
  digestSentBy: string;
}

export function emailNotes(opts: { sending: boolean; workerMode: boolean }): EmailNotes {
  return {
    // In worker mode this service sends no customer email at all, so its
    // own setup says nothing about whether one goes.
    paused:
      !opts.sending && !opts.workerMode
        ? "Screen emails are paused for now — none is being sent. Each switch keeps your choice for when sending starts."
        : null,
    analysis:
      "One email for each screen you start — the verdict, the buy-box call, and a link to the deal page — and one if a screen stops before its verdict, saying why. A screen that stalls, cut off part way with no error to report, sends none; the deal page shows it as stalled.",
    analysisSentBy: opts.workerMode ? WORKER_SENDS : null,
    digest:
      "Monday morning: your open deals by stage, the offers due in the week ahead, and the verdicts that landed since last week.",
    digestSentBy: WORKER_SENDS,
  };
}
