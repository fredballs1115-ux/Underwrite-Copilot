// Who runs the site. The data-health page drew the operator's own working
// view for every signed-in customer: the cost of a screen at list price,
// "run migration 0035", "schedule node scripts/steward.mjs", and in red
// "the nightly cron looks dead". The operators are named by one server env
// var, OPERATOR_EMAILS — a comma-separated list of addresses, each compared
// whole and without regard to case or surrounding space. Unset or empty
// names nobody, so nothing internal shows to anyone.
//
// An address counts only on an account whose email is confirmed: an
// account nobody proved the address of is not the operator's, whatever it
// typed at sign-up. There is no wildcard — "*" or "@firm.com" is an
// address nobody has, never a pattern.
//
// Pure: the env string is handed in (lib/operator-server reads it), so a
// test drives every case.

/** The signed-in user, as far as the check reads it — Supabase's `User`
 *  is one. */
export interface OperatorCandidate {
  email?: string | null;
  /** when the account's address was confirmed; absent or null if never */
  email_confirmed_at?: string | null;
}

/** The addresses OPERATOR_EMAILS names, lower-cased; commas, semicolons
 *  and white space all separate, and a blank entry is no entry. */
export function operatorEmails(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

/** Whether this user is one of the site's operators. */
export function isOperator(
  user: OperatorCandidate | null | undefined,
  raw: string | null | undefined,
): boolean {
  if (!user?.email_confirmed_at) return false;
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return false;
  return operatorEmails(raw).has(email);
}
