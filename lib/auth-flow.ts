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

/** The sign-in page's forms: sign in, create an account, email a reset link,
 *  email a fresh confirmation link. */
export type LoginMode = "signin" | "signup" | "reset" | "resend";

/** What the person was doing when the auth service said no: one of the
 *  sign-in page's forms, or setting a new password on the Account page. */
export type AuthIntent = LoginMode | "password";

/** A session-bound request with no session behind it. */
export const SIGNED_OUT = "You're signed out — sign in again to continue.";

const SUPPORT = "underwritecopilot.support@gmail.com";

export const ACCOUNT_EXISTS =
  "That email already has an account — sign in instead, or use Forgot password if you don't remember it.";

const COPY = {
  wrongPassword: "Wrong email or password. If you're new, switch to Create account.",
  confirmFirst: "Confirm your email first — check your inbox for the link.",
  // Said only where the service gives no reasons: never a rule the
  // project's own settings may not hold (`weakPasswordCopy`).
  weakPassword: "That password is too weak — choose a longer, less common one.",
  longPassword: "That password is too long — keep it under 72 characters.",
  badEmail: "That doesn't look like a valid email address — check it and try again.",
  signupsClosed: `New sign-ups are closed right now — email ${SUPPORT} and we'll set you up.`,
  emailNotAllowed: `We can't send email to that address yet — a setup problem on our side, not yours. Email ${SUPPORT} and we'll get you in.`,
  tooMany: "Too many attempts — wait a minute and try again.",
  // The project's own hourly cap on the emails the auth service sends: it
  // trips during a sign-up spike, for people who never asked before, so it
  // says what happened on our side and never "wait before asking again".
  emailBusy:
    "Our email is rate-limited right now, so the link didn't go out — please try again shortly.",
  banned: `This account is suspended — email ${SUPPORT} if you think that's a mistake.`,
  linkExpired: "That link has expired — request a new one.",
  unreachable: "Couldn't reach the sign-in service — please try again in a moment.",
  emailOff: `Email sign-in is switched off — a setup problem on our side, not yours. Email ${SUPPORT}.`,
  samePassword: "That's already your password — choose a different one.",
  // The auth service asked for a recent sign-in before a password change (the
  // project's secure-password-change setting); the page has no second-factor
  // step, so a fresh session is the way through.
  reauthenticate: "For your security, sign out and sign back in, then set your new password.",
} as const;

const GENERIC: Record<AuthIntent, string> = {
  signin: "Something went wrong signing you in — please try again.",
  signup: "Something went wrong creating your account — please try again.",
  reset: "Something went wrong sending the reset link — please try again.",
  resend: "Something went wrong sending the confirmation link — please try again.",
  password: "Something went wrong saving your new password — please try again.",
};

/** What the page says once an account is created and waits for its
 *  confirmation link: the address it went to, so a mistyped one is seen
 *  (the form keeps it, to correct and send again), and that the link
 *  signs the person in only in this browser — the sign-up's code verifier
 *  lives in its cookies (research pass 32). */
export function accountCreatedNotice(email: string): string {
  return `Account created. We sent a confirmation link to ${email} — open it in this browser to confirm your email and sign in. Not your address? Correct it and create the account again.`;
}

/** What the page says once a fresh confirmation link is asked for. The auth
 *  service answers alike for an address waiting to be confirmed, one already
 *  confirmed and one it has never seen, so the page does too. */
export const CONFIRMATION_RESENT =
  "If that address is waiting to be confirmed, a fresh link is on its way. Open it in this browser — it confirms your email and signs you in.";

/**
 * Whether an auth failure means the address was never confirmed — the
 * sign-in that answers "Confirm your email first", which the page follows
 * with a way to have the link sent again.
 */
export function awaitingConfirmation(err: { message?: string | null; code?: string | null }): boolean {
  if (err.code) return err.code === "email_not_confirmed";
  return (err.message ?? "").toLowerCase().includes("email not confirmed");
}

/**
 * The auth service's one code for two different limits. "For security
 * purposes, you can only request this after 47 seconds." is the person's own
 * address asked again inside the minute, and says the wait. "Email rate limit
 * exceeded" is the project's hourly cap on the emails it sends — reached by
 * everyone's sign-ups and resets together, so the person reading it may have
 * asked for nothing before.
 */
function emailLimitCopy(message: string): string {
  const m = /after (\d+) seconds?/i.exec(message);
  return m ? `Wait about ${m[1]} seconds before requesting another link.` : COPY.emailBusy;
}

/**
 * One sentence for an auth failure, chosen by the error's stable code first
 * and its message second (older responses carry no code), with a fallback
 * that names what the person was trying to do.
 */
/** The character classes a weak-password message lists, as a person says
 *  them. The service's `characters` reason names the classes the project
 *  requires, as the characters themselves. */
