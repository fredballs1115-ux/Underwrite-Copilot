/**
 * The sign-in door's words and routes — pure, so the whole flow can be tested
 * without an auth service.
 *
 * Supabase Auth reports a failure as an `AuthError` carrying a stable `code`
 * and a message written for developers. The person at the door gets one
 * sentence that says what to do next: never the developer's text, and never
 * "something went wrong" when the reason is known.
 *
 * The email links (password reset, address confirmation) come back to the site
 * with a one-time `code` that only a Route Handler can exchange for a session
 * (it has to write cookies). `authLinkHandoff` sends any such link to
 * `/auth/callback`, and the landing helpers decide where the person goes after
 * the exchange — or after it fails.
 */

export type AuthIntent = "signin" | "signup" | "reset";

const SUPPORT = "underwritecopilot.support@gmail.com";

export const ACCOUNT_EXISTS =
  "That email already has an account — sign in instead, or use Forgot password if you don't remember it.";

const COPY = {
  wrongPassword: "Wrong email or password. If you're new, switch to Create account.",
  confirmFirst: "Confirm your email first — check your inbox for the link.",
  weakPassword:
    "That password is too weak — use at least 8 characters with a mix of letters, numbers and symbols.",
  longPassword: "That password is too long — keep it under 72 characters.",
  badEmail: "That doesn't look like a valid email address — check it and try again.",
  signupsClosed: `New sign-ups are closed right now — email ${SUPPORT} and we'll set you up.`,
  emailNotAllowed: `We can't send email to that address yet — a setup problem on our side, not yours. Email ${SUPPORT} and we'll get you in.`,
  tooMany: "Too many attempts — wait a minute and try again.",
  banned: `This account is suspended — email ${SUPPORT} if you think that's a mistake.`,
  linkExpired: "That link has expired — request a new one.",
  unreachable: "Couldn't reach the sign-in service — please try again in a moment.",
  emailOff: `Email sign-in is switched off — a setup problem on our side, not yours. Email ${SUPPORT}.`,
} as const;

const GENERIC: Record<AuthIntent, string> = {
  signin: "Something went wrong signing you in — please try again.",
  signup: "Something went wrong creating your account — please try again.",
  reset: "Something went wrong sending the reset link — please try again.",
};

/** "For security purposes, you can only request this after 47 seconds." */
function waitCopy(message: string): string {
  const m = /after (\d+) seconds?/i.exec(message);
  return m
    ? `Wait about ${m[1]} seconds before requesting another link.`
    : "Wait a minute before requesting another link.";
}

/**
 * One sentence for an auth failure, chosen by the error's stable code first
 * and its message second (older responses carry no code), with a fallback
 * that names what the person was trying to do.
 */
export function authErrorCopy(
  err: { message?: string | null; code?: string | null },
  intent: AuthIntent,
): string {
  const code = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();

  switch (code) {
    case "invalid_credentials":
      return COPY.wrongPassword;
    case "email_not_confirmed":
      return COPY.confirmFirst;
    case "user_already_exists":
    case "email_exists":
      return ACCOUNT_EXISTS;
    case "weak_password":
      return COPY.weakPassword;
    case "email_address_invalid":
      return COPY.badEmail;
    case "email_address_not_authorized":
      return COPY.emailNotAllowed;
    case "signup_disabled":
      return COPY.signupsClosed;
    case "email_provider_disabled":
    case "provider_disabled":
      return COPY.emailOff;
    case "over_email_send_rate_limit":
      return waitCopy(m);
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return COPY.tooMany;
    case "user_banned":
      return COPY.banned;
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return COPY.linkExpired;
    case "validation_failed":
      if (m.includes("72 characters")) return COPY.longPassword;
      if (m.includes("password")) return COPY.weakPassword;
      if (m.includes("email")) return COPY.badEmail;
      return GENERIC[intent];
  }

  // No usable code: read the message the way the older mapping did.
  if (m.includes("invalid login credentials")) return COPY.wrongPassword;
  if (m.includes("already registered") || m.includes("already been registered"))
    return ACCOUNT_EXISTS;
  if (m.includes("email not confirmed")) return COPY.confirmFirst;
  if (m.includes("for security purposes")) return waitCopy(m);
  if (m.includes("rate limit")) return COPY.tooMany;
  if (m.includes("password should") || m.includes("password is too weak") || m.includes("weak password"))
    return COPY.weakPassword;
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return COPY.signupsClosed;
  if (m.includes("invalid format") || m.includes("unable to validate email") || m.includes("is invalid"))
    return COPY.badEmail;
  // supabase-js returns network / backend-unreachable failures as an error
  // whose message is a raw fetch or JSON-parse string ("not valid JSON",
  // "fetch failed", "Host not …"). Never show that at the front door.
  if (
    m.includes("not valid json") ||
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("host not") ||
    m.includes("econnrefused")
  )
    return COPY.unreachable;
  return GENERIC[intent];
}

