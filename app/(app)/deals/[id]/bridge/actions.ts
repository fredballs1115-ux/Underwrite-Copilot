"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { listDealVersions, snapshotVersion } from "@/lib/bridge/versions";
import { currentVersionId } from "@/lib/bridge/version-rules";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import { applyScenarioForm } from "@/lib/bridge/scenario-form";

/**
 * Save a labelled scenario as a new deal version.
 *
 * The base is the deal's current derived assumption set; only the levers the
 * user actually typed are overridden. Everything else stays exactly what the
 * OM and the actuals produced, so the bridge attributes the move to the levers
 * and nothing else.
 */
export async function saveScenarioVersion(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("id, name, extraction")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;

  const base = await currentDealAssumptions(
    supabase,
    dealId,
    deal.name as string,
    (deal.extraction as ExtractionResult | null) ?? null,
  );
  if (!base) redirect(`/deals/${dealId}/bridge?error=noextraction`);

  // Only the levers the user moved: every field comes back prefilled, and an
  // untouched one keeps the base's full precision (lib/bridge/scenario-form).
  // A figure the form cannot read is refused out loud, never dropped.
  const form = applyScenarioForm(base, (field) => {
    const v = formData.get(field);
    return v == null ? null : String(v);
  });
  if (form.refused) {
    redirect(
      `/deals/${dealId}/bridge?error=lever&field=${form.refused.lever.field}&why=${form.refused.refusal}`,
    );
  }
  const scenario = form.scenario;

  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  // The base the scenario is built from goes in first, as an automatic
  // snapshot wherever it moved since the last one (the rate index can move
  // between the page and the save), so the scenario always has the base it
  // was saved from to be set against. A base that cannot be written does not
  // stop the save.
  await snapshotVersion(supabase, { dealId, userId: user.id, assumptions: base });

  const outcome = await snapshotVersion(supabase, {
    dealId,
    userId: user.id,
    assumptions: scenario,
    label: label || undefined,
    note: note || null,
    automatic: false,
  });

  if (outcome.status === "failed") {
    console.error("[bridge] scenario save failed", outcome.error);
    redirect(
      `/deals/${dealId}/bridge?error=${
        outcome.reason === "label_taken" ? "labeltaken" : outcome.reason === "denied" ? "denied" : "save"
      }`,
    );
  }
  revalidatePath(`/deals/${dealId}/bridge`);
  redirect(`/deals/${dealId}/bridge?to=${outcome.version.id}`);
}

/** Remove a version. Immutable does not mean undeletable — a mislabelled
 *  scenario should not be permanent furniture. */
export async function deleteDealVersion(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!dealId || !versionId) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The version that IS the deal as it stands is kept: the page offers no
  // Delete for it, since the next view would only take it again under a new
  // label. Refused here too, because the form can be posted without the
  // page.
  const { data: deal } = await supabase.from("deals").select("name, extraction").eq("id", dealId).maybeSingle();
  if (deal) {
    const current = await currentDealAssumptions(
      supabase,
      dealId,
      deal.name as string,
      (deal.extraction as ExtractionResult | null) ?? null,
    );
    const versions = await listDealVersions(supabase, dealId);
    if (currentVersionId(current, versions) === versionId) redirect(`/deals/${dealId}/bridge?error=current`);
  }

  const { error } = await supabase.from("deal_versions").delete().eq("id", versionId).eq("deal_id", dealId);
  if (error) {
    console.error("[bridge] version delete failed", error.message);
    redirect(`/deals/${dealId}/bridge?error=delete`);
  }
  revalidatePath(`/deals/${dealId}/bridge`);
  redirect(`/deals/${dealId}/bridge`);
}
