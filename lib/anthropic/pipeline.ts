import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { reconcileModel } from "./reconcile";
import { parseModelFile } from "@/lib/model-parse";
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
 * the upload response is sent) so it never blocks the page. It updates the job
 * row as each step finishes — the deal page polls that and reveals results as
 * they land.
 *
 * Phases so far: extract → challenge → comps. Reconcile runs separately (it
 * needs the buyer's own model, uploaded later — see runReconciliation). Phases
 * 6–7 append market → verdict into this same pass.
 */
export async function runAnalysis(dealId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, asset_class, om_storage_path")
      .eq("id", dealId)
      .single();

    if (error || !deal) throw new Error("Deal not found.");
    if (!deal.om_storage_path) {
      throw new Error("No OM file is attached to this deal.");
    }

    const assetClass = (deal.asset_class as AssetClass) ?? "auto";
    const pdf = await downloadOmPdf(deal.om_storage_path as string);

    // Step 1 — extraction
    await patchJob(dealId, {
      status: "running",
      step: "extract",
      progress: 12,
      error: null,
    });
    const extraction = await extractTerms(pdf, assetClass);
    await admin
      .from("deals")
      .update({ extraction, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 2 — assumption challenger
    await patchJob(dealId, { status: "running", step: "challenge", progress: 42 });
    const challenges = await challengeAssumptions(pdf, assetClass);
    await admin
      .from("deals")
      .update({ challenges, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 3 — broker-comp scrutiny (reads the comps out of the OM itself)
    await patchJob(dealId, { status: "running", step: "comps", progress: 72 });
    const comps = await scrutinizeComps(pdf);
    await admin
      .from("deals")
      .update({ comps, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    await patchJob(dealId, {
      status: "done",
      step: "comps",
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

/**
 * Reconcile the OM against the buyer's own underwriting model. Unlike the main
 * pipeline this is user-initiated (it needs a model file), so it runs on its
 * own via `after()` and reuses the same job row to drive the progress UI. The
 * raw model isn't persisted — only the reconciliation result is.
 */
export async function runReconciliation(
  dealId: string,
  model: { name: string; buffer: Buffer },
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, om_storage_path")
      .eq("id", dealId)
      .single();

    if (error || !deal) throw new Error("Deal not found.");
    if (!deal.om_storage_path) {
      throw new Error("No OM file is attached to this deal.");
    }

    await patchJob(dealId, {
      status: "running",
      step: "reconcile",
      progress: 35,
      error: null,
    });

    const omPdf = await downloadOmPdf(deal.om_storage_path as string);
    const parsed = await parseModelFile(model.name, model.buffer);
    const reconciliation = await reconcileModel(omPdf, parsed);

    await admin
      .from("deals")
      .update({ reconciliation, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    await patchJob(dealId, {
      status: "done",
      step: "reconcile",
      progress: 100,
      error: null,
    });
  } catch (err) {
    await patchJob(dealId, {
      status: "error",
      error: err instanceof Error ? err.message : "Reconciliation failed.",
    });
  }
}
