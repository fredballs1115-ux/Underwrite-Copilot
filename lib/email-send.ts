import "server-only";

/**
 * The one place an email is sent: Resend's REST API (plain fetch — no SDK to
 * carry). Key-ready by design: without RESEND_API_KEY the feature is silently
 * off, and nothing here can ever crash a caller. Kept apart from lib/email's
 * notifiers (which read the buy box and lift the memorandum's cover, with
 * sharp and the PDF decoder behind them) so an operator alert — the Stripe
 * webhook's — sends through the same rules without loading any of that.
 * lib/email re-exports everything here.
 *
 * Env:
 *   RESEND_API_KEY   enables sending
 *   RESEND_FROM      the sender, on a domain verified with Resend — required:
 *                    without one the emails are PAUSED (see `emailSetup`)
 *   RESEND_BASE_URL  test override for the API host
 */

/** Resend's shared onboarding domain. Mail sent from it is delivered only to
 *  the address that owns the Resend account, never to a customer, so a
 *  sender there is no sender at all. */
const RESEND_SHARED_DOMAIN = "resend.dev";

/**
 * Whether the emails can reach a customer. `off`: no key, the feature is not
 * set up. `paused`: a key, but no sender a customer would receive mail from —
 * RESEND_FROM unset, naming no address, or on Resend's shared resend.dev
 * domain (the default this module used to fall back to, which delivered to
 * the Resend account's owner and nobody else while the account page showed
 * both emails on). Pure: the environment is an argument.
 */
export type EmailSetup =
  | { state: "on"; key: string; from: string }
  | { state: "off" }
  | { state: "paused"; reason: string };

export function emailSetup(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmailSetup {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { state: "off" };
  const from = env.RESEND_FROM?.trim() ?? "";
  if (!from) return { state: "paused", reason: "RESEND_FROM is not set" };
  const domain = senderDomain(from);
  if (!domain) return { state: "paused", reason: `RESEND_FROM names no address ("${from}")` };
  if (domain === RESEND_SHARED_DOMAIN || domain.endsWith(`.${RESEND_SHARED_DOMAIN}`)) {
    return {
      state: "paused",
      reason: `RESEND_FROM is on Resend's shared ${RESEND_SHARED_DOMAIN} domain, which delivers only to the Resend account's own address`,
    };
  }
  return { state: "on", key, from };
}

/** The domain of a sender written "Name <a@b.com>" or "a@b.com", lowercased;
 *  null where it names no address. */
export function senderDomain(from: string): string | null {
  const angled = /<([^<>]*)>\s*$/.exec(from);
  const address = (angled ? angled[1] : from).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain && !/[\s<>"]/.test(domain) ? domain : null;
}

/** Said once a process, never per email: a paused feature is one fact. */
let pausedSaid = false;

/** The setup to send with, or null. A paused setup says why in the log,
 *  once; a missing key stays silent, as it always has. */
function readySetup(): { key: string; from: string } | null {
  const setup = emailSetup();
  if (setup.state === "paused" && !pausedSaid) {
    pausedSaid = true;
    console.warn(
      `[email] paused: ${setup.reason} — no email is sent until RESEND_FROM names a sender on a domain verified with Resend.`,
    );
  }
  return setup.state === "on" ? setup : null;
}

/** Whether the emails go out — what the senders check before reading
 *  anything, and what the account page says beside its two switches. */
export function emailEnabled(): boolean {
  return readySetup() !== null;
}

/** How long a send waits for Resend before giving up on the request. */
export const SEND_TIMEOUT_MS = 8000;

export interface SendOptions {
  /**
   * Resend's idempotency key, naming the email and its occasion
   * (`occasionKey`): "Resend checks whether an email with the same
   * idempotency key has already been sent in the last 24 hours", so a send
   * retried after the request timed out — when Resend may well have taken
   * the first — is not a second email. The digest retries exactly that way.
   */
  idempotencyKey?: string | null;
}

/** An idempotency key: the email's kind and its occasion's parts, joined
 *  by "/", each part kept to the characters an id, a date or a timestamp
 *  is written in. Null where a part is missing: no key is better than a
 *  key two different emails could share. */
export function occasionKey(kind: string, ...parts: (string | null | undefined)[]): string | null {
  if (parts.some((p) => !p || !p.trim())) return null;
  return [kind, ...(parts as string[])].map((p) => p.trim().replace(/[^A-Za-z0-9._:-]/g, "-")).join("/");
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  opts: SendOptions = {},
): Promise<boolean> {
  // The rule holds at the one place a request is made: while paused, no
  // send is attempted, whoever calls.
  const ready = readySetup();
  if (!ready) return false;
  const { key, from } = ready;
  const base = process.env.RESEND_BASE_URL ?? "https://api.resend.com";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // "Send the key in the Idempotency-Key HTTP header" (Resend).
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[email] resend responded ${res.status} for "${subject}"`);
    }
    return res.ok;
  } catch (err) {
    console.error(
      `[email] send failed for "${subject}":`,
      err instanceof Error ? err.message : err,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
