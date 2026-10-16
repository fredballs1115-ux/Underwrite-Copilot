// A person as the site shows one: their name, their initials and the tone
// their badge wears. Pure and import-free, so a client component, a server
// page and a test all read the same rules.
//
// Most people have never typed a name, so most of what reaches a badge is
// an email. Read as a name, "fredballs1115@gmail.com" had split on its dots
// into "fredballs1115@gmail" and "com" and worn "FC" — the domain's letter
// in the person's place (signed-in gaps, H1). An email's name is its local
// part, and only that.

/** Whether a string is an email address rather than a name. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(s.trim());
}

/** An email's local part, without a "+tag" subaddress: "fred+deals@x.com"
 *  is fred's. A string that is no email comes back trimmed. */
export function emailLocalPart(s: string): string {
  const t = s.trim();
  if (!looksLikeEmail(t)) return t;
  const local = t.slice(0, t.lastIndexOf("@"));
  const plus = local.indexOf("+");
  // A local part that is all subaddress ("+x@") keeps itself.
  return plus > 0 ? local.slice(0, plus) : local;
}

/** What a person is called on a page: the name they set, else their
 *  email's local part — never the whole address, which says where they get
 *  mail rather than who they are — else the fallback. */
export function personName(
  fullName: string | null | undefined,
  email: string | null | undefined,
  fallback = "Teammate",
): string {
  const name = (fullName ?? "").trim();
  if (name) return name;
  const local = email ? emailLocalPart(email) : "";
  return local || fallback;
}

/** The signed-in reader's own name, from the sign-in check every page
 *  already makes: the copy the account page's save leaves in the account's
 *  metadata (saveFullName), else the email's local part. Only ever used to
 *  name the reader to themselves; what teammates read is the profile. */
export function viewerName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
  fallback = "You",
): string {
  const meta = user?.user_metadata?.full_name;
  return personName(typeof meta === "string" ? meta : null, user?.email ?? null, fallback);
}

/** A label that may be a name or an email, as a page shows it: an email's
 *  local part, a name as written. */
export function displayName(nameOrEmail: string | null | undefined): string {
  return emailLocalPart(nameOrEmail ?? "");
}

/** A person's initials: the first letters of their first and last words.
 *  An email is read by its local part alone, its dots, underscores, hyphens
 *  and digits as the breaks between words ("jordan.lee@firm.com" → "JL",
 *  "fredballs1115@gmail.com" → "F"); a name by its words, a title after a
 *  comma or in brackets dropped ("J. R. Smith, CCIM" → "JS"). "?" where
 *  nothing in it is a letter or a digit. */
export function personInitials(nameOrEmail: string | null | undefined): string {
  const raw = (nameOrEmail ?? "").trim();
  const email = looksLikeEmail(raw);
  const text = email ? emailLocalPart(raw) : raw.replace(/\s*[,(].*$/, "");
  const words = text
    // A name breaks where an email's local part does, an apostrophe aside
    // ("O'Brien" is one word), so "jordan.lee" shown as a name and
    // "jordan.lee@firm.com" wear the same initials.
    .split(email ? /[^\p{L}]+/u : /[\s._\-–—/\d+]+/u)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (!words.length) {
    // A local part of digits alone ("1115@…") still has a mark of its own.
    const first = /[\p{L}\p{N}]/u.exec(text || raw);
    return first ? first[0].toUpperCase() : "?";
  }
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** The tones a person's badge may wear: solid fills each read at 4.5:1 or
 *  better under white initials (lib/person.test.ts measures them), and
 *  none of them the pass, caution or kill colours, which mean a call. */
export const PERSON_TONES = [
  "#114e54", // the brand's deep teal
  "#3f4f9e", // indigo
  "#7a3f73", // plum
  "#2f6b4f", // pine
  "#8a4b22", // umber
  "#24507a", // harbour blue
  "#9c3f5a", // claret
  "#4a5560", // slate
] as const;

/** The index into PERSON_TONES a person always wears: a hash of their key
 *  (their user id where the page has one, else their name), so the same
 *  person is the same colour on every row of a page and on every visit. */
export function personToneIndex(key: string | null | undefined): number {
  const s = (key ?? "").trim().toLowerCase();
  // FNV-1a, 32-bit: small, fast and spread well enough over eight tones.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % PERSON_TONES.length;
}

/** The longest name the account page keeps, in characters. */
export const FULL_NAME_MAX = 80;

/** What the account page's "Your name" field may save: the words typed,
 *  their runs of space made one and control and format characters dropped,
 *  or null for an empty field (no name, so the email's local part shows).
 *  An email is refused, since a name field holding the address would print
 *  it whole on every row, and so is a name past FULL_NAME_MAX. */
export function readFullName(
  raw: unknown,
): { ok: true; name: string | null } | { ok: false; why: "long" | "email" } {
  const text = typeof raw === "string" ? raw : "";
  const name = text
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { ok: true, name: null };
  if ([...name].length > FULL_NAME_MAX) return { ok: false, why: "long" };
  if (looksLikeEmail(name)) return { ok: false, why: "email" };
  return { ok: true, name };
}
