import "server-only";
import { withArticle } from "@/lib/article";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { readFirstSignal } from "./first-signal";
import { describeRunFailure, ScreenError } from "./failure";
import { RunGate, concurrencyFromEnv } from "./run-gate";
import { newLedger, summarizeUsage, usageLogLine, withUsageLedger, type UsageLedger } from "./usage";
import { omSourceFor, omFromText, releaseOmSource, type OmSource } from "./om-source";
import {
  manualFactSheet,
  firstSignalFromExtraction,
  manualCompsStub,
} from "@/lib/manual-deal";
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
import { OM_NOI_BASIS_LABEL, compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import {
  askingPriceOf,
  assessPlausibility,
  inferStrategy,
  isPlanDeal,
  noiFigures,
  planSummary,
  plausibilityNote,
} from "@/lib/deal-strategy";
import { dealContextFor } from "@/lib/deal-context";
import { interestNote, readInterest } from "@/lib/interest";
import { assumableNote, readAssumable } from "@/lib/assumable-debt";
import { otherPortfolioMarkets, portfolioFor, portfolioNote, readPortfolio } from "@/lib/portfolio";
import { parseStructuredAddress, type StructuredAddress } from "@/lib/address";
import { marketForAddress } from "@/lib/market-match";
import { SERIES, metroSeriesFor, readMetroRates, readRates } from "@/lib/live-rates";
import { fetchBenchRows, fetchSeriesRows } from "@/lib/live-rates-query";
import { ZILLOW_METRICS, zoriFor } from "@/lib/zori";
import { REALTOR_METRICS, realtorFor } from "@/lib/realtor";
import { BRIEF_NATIONAL_IDS, liveMarketBrief, type LiveMarketBrief } from "@/lib/live-market-brief";
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

/**
 * What a text-layer read failed to find, or null when it read the deck:
 * no figures at all, or figures but no NOI of any kind — the shape of a
 * deck whose financial tables were pasted in as pictures under a text
 * narrative. Either sends the extraction back to the pages.
 */
export function textLayerMissed(x: ExtractionResult): "no figures" | "no NOI" | null {
  const metrics = x.metrics ?? [];
  if (metrics.length === 0) return "no figures";
  return noiFigures(metrics).length === 0 ? "no NOI" : null;
}

async function patchJob(dealId: string, patch: JobPatch): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analysis_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("deal_id", dealId)
    .select("id");
  if (error) {
    // A transient write failure never sinks the run — the next boundary
    // writes again. Loud, though: a silent miss is what hid the case below.
    console.error(`[pipeline] job update failed for deal ${dealId}: ${error.message}`);
    return;
  }
  // No row at all: the deal was deleted mid-run (its jobs cascade with it).
  // Every later step would spend tokens on a deal nobody can see — the
  // throw stops the pipeline at this step boundary.
  if (!data || data.length === 0) {
    throw new ScreenError("This deal was deleted while its screen was running.");
  }
}

