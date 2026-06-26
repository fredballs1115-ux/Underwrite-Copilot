"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runCompSearch } from "@/lib/anthropic/comps-search";

/** Kick off a public-web comp search in the background, reusing the job row. */
export async function searchPublicComps(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;

  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("deal_id", dealId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({
        status: "running",
        step: "comps_search",
        progress: 5,
        error: null,
      })
      .eq("deal_id", dealId);
  } else {
    await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "comps_search",
      progress: 5,
    });
  }

  after(() => runCompSearch(dealId));
  revalidatePath(`/deals/${dealId}`);
}
