"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACCOUNT_EXISTS,
  authErrorCopy,
  safeNextPath,
  type AuthIntent,
} from "@/lib/auth-flow";

/** `intent` names the form that produced the state, so the sign-in tab never
 *  shows the sign-up tab's error. */
export type AuthState = { error?: string; notice?: string; intent?: AuthIntent } | null;

const UNREACHABLE = "Couldn't reach the sign-in service — try again in a moment.";

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

  if (!email || !password) {
    return { intent, error: "Email and password are required." };
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
              // instead of dead-ending on the marketing homepage. The URL
              // must be on the Supabase project's redirect allowlist; the
              // proxy hands the link's code to /auth/callback, which signs
              // the person in.
              emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login?confirmed=1`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    // Network failure or a non-JSON response from the auth service — don't
    // surface a raw parse error to the person signing in.
    return { intent, error: UNREACHABLE };
  }

  if (error) {
    return { intent, error: authErrorCopy(error, intent) };
  }

  // With enumeration protection on, signing up an email that already has an
  // account "succeeds" with a placeholder user that has no identities and no
  // session. Left alone, that reads as "Account created — check your email"
  // and the person waits for a message that never comes.
  if (intent === "signup" && data.user && (data.user.identities?.length ?? 0) === 0) {
    return { intent, error: ACCOUNT_EXISTS };
  }

  // If the project requires email confirmation, sign-up succeeds but no session
  // is created. Redirecting to the app would just bounce back to /login — so
  // tell the user to confirm their email instead.
  if (!data.session) {
    return {
      intent,
      notice:
        "Account created. Check your email for the confirmation link — opening it signs you in.",
    };
  }

  // Success — the session cookie is set; send them into the app (or back to
  // the invite/deep link they were headed to — same-origin paths only).
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
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
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let error;
  try {
    // The target stays the Account page — it is on the project's redirect
    // allowlist today, and the proxy routes the link's code through the
    // callback on the way there.
    ({ error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/account?reset=1`,
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

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
