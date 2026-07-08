"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persist a per-line precedence override — which document the user chose to
 * trust for one reconciled figure. RLS scopes the update to deals the caller
 * can see. The stored override feeds the next model generation; the panel
 * updates its display immediately on the client.
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
    .select("recon_overrides")
    .eq("id", dealId)
    .maybeSingle();
  if (!data) return;

  const overrides = {
    ...((data.recon_overrides as Record<string, string> | null) ?? {}),
    [factKey]: docKind,
  };
  await supabase.from("deals").update({ recon_overrides: overrides }).eq("id", dealId);
  revalidatePath(`/deals/${dealId}`);
}
