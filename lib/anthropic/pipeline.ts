import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { extractTerms } from "./extract";
import type { AssetClass } from "./types";

type JobPatch = {
  status?: string;
  step?: string | null;
  progress?: number;
  error?: string | null;
};

async function patchJob(dealId: string, patch: JobPatch): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("analysis_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("deal_id", dealId);
}

/**
 * The analysis pipeline. Runs in the background (kicked off via `after()` once
 * the upload response is sent) so it never blocks the page. It updates the
 * job row as it goes, which the deal page polls for live progress.
 *
 * Phase 2 wires the first step (extraction). Phases 3–6 append the remaining
 * steps (challenge → comps → reconcile → market → verdict) into this same pass.
 */
export async function runAnalysis(dealId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  try {
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, asset_class, om_storage_path")
      .eq("id", dealId)
      .single();

    if (error || !deal) throw new Error("Deal not found.");
    if (!deal.om_storage_path) {
      throw new Error("No OM file is attached to this deal.");
    }

    await patchJob(dealId, {
      status: "running",
      step: "extract",
      progress: 15,
      error: null,
    });

    const pdf = await downloadOmPdf(deal.om_storage_path as string);
    const extraction = await extractTerms(
      pdf,
      (deal.asset_class as AssetClass) ?? "auto",
    );

    await admin
      .from("deals")
      .update({ extraction, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    await patchJob(dealId, {
      status: "done",
      step: "extract",
      progress: 100,
      error: null,
    });
  } catch (err) {
    await patchJob(dealId, {
      status: "error",
      error: err instanceof Error ? err.message : "Analysis failed.",
    });
  }
}
