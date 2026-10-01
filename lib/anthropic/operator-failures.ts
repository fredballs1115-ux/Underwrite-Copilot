/**
 * The failures that are the operator's to fix, never the analyst's to retry:
 * the service refusing our credentials, or pausing our account at a credit
 * or usage limit. The sentences live here, with no imports, so the deal page
 * (a client component) can tell them apart and leave out its "Try again"
 * button — a sentence saying a retry will not help, above a button offering
 * one, was the page contradicting itself (pass 14, 2026-10-01).
 * lib/anthropic/failure writes them; nothing else may.
 */

export const CREDENTIALS_FAILURE =
  "The analysis service isn't accepting our credentials. That is a configuration problem on our side, not your deal — it needs the operator, not a retry.";

export const ACCOUNT_PAUSED_FAILURE =
  "The analysis service has paused our account's requests — a limit on our side, not your deal. It needs the operator, not a retry.";

/** True for a stored failure a retry cannot fix. */
export function needsOperator(message: string | null | undefined): boolean {
  const m = (message ?? "").trim();
  return m === CREDENTIALS_FAILURE || m === ACCOUNT_PAUSED_FAILURE;
}
