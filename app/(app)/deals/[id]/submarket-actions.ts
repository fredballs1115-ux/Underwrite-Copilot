"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDealSubmarket } from "@/lib/market/store";

async function requireDeal(dealId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("deals").select("id").eq("id", dealId).maybeSingle();
  if (!data) return null;
  return { supabase, user };
}

/** Attach a submarket to the deal (or detach it with an empty selection). */
export async function linkSubmarket(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const submarketId = String(formData.get("submarketId") ?? "");
  if (!dealId) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;

  if (!submarketId) {
    await ctx.supabase.from("deal_submarkets").delete().eq("deal_id", dealId);
  } else {
    await ctx.supabase
      .from("deal_submarkets")
      .upsert({ deal_id: dealId, submarket_id: submarketId }, { onConflict: "deal_id" });
  }
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

/**
 * Dismiss one assumption warning.
 *
 * The reason is REQUIRED — an empty one bounces rather than being stored as a
 * blank. Analysts overriding a check is normal; doing it silently isn't, and
 * the reason lands in the deal memo.
 */
export async function dismissSubmarketWarning(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const code = String(formData.get("code") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!dealId || !code) return;
  if (!reason) redirect(`/deals/${dealId}?error=dismissreason`);

  const ctx = await requireDeal(dealId);
  if (!ctx) return;
  const link = await getDealSubmarket(ctx.supabase, dealId);
  if (!link) return;

  const dismissals = [
    ...link.dismissals.filter((d) => d.code !== code),
    {
      code,
      reason: reason.slice(0, 300),
      by: ctx.user.email ?? ctx.user.id,
      at: new Date().toISOString(),
    },
  ];

  await ctx.supabase.from("deal_submarkets").update({ dismissals }).eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

/** Bring a dismissed warning back. The override disappears from the memo too. */
export async function restoreSubmarketWarning(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!dealId || !code) return;
  const ctx = await requireDeal(dealId);
  if (!ctx) return;
  const link = await getDealSubmarket(ctx.supabase, dealId);
  if (!link) return;

  await ctx.supabase
    .from("deal_submarkets")
    .update({ dismissals: link.dismissals.filter((d) => d.code !== code) })
    .eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