const CHARACTER_CLASSES: [RegExp, string][] = [
  [/abcdefghijklmnopqrstuvwxyz/, "a lower-case letter"],
  [/ABCDEFGHIJKLMNOPQRSTUVWXYZ/, "an upper-case letter"],
  [/0123456789/, "a number"],
  [/[!@#$%^&*][!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]{3,}/, "a symbol"],
];

/**
 * A weak password, said by the reasons the auth service gives
 * (`AuthWeakPasswordError.reasons`: length, characters, pwned) and the
 * figures its own message states — never a rule the project's settings may
 * not hold. The sentence had promised "at least 8 characters with a mix of
 * letters, numbers and symbols" to every weak password alike, a rule the
 * project's policy may not ask for (research pass 32).
 */
export function weakPasswordCopy(err: { message?: string | null; reasons?: readonly string[] | null }): string {
  const message = err.message ?? "";
  const reasons = err.reasons ?? [];
  const parts: string[] = [];
  if (reasons.includes("length")) {
    const n = /at least (\d+) characters/i.exec(message)?.[1];
    parts.push(n ? `use at least ${n} characters` : "make it longer");
  }
  if (reasons.includes("characters")) {
    const kinds = CHARACTER_CLASSES.filter(([re]) => re.test(message)).map(([, words]) => words);
    parts.push(
      kinds.length === 0
        ? "include the kinds of characters the sign-in service asks for"
        : `include at least ${kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}`}`,
    );
  }
  if (reasons.includes("pwned")) parts.push("choose one that hasn't appeared in a known data breach");
  if (parts.length === 0) return COPY.weakPassword;
  const said = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `That password is too weak — ${said}.`;
}

export function authErrorCopy(
  err: { message?: string | null; code?: string | null; reasons?: readonly string[] | null },
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
      return weakPasswordCopy(err);
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
      return emailLimitCopy(m);
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return COPY.tooMany;
    case "user_banned":
      return COPY.banned;
    case "same_password":
      return COPY.samePassword;
    case "reauthentication_needed":
    case "reauthentication_not_valid":
    case "reauth_nonce_missing":
      return COPY.reauthenticate;
    case "session_not_found":
    case "session_expired":
      return SIGNED_OUT;
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return COPY.linkExpired;
    case "validation_failed":
      if (m.includes("72 characters")) return COPY.longPassword;
      if (m.includes("password")) return weakPasswordCopy(err);
      if (m.includes("email")) return COPY.badEmail;
      return GENERIC[intent];
  }

  // No usable code: read the message the way the older mapping did.
  if (m.includes("invalid login credentials")) return COPY.wrongPassword;
  if (m.includes("already registered") || m.includes("already been registered"))
    return ACCOUNT_EXISTS;
  if (m.includes("email not confirmed")) return COPY.confirmFirst;
  if (m.includes("for security purposes")) return emailLimitCopy(m);
  if (m.includes("email rate limit")) return COPY.emailBusy;
  if (m.includes("rate limit")) return COPY.tooMany;
  if (m.includes("should be different from the old password")) return COPY.samePassword;
  if (m.includes("requires reauthentication")) return COPY.reauthenticate;
  if (m.includes("password should") || m.includes("password is too weak") || m.includes("weak password"))
    return weakPasswordCopy(err);
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

/** A page worth carrying past the sign-in page: a safe path that is neither
 *  the site root nor the sign-in page itself (which would only loop). */
function onwardPath(next: string | null): string | null {
  const safe = safeNextPath(next);
  return safe && safe !== "/" && !safe.startsWith("/login") ? safe : null;
}

/** The page a sign-in page path was carrying in its own `next` — an invite,
 *  a plan — read whole and held to the same rule. */
function carriedBy(loginPath: string): string | null {
  const q = loginPath.indexOf("?");
  if (q === -1) return null;
  return onwardPath(new URLSearchParams(loginPath.slice(q + 1)).get("next"));
}

/**
 * Where a sign-up's confirmation email points: the sign-in page's "Email
 * confirmed" banner, carrying the page the person was headed to as `next` —
 * the invite they signed up from (`/team/join/<token>`), the plan they picked
 * (`/billing`, `/team`) — so the confirmed person lands there and not on an
 * empty pipeline of their own. A same-origin path only; anything else is
 * dropped and the link points where it always did. (Should the auth service
 * refuse the longer URL, it falls back to the project's Site URL and the
 * handoff lands in the pipeline, as before.)
 */
export function confirmationRedirect(origin: string, next: string | null): string {
  const base = `${origin}/login?confirmed=1`;
  const onward = onwardPath(next);
  return onward ? `${base}&next=${encodeURIComponent(onward)}` : base;
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
 * never back to the sign-in page they no longer need. A confirmation link
 * points at the sign-in page, so the page it carries (`confirmationRedirect`)
 * is where the person goes: the invite they signed up from, accepted from
 * its own page, rather than an empty pipeline of their own.
 */
export function landingAfterExchange(next: string | null, redirectType: string | null): string {
  const safe = safeNextPath(next);
  const specific = safe && safe !== "/" ? safe : null;
  if (redirectType === "recovery") return specific ?? "/account?reset=1";
  if (specific && !specific.startsWith("/login")) return specific;
  return (specific && carriedBy(specific)) ?? "/deals";
}

/**
 * Where a person lands when there was no session to make. A confirmation
 * link's real work happens at the auth service before it redirects here, so
 * with a code in hand the address is confirmed even when the sign-in half
 * failed (a second click, a different browser) — say so and ask for a sign-in.
 * Without a code the link itself was refused (expired, already used), and the
 * page says that instead. Either way the page the link carried rides along,
 * so the sign-in that follows still goes there.
 */
export function landingAfterFailedExchange(next: string | null, hadCode: boolean): string {
  const safe = safeNextPath(next) ?? "";
  const confirming = /[?&]confirmed=1(?:&|$)/.test(safe);
  if (confirming) {
    const onward = carriedBy(safe);
    const tail = onward ? `&next=${encodeURIComponent(onward)}` : "";
    return hadCode ? `/login?confirmed=1${tail}` : `/login?confirmed=1&link=expired${tail}`;
  }
  return "/login?link=expired";
}

/**
 * The email links a click-through page verifies by their token hash
 * (supabase-js's `EmailOtpType`): `/auth/confirm` shows one button and
 * verifies only when it is pressed. A link a corporate scanner fetches to
 * check it (Outlook's Safe Links and its kind) then uses nothing up, and a
 * reset asked for on a laptop opens on a phone, since the hash needs no code
 * verifier in the browser that asked (research pass 32; the email templates
 * pointing here are the owner's to set).
 */
export const EMAIL_LINK_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

/** A link's `type`, or null for one the page does not verify. */
export function emailLinkTypeOf(raw: string | null | undefined): EmailLinkType | null {
  return (EMAIL_LINK_TYPES as readonly string[]).includes(raw ?? "") ? (raw as EmailLinkType) : null;
}

/** A token hash as a link carries it: letters, digits, `-` and `_`, of a
 *  sane length — anything else is refused before the auth service is asked. */
export function isTokenHash(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{16,512}$/.test(raw);
}

/** What `/auth/confirm` says, and its one button, by the link's kind. */
export function confirmPageCopy(type: EmailLinkType): { heading: string; body: string; button: string } {
  if (type === "recovery") {
    return {
      heading: "Set a new password",
      body: "Continue to sign in and choose a new password on your Account page.",
      button: "Continue",
    };
  }
  if (type === "email_change") {
    return { heading: "Confirm your new email", body: "Confirm the change to your account's email address.", button: "Confirm the change" };
  }
  if (type === "magiclink") return { heading: "Sign in", body: "Continue to sign in to Underwrite Copilot.", button: "Sign in" };
  return { heading: "Confirm your email", body: "Confirm your email address to finish setting up your account.", button: "Confirm my email" };
}

/** Where `/auth/confirm` sends the person: on a verified link, where a
 *  code's exchange would (`landingAfterExchange`); on a refused one, to the
 *  sign-in page's banner for that kind of link, the page it carried riding
 *  along. */
export function landingAfterConfirm(type: EmailLinkType, next: string | null, ok: boolean): string {
  if (ok) return landingAfterExchange(next, type === "recovery" ? "recovery" : null);
  if (type === "recovery" || type === "magiclink") return "/login?link=expired";
  const onward = onwardPath(next);
  return `/login?confirmed=1&link=expired${onward ? `&next=${encodeURIComponent(onward)}` : ""}`;
}

export type LinkBanner = { tone: "ok" | "warn"; text: string };

export const CONFIRM_LINK_FAILED =
  "That confirmation link has expired or was already used. Try signing in — if your email still isn't confirmed, use Resend the confirmation link below for a fresh one.";
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
  next?: string | null;
}): LoginMode {
  if (params.mode === "signup") return "signup";
  if (params.mode === "reset") return "reset";
  if (params.mode === "signin") return "signin";
  // A refused reset link opens straight on "email me a new one".
  if (params.link === "expired" && !params.confirmed) return "reset";
  // A signed-out invitee is sent here on the way to the invite: most are new
  // to the site, so the page opens on Create account, a tab away from Sign
  // in (research pass 32).
  if (safeNextPath(params.next ?? null)?.startsWith("/team/join/")) return "signup";
  return "signin";
}
