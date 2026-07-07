import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { readFirstSignal } from "./first-signal";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { reconcileModel } from "./reconcile";
import { checkMarket } from "./market";
import { synthesizeVerdict } from "./verdict";
import { parseModelFile } from "@/lib/model-parse";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { buyBoxLines } from "@/lib/criteria";
import { notifyAnalysisReady } from "@/lib/email";
import type {
  AssetClass,
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
} from "./types";

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
 * Re-synthesize the one-screen verdict from whatever results the deal currently
 * has stored. Called at the end of the main run and again after a reconcile, so
 * the verdict always reflects the latest evidence.
 */
async function regenerateVerdict(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
): Promise<void> {
  const { data } = await admin
    .from("deals")
    .select("extraction, challenges, comps, reconciliation, market, user_id, team_id")
    .eq("id", dealId)
    .single();

  // Fetch the buyer's standing criteria so the verdict judges fit against
  // THEIR box. Best-effort: a missing box (or pre-0008 schema) just means no
  // buy-box section in the brief.
  let buyBox: string[] | null = null;
  try {
    const box = await getBuyBoxForDeal(
      (data?.user_id as string) ?? "",
      (data?.team_id as string) ?? null,
    );
    buyBox = box ? buyBoxLines(box) : null;
  } catch {
    buyBox = null;
  }

  const verdict = await synthesizeVerdict({
    extraction: (data?.extraction as ExtractionResult) ?? null,
    challenges: (data?.challenges as ChallengerResult) ?? null,
    comps: (data?.comps as BrokerCompsResult) ?? null,
    reconciliation: (data?.reconciliation as ReconciliationResult) ?? null,
    market: (data?.market as MarketResult) ?? null,
    buyBox,
  });

  await admin
    .from("deals")
    .update({ verdict, updated_at: new Date().toISOString() })
    .eq("id", dealId);
}

/**
 * The analysis pipeline. Runs in the background (kicked off via `after()` once
 * the upload response is sent) so it never blocks the page. It updates the job
 * row as each step finishes — the deal page polls that and reveals results as
 * they land.
 *
 * The automatic pass: extract → challenge → comps → market → verdict.
 * Reconcile runs separately (it needs the buyer's own model, uploaded later —
 * see runReconciliation), and regenerates the verdict when it lands.
 */
export async function runAnalysis(
  dealId: string,
  opts?: {
    /** snapshot the previous results for the retrade diff — pass false when
     *  the last run failed, so a half-written generation is never diffed */
    snapshotPrior?: boolean;
  },
): Promise<void> {
  const snapshotPrior = opts?.snapshotPrior ?? true;
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

    // Retrade watch: on a RE-screen, snapshot the previous run's results
    // before they're overwritten, so the deal page can show what moved
    // (price cuts, cap drift, verdict flips). Best-effort — a pre-0010
    // schema without the column must never sink the run.
    if (snapshotPrior) try {
      const { data: prev } = await admin
        .from("deals")
        .select("extraction, verdict")
        .eq("id", dealId)
        .single();
      if (prev?.extraction) {
        await admin
          .from("deals")
          .update({
            prior_screen: {
              at: new Date().toISOString(),
              extraction: prev.extraction,
              verdict: prev.verdict ?? null,
            },
          })
          .eq("id", dealId);
      }
    } catch {
      // No snapshot — the screen itself proceeds regardless.
    }

    // Step 0 — first signal: the fast headline read, stored the moment it
    // lands so the deal page shows what the deal IS while the deep pass runs.
    // Best-effort: a failure here (or a pre-0009 schema without the column)
    // must never sink the real screen. This call also warms the prompt cache
    // for the OM, so extraction and the later steps read it cheaply.
    await patchJob(dealId, {
      status: "running",
      step: "signal",
      progress: 4,
      error: null,
    });
    try {
      // Clear the previous run's signal first so a re-run never shows a stale
      // headline next to fresh results if the read below fails.
      await admin.from("deals").update({ first_signal: null }).eq("id", dealId);
      const firstSignal = await readFirstSignal(pdf, assetClass);
      await admin
        .from("deals")
        .update({ first_signal: firstSignal, updated_at: new Date().toISOString() })
        .eq("id", dealId);
    } catch {
      // No signal — the pipeline continues to the full extraction regardless.
    }

    // Step 1 — extraction
    await patchJob(dealId, {
      status: "running",
      step: "extract",
      progress: 10,
      error: null,
    });
    const extraction = await extractTerms(pdf, assetClass);
    await admin
      .from("deals")
      .update({ extraction, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 2 — assumption challenger
    await patchJob(dealId, { status: "running", step: "challenge", progress: 30 });
    const challenges = await challengeAssumptions(pdf, assetClass);
    await admin
      .from("deals")
      .update({ challenges, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 3 — broker-comp scrutiny (reads the comps out of the OM itself)
    await patchJob(dealId, { status: "running", step: "comps", progress: 50 });
    const comps = await scrutinizeComps(pdf);
    await admin
      .from("deals")
      .update({ comps, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 4 — market plausibility check (rules-of-thumb, no live comps feed)
    await patchJob(dealId, { status: "running", step: "market", progress: 70 });
    const market = await checkMarket(pdf, assetClass);
    await admin
      .from("deals")
      .update({ market, updated_at: new Date().toISOString() })
      .eq("id", dealId);

    // Step 5 — verdict (synthesizes everything gathered above)
    await patchJob(dealId, { status: "running", step: "verdict", progress: 90 });
    await regenerateVerdict(admin, dealId);

    await patchJob(dealId, {
      status: "done",
      step: "verdict",
      progress: 100,
      error: null,
    });

    // Heads-up email (key-ready; silently off without RESEND_API_KEY, and
    // best-effort by design — the screen itself is already complete).
    await notifyAnalysisReady(admin, dealId);
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

    // Fold the reconciliation into the verdict so the headline reflects it.
    await patchJob(dealId, { status: "running", step: "verdict", progress: 80 });
    await regenerateVerdict(admin, dealId);

    await patchJob(dealId, {
      status: "done",
      step: "verdict",
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
