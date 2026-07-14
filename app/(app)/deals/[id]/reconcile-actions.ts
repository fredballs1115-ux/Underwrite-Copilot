"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyOverride, type ReconcileResult } from "@/lib/reconcile";

/**
 * Persist a per-line precedence override — which document the user chose to
 * trust for one reconciled figure — and re-base the stored discrepancies to
 * match, so a reload shows exactly what the toggle showed (not the stale
 * server value until the next screen).
 *
 * What the override drives: this reconciliation panel, and what the challenger
 * is told about the conflict on the NEXT screen. It does NOT change the inputs
 * of the generated underwriting model. RLS scopes the read/update to deals the
 * caller can see.
 */
export async function setReconOverride(dealId: string, factKey: string, docKind: string) {
  if (!dealId || !factKey) return;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("deals")
    .select("recon_overrides, discrepancies")
    .eq("id", dealId)
    .maybeSingle();
  if (!data) return;

  const overrides = {
    ...((data.recon_overrides as Record<string, string> | null) ?? {}),
    [factKey]: docKind,
  };
  const stored = (data.discrepancies as ReconcileResult | null) ?? null;

  const update: Record<string, unknown> = { recon_overrides: overrides };
  // Re-base the stored discrepancies so the choice survives a reload.
  if (stored?.discrepancies?.length) {
    update.discrepancies = applyOverride(stored, factKey, docKind);
  }
  await supabase.from("deals").update(update).eq("id", dealId);
  revalidatePath(`/deals/${dealId}`);
}
