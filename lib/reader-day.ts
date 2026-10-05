// The reader's own calendar day, for every signed-in surface that says
// "today" or counts the days to a date (the offers-due badge and control,
// the deal's tasks, the rent roll's years to expiry).
//
// Pure and universal: the browser writes the cookie (app/(app)/time-zone-
// cookie.tsx) and the server reads it once per request through
// `readerToday`, handing the day down as a prop, so the server's markup and
// the browser's first render are the same day. The page had counted from
// the UTC day, so from 8 pm Eastern (5 pm Pacific) a deal due tomorrow read
// "Offers due today" and a task due tomorrow read as due today.
//
// What keeps the UTC day, on purpose: the Monday digest and the worker,
// which run with no reader, and the dates a feed or a job wrote as UTC days
// (each said as UTC where it is printed).

/** The cookie that carries the reader's time zone: an IANA name, as their
 *  browser reports it (`Intl.DateTimeFormat().resolvedOptions().timeZone`). */
export const TZ_COOKIE = "uc_tz";

/** A year, in seconds — as long as the pipeline's view is remembered. */
export const TZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The zone read where the browser has not said one (its first page, before
 *  the cookie is written), or said one this server cannot use: Eastern, the
 *  US zone most of the site's readers keep. */
export const DEFAULT_TIME_ZONE = "America/New_York";

// An IANA name's shape — "America/Argentina/Buenos_Aires", "Etc/GMT+5",
// "UTC" — checked before anything reads the cookie, which is the reader's to
// edit and is read as untrusted text.
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

let zoneList: Set<string> | null | undefined;
/** The zones this runtime lists (`Intl.supportedValuesOf`); null where it
 *  lists none (an older browser). */
function supportedZones(): Set<string> | null {
  if (zoneList !== undefined) return zoneList;
  try {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : null;
    zoneList = list && list.length > 0 ? new Set(list) : null;
  } catch {
    zoneList = null;
  }
  return zoneList;
}

/**
 * The time zone a cookie value names, checked against the runtime's own list
 * of zones (`Intl.supportedValuesOf("timeZone")`) — or null where it names
 * none this runtime can use. A browser may report a zone under a name the
 * list files under another (Firefox's "Asia/Kolkata" for V8's
 * "Asia/Calcutta"), so a name the list lacks is read through `Intl` once and
 * kept where that reading is on the list. "UTC" is a zone whatever the list
 * says: V8 leaves it off.
 */
export function validTimeZone(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let name = raw.trim();
  try {
    name = decodeURIComponent(name);
  } catch {
    return null;
  }
  if (!name || name.length > 64 || !ZONE_SHAPE.test(name)) return null;
  const zones = supportedZones();
  if (zones?.has(name)) return name;
  let canonical: string;
  try {
    canonical = new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  if (canonical === "UTC") return "UTC";
  if (!zones) return canonical;
  return zones.has(canonical) ? canonical : null;
}

/** The reader's time zone from the cookie's value: the zone it names, else
 *  `DEFAULT_TIME_ZONE` — absent, unreadable or unknown alike. */
export function readerTimeZone(raw: string | null | undefined): string {
  return validTimeZone(raw) ?? DEFAULT_TIME_ZONE;
}

/** The calendar day `now` falls on in `timeZone`, as an ISO day
 *  (yyyy-mm-dd). */
export function dayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today, on the reader's own calendar: the day `now` falls on in the zone
 *  the cookie's value names (`readerTimeZone`). Every signed-in page that
 *  says "today" or counts the days to a date reads its day here, once per
 *  request. */
export function readerToday(raw: string | null | undefined, now: Date = new Date()): string {
  return dayIn(readerTimeZone(raw), now);
}

/** One cookie's value out of a `document.cookie` string; null where the
 *  string carries none of that name. */
export function cookieValueOf(cookies: string | null | undefined, name: string): string | null {
  for (const pair of (cookies ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    if (pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return null;
}

/**
 * What the browser writes, given the cookie it holds and the zone it
 * reports: the cookie to set (the zone, for a year, on every path, sent on
 * same-site requests, and only over https where the page is), and whether
 * the day the server rendered with differs from the reader's — where it
 * does, the page asks the server again so its dates are the reader's on the
 * first visit too. Null where there is nothing to write: the cookie already
 * names the zone, or the browser reports nothing that is a zone's name.
 */
export function tzCookieUpdate(
  current: string | null | undefined,
  browserZone: string | null | undefined,
  { secure, now = new Date() }: { secure: boolean; now?: Date },
): { cookie: string; value: string; dayMoves: boolean } | null {
  const zone = typeof browserZone === "string" ? browserZone.trim() : "";
  if (!zone || zone.length > 64 || !ZONE_SHAPE.test(zone)) return null;
  let held: string | null = null;
  try {
    held = current != null ? decodeURIComponent(current.trim()) : null;
  } catch {
    held = null;
  }
  if (held === zone) return null;
  const value = encodeURIComponent(zone);
  return {
    cookie: `${TZ_COOKIE}=${value}; path=/; max-age=${TZ_COOKIE_MAX_AGE}; samesite=lax${secure ? "; secure" : ""}`,
    // The value as `document.cookie` reads it back once the write holds.
    value,
    dayMoves: readerToday(current, now) !== readerToday(zone, now),
  };
}
