import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The building's picture in an email (#464) — the listing sites' habit: an
// alert opens on the photograph. An email client fetches an image with no
// session, so the deal's own picture routes (auth-scoped, the reader's
// cookies) cannot serve it; /api/email/picture/<token> does, for a token
// only the server can mint: the deal's id and an expiry, signed.
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
const TOKEN = /^([0-9a-f-]{36})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/;

function signingKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update("underwrite-copilot/email-picture/v1").digest();
}

function signature(key: Buffer, body: string): string {
  // 132 bits of the MAC: far past guessing, short enough for a URL.
  return createHmac("sha256", key).update(body).digest("base64url").slice(0, 22);
}

/** A picture token for a deal, good for `EMAIL_PICTURE_DAYS`; null where
 *  the server holds no key or the id is not a deal's. */
export function emailPictureToken(dealId: string, now = Date.now()): string | null {
  const key = signingKey();
  const id = dealId.toLowerCase();
  if (!key || !UUID.test(id)) return null;
  const exp = Math.floor(now / 1000) + EMAIL_PICTURE_DAYS * 86_400;
  const body = `${id}.${exp.toString(36)}`;
  return `${body}.${signature(key, body)}`;
}

/** The deal a token names, or null: malformed, signed with another key,
 *  altered in any character, or past its expiry. */
export function readEmailPictureToken(token: string, now = Date.now()): string | null {
  const key = signingKey();
  const m = TOKEN.exec(token);
  if (!key || !m || !UUID.test(m[1])) return null;
  const body = `${m[1]}.${m[2]}`;
  const want = Buffer.from(signature(key, body));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const exp = parseInt(m[2], 36);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  return m[1];
}

/** The URL an email draws the deal's picture from, or null where no token
 *  can be minted (the email then carries no picture). */
export function emailPictureUrl(appUrl: string, dealId: string, shape: EmailPictureShape, now?: number): string | null {
  const token = emailPictureToken(dealId, now);
  return token ? `${appUrl.replace(/\/+$/, "")}/api/email/picture/${token}?s=${shape}` : null;
}
