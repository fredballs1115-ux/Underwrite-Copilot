"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { claimJob } from "@/lib/jobs";
import { runCompSearch } from "@/lib/anthropic/comps-search";

/** Kick off a public-web comp search in the background, reusing the job row. */
export async function searchPublicComps(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;

  // Pro-only feature.
  if (!(await isPro(supabase, user.id))) return;

  // Atomic claim (not a check-then-act read) so overlapping triggers can't
  // both schedule a run on the same deal.
  const claim = await claimJob(supabase, dealId, "comps_search");
  if (claim.outcome === "busy") return;
  if (claim.outcome === "none") {
    await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "comps_search",
      progress: 5,
    });
  } else {
    await supabase
      .from("analysis_jobs")
      .update({
        status: "running",
        step: "comps_search",
        progress: 5,
        error: null,
      })
      .eq("deal_id", dealId);
  }

  after(() => runCompSearch(dealId));
  revalidatePath(`/deals/${dealId}`);
}