// In-process runs wrote the job row only at step boundaries. A slow step —
// the SDK retries a 529 twice with backoff inside one call, so one step can
// run past ten minutes — let the row go stale with the run still alive, and
// the stall banner's "Start it again" then ran a SECOND pipeline on the same
// deal (double spend, interleaved results). The worker heartbeats its row;
// the in-process path now does too. Env-overridable for the test rig.
function heartbeatMs(): number {
  const n = Number(process.env.ANALYSIS_HEARTBEAT_MS);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

// One web process runs at most ANALYSIS_CONCURRENCY screens at a time (see
// run-gate.ts): a batch upload used to start four pipelines at once, each
// holding a 20MB OM and its 27MB base64 request body. The claim is taken
// before the wait and heartbeats through it, so a queued run never reads as
// stalled and never invites a second pipeline on the same deal.
const runGate = new RunGate(concurrencyFromEnv);

// The provider reads a PDF of up to about 600 pages in one request; a longer
// deck came back as a raw 400. The byte counter (lib/pdf.ts) only ever
// UNDER-counts, so a count past the cap is certain, never a false alarm.
const MAX_OM_PAGES = 600;

/** Keep the job row fresh while a run is alive; returns the stop function. */
function startHeartbeat(dealId: string): () => void {
  const timer = setInterval(() => {
    patchJob(dealId, {}).catch(() => {
      // a deleted deal stops the run at its next step boundary
    });
  }, heartbeatMs());
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * What the screen established about the deal — its kind and, on a plan deal,
 * the plan's figures — for the steps that read the OM after the extraction.
 * Best-effort: with no extraction stored, the step runs on the OM alone.
 */
async function dealContextFromDb(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
): Promise<string | null> {
  try {
    const { data } = await admin.from("deals").select("extraction").eq("id", dealId).single();
    return dealContextFor((data?.extraction as ExtractionResult | null) ?? null);
  } catch {
    return null;
  }
}

/**
 * The metro's published figures for the market check, where the deal's
 * address sits in a covered market (lib/live-market-brief): the same rows
 * the market brief draws for a visitor, read bare — one screen reads them
 * once, from the web process or the worker, and the worker has no Next
 * cache to wrap them in — and written out dated and sourced. Null outside
 * the covered markets, or when nothing fresh could be read: the check then
 * reasons from typical ranges alone, as it always did, and says so. A read
 * that fails is a check without figures, never a failed screen.
 *
 * A portfolio across markets (#413) reads each OTHER market's own figures
 * too (lib/portfolio's `otherPortfolioMarkets`: most properties first, at
 * most `MAX_OTHER_MARKETS`), one block a market whose header names how
 * many of the properties sit there — never the portfolio's figure, never
 * those properties' own. The national lines ride in the first block alone:
 * the address's market where it has one, else the first of the others.
 */
interface LiveMarketRead {
  /** the market the deal's address sits in — what the page's since-this-
   *  screen reads against — or null where it names none or read nothing */
  primary: LiveMarketBrief | null;
  /** a portfolio's other markets, in the order read */
  others: LiveMarketBrief[];
}

async function liveMarketFromDb(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  now: Date = new Date(),
): Promise<LiveMarketRead> {
  try {
    const { data } = await admin
      .from("deals")
      .select("address, asset_class, extraction")
      .eq("id", dealId)
      .single();
    // The column holds the structured object the deal form saved (the deals
    // list and the compare page read it the same way); a row that still
    // carries the form's JSON string is parsed the form's way.
    const raw = data?.address;
    const address: Partial<StructuredAddress> | null =
      raw && typeof raw === "object"
        ? (raw as Partial<StructuredAddress>)
        : typeof raw === "string"
          ? parseStructuredAddress(raw)
          : null;
    // A covered metro's figures where the address sits in one; the state's
    // own otherwise (lib/market-match's stateForAddress — the same series
    // table, filed under `state:PA`), said as the state's. A deal with no
    // readable state reads nothing of its own, as before.
    const metro = marketForAddress(address ?? {});
    // The debt-market lines read the class the deck turned out to be, and
    // whether the deal is a plan, so the lending-standards series is the
    // one a bank reports for this kind of loan.
    const ex = (data?.extraction as ExtractionResult | null) ?? null;
    const assetClass = ex?.assetClass || (data?.asset_class as string | null) || null;
    const plan = isPlanDeal(inferStrategy(ex).kind);
    const others = otherPortfolioMarkets(ex, metro?.id ?? null);
    if (!metro && !others) return { primary: null, others: [] };
    const nationalRows = await fetchSeriesRows(admin, SERIES.filter((s) => BRIEF_NATIONAL_IDS.includes(s.id)));
    const national = readRates(nationalRows, now);
    const readMarket = async (
      market: { id: string; name: string },
      withNational: boolean,
      portfolio: Parameters<typeof liveMarketBrief>[0]["portfolio"],
    ): Promise<LiveMarketBrief | null> => {
      const [rateRows, bench] = await Promise.all([
        fetchSeriesRows(admin, metroSeriesFor(market.id).series),
        fetchBenchRows(admin, market.name, [...ZILLOW_METRICS, ...REALTOR_METRICS]),
      ]);
      return liveMarketBrief({
        metro: market,
        rates: readMetroRates(market.id, rateRows, now),
        zori: zoriFor(bench, market.name),
        realtor: realtorFor(bench, market.name),
        now,
        national: withNational ? national : undefined,
        assetClass,
        portfolio,
        plan,
      });
    };
    const whole = portfolioFor(ex, metro?.id ?? "");
    // The other markets are read FIRST, so the address's header names only
    // the blocks that actually follow: a market with nothing fresh is
    // counted with the ones past the cap, never promised.
    const read: LiveMarketBrief[] = [];
    for (const m of others?.read ?? []) {
      if (!whole) break;
      // One market at a time: each is a round of one-query-a-series reads,
      // and a portfolio's blocks are a handful at most. The national lines
      // ride in the address's block; with no address market they ride in
      // the first other block that reads anything.
      const b = await readMarket({ id: m.id, name: m.name }, !metro && read.length === 0, { ...whole, here: m.properties, role: "other" });
      if (b) read.push(b);
    }
    const unread = (others?.read.length ?? 0) - read.length + (others?.notRead ?? 0);
    const primary = metro
      ? await readMarket(metro, true, whole ? { ...whole, othersRead: read.map((b) => b.metro), notRead: unread } : null)
      : null;
    return { primary, others: read };
  } catch (err) {
    console.warn(`[pipeline] live market figures unavailable for deal ${dealId}:`, err instanceof Error ? err.message : err);
    return { primary: null, others: [] };
  }
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
/**
 * What the run spent, written to its job row when it ends — on success and
 * on failure alike, since a failed screen still paid for its steps — and
 * said once in the log. Best-effort: a deployment without the column
 * (migration 0035) or a deal deleted under the run records nothing.
 */
async function writeUsage(dealId: string, ledger: UsageLedger): Promise<void> {
  if (ledger.calls.length === 0) return;
  const summary = summarizeUsage(ledger);
  console.log(usageLogLine(dealId, summary));
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("analysis_jobs").update({ usage: summary }).eq("deal_id", dealId);
  } catch {
    // the ledger is telemetry — never a reason to fail a finished screen
  }
}

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
  // Every model call inside the run records its meters into this ledger.
  const ledger = newLedger();
  try {
    await withUsageLedger(ledger, () => runAnalysisSteps(dealId, opts));
  } finally {
    await writeUsage(dealId, ledger);
  }
}

async function runAnalysisSteps(
  dealId: string,
  opts?: { snapshotPrior?: boolean; resume?: boolean },
): Promise<void> {
  const snapshotPrior = opts?.snapshotPrior ?? true;
  const resume = opts?.resume ?? false;
  // The OM's transport for this run — released in `finally` when it is a
  // Files-API object, so a large OM never leaves an orphaned upload behind.
  let omSource: OmSource | null = null;
  let releaseSlot: (() => void) | null = null;
  const stopHeartbeat = startHeartbeat(dealId);
  try {
    releaseSlot = await runGate.acquire();
    const admin = createSupabaseAdminClient();
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, name, asset_class, om_storage_path, extraction")
      .eq("id", dealId)
      .single();

    if (error || !deal) throw new Error("Deal not found.");
    // Manual deals have no OM — the stored extraction (the buyer's typed
    // facts) is the source, and a synthesized fact sheet stands in for the
    // document. No extraction either means there's nothing to screen.
    const manualExtraction = !deal.om_storage_path
      ? ((deal.extraction as ExtractionResult | null) ?? null)
      : null;
    const manual = manualExtraction != null;
    if (!deal.om_storage_path && !manual) {
      throw new Error(
        "No OM file is attached to this deal — upload one, or enter the deal's facts by hand.",
      );
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
    // A previous attempt that fell back from the text layer to the pages
    // said so in the payload; this attempt then reads the pages from the
    // start, rather than the layer that attempt already found wanting.
    let pagesRead = false;
    if (resume) {
      try {
        const { data: jobRow, error: jobErr } = await admin
          .from("analysis_jobs")
          .select("payload")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        // supabase-js reports a failed read in `error`, never by throwing —
        // an unread payload means "no checkpoints", not an empty payload.
        if (jobErr) throw jobErr;
        payload = (jobRow?.payload as Record<string, unknown>) ?? {};
        for (const s of (payload.completed as string[]) ?? []) completed.add(s);
        pagesRead = payload.omPages === true;
      } catch {
        // no checkpoints — run everything
      }
    }
    const writeCheckpoint = async () => {
      if (!resume) return;
      try {
        // The handoff contract rides along: a checkpoint written from an
        // unread payload must still say what kind of job this row is, or a
        // re-queued attempt fails it as "unrecognized type".
        await admin
          .from("analysis_jobs")
          .update({
            payload: { ...payload, kind: payload.kind ?? "screen", completed: [...completed] },
          })
          .eq("deal_id", dealId);
      } catch {
        // checkpointing is an optimization, never a failure
      }
    };
    const markDone = async (step: string) => {
      if (!resume) return;
      completed.add(step);
      await writeCheckpoint();
    };

    // The OM is only needed by the document-reading steps. A run resumed at
    // the verdict (everything else checkpointed) skips the whole download —
    // re-paying a 20MB Storage read just to ignore it would defeat the
    // point of the checkpoints. Manual deals never download: their document
    // is the fact sheet synthesized from the typed facts.
    const pdfSteps = ["signal", "extract", "challenge", "comps", "market"];
    const needsDoc = pdfSteps.some((s) => !completed.has(s));
    const pdf =
      needsDoc && !manual
        ? await downloadOmPdf(deal.om_storage_path as string, { kind: "deal", dealId })
        : null;
    if (pdf) {
      const pages = countPdfPages(pdf);
      if (pages != null && pages > MAX_OM_PAGES) {
        throw new ScreenError(
          `This OM runs ${pages.toLocaleString("en-US")} pages — the analysis service reads up to about ${MAX_OM_PAGES} in one pass. Split off the financial sections and upload those.`,
        );
      }
    }
    // Inline for anything the request cap carries; one Files-API upload for
    // larger OMs, which every step then references by id (a resumed run
    // re-uploads — one extra upload, never a stale reference).
    // The OM goes text first: its own text layer, page-tagged, when dense
    // enough to stand in for the pages (a fraction of the tokens on every
    // step below); the PDF itself otherwise, or when an earlier attempt of
    // this run already had to fall back to it. `OM_READ` overrides.
    omSource = manualExtraction
      ? needsDoc
        ? omFromText(manualFactSheet(manualExtraction, (deal.name as string) ?? "Deal"))
        : null
      : pdf
        ? await omSourceFor(pdf, "om.pdf", { textFirst: !pagesRead })
        : null;
    // Every use sits inside a `!completed.has(<pdf step>)` guard, so the
    // source above must have been built; this just makes that invariant loud.
    const om = (): OmSource => {
      if (!omSource) throw new Error("OM was not loaded for a document step.");
      return omSource;
    };

    // Retrade watch: on a RE-screen, snapshot the previous run's results
    // before they're overwritten, so the deal page can show what moved
    // (price cuts, cap drift, verdict flips). Best-effort — a pre-0010
    // schema without the column must never sink the run. On a RESUMED
    // attempt the snapshot already happened (and the columns now hold a
    // half-new generation), so never re-snapshot. Manual deals skip this:
    // their extraction exists BEFORE any screen (it's the typed facts, and
    // this run never rewrites it), so a run-time snapshot would just diff
    // the deal against itself — the edit-facts action snapshots the OLD
    // facts instead, where a real before/after exists.
    if (snapshotPrior && completed.size === 0 && !manual) try {
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
    // for the OM, so extraction and the later steps read it cheaply. Manual
    // deals derive the signal from the typed facts — no model call.
    if (!completed.has("signal")) {
      await patchJob(dealId, {
        status: "running",
        step: "signal",
        progress: 4,
        error: null,
      });
      try {
        // The previous run's signal stays until the new one lands: clearing
        // it first meant a read that failed here took the headline with it,
        // and the full extraction supersedes the signal moments later anyway.
        const firstSignal = manualExtraction
          ? firstSignalFromExtraction(manualExtraction)
          : await readFirstSignal(om(), assetClass);
        await admin
          .from("deals")
          .update({ first_signal: firstSignal, updated_at: new Date().toISOString() })
          .eq("id", dealId);
      } catch {
        // No signal — the pipeline continues to the full extraction regardless.
      }
      await markDone("signal");
    }

    // Step 1 — extraction. A manual deal's extraction IS the typed facts,
    // already stored at create/edit time — nothing to extract from.
    if (!completed.has("extract") && !manual) {
      await patchJob(dealId, {
        status: "running",
        step: "extract",
        progress: 10,
        error: null,
      });
      let extraction = await extractTerms(om(), assetClass);
      // A text layer can be dense and still not be the deck — OCR noise, a
      // layer of captions under the pictures that hold the figures, a
      // narrative whose financial tables were pasted in as images — and
      // then the read finds nothing, or everything but the money. Before
      // giving up (or proceeding on a deck whose financials it never saw),
      // read the pages themselves once; the PDF is right here, every later
      // step then reads the pages too, and the checkpoint payload remembers,
      // so an attempt resumed after a restart reads the pages from the start.
      const missed = textLayerMissed(extraction);
      if (missed && omSource?.kind === "pages" && pdf) {
        console.log(`[pipeline] the text layer of deal ${dealId} read to ${missed} — re-reading the pages`);
        omSource = await omSourceFor(pdf, "om.pdf", { textFirst: false });
        payload.omPages = true;
        await writeCheckpoint();
        extraction = await extractTerms(om(), assetClass);
      }
      // A scan, a password-protected file or an empty deck yields a
      // schema-valid extraction with no figures at all. Stored, it flowed to
      // a Caution verdict on a document the product never read — stop here.
      if (extraction.metrics.length === 0) {
        throw new ScreenError(
          "We couldn't read any figures out of this PDF — it may be a scan or password-protected. Try a text-based PDF.",
        );
      }
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
        // The text layer's page count is exact (pdfjs walked the pages).
        // Otherwise prefer the model's own count (it read the native PDF —
        // robust to object-stream / bookmarked PDFs the byte counter
        // mis-reads), and fall back to the fail-safe byte counter only when
        // the model didn't report.
        const pageCount =
          omSource?.kind === "pages"
            ? omSource.pages
            : extraction.totalPages && extraction.totalPages > 0
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
    if (manual) await markDone("extract");

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

        // The deal's kind first: it decides which OM figure the T-12 is held
        // against and how the plan's figures are read below.
        const ex = (dr?.extraction as ExtractionResult | null) ?? null;
        const strategy = inferStrategy(ex);

        // Feature 1: the OM-assumed vs T-12-actual NOI gap is the skeptic's
        // first-order fact — a material (>5%) or red-flag (>10%) delta means
        // the deck's income story isn't what the property produced. On a
        // plan deal the figure tested is the OM's in-place or Year-1 NOI;
        // the stabilized pro forma is the finished project's and is judged
        // on yield on cost, never against today's actuals.
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
          const omPick = pickOmNoi(exMetrics, strategy.kind);
          const omNoi = omPick?.noi ?? null;
          const t12Usable = t12Noi != null && Number.isFinite(t12Noi) && t12Noi !== 0;
          if (omPick && omNoi != null && t12Usable) {
            const cmp = compareNoi(omNoi, t12Noi, omPick);
            if (cmp.severity !== "in_line") {
              notes.push(
                `The OM's ${OM_NOI_BASIS_LABEL[omPick.basis]} ($${Math.round(omNoi).toLocaleString("en-US")}) runs ${(Math.abs(cmp.deltaPct) * 100).toFixed(1)}% ${cmp.direction} the T-12 actual ($${Math.round(t12Noi).toLocaleString("en-US")}) — ${withArticle(cmp.severity === "red_flag" ? "red-flag" : "material")} gap between the deck's story and what the property produced.`,
              );
            }
          } else if (!omPick && t12Usable && isPlanDeal(strategy.kind)) {
            // A plan deal whose OM states only the finished project's NOI:
            // the T-12 describes the building as it stands, and nothing in
            // the deck claims what it earns today.
            notes.push(
              `The T-12 shows the building earns $${Math.round(t12Noi).toLocaleString("en-US")} today, and the OM states only the finished project's NOI — nothing in the deck claims what the asset produces as bought. Ask for the in-place figure; the stabilized pro forma is judged on yield on cost, not against today's actuals.`,
            );
          }
        } catch {
          // no T-12 stored (or pre-0020 schema) — skip the comparison
        }

        // The deal's strategy, the plan's stated figures (stabilized NOI,
        // budget, total cost, yield on cost, timeline) and any figures that
        // cannot all be true at once — checked in code, so the skeptic tests
        // whether the plan's pro forma is as conservative as the deck says,
        // and grills a misread as a misread, rather than reading either as
        // a 105% cap rate.
        const plausibility = plausibilityNote(
          assessPlausibility(ex, strategy),
          strategy,
          planSummary(ex, strategy),
        );
        if (plausibility) notes.push(plausibility);

        // A portfolio: what the extraction established about the properties
        // (the markets, the income's concentration, the allocation against
        // the ask) and the portfolio traps by name — lib/portfolio.
        const portfolio = readPortfolio(ex);
        if (portfolio) notes.push(portfolioNote(portfolio));

        // What is being sold (#414): a note, a share, a leasehold — the
        // interest's own traps by name, ahead of everything the challenger
        // reads the figures through (lib/interest).
        const interest = readInterest(ex, askingPriceOf(ex));
        if (interest) notes.unshift(interestNote(interest));

        // The seller's loan offered for assumption (#417): its terms and the
        // assumable-debt traps by name.
        const assumable = readAssumable(ex, null);
        if (assumable) notes.push(assumableNote(assumable));

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

    // Step 3 — broker-comp scrutiny (reads the comps out of the OM itself).
    // A manual deal has no OM comp set — store the explanatory stub so the
    // comps tab hands over to own-comps / public-web search instead.
    // The comp scrutiny and the market check are told what the screen
    // established — the deal's kind and, on a plan deal, the plan's figures —
    // so a conversion's comps are held against total cost, not the shell.
    const dealContext =
      !completed.has("comps") || !completed.has("market")
        ? await dealContextFromDb(admin, dealId)
        : null;
    if (!completed.has("comps")) {
      await patchJob(dealId, { status: "running", step: "comps", progress: 50 });
      const comps = manual ? manualCompsStub() : await scrutinizeComps(om(), dealContext);
      await admin
        .from("deals")
        .update({ comps, updated_at: new Date().toISOString() })
        .eq("id", dealId);
      await markDone("comps");
    }

    // Step 4 — market plausibility check: rules of thumb, no live comps feed,
    // and — where the deal sits in a covered market — the metro's own
    // published figures, dated, handed in and stored with the result so the
    // page can say what the check read.
    if (!completed.has("market")) {
      await patchJob(dealId, { status: "running", step: "market", progress: 70 });
      const { primary, others } = await liveMarketFromDb(admin, dealId);
      // One block a market, the address's first: a portfolio's other
      // markets follow in blocks of their own (#413).
      const handed = [primary, ...others].filter((b): b is LiveMarketBrief => !!b).map((b) => b.text);
      const checked = await checkMarket(om(), assetClass, dealContext, handed.length > 0 ? handed.join("\n\n") : null);
      const record = (b: LiveMarketBrief) => ({
        metro: b.metro,
        grain: b.grain,
        readOn: b.readOn,
        lines: b.lines,
        figures: b.figures,
        ...(b.national > 0 ? { national: b.national } : {}),
        ...(b.portfolio ? { portfolio: b.portfolio } : {}),
      });
      const market: MarketResult = {
        ...checked,
        liveBrief: primary ? record(primary) : null,
        ...(others.length > 0 ? { otherBriefs: others.map(record) } : {}),
      };
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
    // One sentence the analyst can act on; the raw failure goes to the log.
    const failure = describeRunFailure(err);
    console.error(`[pipeline] screen failed for deal ${dealId}: ${failure.detail}`);
    await patchJob(dealId, { status: "error", error: failure.message }).catch(() => {
      // the deal (and its job row) is gone — nothing left to tell
    });
  } finally {
    releaseSlot?.();
    stopHeartbeat();
    await releaseOmSource(omSource);
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
  // The reconciler re-reads the whole OM (a fresh cache write — it runs on
  // its own, outside the screen's cache window), so its spend is said in
  // the log; the job row's ledger stays the screen's.
  const ledger = newLedger();
  try {
    await withUsageLedger(ledger, () => runReconciliationSteps(dealId, model));
  } finally {
    if (ledger.calls.length) console.log(usageLogLine(dealId, summarizeUsage(ledger)).replace("screen usage", "reconciliation usage"));
  }
}

async function runReconciliationSteps(
  dealId: string,
  model: { name: string; buffer: Buffer },
): Promise<void> {
  let omSource: OmSource | null = null;
  let releaseSlot: (() => void) | null = null;
  const stopHeartbeat = startHeartbeat(dealId);
  try {
    releaseSlot = await runGate.acquire();
    const admin = createSupabaseAdminClient();
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, om_storage_path, extraction")
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

    const omPdf = await downloadOmPdf(deal.om_storage_path as string, { kind: "deal", dealId });
    const parsed = await parseModelFile(model.name, model.buffer);
    omSource = await omSourceFor(omPdf);
    // The reconciler is told the deal's kind, so a buyer's model that carries
    // construction and downtime is compared to the OM on the plan's terms.
    const reconciliation = await reconcileModel(
      omSource,
      parsed,
      dealContextFor((deal.extraction as ExtractionResult | null) ?? null),
    );

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
    const failure = describeRunFailure(err);
    console.error(`[pipeline] reconcile failed for deal ${dealId}: ${failure.detail}`);
    await patchJob(dealId, { status: "error", error: failure.message }).catch(() => {
      // the deal is gone — nothing left to tell
    });
  } finally {
    releaseSlot?.();
    stopHeartbeat();
    await releaseOmSource(omSource);
  }
}
