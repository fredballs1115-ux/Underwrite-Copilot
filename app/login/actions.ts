"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | null;

/**
 * One server action handles both sign-in and sign-up — the clicked button sends
 * an `intent` field so we know which. Server Actions always run on the server,
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
  const { data, error } =
    intent === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
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

  // Success — the session cookie is set; send them into the app.
  redirect("/deals");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
