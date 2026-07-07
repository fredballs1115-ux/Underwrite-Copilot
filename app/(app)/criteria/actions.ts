"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveBuyBox } from "@/lib/criteria-server";
import { isEmptyBuyBox, type BuyBox } from "@/lib/criteria";

const ASSET_CLASSES = ["multifamily", "office", "industrial", "retail"];

function num(formData: FormData, key: string): number | undefined {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Save the caller's buy box — team box when they own a team, else personal. */
export async function saveBuyBox(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const assetClasses = formData
    .getAll("assetClasses")
    .map(String)
    .filter((a) => ASSET_CLASSES.includes(a));

  const box: BuyBox = {
    assetClasses: assetClasses.length ? assetClasses : undefined,
    markets: String(formData.get("markets") ?? "").trim().slice(0, 300) || undefined,
    maxPriceM: num(formData, "maxPriceM"),
    maxPerUnitK: num(formData, "maxPerUnitK"),
    minCapPct: num(formData, "minCapPct"),
    minIrrPct: num(formData, "minIrrPct"),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 600) || undefined,
  };
  const value = isEmptyBuyBox(box) ? null : box;

  const active = await getActiveBuyBox(supabase, user.id);

  if (active.scope === "team") {
    if (!active.editable) redirect("/criteria?error=owner");
    // Team criteria are service-role writes (teams table is user-write-locked).
    const { error } = await createSupabaseAdminClient()
      .from("teams")
      .update({ criteria: value })
      .eq("id", active.teamId!);
    if (error) redirect("/criteria?error=save");
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ criteria: value })
      .eq("id", user.id);
    if (error) redirect("/criteria?error=save");
  }

  revalidatePath("/criteria");
  revalidatePath("/deals");
  redirect("/criteria?saved=1");
}
