"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACCOUNT_EXISTS,
  CONFIRMATION_RESENT,
  accountCreatedNotice,
  authErrorCopy,
  awaitingConfirmation,
  confirmationRedirect,
  safeNextPath,
  type AuthIntent,
} from "@/lib/auth-flow";
import { appUrl } from "@/lib/app-url";

/** `intent` names the form that produced the state, so the sign-in tab never
 *  shows the sign-up tab's error. `resend` asks the page to offer a fresh
 *  confirmation link, and `email` is the address the form was sent with:
 *  React empties the form once its action runs, so the field opens on it
 *  again after any refusal, and the resend offer opens on it too. */
export type AuthState = {
  error?: string;
  notice?: string;
  intent?: AuthIntent;
  resend?: boolean;
  email?: string;
} | null;

const UNREACHABLE = "Couldn't reach the sign-in service — try again in a moment.";

/** The site's own origin, where the email links come back to: the one
 *  reader the emails use too (lib/app-url), a blank setting read as unset. */
function siteOrigin(): string {
  return appUrl();
}

/**
 * One server action handles both sign-in and sign-up — the form sends an
 * `intent` field so we know which. Server Actions always run on the server,
 * so credentials never get handled in the browser.
 */
export async function authenticate(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const intent: AuthIntent = formData.get("intent") === "signup" ? "signup" : "signin";
  // Where the person was headed — an invite, a plan, a deep link — read once
  // and held to same-origin paths; a sign-in goes there now, a sign-up after
  // its confirmation link.
  const next = safeNextPath(String(formData.get("next") ?? "") || null);

  if (!email || !password) {
    return { intent, error: "Email and password are required.", email };
  }

  const supabase = await createSupabaseServerClient();
  let data, error;
  try {
    ({ data, error } =
      intent === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              // The confirmation email's link lands back here with a banner
              // instead of dead-ending on the marketing homepage, carrying
              // `next` so an invitee lands on the invite rather than on an
              // empty pipeline of their own. The URL must be on the Supabase
              // project's redirect allowlist; the proxy hands the link's code
              // to /auth/callback, which signs the person in and sends them
              // on (lib/auth-flow's landingAfterExchange).
              emailRedirectTo: confirmationRedirect(siteOrigin(), next),
            },
          })
        : await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    // Network failure or a non-JSON response from the auth service — don't
    // surface a raw parse error to the person signing in.
    return { intent, error: UNREACHABLE, email };
  }

  if (error) {
    // "Confirm your email first" comes with a way to have the link sent again.
    return awaitingConfirmation(error)
      ? { intent, error: authErrorCopy(error, intent), resend: true, email }
      : { intent, error: authErrorCopy(error, intent), email };
  }

  // With enumeration protection on, signing up an email that already has an
  // account "succeeds" with a placeholder user that has no identities and no
  // session. Left alone, that reads as "Account created — check your email"
  // and the person waits for a message that never comes.
  if (intent === "signup" && data.user && (data.user.identities?.length ?? 0) === 0) {
    return { intent, error: ACCOUNT_EXISTS, email };
  }

  // If the project requires email confirmation, sign-up succeeds but no session
  // is created. Redirecting to the app would just bounce back to /login — so
  // tell the user to confirm their email instead.
  if (!data.session) {
    return { intent, notice: accountCreatedNotice(email), resend: true, email };
  }

  // Success — the session cookie is set; send them into the app (or back to
  // the invite/deep link they were headed to — same-origin paths only).
  redirect(next ?? "/deals");
}

/** Email a password-recovery link. Opening it signs the person in (the code
 *  is exchanged by /auth/callback) and lands on the Account page, where they
 *  set a new password. */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { intent: "reset", error: "Enter your account email first." };

  const supabase = await createSupabaseServerClient();
  let error;
  try {
    // The target stays the Account page — it is on the project's redirect
    // allowlist today, and the proxy routes the link's code through the
    // callback on the way there.
    ({ error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteOrigin()}/account?reset=1`,
    }));
  } catch {
    return { intent: "reset", error: UNREACHABLE };
  }
  if (error) return { intent: "reset", error: authErrorCopy(error, "reset") };
  return {
    intent: "reset",
    notice:
      "If that email has an account, a reset link is on its way. Open it in this browser — it signs you in, and you set a new password on the Account page.",
  };
}

/**
 * Email a fresh confirmation link to an address that signed up and never
 * confirmed — the auth service's own resend for a sign-up. It answers alike
 * whether the address is waiting, already confirmed or unknown, so the page
 * does too. The link carries `next` exactly as the sign-up's did, so an
 * invitee still lands on the invite; a limit reads by lib/auth-flow's rule
 * (the address's own wait with its seconds, or our email's hourly cap — never
 * "wait a minute" to someone who never asked).
 */
export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { intent: "resend", error: "Enter the email you signed up with." };
  const next = safeNextPath(String(formData.get("next") ?? "") || null);

  const supabase = await createSupabaseServerClient();
  let error;
  try {
    ({ error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: confirmationRedirect(siteOrigin(), next) },
    }));
  } catch {
    return { intent: "resend", error: UNREACHABLE, email };
  }
  if (error) return { intent: "resend", error: authErrorCopy(error, "resend"), email };
  return { intent: "resend", notice: CONFIRMATION_RESENT, email };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
