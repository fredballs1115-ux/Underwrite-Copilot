import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// One-click unsubscribe for the Monday digest. The opt-out link had needed a
// sign-in (the Account page's switch), and a mail provider's own
// "Unsubscribe" button reaches none: RFC 8058 has it POST
// `List-Unsubscribe=One-Click` to the URI the List-Unsubscribe header names,
// and Gmail's sender guidelines ask a sender of more than 5,000 messages a
// day for exactly that on its subscribed messages. The URI must work with no
// session, so — as an email's picture link does (lib/email-picture) — the
// token is the whole permission: the user's id and the ONE setting it turns
// off, signed by the server.
//
// The key is derived from the service-role key under a label of its OWN,
// never the picture's, so a picture token can never be read as an
// unsubscribe and neither says anything about the key. No new secret has to
// be set, and rotating that key retires every link already sent (a provider
// then gets a 404; the Account page's switch still works). Unlike the
// picture's, the token does not expire: an unsubscribe link has to keep
// working however old the email it sits in, and all it can ever do is turn
// one person's one email off.

/** The settings a link can turn off, by the name its token carries, and the
 *  profile column each one is. The digest is the only email that carries
 *  one; the screen emails are what the reader asked for, and keep their
 *  switch on the Account page. */
export const UNSUBSCRIBE_SETTINGS = {
  digest: "email_weekly_digest",
} as const;
export type UnsubscribeSetting = keyof typeof UNSUBSCRIBE_SETTINGS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^([0-9a-f-]{36})\.([a-z]{1,16})\.([A-Za-z0-9_-]{22})$/;

/** The label the unsubscribe key is derived under — its own. */
export const UNSUBSCRIBE_KEY_LABEL = "underwrite-copilot/email-unsubscribe/v1";

function signingKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update(UNSUBSCRIBE_KEY_LABEL).digest();
}

function signature(key: Buffer, body: string): string {
  // 132 bits of the MAC: far past guessing, short enough for a URL.
  return createHmac("sha256", key).update(body).digest("base64url").slice(0, 22);
}

const isSetting = (s: string): s is UnsubscribeSetting => Object.hasOwn(UNSUBSCRIBE_SETTINGS, s);

/** A token that turns `setting` off for `userId`; null where the server
 *  holds no key or the id is not a user's. */
export function emailUnsubscribeToken(userId: string, setting: UnsubscribeSetting): string | null {
  const key = signingKey();
  const id = userId.toLowerCase();
  if (!key || !UUID.test(id) || !isSetting(setting)) return null;
  const body = `${id}.${setting}`;
  return `${body}.${signature(key, body)}`;
}

/** The user and the one setting a token names, or null: malformed, a
 *  setting no link may turn off, signed with another key or label, or
 *  altered in any character. */
export function readEmailUnsubscribeToken(token: string): { userId: string; setting: UnsubscribeSetting } | null {
  const key = signingKey();
  const m = TOKEN.exec(token);
  if (!key || !m || !UUID.test(m[1]) || !isSetting(m[2])) return null;
  const body = `${m[1]}.${m[2]}`;
  const want = Buffer.from(signature(key, body));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { userId: m[1], setting: m[2] };
}

/** The https URI a digest names for its one-click unsubscribe, or null
 *  where no token can be minted (the digest then carries no header and no
 *  link, and the Account page's switch is the way out, as before). */
export function emailUnsubscribeUrl(appUrl: string, userId: string, setting: UnsubscribeSetting): string | null {
  const token = emailUnsubscribeToken(userId, setting);
  return token ? `${appUrl.replace(/\/+$/, "")}/api/email/unsubscribe/${token}` : null;
}

/** The two header fields RFC 8058 names for a one-click unsubscribe: "one
 *  List-Unsubscribe header field and one List-Unsubscribe-Post header
 *  field", the second exactly `List-Unsubscribe=One-Click`. The URI is
 *  written in angle brackets, as a list header's URI is. */
export function oneClickHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Whether a POST's body is the one-click request: the key/value pair
 *  `List-Unsubscribe=One-Click`, form-encoded (or bare) or as a multipart
 *  field, read by the platform's own form parser. */
export async function isOneClickBody(contentType: string | null, body: string): Promise<boolean> {
  if (contentType && /multipart\/form-data/i.test(contentType)) {
    try {
      const form = await new Request("http://unsubscribe.local/", {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      }).formData();
      return form.get("List-Unsubscribe") === "One-Click";
    } catch {
      return false;
    }
  }
  return new URLSearchParams(body.trim()).get("List-Unsubscribe") === "One-Click";
}
