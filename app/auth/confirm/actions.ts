"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emailLinkTypeOf, isTokenHash, landingAfterConfirm } from "@/lib/auth-flow";

/**
 * Verify an email link by its token hash, on the person's press of the
 * page's one button — never on the page's load, which a link scanner makes
 * too. A Server Action may write the session's cookies, as a Server
 * Component may not. The reason a link is refused goes to the log; the
 * sign-in page says what to do about it.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const type = emailLinkTypeOf(String(formData.get("type") ?? ""));
  const tokenHash = String(formData.get("token_hash") ?? "");
  const next = String(formData.get("next") ?? "") || null;
  let ok = false;
  if (type && isTokenHash(tokenHash)) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      ok = !error && !!data.session;
      if (!ok) console.warn(`[auth/confirm] verify failed: ${error?.code ?? "no session"} — ${error?.message ?? ""}`);
    } catch (err) {
      console.warn(`[auth/confirm] verify threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  redirect(landingAfterConfirm(type ?? "signup", next, ok));
}