/** Only ever bounce to a same-origin path — never an absolute URL. */
export function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!/^\/[a-zA-Z0-9/_\-?=&%.]*$/.test(next) || next.startsWith("//")) {
    return null;
  }
  return next;
}

/** The query keys an auth link arrives with. */
const LINK_KEYS = ["code", "error", "error_code", "error_description"] as const;

/**
 * A Supabase auth link that landed anywhere but the callback: return the
 * callback path to hand it to, carrying the one-time code (or the service's
 * error code) and the page the link meant to reach as `next`. Null when the
 * request is not an auth link.
 *
 * No page of our own reads `code` or `error_code`, so their presence is the
 * whole test — which is what keeps a reset link working whether it was sent
 * to the callback, to `/account?reset=1`, or fell back to the project's Site
 * URL.
 */
export function authLinkHandoff(url: URL): string | null {
  if (url.pathname === "/auth/callback") return null;
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error_code");
  if (!code && !errorCode) return null;

  const rest = new URL(url.toString());
  for (const k of LINK_KEYS) rest.searchParams.delete(k);

  const target = new URL("/auth/callback", url.origin);
  if (code) target.searchParams.set("code", code);
  if (errorCode) target.searchParams.set("error_code", errorCode);
  target.searchParams.set("next", rest.pathname + rest.search);
  return target.pathname + target.search;
}

/**
 * Where a person lands once the code became a session. A recovery link goes
 * to the Account page's reset banner unless it asked for somewhere more
 * specific; anything else goes where the link pointed, or into the app —
 * never back to the sign-in page they no longer need.
 */
export function landingAfterExchange(next: string | null, redirectType: string | null): string {
  const safe = safeNextPath(next);
  const specific = safe && safe !== "/" ? safe : null;
  if (redirectType === "recovery") return specific ?? "/account?reset=1";
  if (specific && !specific.startsWith("/login")) return specific;
  return "/deals";
}

/**
 * Where a person lands when there was no session to make. A confirmation
 * link's real work happens at the auth service before it redirects here, so
 * with a code in hand the address is confirmed even when the sign-in half
 * failed (a second click, a different browser) — say so and ask for a sign-in.
 * Without a code the link itself was refused (expired, already used), and the
 * page says that instead.
 */
export function landingAfterFailedExchange(next: string | null, hadCode: boolean): string {
  const safe = safeNextPath(next) ?? "";
  const confirming = /[?&]confirmed=1(?:&|$)/.test(safe);
  if (confirming) return hadCode ? "/login?confirmed=1" : "/login?confirmed=1&link=expired";
  return "/login?link=expired";
}

export type LinkBanner = { tone: "ok" | "warn"; text: string };

export const CONFIRM_LINK_FAILED =
  "That confirmation link has expired or was already used. Try signing in — if your email still isn't confirmed, use Create account again with the same email and we'll send a fresh link.";
export const RESET_LINK_FAILED =
  "That reset link has expired, was already used, or was opened in a different browser than the one you asked from. Request a fresh one below and open it in this browser.";
export const EMAIL_CONFIRMED = "Email confirmed — sign in below and your pipeline is ready.";

/**
 * The banner the sign-in page shows for the link that brought someone here.
 * Reads our own `link=expired` marker first, then the auth service's raw
 * error parameters in case a link landed here without passing the callback —
 * an expired confirmation must never read as "Email confirmed".
 */
export function authLinkBanner(params: {
  confirmed?: string | null;
  link?: string | null;
  error?: string | null;
  error_code?: string | null;
  error_description?: string | null;
}): LinkBanner | null {
  const refused =
    params.link === "expired" ||
    !!params.error_code ||
    !!params.error_description ||
    params.error === "access_denied";
  if (refused) {
    return { tone: "warn", text: params.confirmed ? CONFIRM_LINK_FAILED : RESET_LINK_FAILED };
  }
  if (params.confirmed) return { tone: "ok", text: EMAIL_CONFIRMED };
  return null;
}

/** Which form the sign-in page opens on, from its query. */
export function initialLoginMode(params: {
  mode?: string | null;
  link?: string | null;
  confirmed?: string | null;
}): AuthIntent {
  if (params.mode === "signup") return "signup";
  if (params.mode === "reset") return "reset";
  // A refused reset link opens straight on "email me a new one".
  if (params.link === "expired" && !params.confirmed) return "reset";
  return "signin";
}
