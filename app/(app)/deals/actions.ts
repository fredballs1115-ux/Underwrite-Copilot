"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOmPdf } from "@/lib/storage";
import { runAnalysis } from "@/lib/anthropic/pipeline";

// Keep PDFs comfortably under Claude's ~32MB per-request limit (base64 inflates
// the payload ~33%). Larger files will use the Files API in a later pass.
const MAX_BYTES = 22 * 1024 * 1024;

/**
 * Create a deal from the new-deal form: store the OM PDF, then kick off the
 * background analysis. `after()` runs the pipeline once the redirect response
 * is sent, so the page returns instantly and the deal screen shows progress.
 */
export async function createDeal(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const assetClass = String(formData.get("assetClass") ?? "auto");
  const file = formData.get("om");

  if (!name) redirect("/deals?error=name");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/deals?error=file");
  }
  if (file.type !== "application/pdf") {
    redirect("/deals?error=pdf");
  }
  if (file.size > MAX_BYTES) {
    redirect("/deals?error=size");
  }

  const { data: deal, error: insertErr } = await supabase
    .from("deals")
    .insert({ name, asset_class: assetClass, user_id: user.id })
    .select("id")
    .single();
  if (insertErr || !deal) redirect("/deals?error=save");

  const dealId = deal.id as string;
  const path = `${user.id}/${dealId}.pdf`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadOmPdf(path, buffer);

  await supabase.from("deals").update({ om_storage_path: path }).eq("id", dealId);
  await supabase
    .from("analysis_jobs")
    .insert({ deal_id: dealId, status: "queued", step: "extract", progress: 0 });

  after(() => runAnalysis(dealId));

  redirect(`/deals/${dealId}`);
}

/** Re-run (or first-run) the analysis for an existing deal that has an OM. */
export async function rerunAnalysis(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) redirect("/deals");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, om_storage_path")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal?.om_storage_path) redirect(`/deals/${dealId}`);

  const { data: existing } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("deal_id", dealId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "queued", step: "extract", progress: 0, error: null })
      .eq("deal_id", dealId);
  } else {
    await supabase
      .from("analysis_jobs")
      .insert({ deal_id: dealId, status: "queued", step: "extract", progress: 0 });
  }

  after(() => runAnalysis(dealId));
  redirect(`/deals/${dealId}`);
}
