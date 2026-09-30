/**
 * Which regulatory alerts THIS browser has dismissed — pure, so the list's
 * parsing and bounding are tested.
 *
 * The banner's Dismiss used to write the shared row's `dismissed_at`, and
 * every signed-in user may update that column (migration 0034's column
 * grant), so one reader's click — or anyone's direct PATCH — hid an alert
 * from every customer. A dismissal is the reader's own now: the alert's id in
 * a cookie on this site, newest first, at most `MAX_DISMISSED_ALERTS` of
 * them, for a year. Nothing reads `dismissed_at` any more; an alert asks for
 * attention for `ALERT_WINDOW_DAYS` after it was detected, and then only in a
 * browser that has not dismissed it.
 */

export const DISMISSED_ALERTS_COOKIE = "uc_dismissed_alerts";

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
 * What the server action sets when a browser dismisses `id`: the cookie's
 * new value and its options — the whole site, never read by script, sent on
 * a top-level navigation but not on a cross-site subrequest, HTTPS-only in
 * production, a year. Null for an id that is not an alert's.
 */
export function dismissedCookie(
  current: string | null | undefined,
  id: string,
  production: boolean,
): {
  name: string;
  value: string;
  options: { path: string; httpOnly: boolean; sameSite: "lax"; secure: boolean; maxAge: number };
} | null {
  if (!isAlertId(id.trim().toLowerCase())) return null;
  return {
    name: DISMISSED_ALERTS_COOKIE,
    value: withDismissed(parseDismissed(current), id).join(","),
    options: { path: "/", httpOnly: true, sameSite: "lax", secure: production, maxAge: DISMISSED_ALERTS_MAX_AGE },
  };
}

/** The earliest `detected_at` an alert may carry and still ask for
 *  attention, as an ISO timestamp. */
export function alertWindowStart(now: Date): string {
  return new Date(now.getTime() - ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** The rows this browser has not dismissed, in their order, at most
 *  `limit` of them. */
export function undismissed<T extends { id: string }>(
  rows: readonly T[],
  dismissed: readonly string[],
  limit: number = rows.length,
): T[] {
  const gone = new Set(dismissed);
  return rows.filter((r) => !gone.has(String(r.id).toLowerCase())).slice(0, limit);
}
