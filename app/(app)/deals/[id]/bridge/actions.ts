"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { snapshotVersion } from "@/lib/bridge/versions";
import { currentDealAssumptions } from "@/lib/bridge/deal-assumptions";
import { setPath } from "@/lib/bridge/fields";
import type { Assumptions } from "@/lib/bridge/model";

/** The levers the scenario form exposes, with the parse each needs. Percents
 *  arrive as whole numbers ("6.5") and are stored as decimals, matching the
 *  engine's convention everywhere else. */
const LEVERS: { field: keyof Assumptions; kind: "pct" | "usd" | "months" | "sf" }[] = [
  { field: "purchasePrice", kind: "usd" },
  { field: "exitCapPct", kind: "pct" },
  { field: "rentGrowthPct", kind: "pct" },
  { field: "vacancyPct", kind: "pct" },
  { field: "expenseGrowthPct", kind: "pct" },
  { field: "holdMonths", kind: "months" },
  { field: "ltc", kind: "pct" },
  { field: "allInRatePct", kind: "pct" },
];

/** Strip currency/percent decoration and parse. Returns null for blank or
 *  unparseable input so a typo leaves the assumption untouched rather than
 *  silently zeroing it. */
function parseLever(raw: FormDataEntryValue | null, kind: string): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s%]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (kind === "pct") return n / 100;
  return n;
}

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

  let scenario = base;
  for (const { field, kind } of LEVERS) {
    const value = parseLever(formData.get(field), kind);
    if (value != null) scenario = setPath(scenario, field, value);
  }

  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const outcome = await snapshotVersion(supabase, {
    dealId,
    userId: user.id,
    assumptions: scenario,
    label: label || undefined,
    note: note || null,
    automatic: false,
  });

  if (outcome.status === "failed") {
    redirect(`/deals/${dealId}/bridge?error=save`);
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

  await supabase.from("deal_versions").delete().eq("id", versionId).eq("deal_id", dealId);
  revalidatePath(`/deals/${dealId}/bridge`);
  redirect(`/deals/${dealId}/bridge`);
}
