"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSectorFields } from "@/lib/sector-fields";

// Writes go through the USER client — deal RLS is the security boundary;
// this action only shapes the data (same contract as task-actions).

export async function saveSectorFields(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, asset_class")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/deals");

  const form: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) form[k] = v;
  const values = parseSectorFields((deal.asset_class as string) ?? "auto", form);

  await supabase
    .from("deals")
    .update({ sector_fields: Object.keys(values).length ? values : null })
    .eq("id", dealId);

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
