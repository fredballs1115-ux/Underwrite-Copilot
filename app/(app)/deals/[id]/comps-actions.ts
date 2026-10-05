"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/billing";
import { claimJob, analysisWorkerEnabled, workerSchemaReady } from "@/lib/jobs";
import { runCompSearch } from "@/lib/anthropic/comps-search";
import { claimRecordComps, runRecordComps } from "@/lib/public-comps/run";

/** Re-pull public-record comps on demand (all plans — the data is free). */
export async function refreshRecordComps(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // RLS-scoped read is the access check — no row, no refresh.
  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;

  await claimRecordComps(dealId, true);
  after(() => runRecordComps(dealId));
  revalidatePath(`/deals/${dealId}`);
}

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
  // both schedule a run on the same deal. This job type always runs
  // IN-PROCESS — in worker mode, claim straight to "running" (a "queued" row
  // is claimable the instant it exists) and clear any stale worker payload
  // left by the last screen, so the worker never mistakes this row for a
  // handoff and runs a phantom pipeline alongside the comp search.
  const workerOn =
    analysisWorkerEnabled() && (await workerSchemaReady(supabase));
  const claim = workerOn
    ? await claimJob(supabase, dealId, "comps_search", null, "running")
    : await claimJob(supabase, dealId, "comps_search");
  // A claim the database did not take claimed nothing: never run on it.
  if (claim.outcome === "busy" || claim.outcome === "error") return;
  if (claim.outcome === "none") {
    // A row the database would not insert claimed nothing either — another
    // run of the deal is live (migration 0037) or the write failed.
    const { error: insErr } = await supabase.from("analysis_jobs").insert({
      deal_id: dealId,
      status: "running",
      step: "comps_search",
      progress: 5,
    });
    if (insErr) return;
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
