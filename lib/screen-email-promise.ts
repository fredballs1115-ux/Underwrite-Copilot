/**
 * Whether the progress rail may tell the reader "We'll email you when it's
 * done — you can close this page." Pure, no imports, so the rule is tested
 * apart from the page.
 *
 * The line is a promise, so it is said only where the screen-complete email
 * will go to this reader (lib/email `notifyAnalysisReady`): email is set up
 * and sending (lib/email-send `emailEnabled` — never while paused), the deal
 * is not the sample (which is never emailed), the reader's own switch is on
 * (read as lib/email `wantsAnalysisEmail` reads it: off where the read
 * failed), and the reader is the one the email goes to. The email goes to
 * whoever asked for the run, else the deal's creator; the page knows the
 * asker only where the job recorded one. With none recorded, it is this
 * reader only on a personal deal they created — on a team deal another
 * member may have started the run, and the line would promise this reader
 * an email that goes to someone else (the first-run audit of 2026-10-20).
 */

/** The rail's line, said where `screenEmailPromised` holds. */
export const EMAIL_WHEN_DONE = "We'll email you when it's done — you can close this page.";

export function screenEmailPromised(p: {
  emailOn: boolean;
  isSample: boolean;
  switchOn: boolean;
  viewerId: string | null;
  creatorId: string | null;
  teamId: string | null;
  /** the run's recorded asker, where the job carries one */
  requestedBy?: string | null;
}): boolean {
  if (!p.emailOn || p.isSample || !p.switchOn || !p.viewerId) return false;
  const viewer = p.viewerId.toLowerCase();
  if (p.requestedBy) return p.requestedBy.toLowerCase() === viewer;
  return !p.teamId && (p.creatorId ?? "").toLowerCase() === viewer;
}
