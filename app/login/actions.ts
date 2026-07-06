"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/proxy-session";

export type AuthState = { error?: string; notice?: string } | null;

/** Map raw Supabase auth errors onto copy a person can act on. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Wrong email or password. If you're new, switch to Create account.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account — sign in instead.";
  if (m.includes("rate limit"))
    return "Too many attempts — wait a minute and try again.";
  if (m.includes("email not confirmed"))
    return "Confirm your email first — check your inbox for the link.";
  return message;
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
  const intent = String(formData.get("intent") ?? "signin");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  let data, error;
  try {
    ({ data, error } =
      intent === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    // Network failure or a non-JSON response from the auth service — don't
    // surface a raw parse error to the person signing in.
    return { error: "Couldn't reach the sign-in service — try again in a moment." };
  }

  if (error) {
    return { error: friendly(error.message) };
  }

  // If the project requires email confirmation, sign-up succeeds but no session
  // is created. Redirecting to the app would just bounce back to /login — so
  // tell the user to confirm their email instead.
  if (!data.session) {
    return {
      notice:
        "Account created. Check your email to confirm your address, then sign in.",
    };
  }

  // Success — the session cookie is set; send them into the app (or back to
  // the invite/deep link they were headed to — same-origin paths only).
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  redirect(next ?? "/deals");
}

/** Email a password-recovery link. The link signs the user in; they then set a
 *  new password on the Account page (which the redirect points at). */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your account email first." };

  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let error;
  try {
    ({ error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/account?reset=1`,
    }));
  } catch {
    return { error: "Couldn't reach the sign-in service — try again in a moment." };
  }
  if (error) return { error: friendly(error.message) };
  return {
    notice:
      "If that email has an account, a reset link is on its way. It signs you in — set a new password on the Account page.",
  };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
