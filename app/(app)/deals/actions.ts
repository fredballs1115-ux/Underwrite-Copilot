"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Create a new deal owned by the signed-in user, then open it.
 * (In Phase 2 this is where OM upload kicks off the analysis job.)
 */
export async function createDeal(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const assetClass = String(formData.get("assetClass") ?? "auto");

  if (!name) {
    redirect("/deals");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("deals")
    .insert({ name, asset_class: assetClass, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    // Surfacing this nicely is a later polish item; for now bounce back.
    redirect("/deals");
  }

  redirect(`/deals/${data.id}`);
}
