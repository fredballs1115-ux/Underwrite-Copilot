/**
 * Which regulatory alerts a reader has dismissed, in this browser — pure, so
 * the list's parsing and bounding are tested.
 *
 * The banner's Dismiss used to write the shared row's `dismissed_at`, and
 * every signed-in user could update that column (migration 0034's column
 * grant, until 0036 took it back), so one reader's click — or anyone's
 * direct PATCH — hid an alert from every customer. A dismissal is the reader's own now: the alert's id in
 * a cookie on this site, newest first, at most `MAX_DISMISSED_ALERTS` of
 * them, for a year. The cookie is named for the account (`dismissedCookieName`),
 * so a second account signed in on the same browser keeps its own list: one
 * reader's dismissal is never another's. Nothing reads `dismissed_at` any
 * more; an alert asks for attention for `ALERT_WINDOW_DAYS` after it was
 * detected, and then only for a reader who has not dismissed it.
 */

export const DISMISSED_ALERTS_COOKIE = "uc_dismissed_alerts";

/** The cookie for one account's dismissals: the base name and the account's
 *  id, kept to the characters a uuid has, so it is always a valid name. */
export function dismissedCookieName(userId: string): string {
  const key = userId.toLowerCase().replace(/[^0-9a-f-]/g, "");
  return `${DISMISSED_ALERTS_COOKIE}_${key}`;
}

/**
 * The reader's dismissals, newest first: their account's cookie, else the
 * old shared cookie's (`DISMISSED_ALERTS_COOKIE`) — what a reader dismissed
 * before the cookie was named for the account, read until their first
 * dismissal writes the account's cookie with those ids in it. Every surface
 * that hides a dismissed alert (the banner, its action, /api/intel/latest)
 * reads through this one, so none reads a list the others do not write.
 * The old cookie's ids only ever name alerts detected before the rename,
 * and an alert stops asking for attention `ALERT_WINDOW_DAYS` after it was
 * detected, so the fallback fades out on its own.
 */
export function dismissedFor(get: (name: string) => string | undefined, userId: string): string[] {
  return parseDismissed(get(dismissedCookieName(userId)) ?? get(DISMISSED_ALERTS_COOKIE));
}

/** The newest this many dismissals are kept: 50 ids of 36 characters and
 *  their commas are under 2 KB, well inside a cookie's 4. */
export const MAX_DISMISSED_ALERTS = 50;

/** A year, in seconds. */
export const DISMISSED_ALERTS_MAX_AGE = 60 * 60 * 24 * 365;

/** How long a detected alert asks for attention. */
export const ALERT_WINDOW_DAYS = 30;

/** An alert's id is the table's uuid, and nothing else is kept: the cookie
 *  is the reader's to edit, so it is read as untrusted text. */
const ALERT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAlertId(id: string): boolean {
  return ALERT_ID.test(id);
}

/** The cookie's ids, newest first: each a uuid, each once, at most
 *  `MAX_DISMISSED_ALERTS`; anything else in it is dropped. */
export function parseDismissed(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (!isAlertId(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_DISMISSED_ALERTS) break;
  }
  return out;
}

/** The list with `id` dismissed: moved to the front, the oldest dropped past
 *  the bound. An id that is not an alert's changes nothing. */
export function withDismissed(list: readonly string[], id: string): string[] {
  const key = id.trim().toLowerCase();
  const kept = list.filter((x) => isAlertId(x));
  if (!isAlertId(key)) return kept.slice(0, MAX_DISMISSED_ALERTS);
  return [key, ...kept.filter((x) => x !== key)].slice(0, MAX_DISMISSED_ALERTS);
}

/**
 * What the server action sets when a reader dismisses `id`: the account's
 * cookie's new value and its options — the whole site, never read by
 * script, sent on a top-level navigation but not on a cross-site
 * subrequest, HTTPS-only in production, a year. Null for an id that is not
 * an alert's.
 */
export function dismissedCookie(
  current: string | null | undefined,
  id: string,
  production: boolean,
  userId: string,
): {
  name: string;
  value: string;
  options: { path: string; httpOnly: boolean; sameSite: "lax"; secure: boolean; maxAge: number };
} | null {
  if (!isAlertId(id.trim().toLowerCase())) return null;
  return {
    name: dismissedCookieName(userId),
    value: withDismissed(parseDismissed(current), id).join(","),
    options: { path: "/", httpOnly: true, sameSite: "lax", secure: production, maxAge: DISMISSED_ALERTS_MAX_AGE },
  };
}

/** The earliest `detected_at` an alert may carry and still ask for
 *  attention, as an ISO timestamp. */
export function alertWindowStart(now: Date): string {
  return new Date(now.getTime() - ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** The rows the reader has not dismissed, in their order, at most `limit`
 *  of them. */
export function undismissed<T extends { id: string }>(
  rows: readonly T[],
  dismissed: readonly string[],
  limit: number = rows.length,
): T[] {
  const gone = new Set(dismissed);
  return rows.filter((r) => !gone.has(String(r.id).toLowerCase())).slice(0, limit);
}
