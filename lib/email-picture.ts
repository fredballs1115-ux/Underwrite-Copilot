import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The building's picture in an email (#464) — the listing sites' habit: an
// alert opens on the photograph. An email client fetches an image with no
// session, so the deal's own picture routes (auth-scoped, the reader's
// cookies) cannot serve it; /api/email/picture/<token> does, for a token
// only the server can mint: the deal's id, the person the email went to
// and an expiry, signed.
//
// The person is in the token because the link lives a year (research pass
// 22): the Monday digest pictures a team's deals too, and a member who left
// the team kept seeing those deals' current photographs, replacements
// included, until the link expired. The route now asks, on every request,
// whether that person can still read the deal (its creator, or a member of
// its team — the share link's own rule, lib/share-access), and answers 404
// where they cannot.
//
// The key is derived from the service-role key (the one secret the web
// service and the worker both hold) under a label of its own, so the token
// says nothing about the key and no new secret has to be set. Rotating that
// key retires every picture link already sent: an old email shows its alt
// text, never another deal's picture.

/** How long an email's picture link keeps answering. */
export const EMAIL_PICTURE_DAYS = 365;

/** The two frames an email draws, in pixels at 2× (the email sets half):
 *  the screen-complete email's banner across its 520px card, and a digest
 *  row's square. */
export const EMAIL_PICTURE = {
  banner: { w: 1040, h: 520 },
  thumb: { w: 96, h: 96 },
} as const;
export type EmailPictureShape = keyof typeof EMAIL_PICTURE;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `<deal>.<recipient>.<expiry>.<signature>`, signed over the first three. */
const TOKEN = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/;
/**
 * `<deal>.<expiry>.<signature>`: a token signed before the recipient was
 * carried (2026-10-04). It names no one, so the route can ask no one's
 * access, and it keeps serving the deal's picture until its own expiry, the
 * year it was minted for, so the emails already in inboxes keep their
 * pictures. Nothing mints one any more: the last of them expires a year
 * after the last email sent with one. The two shapes cannot stand for each
 * other: each signs exactly the parts it shows, a legacy body has one dot
 * and a current body two, and neither an expiry nor a uuid holds a dot.
 */
const LEGACY_TOKEN = /^([0-9a-f-]{36})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/;

function signingKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update("underwrite-copilot/email-picture/v1").digest();
}

function signature(key: Buffer, body: string): string {
  // 132 bits of the MAC: far past guessing, short enough for a URL.
  return createHmac("sha256", key).update(body).digest("base64url").slice(0, 22);
}

/** A picture token for a deal, for the person the email goes to, good for
 *  `EMAIL_PICTURE_DAYS`; null where the server holds no key, or either id is
 *  not a uuid. */
export function emailPictureToken(dealId: string, recipient: string, now = Date.now()): string | null {
  const key = signingKey();
  const id = dealId.toLowerCase();
  const to = recipient.toLowerCase();
  if (!key || !UUID.test(id) || !UUID.test(to)) return null;
  const exp = Math.floor(now / 1000) + EMAIL_PICTURE_DAYS * 86_400;
  const body = `${id}.${to}.${exp.toString(36)}`;
  return `${body}.${signature(key, body)}`;
}

/** What a token grants: the deal's picture, to whoever the email went to —
 *  null for a token minted before the recipient was carried. */
export interface EmailPictureClaim {
  dealId: string;
  recipient: string | null;
}

/** What a token names, or null: malformed, signed with another key, altered
 *  in any character, or past its expiry. */
export function readEmailPictureToken(token: string, now = Date.now()): EmailPictureClaim | null {
  const key = signingKey();
  if (!key) return null;
  const m = TOKEN.exec(token);
  const legacy = m ? null : LEGACY_TOKEN.exec(token);
  const parts = m
    ? { dealId: m[1], recipient: m[2] as string | null, exp: m[3], sig: m[4] }
    : legacy
      ? { dealId: legacy[1], recipient: null, exp: legacy[2], sig: legacy[3] }
      : null;
  if (!parts || !UUID.test(parts.dealId) || (parts.recipient !== null && !UUID.test(parts.recipient))) return null;
  const body = parts.recipient === null ? `${parts.dealId}.${parts.exp}` : `${parts.dealId}.${parts.recipient}.${parts.exp}`;
  const want = Buffer.from(signature(key, body));
  const got = Buffer.from(parts.sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const exp = parseInt(parts.exp, 36);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  return { dealId: parts.dealId, recipient: parts.recipient };
}

/** The URL an email draws the deal's picture from for `recipient`, or null
 *  where no token can be minted (the email then carries no picture). */
export function emailPictureUrl(
  appUrl: string,
  dealId: string,
  shape: EmailPictureShape,
  recipient: string,
  now?: number,
): string | null {
  const token = emailPictureToken(dealId, recipient, now);
  return token ? `${appUrl.replace(/\/+$/, "")}/api/email/picture/${token}?s=${shape}` : null;
}
