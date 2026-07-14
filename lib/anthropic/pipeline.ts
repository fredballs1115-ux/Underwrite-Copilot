import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { readFirstSignal } from "./first-signal";
import { omSourceFor, type OmSource } from "./om-source";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { scrutinizeComps } from "./comps";
import { reconcileModel } from "./reconcile";
import { checkMarket } from "./market";
import { synthesizeVerdict } from "./verdict";
import { parseModelFile } from "@/lib/model-parse";
import { countPdfPages } from "@/lib/pdf";
import { buildDealFacts, toFactRows } from "@/lib/facts";
import { runDocReconciliation } from "./reconcile-facts";
import { runActualsIngestion } from "./actuals-ingest";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
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
    .update({
      // generatedAt lets consumers (the weekly digest) know when THIS verdict
      // landed — deals.updated_at bumps on any edit and can't be trusted.
      verdict: { ...verdict, generatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
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
    /** worker mode: read the job's per-step checkpoints and skip whatever a
     *  previous interrupted attempt already finished, recording new steps as
     *  they land (migration 0016). In-process runs never pass this. */
    resume?: boolean;
  },
): Promise<void> {
  const snapshotPrior = opts?.snapshotPrior ?? true;
  const resume = opts?.resume ?? false;
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

    // Per-step checkpoints: a deploy that restarts the worker mid-screen
    // re-queues the job, and the next attempt picks up after the last
    // completed step instead of re-paying for the whole pipeline. Each step
    // is written to the deal as it finishes (that already happened before
    // this change), so "skip" just means trusting those writes. Checkpoint
    // bookkeeping is best-effort — it must never sink a run.
    let payload: Record<string, unknown> = {};
    const completed = new Set<string>();
    if (resume) {
      try {
        const { data: jobRow } = await admin
          .from("analysis_jobs")
          .select("payload")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        payload = (jobRow?.payload as Record<string, unknown>) ?? {};
        for (const s of (payload.completed as string[]) ?? []) completed.add(s);
      } catch {
        // no checkpoints — run everything
      }
    }
    const markDone = async (step: string) => {
      if (!resume) return;
      completed.add(step);
      try {
        await admin
          .from("analysis_jobs")
          .update({ payload: { ...payload, completed: [...completed] } })
          .eq("deal_id", dealId);
      } catch {
        // checkpointing is an optimization, never a failure
      }
    };

    // The OM is only needed by the document-reading steps. A run resumed at
    // the verdict (everything else checkpointed) skips the whole download —
    // re-paying a 20MB Storage read just to ignore it would defeat the
    // point of the checkpoints.
    const pdfSteps = ["signal", "extract", "challenge", "comps", "market"];
    const pdf = pdfSteps.some((s) => !completed.has(s))
      ? await downloadOmPdf(deal.om_storage_path as string)
      : null;
    // Inline for anything the request cap carries; one Files-API upload for
    // larger OMs, which every step then references by id (a resumed run
    // re-uploads — one extra upload, never a stale reference).
    const omSource = pdf ? await omSourceFor(pdf) : null;
    // Every use sits inside a `!completed.has(<pdf step>)` guard, so the
    // download above must have run; this just makes that invariant loud.
    const om = (): OmSource => {
      if (!omSource) throw new Error("OM was not loaded for a document step.");
      return omSource;
    };

    // Retrade watch: on a RE-screen, snapshot the previous run's results
    // before they're overwritten, so the deal page can show what moved
    // (price cuts, cap drift, verdict flips). Best-effort — a pre-0010
    // schema without the column must never sink the run. On a RESUMED
    // attempt the snapshot already happened (and the columns now hold a
    // half-new generation), so never re-snapshot.
    if (snapshotPrior && completed.size === 0) try {
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
    if (!completed.has("signal")) {
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
        const firstSignal = await readFirstSignal(om(), assetClass);
        await admin
          .from("deals")
          .update({ first_signal: firstSignal, updated_at: new Date().toISOString() })
          .eq("id", dealId);
      } catch {
        // No signal — the pipeline continues to the full extraction regardless.
      }
      await markDone("signal");
    }

    // Step 1 — extraction
    if (!completed.has("extract")) {
      await patchJob(dealId, {
        status: "running",
        step: "extract",
        progress: 10,
        error: null,
      });
      const extraction = await extractTerms(om(), assetClass);
      await admin
        .from("deals")
        .update({ extraction, updated_at: new Date().toISOString() })
        .eq("id", dealId);

      // Citation-level provenance (migration 0018): store one deal_facts row
      // per extracted figure, with its page VALIDATED against the OM's real
      // length (a page beyond the document is recorded "source not located",
      // never shown). Best-effort — a pre-0018 schema or a write failure must
      // never sink the screen.
      try {
        // Prefer the model's own page count (it read the native PDF — robust
        // to object-stream / bookmarked PDFs the byte counter mis-reads); fall
        // back to the fail-safe byte counter only when the model didn't report.
        const pageCount =
          extraction.totalPages && extraction.totalPages > 0
            ? extraction.totalPages
            : pdf
              ? countPdfPages(pdf)
              : 0;
        const facts = buildDealFacts(extraction.metrics, pageCount);
        await admin.from("deal_facts").delete().eq("deal_id", dealId);
        const rows = toFactRows(dealId, facts);
        if (rows.length) await admin.from("deal_facts").insert(rows);
      } catch {
        // no facts table yet, or a transient write error — carry on.
      }

      await markDone("extract");
    }

    // Step 1b — multi-document reconciliation (best-effort). Compares the OM
    // against any rent roll / T-12 / financials and stores the deal's
    // discrepancies for the panel. Runs before the challenger so the skeptic
    // can reference red flags; a no-op (and never a failure) when the deal has
    // only the OM or the reconciliation table isn't there yet.
    if (!completed.has("reconcile_docs")) {
      try {
        await runDocReconciliation(admin, dealId);
      } catch {
        // reconciliation is additive — never let it sink the screen
      }
      await markDone("reconcile_docs");
    }

    // Property actuals (Feature 1): structured rent-roll / T-12 ingestion,
    // stored for the PROPERTY ACTUALS card and the model. Additive and
    // best-effort — a bad statement never sinks the screen.
    if (!completed.has("ingest_actuals")) {
      try {
        await runActualsIngestion(admin, dealId);
      } catch {
        // never let actuals ingestion sink the screen
      }
      await markDone("ingest_actuals");
    }

    // Step 2 — assumption challenger
    if (!completed.has("challenge")) {
      await patchJob(dealId, { status: "running", step: "challenge", progress: 30 });
      // Feed the reconciliation red flags to the skeptic so it puts concrete
      // OM-vs-rent-roll / OM-vs-T-12 discrepancies to the broker.
      let reconNote: string | undefined;
      try {
        const { data: dr } = await admin
          .from("deals")
          .select("discrepancies, extraction")
          .eq("id", dealId)
          .single();
        const disc = (dr?.discrepancies as {
          discrepancies?: {
            label: string;
            severity: string;
            values: { docLabel: string; value: string }[];
          }[];
        } | null)?.discrepancies ?? [];
        const flagged = disc.filter((d) => d.severity !== "minor").slice(0, 6);
        const notes: string[] = [];

        // Feature 1: the OM-assumed vs T-12-actual NOI gap is the skeptic's
        // first-order fact — a material (>5%) or red-flag (>10%) delta means
        // the deck's income story isn't what the property produced.
        try {
          const { data: t12Row } = await admin
            .from("deal_t12_statements")
            .select("summary")
            .eq("deal_id", dealId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const t12Noi = (t12Row?.summary as { noi?: number | null } | null)?.noi;
          const exMetrics =
            (dr?.extraction as { metrics?: { label: string; value: string }[] } | null)
              ?.metrics ?? [];
          // Same shared picker as the actuals card — the note and the card
          // must reference the same OM figure.
          const omNoi = pickOmNoi(exMetrics)?.noi ?? null;
          if (omNoi != null && t12Noi != null && Number.isFinite(t12Noi) && t12Noi !== 0) {
            const cmp = compareNoi(omNoi, t12Noi);
            if (cmp.severity !== "in_line") {
              notes.push(
                `The OM's assumed NOI ($${Math.round(omNoi).toLocaleString("en-US")}) runs ${(Math.abs(cmp.deltaPct) * 100).toFixed(1)}% ${cmp.direction} the T-12 actual ($${Math.round(t12Noi).toLocaleString("en-US")}) — a ${cmp.severity === "red_flag" ? "red-flag" : "material"} gap between the deck's story and what the property produced.`,
              );
            }
          }
        } catch {
          // no T-12 stored (or pre-0020 schema) — skip the comparison
        }

        if (flagged.length) {
          notes.push(
            "Cross-document reconciliation flagged these conflicts: " +
              flagged
                .map(
                  (f) =>
                    `${f.label} (${f.values.map((v) => `${v.docLabel}: ${v.value}`).join(" vs ")})`,
                )
                .join("; ") +
              ".",
          );
        }
        if (notes.length) reconNote = notes.join(" ");
      } catch {
        // no discrepancies stored — the challenger runs on the OM alone
      }
      const challenges = await challengeAssumptions(om(), assetClass, reconNote);
      await admin
        .from("deals")
        .update({ challenges, updated_at: new Date().toISOString() })
        .eq("id", dealId);
      await markDone("challenge");
    }

    // Step 3 — broker-comp scrutiny (reads the comps out of the OM itself)
    if (!completed.has("comps")) {
      await patchJob(dealId, { status: "running", step: "comps", progress: 50 });
      const comps = await scrutinizeComps(om());
      await admin
        .from("deals")
        .update({ comps, updated_at: new Date().toISOString() })
        .eq("id", dealId);
      await markDone("comps");
    }

    // Step 4 — market plausibility check (rules-of-thumb, no live comps feed)
    if (!completed.has("market")) {
      await patchJob(dealId, { status: "running", step: "market", progress: 70 });
      const market = await checkMarket(om(), assetClass);
      await admin
        .from("deals")
        .update({ market, updated_at: new Date().toISOString() })
        .eq("id", dealId);
      await markDone("market");
    }

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
    const reconciliation = await reconcileModel(await omSourceFor(omPdf), parsed);

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
