"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Share links expire on their own — a forwarded screen shouldn't be readable
// forever. 30 days covers a deal's live window; revoke kills it sooner.
const SHARE_DAYS = 30;

/**
 * Mint a read-only share link for a deal. The token is the row's uuid —
 * unguessable, expiring, revocable. RLS (0017) scopes creation to deals the
 * caller can see; the public page reads via the service role.
 */
export async function createShareLink(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The share page leads with the verdict — an unscreened deal has nothing
  // to show a partner yet.
  const { data: deal } = await supabase
    .from("deals")
    .select("id, verdict, is_sample")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");
  if (!deal.verdict || deal.is_sample) {
    redirect(`/deals/${dealId}?error=shareempty`);
  }

  const { error } = await supabase.from("deal_shares").insert({
    deal_id: dealId,
    created_by: user.id,
    expires_at: new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString(),
  });
  if (error) redirect(`/deals/${dealId}?error=share`);

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

/** Kill a share link now (sets revoked — the row stays as an audit trail). */
export async function revokeShareLink(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const shareId = String(formData.get("shareId") ?? "");
  if (!dealId || !shareId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("deal_shares")
    .update({ revoked: true })
    .eq("id", shareId)
    .eq("deal_id", dealId);
  if (error) redirect(`/deals/${dealId}?error=share`);

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
