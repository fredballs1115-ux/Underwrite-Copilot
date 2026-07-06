"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PwState = { error?: string; ok?: boolean } | null;

/** Change the signed-in user's password. Returns a state for useActionState. */
export async function changePassword(
  _prev: PwState,
  formData: FormData,
): Promise<PwState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out — sign in again to continue." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { ok: true };
}
