"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  confirmSwitchPath,
  confirmedPath,
  emailLinkTypeOf,
  isTokenHash,
  landingAfterConfirm,
} from "@/lib/auth-flow";

/**
 * Verify an email link by its token hash, on the person's press of the
 * page's one button — never on the page's load, which a link scanner makes
 * too. A Server Action may write the session's cookies, as a Server
 * Component may not. The reason a link is refused goes to the log; the
 * sign-in page says what to do about it.
 *
 * A browser already signed in is never switched to another account on one
 * press (research pass 39): the first press only asks (`confirmSwitchPath`,
 * the page then naming the account signed in), and the second, carrying
 * `replace`, signs that account out of this browser and then verifies. A
 * verified link lands on the page naming the account now signed in
 * (`confirmedPath`), with "not you?" beside it.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const type = emailLinkTypeOf(String(formData.get("type") ?? ""));
  const tokenHash = String(formData.get("token_hash") ?? "");
  const next = String(formData.get("next") ?? "") || null;
  const replace = formData.get("replace") === "1";
  let ok = false;
  if (type && isTokenHash(tokenHash)) {
    let ask = false;
    try {
      const supabase = await createSupabaseServerClient();
      // Who this browser is signed in as now, if anyone. A read that fails
      // is read as signed in, so it asks rather than replaces.
      let signedIn = false;
      try {
        const { data, error } = await supabase.auth.getUser();
        signedIn = !!data?.user || (!!error && error.name !== "AuthSessionMissingError");
      } catch {
        signedIn = true;
      }
      if (signedIn && !replace) {
        ask = true;
      } else {
        if (signedIn) {
          // The second press: this browser's session goes first, and only
          // this browser's.
          const { error: outErr } = await supabase.auth.signOut({ scope: "local" });
          if (outErr) console.warn(`[auth/confirm] sign-out before switching failed: ${outErr.code ?? ""} — ${outErr.message}`);
        }
        const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        ok = !error && !!data.session;
        if (!ok) console.warn(`[auth/confirm] verify failed: ${error?.code ?? "no session"} — ${error?.message ?? ""}`);
      }
    } catch (err) {
      console.warn(`[auth/confirm] verify threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ask) redirect(confirmSwitchPath(type, tokenHash, next));
  }
  redirect(ok && type ? confirmedPath(landingAfterConfirm(type, next, true)) : landingAfterConfirm(type ?? "signup", next, false));
}

/** "Not you? Sign out" on the page a verified link lands on: this browser's
 *  session only, then the sign-in page. */
export async function signOutHere(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.warn(`[auth/confirm] sign-out failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  redirect("/login");
}
