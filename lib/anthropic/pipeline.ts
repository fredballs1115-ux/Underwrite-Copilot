import "server-only";
import { answeredSiteFlags, type SiteFlagsResult } from "@/lib/site-flags/core";
import { withArticle } from "@/lib/article";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadOmPdf } from "@/lib/storage";
import { readFirstSignal } from "./first-signal";
import { DATABASE_READ_FAILURE, describeRunFailure, ScreenError } from "./failure";
import { NO_FIGURES_FAILURE, NO_OM_FAILURE, pageCapFailure } from "./document-failures";
import { RunGate, concurrencyFromEnv } from "./run-gate";
import { newLedger, summarizeUsage, usageLogLine, withUsageLedger, type UsageLedger } from "./usage";
import { omSourceFor, omFromText, releaseOmSource, type OmSource } from "./om-source";
import {
  manualFactSheet,
  firstSignalFromExtraction,
  manualCompsStub,
  typedByHand,
} from "@/lib/manual-deal";
import { memorandumReplacedSince } from "@/lib/deals";
import { extractTerms } from "./extract";
import { challengeAssumptions } from "./challenge";
import { keyedTrapsFor } from "./prompts";
import { scrutinizeComps } from "./comps";
import { reconcileModel } from "./reconcile";
import { checkMarket } from "./market";
import { synthesizeVerdict } from "./verdict";
import { parseModelFile } from "@/lib/model-parse";
import { MAX_OM_PAGES, countPdfPages } from "@/lib/pdf";
import { checkPdfOpens } from "@/lib/pdf-open";
import { buildDealFacts, toFactRows } from "@/lib/facts";
import { runDocReconciliation } from "./reconcile-facts";
import { runActualsIngestion } from "./actuals-ingest";
import { OM_NOI_BASIS_LABEL, compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import {
  askingPriceOf,
  assessPlausibility,
  inferStrategy,
  isPlanDeal,
  buildsSomething,
  noiFigures,
  planSummary,
  plausibilityNote,
  type StrategyKind,
} from "@/lib/deal-strategy";
import { dealContextFor } from "@/lib/deal-context";
import { interestNote, readInterest } from "@/lib/interest";
import { assumableNote, readAssumable } from "@/lib/assumable-debt";
import { affordableNote, readAffordable } from "@/lib/affordable";
import { readSingleTenant, singleTenantNote } from "@/lib/single-tenant";
import { hotelNote, readHotelDeal } from "@/lib/hotel-deal";
import { readSale, saleNote } from "@/lib/sale-terms";
import { readRoster, rosterNote } from "@/lib/tenant-roster";
import { readValueAdd, valueAddNote } from "@/lib/value-add";
import { readTaxAbatement, taxAbatementNote } from "@/lib/tax-abatement";
import {
  notePurchaseFinancing,
  notePurchaseFinancingContextLine,
  readSellerFinancing,
  sellerFinancingNote,
} from "@/lib/seller-financing";
import { readSiteReports, siteReportsNote } from "@/lib/site-reports";
import { readStudentHousing, studentNote } from "@/lib/student-housing";
import { mhNote, readManufacturedHousing } from "@/lib/manufactured-housing";
import { readSelfStorage, storageNote } from "@/lib/self-storage";
import { regulationForDeal, regulationNote, type RegulationRead } from "@/lib/rent-regulation";
import { forwardNote, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseNote, readMixedUse } from "@/lib/mixed-use";
import { goingConcernNote, readGoingConcern } from "@/lib/going-concern";
import { condoNote, readCondo } from "@/lib/condo";
import { readSandwichLease, sandwichNote } from "@/lib/sandwich-lease";
import { otherPortfolioMarkets, portfolioFor, portfolioNote, readPortfolio } from "@/lib/portfolio";
import { addressUpgrade, parseStructuredAddress, type StructuredAddress } from "@/lib/address";
import { offersDueOf, offersDueUpgrade } from "@/lib/offering";
import { countyOf, placeDeal } from "@/lib/market-county";
import { isStateMarket } from "@/lib/market-match";
import { claimSiteFlags, runSiteFlags } from "@/lib/site-flags/run";
import { SERIES, metroSeriesFor, readMetroRates, readRates } from "@/lib/live-rates";
import { debtSeeds, isDebtSeedSeries, ratesPromptLine } from "@/lib/debt-index";
import { HOLD_MONTHS, permanentLoanSpread } from "@/lib/underwrite/inputs";
import { fetchBenchRows, fetchSeriesRows } from "@/lib/live-rates-query";
import { ZILLOW_METRICS, zoriFor } from "@/lib/zori";
import { REALTOR_METRICS, realtorFor } from "@/lib/realtor";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { assetClassKey } from "@/lib/asset-words";
import { BRIEF_NATIONAL_IDS, liveMarketBrief, type LiveMarketBrief } from "@/lib/live-market-brief";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import {
  buyBoxLines,
  evaluateBuyBox,
  hasNoDealbreakers,
  screenStampFor,
  type BuyBox,
  type BuyBoxCheck,
} from "@/lib/criteria";
import { dealCheckSource } from "@/lib/buy-box-chip";
import { evalDealbreakers, scoreMandateFit, type MandateScore } from "@/lib/mandate";
import { notifyAnalysisFailed, notifyAnalysisReady } from "@/lib/email";
import { requesterOf } from "@/lib/jobs";
import { omFingerprint } from "@/lib/om-fingerprint";
import type { DealVisualCache } from "@/lib/deal-location";
import { ensureDealPicture, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import type {
  AssetClass,
  ExtractionResult,
  FirstSignal,
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

/** The five results a screen writes, and the reconciler's, as the deal page
 *  names them in a failure's sentence. */
const RESULT_NAME = {
  extraction: "terms",
  challenges: "challenger's questions",
  comps: "comp read",
  market: "market check",
  verdict: "verdict",
  reconciliation: "reconciliation",
} as const;

/**
 * Write one of the run's results to the deal, or fail the run there. The
 * writes' errors were never read: a statement timeout on the verdict's write
 * left the previous screen's call on the deal, undashed and unmarked, under
 * a job that ended "done" and a toast saying the verdict was ready; a failed
 * write of the terms sent every later step to read the old ones (research
 * pass 30). Thrown, the job ends "error" at the step that wrote, and every
 * surface's previous-screen rule (lib/screen-run) marks what is the last
 * screen's.
 */
async function writeResult(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  column: keyof typeof RESULT_NAME,
  value: unknown,
): Promise<void> {
  const { error } = await admin
    .from("deals")
    .update({ [column]: value, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) {
    throw new ScreenError(
      `We couldn't save the ${RESULT_NAME[column]} to the deal — our database didn't take the write. Try again in a minute.`,
      error.message,
    );
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

// The provider reads a PDF of up to about 600 pages in one request
// (MAX_OM_PAGES, lib/pdf); a longer deck came back as a raw 400. The upload
// refuses one first (lib/pdf-open); this stop catches a deck uploaded before
// that check. The byte counter is the cheap first look, and it mostly
// under-counts, but an incrementally saved file reads high by every page it
// revised (lib/pdf): a 350-page deck annotated and saved in Acrobat read as
// 700 and was refused, with a false sentence and a retry that failed the
// same way forever (research pass 30). So a count past the cap is only a
// reason to ask pdfjs, which reads the page tree — the upload check's own
// count — and only its count refuses. Where pdfjs cannot open the file the
// screen goes on, and the service decides.

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

/** How long the screen waits on the site flags' lookup before reading the
 *  market by the address alone: the lookup carries on and stores its answer
 *  for the page either way. */
export const SITE_FLAGS_WAIT_MS = 15_000;

/** A timer that never holds the process open, cancelled once the race ends. */
function pause(ms: number): { done: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
  return { done, cancel: () => clearTimeout(timer) };
}

/**
 * The deal's site flags for the steps after the extraction (#447): the
 * FEMA, Opportunity Zone and census-tract lookup the deal page makes on its
 * first view (lib/site-flags). The tract's county places a deal in its metro
 * area where its address names no place a market's keywords know, and the
 * flood zone rides in the deal context (#426). Where the page has not looked
 * yet — a deal whose address arrived with its memorandum, a screen started
 * with no page open — the screen looks itself; where a lookup is running, it
 * waits for it. Either way no longer than `SITE_FLAGS_WAIT_MS`: a slow
 * geocoder or FEMA leaves the screen to read the market by the address, as
 * it always did. Null where nothing has answered.
 */
/** The deal's stored site flags beside the address line they must match. */
async function readStoredFlags(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
): Promise<{ label: string; flags: SiteFlagsResult | null }> {
  try {
    const { data } = await admin.from("deals").select("address, site_flags").eq("id", dealId).maybeSingle();
    const row = data as { address?: { label?: string } | null; site_flags?: SiteFlagsResult | null } | null;
    return { label: row?.address?.label?.trim() ?? "", flags: row?.site_flags ?? null };
  } catch {
    return { label: "", flags: null };
  }
}

/** Answered, and for the address the deal has now: flags looked up before
 *  an edit are the old address's (lib/site-flags/core, the rule Ask reads
 *  its flood zone by too). */
const flagsAnswered = ({ label, flags }: { label: string; flags: SiteFlagsResult | null }) =>
  answeredSiteFlags(flags, label) !== null;

/**
 * The site flags as stored, with no lookup — for a step that runs after the
 * comps and the market check already asked (a resumed run's verdict, a
 * reconcile against the buyer's model). Null where nothing has answered.
 */
async function storedSiteFlags(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
): Promise<SiteFlagsResult | null> {
  const stored = await readStoredFlags(admin, dealId);
  return flagsAnswered(stored) ? stored.flags : null;
}

async function siteFlagsForScreen(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
): Promise<SiteFlagsResult | null> {
  const read = () => readStoredFlags(admin, dealId);
  const answered = flagsAnswered;
  const first = await read();
  // No address, no lookup: the address matchers read nothing either.
  if (!first.label) return null;
  if (answered(first)) return first.flags;
  const stale = !!first.flags && first.flags.status !== "pending";
  let stopped = false;
  const wait = pause(SITE_FLAGS_WAIT_MS);
  try {
    // Claimed here where no one has looked (or looked for another address);
    // a lookup already running — the page's — is waited on, a second at a
    // time. A lookup outlasting the wait carries on and stores its answer.
    const lookup = (async () => {
      if (await claimSiteFlags(dealId, stale)) {
        await runSiteFlags(dealId);
        return;
      }
      while (!stopped) {
        const tick = pause(1000);
        await tick.done;
        if (stopped || answered(await read())) return;
      }
    })().catch(() => {});
    await Promise.race([lookup, wait.done]);
  } finally {
    stopped = true;
    wait.cancel();
  }
  const last = await read();
  return answered(last) ? last.flags : null;
}

/** How long the screen's lift of the memorandum's cover waits for a turn.
 *  The turns are the ones the deal pages' own searches take
 *  (lib/deal-picture); nothing is waiting on this one, so it may wait. */
export const SCREEN_PICTURE_WAIT_MS = 30_000;
/** The most the screen waits, at its end, for a lift still running. */
export const SCREEN_PICTURE_MS = 60_000;

/**
 * The building's own photograph, lifted out of the memorandum right after
 * the extraction and beside the steps that follow. A deal's photograph used
 * to be looked for only on its first view, so a new deal's first pipeline
 * view showed a placeholder, and a batch upload's first view queued every
 * deal behind the picture search's two turns. The screen already holds the
 * memorandum's bytes, so the search reads those rather than downloading the
 * file again, and it lifts the cover alone (#464's rule for the worker): the
 * gallery's sixteen pages wait for the deal's first view.
 *
 * Never the sample deal, and only where lib/deal-picture says a search is
 * due (`pictureMayBeInMemorandum`: no photograph stored, none looked for
 * under today's rules). It never fails or slows the screen: the steps after
 * the extraction run while it reads, a failure is logged and dropped, and
 * what it returns settles within `SCREEN_PICTURE_MS` whatever the search
 * does — the screen waits for it only at its end, to release its turn with
 * the memorandum the lift read.
 */
function liftPictureBeside(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  omPath: string,
  pdf: Uint8Array,
): Promise<void> {
  const limit = pause(SCREEN_PICTURE_MS);
  const lift = (async () => {
    const { data } = await admin.from("deals").select("photo, is_sample").eq("id", dealId).maybeSingle();
    const row = data as { photo?: DealVisualCache | null; is_sample?: boolean } | null;
    if (!row || row.is_sample) return "skipped" as const;
    const cache = row.photo ?? null;
    if (!pictureMayBeInMemorandum({ omPath, isSample: false, cache })) return "skipped" as const;
    await ensureDealPicture(admin, dealId, {
      omPath,
      isSample: false,
      cache,
      waitMs: SCREEN_PICTURE_WAIT_MS,
      gallery: false,
      pdf,
    });
    return "done" as const;
  })().catch((err) => {
    console.warn(
      `[pipeline] the memorandum's photograph was not lifted for deal ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
    return "failed" as const;
  });
  return Promise.race([lift, limit.done.then(() => "running" as const)])
    .then((outcome) => {
      if (outcome === "running") {
        console.warn(`[pipeline] the memorandum's photograph for deal ${dealId} is still being read; the screen ends without waiting for it`);
      }
    })
    .finally(() => limit.cancel());
}

/**
 * Today's debt indices for the challenger (lib/debt-index `ratesPromptLine`):
 * it is told to judge the OM's financing at current rates, so it is handed
 * them — the same figures the site's own model is seeded from, read bare
 * because the worker has no Next cache. Best-effort: a read that fails, or a
 * table with nothing fresh, hands the step no rates, and it reasons as it
 * did before.
 */
async function todaysRatesLine(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  /** the deal's extraction, whose class sets the spread the site's model
   *  adds (lib/underwrite/inputs `permanentLoanSpread`) — named in the line
   *  as its screening default, and on land, no permanent loan at all */
  extraction: ExtractionResult | null,
): Promise<string | null> {
  try {
    const rows = await fetchSeriesRows(admin, SERIES.filter(isDebtSeedSeries));
    return ratesPromptLine(
      debtSeeds(readRates(rows, new Date()), HOLD_MONTHS),
      HOLD_MONTHS,
      permanentLoanSpread(extraction?.assetClass),
    );
  } catch {
    return null;
  }
}

/**
 * The deal's rent regulation for a screen step (lib/rent-regulation), through
 * the one call every surface makes (`regulationForDeal`), on the UTC day the
 * worker keeps (lib/reader-day): the regimes the site's rules say reach the
 * building at the address the deal page reads it at (a blank one the
 * memorandum's, a typed line its own fields — `addressUpgrade`), the Census
 * place and county only from site flags answered for that address, and the
 * deal's one class (the analyst's, else the deck's). Null where no regime
 * reaches the building and the memorandum names none.
 */
function screenRegulation(
  row: { extraction?: unknown; address?: unknown; asset_class?: unknown } | null | undefined,
  flags: SiteFlagsResult | null,
): RegulationRead | null {
  const ex = (row?.extraction as ExtractionResult | null | undefined) ?? null;
  const raw = row?.address;
  const address: Partial<StructuredAddress> | null =
    addressUpgrade(raw, ex) ??
    (raw && typeof raw === "object"
      ? (raw as Partial<StructuredAddress>)
      : typeof raw === "string"
        ? parseStructuredAddress(raw)
        : null);
  return regulationForDeal(
    { extraction: ex, address, siteFlags: flags, assetClass: (row?.asset_class as string | null | undefined) ?? null },
    new Date().toISOString().slice(0, 10),
  );
}

/**
 * What the screen established about the deal — its kind and, on a plan deal,
 * the plan's figures — for the steps that read the OM after the extraction.
 * Best-effort: with no extraction stored, the step runs on the OM alone.
 */
async function dealContextFromDb(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  flags: SiteFlagsResult | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("deals")
      .select("extraction, first_signal, address, asset_class")
      .eq("id", dealId)
      .single();
    // Where the FEMA lookup has answered (`siteFlagsForScreen`), the step
    // reads the flood zone too (#426). The deal's kind is read with the
    // first signal beside the extraction, as the market figures read it.
    // The rent rules are read after the lookup, so a city's regime reads the
    // building's own municipality where the Census geocoder named it.
    return dealContextFor(
      (data?.extraction as ExtractionResult | null) ?? null,
      flags && flags.status !== "pending" ? { flood: flags.flood, pointIsBuilding: flags.pointIsBuilding } : null,
      (data?.first_signal as FirstSignal | null | undefined) ?? null,
      screenRegulation(data, flags),
    );
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
  /** the deal sits in a market the site reads figures for and none could be
   *  read — a read of the figures, or of the deal's address, failed — so the
   *  check says it reasoned from rules of thumb that day, never that the
   *  market has no figures (lib/market-read-failed, research pass 30) */
  failed: { market: string | null; grain: "metro" | "state" } | null;
}

/** A failed read, said for the market it was for where the deal was placed. */
function readFailedFor(market: { id: string; name: string } | null): NonNullable<LiveMarketRead["failed"]> {
  return market
    ? { market: market.name, grain: isStateMarket(market.id) ? "state" : "metro" }
    : { market: null, grain: "metro" };
}

async function liveMarketFromDb(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  flags: SiteFlagsResult | null = null,
  now: Date = new Date(),
): Promise<LiveMarketRead> {
  // The market whose figures are being read, once the deal is placed, and
  // how many of its reads failed: a covered market's check that read none
  // of its figures for a failure says so.
  let placed: { id: string; name: string } | null = null;
  let failures = 0;
  const failedRead = () => {
    failures++;
  };
  try {
    const { data, error: dealErr } = await admin
      .from("deals")
      .select("address, asset_class, extraction, first_signal")
      .eq("id", dealId)
      .maybeSingle();
    // The deal's own address could not be read: where it sits is unknown,
    // and no figure was read for it.
    if (dealErr) {
      console.warn(`[pipeline] the deal's address could not be read for the market check of ${dealId}: ${dealErr.message}`);
      return { primary: null, others: [], failed: readFailedFor(null) };
    }
    // The column holds the structured object the deal form saved (the deals
    // list and the compare page read it the same way); a row that still
    // carries the form's JSON string is parsed the form's way.
    const raw = data?.address;
    const ex = (data?.extraction as ExtractionResult | null) ?? null;
    // A typed line read for its city and state, and a deal nobody typed an
    // address for placed by the one its memorandum states (#441) — the
    // extraction step writes the same upgrade, so this only matters for a
    // run resumed from before it.
    const address: Partial<StructuredAddress> | null =
      addressUpgrade(raw, ex) ??
      (raw && typeof raw === "object"
        ? (raw as Partial<StructuredAddress>)
        : typeof raw === "string"
          ? parseStructuredAddress(raw)
          : null);
    // A covered metro's figures where the address sits in one; the metro
    // area its county sits in where the address names no place a market's
    // keywords know (#447, lib/market-county — said as placed by its
    // county); the state's own otherwise (the same series table, filed
    // under `state:PA`), said as the state's. A deal with no readable state
    // or county reads nothing of its own, as before.
    const metro = placeDeal(address, countyOf(address, flags)).live;
    placed = metro ?? null;
    // The debt-market lines read the deal's class, and whether the deal is
    // a plan, so the lending-standards series is the one a bank reports for
    // this kind of loan. The class is the one every page shows
    // (`shownAssetClass`): the analyst's where they filed one, the deck's
    // where they left it to "Auto" — it had read the deck's first, so a
    // deal filed as an office and pitched as mixed-use was checked as one
    // thing and shown as the other.
    const assetClass = shownAssetClass((data?.asset_class as string | null) ?? null, ex) || null;
    // The first signal read beside the extraction, as the deal page reads it:
    // a deal only the first signal calls a development or a conversion is a
    // plan here too, and reads what building costs (the audit of 2026-09-30).
    const firstSignal = (data?.first_signal as FirstSignal | null | undefined) ?? null;
    const kind = inferStrategy(ex, firstSignal).kind;
    const plan = isPlanDeal(kind);
    // What building costs is read only where the deal builds something — a
    // development, a conversion, a value-add with a stated budget — never a
    // lease-up's finished building (lib/deal-strategy buildsSomething).
    const builds = buildsSomething(ex, kind);
    const others = otherPortfolioMarkets(ex, metro?.id ?? null);
    if (!metro && !others) return { primary: null, others: [], failed: null };
    const nationalRows = await fetchSeriesRows(admin, SERIES.filter((s) => BRIEF_NATIONAL_IDS.includes(s.id)), failedRead);
    const national = readRates(nationalRows, now);
    // Whether the reads of the market's OWN figures failed — its series and
    // its benchmarks — apart from the national lines, every one of them or
    // enough to leave no line of its own: a brief left holding only the
    // nation's lines is no read of the market (the batch-2 audit, and the
    // pre-merge audit's case of a read that answered empty).
    let ownReadFailed = false;
    const readMarket = async (
      market: { id: string; name: string; placedBy?: { county: string; area: string } },
      withNational: boolean,
      portfolio: Parameters<typeof liveMarketBrief>[0]["portfolio"],
    ): Promise<LiveMarketBrief | null> => {
      const metas = metroSeriesFor(market.id).series;
      const attempts = metas.reduce((n, m) => n + (m.moe ? 2 : 1), 0) + 1;
      let own = 0;
      const ownFailed = () => {
        own++;
        failedRead();
      };
      const [rateRows, bench] = await Promise.all([
        fetchSeriesRows(admin, metas, ownFailed),
        fetchBenchRows(admin, market.name, [...ZILLOW_METRICS, ...REALTOR_METRICS], ownFailed),
      ]);
      const brief = liveMarketBrief({
        metro: market,
        rates: readMetroRates(market.id, rateRows, now),
        zori: zoriFor(bench, market.name, now),
        realtor: realtorFor(bench, market.name, now),
        now,
        national: withNational ? national : undefined,
        assetClass,
        // The deck's own class words, so a lab or a cold-storage building
        // filed as plain office or industrial reads no neighbour's rents.
        deckWords: ex?.assetClass ?? null,
        portfolio,
        plan,
        builds,
      });
      // Reads of the market's own figures failed and left no line of its
      // own: the reads that answered held nothing for this deal (a state
      // has no Zillow or Realtor.com rows, and their read "succeeds" empty;
      // a commercial deal reads no housing line), so a block of the
      // nation's lines alone is a failed read of the market, never a read
      // of it (the pre-merge audit).
      ownReadFailed = own > 0 && (own >= attempts || brief == null || brief.national >= brief.lines.length);
      return ownReadFailed ? null : brief;
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
    ownReadFailed = false;
    const primary = metro
      ? await readMarket(metro, true, whole ? { ...whole, othersRead: read.map((b) => b.metro), notRead: unread } : null)
      : null;
    // The deal's market was wanted, nothing came back, and reads failed — or
    // every read of its own figures failed, whatever the nation's lines did:
    // a failed read, never a market with no figures to read.
    return {
      primary,
      others: read,
      failed: metro && !primary && (failures > 0 || ownReadFailed) ? readFailedFor(metro) : null,
    };
  } catch (err) {
    console.warn(`[pipeline] live market figures unavailable for deal ${dealId}:`, err instanceof Error ? err.message : err);
    return { primary: null, others: [], failed: readFailedFor(placed) };
  }
}

/**
 * Re-synthesize the one-screen verdict from whatever results the deal currently
 * has stored. Called at the end of the main run and again after a reconcile, so
 * the verdict always reflects the latest evidence.
 *
 * `dealContext` is what the screen established about the deal (lib/deal-
 * context: what is being sold, how it is sold, the kind, the plan's figures,
 * the flood zone) — the same text the comps, the market check, Ask and the
 * reconciler read, built once by the caller and handed in, so the verdict
 * never judges a share's price over the whole building's units or a note's
 * price as a property's while every step before it was told otherwise.
 */
async function regenerateVerdict(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  dealId: string,
  dealContext: string | null,
): Promise<void> {
  const { data, error: readErr } = await admin
    .from("deals")
    .select("asset_class, address, extraction, first_signal, challenges, comps, reconciliation, market, user_id, team_id")
    .eq("id", dealId)
    .single();
  // A verdict synthesized over a read that failed would judge a deal with
  // no terms, no challenger and no market check — and be written as this
  // run's call (research pass 30).
  if (readErr || !data) {
    throw new ScreenError(
      "We couldn't read this deal's results back from our database just now — try again in a minute.",
      readErr?.message ?? "no row",
    );
  }
  const extraction = (data?.extraction as ExtractionResult | null | undefined) ?? null;
  const firstSignal = (data?.first_signal as FirstSignal | null | undefined) ?? null;

  // Fetch the buyer's standing criteria so the verdict judges fit against
  // THEIR box. Best-effort: a missing box (or pre-0008 schema) just means no
  // buy-box section in the brief.
  let buyBox: string[] | null = null;
  let box: BuyBox | null = null;
  try {
    box = await getBuyBoxForDeal(
      (data?.user_id as string) ?? "",
      (data?.team_id as string) ?? null,
    );
    // The box without the buyer's 1031 exchange: the verdict's words reach a
    // shared screen, and the exchange is the reader's own (lib/criteria).
    buyBox = box ? buyBoxLines(box, { exchange: false }) : null;
  } catch {
    buyBox = null;
  }
  // The deal page's own read of the box (lib/buy-box-chip, which the
  // screen-complete email makes too): the extraction, the first signal and
  // the address the page reads, the same checks and the same red lines — so
  // the verdict is handed the calls the chip shows, never left to re-derive
  // a fit from the bare criteria. Best-effort on its own: a read that fails
  // leaves the criteria in the brief, as before.
  let buyBoxChecks: { checks: BuyBoxCheck[]; tripped: string[]; mandate: MandateScore | null } | null = null;
  if (box && buyBox) {
    try {
      const address =
        addressUpgrade(data?.address, extraction) ?? (data?.address as StructuredAddress | null | undefined) ?? null;
      const source = dealCheckSource(extraction, firstSignal, address);
      const filedAs = (data?.asset_class as string | null | undefined) ?? "auto";
      buyBoxChecks = {
        checks: evaluateBuyBox(filedAs, source, box),
        tripped: source && !hasNoDealbreakers(box.dealbreakers) ? evalDealbreakers(filedAs, source, box).tripped : [],
        // The score beside them, as the chip reads it: its cash-on-cash
        // floor and its red lines are criteria the coverage counts.
        mandate: source ? scoreMandateFit(filedAs, source, box) : null,
      };
    } catch {
      buyBoxChecks = null;
    }
  }
  // The buyer's 1031 exchange is never handed to the verdict: its words reach
  // the shared screen, and a counterparty who learns the buyer must close by
  // a date holds the price. The deadlines stay on the reader's own surfaces
  // (the deal header's chip, the pipeline's tag, the memo).

  const verdict = await synthesizeVerdict({
    extraction,
    // The deal's kind is read with the first signal beside the extraction,
    // as every other step reads it.
    firstSignal,
    // The class the deal is filed as, read with the deck's where the
    // analyst left "Auto" (shownAssetClass) — the noun the building's basis
    // is said in, as the pipeline card says it.
    assetClass: (data?.asset_class as string | null | undefined) ?? null,
    dealContext,
    challenges: (data?.challenges as ChallengerResult) ?? null,
    comps: (data?.comps as BrokerCompsResult) ?? null,
    reconciliation: (data?.reconciliation as ReconciliationResult) ?? null,
    market: (data?.market as MarketResult) ?? null,
    buyBox,
    buyBoxChecks,
    // The latest published rates, the line the challenger is handed: the
    // debt deal-killer is read against a dated index and the site's own
    // screening spread, never a rate remembered as current.
    ratesLine: await todaysRatesLine(admin, extraction),
  });

  // generatedAt lets consumers (the weekly digest) know when THIS verdict
  // landed — deals.updated_at bumps on any edit and can't be trusted.
  await writeResult(admin, dealId, "verdict", { ...verdict, generatedAt: new Date().toISOString() });
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
async function writeUsage(dealId: string, ledger: UsageLedger, wallMs?: number): Promise<void> {
  if (ledger.calls.length === 0) return;
  const summary = {
    ...summarizeUsage(ledger),
    ...(wallMs != null && Number.isFinite(wallMs) && wallMs > 0 ? { wallMs: Math.round(wallMs) } : {}),
  };
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
    /** the user who asked for this run — the action's caller in-process, the
     *  payload's `requestedBy` in the worker — whom the screen's emails go
     *  to (lib/email); absent, they go to the deal's creator, as before */
    requestedBy?: string | null;
  },
): Promise<void> {
  // Every model call inside the run records its meters into this ledger,
  // and the run's own time rides with it (the deal page's "your screens
  // usually take", lib/screen-duration): its wait for a turn included,
  // stopped at the moment the job was marked done.
  const ledger = newLedger();
  const started = Date.now();
  let finished: RunFinish | null = null;
  try {
    finished = await withUsageLedger(ledger, () => runAnalysisSteps(dealId, opts));
  } finally {
    // A screen's time only where this attempt ran the screen from its first
    // step to done: a failed run's time is no screen's, and a resumed
    // attempt's covers only the steps an earlier one left it.
    await writeUsage(dealId, ledger, finished?.whole ? finished.doneAt - started : undefined);
  }
}

/** How a screen ended, for its clock: when the job was marked done, and
 *  whether this attempt ran every step itself (no checkpoint skipped). */
interface RunFinish {
  doneAt: number;
  whole: boolean;
}

async function runAnalysisSteps(
  dealId: string,
  opts?: { snapshotPrior?: boolean; resume?: boolean; requestedBy?: string | null },
): Promise<RunFinish | null> {
  const snapshotPrior = opts?.snapshotPrior ?? true;
  const resume = opts?.resume ?? false;
  // Who asked for this run: the screen's emails go to them (lib/email). A
  // resumed attempt that was not handed one reads its payload's.
  let requestedBy = requesterOf(opts?.requestedBy);
  let finished: RunFinish | null = null;
  // Steps an earlier attempt of this run had already finished (worker mode).
  let resumedSteps = 0;
  // The OM's transport for this run — released in `finally` when it is a
  // Files-API object, so a large OM never leaves an orphaned upload behind.
  let omSource: OmSource | null = null;
  let releaseSlot: (() => void) | null = null;
  // The memorandum's photograph, lifted beside the steps after the
  // extraction; settled, bounded, before the run gives up its turn.
  let pictureLift: Promise<void> | null = null;
  const stopHeartbeat = startHeartbeat(dealId);
  try {
    releaseSlot = await runGate.acquire();
    const admin = createSupabaseAdminClient();
    // `qa` and `verdict` say whether the memorandum was replaced since the
    // last screen (the stamp below, `screenStampFor`).
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, name, asset_class, om_storage_path, extraction, qa, verdict")
      .eq("id", dealId)
      .maybeSingle();

    // A read that failed is not a deal that is gone: one blip had told the
    // reader looking at the deal it was "no longer available" (research
    // pass 30). Only a read that answered with no row says that.
    if (error) throw new ScreenError(DATABASE_READ_FAILURE, error.message);
    if (!deal) throw new Error("Deal not found.");
    // Manual deals have no OM — the stored extraction (the buyer's typed
    // facts) is the source, and a synthesized fact sheet stands in for the
    // document. No extraction either means there's nothing to screen.
    const manualExtraction = !deal.om_storage_path
      ? ((deal.extraction as ExtractionResult | null) ?? null)
      : null;
    const manual = manualExtraction != null;
    if (!deal.om_storage_path && !manual) {
      throw new ScreenError(NO_OM_FAILURE);
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
        requestedBy ??= requesterOf(payload.requestedBy);
      } catch {
        // no checkpoints — run everything
      }
    }
    resumedSteps = completed.size;
    const writeCheckpoint = async () => {
      if (!resume) return;
      try {
        // The handoff contract rides along: a checkpoint written from an
        // unread payload must still say what kind of job this row is, or a
        // re-queued attempt fails it as "unrecognized type" — and whom the
        // run was asked for by, or a later attempt emails the creator.
        await admin
          .from("analysis_jobs")
          .update({
            payload: {
              ...payload,
              kind: payload.kind ?? "screen",
              ...(requestedBy && !payload.requestedBy ? { requestedBy } : {}),
              completed: [...completed],
            },
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
      const counted = countPdfPages(pdf);
      if (counted != null && counted > MAX_OM_PAGES) {
        const opened = await checkPdfOpens(pdf);
        if (opened.verdict === "too_long" && opened.pages != null) {
          throw new ScreenError(pageCapFailure(opened.pages));
        }
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
    // must never sink the real screen. This call also writes the OM to the
    // prompt cache; whether the extraction and the later steps read it back
    // — each sends a structured-output format of its own, which Anthropic's
    // documentation says invalidates the cache — is the ledger's to say
    // (./models). Manual deals derive the signal from the typed facts — no
    // model call.
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
      // A deck with no figures in it — a teaser, a cover letter, pages too
      // faint to read — yields a schema-valid extraction with none at all.
      // Stored, it flowed to a Caution verdict on a document the product
      // never read — stop here. (A scan is read as pictures, and a file that
      // needs a password to open is refused at the upload, lib/pdf-open.)
      if (extraction.metrics.length === 0) {
        throw new ScreenError(NO_FIGURES_FAILURE);
      }
      // The memorandum's page count, as exact as this run can make it: the
      // text layer's own (pdfjs walked the pages); else the model's count of
      // the PDF it read (robust to object-stream / bookmarked PDFs the byte
      // counter mis-reads); else the fail-safe byte counter, only where the
      // model did not report. Stored as the extraction's own count, so every
      // reader that holds a cited page to `totalPages` (what is being sold,
      // a portfolio's properties, the sale, the reports) agrees with the
      // citation rows below — the model's count had been stored even where
      // the layer's exact one was in hand.
      const pageCount =
        omSource?.kind === "pages"
          ? omSource.pages
          : extraction.totalPages && extraction.totalPages > 0
            ? extraction.totalPages
            : pdf
              ? countPdfPages(pdf)
              : 0;
      if (pageCount != null && pageCount > 0 && pageCount !== extraction.totalPages) {
        extraction = { ...extraction, totalPages: pageCount };
      }
      // How this read was made — the deck's text layer, or the PDF itself
      // (the layer never dense enough, or found wanting above and re-read as
      // pages) — stored with the extraction, where the checkpoint payload
      // was the only record and lasted only the run: Ask reads the
      // memorandum the same way (lib/anthropic/ask `askTextFirst`), and
      // never answers "the OM doesn't state" a figure the screen found in a
      // picture on a page.
      extraction = { ...extraction, omRead: omSource?.kind === "pages" ? "text" : "pdf" };
      // The day this screen read the memorandum: a price label's year is
      // judged against its year (lib/criteria `screenYearOf`), so "Asking
      // price (2026)" read in 2026 is still the ask when the deal is opened
      // in 2027 — and when the same deck is screened again in 2027, since a
      // re-screen of the same bytes keeps its first stamp, or the lack of
      // one (`screenStampFor` against the extraction this run replaces). An
      // extraction stored before the fingerprint is this deck's unless it
      // was typed by hand (a deal entered by hand getting its first
      // memorandum) or the deck was replaced after the deal's last screen
      // (Ask's thread, which `replaceOm` marks) — "Replace OM" keeps the old
      // deck's extraction on file until this run overwrites it.
      const fingerprint = pdf ? omFingerprint(pdf) : undefined;
      const prior = (deal.extraction as ExtractionResult | null) ?? null;
      const lastScreen = (deal.verdict as { generatedAt?: unknown } | null)?.generatedAt;
      const stamp = screenStampFor(prior, fingerprint, new Date(), {
        priorReadFromThisDeck:
          prior != null &&
          !typedByHand(prior) &&
          !memorandumReplacedSince(deal.qa, typeof lastScreen === "string" ? lastScreen : null, fingerprint),
      });
      // A reading kept with no stamp is stored with none, never an invented day.
      extraction = { ...extraction, omFingerprint: fingerprint, screenedOn: stamp };
      if (!stamp) delete extraction.screenedOn;
      await writeResult(admin, dealId, "extraction", extraction);
      // Place the deal by its address (#441): a deal uploaded with the
      // address box empty takes the one the memorandum states, and a typed
      // line gets the street, city and state it names — so the market check
      // below, the pictures, the flood map and the comps all have one.
      // Best-effort: a failed write leaves the deal as it was.
      try {
        const { data: placed } = await admin
          .from("deals")
          .select("address, is_sample")
          .eq("id", dealId)
          .maybeSingle();
        const upgrade = placed && !placed.is_sample ? addressUpgrade(placed.address, extraction) : null;
        if (upgrade) await admin.from("deals").update({ address: upgrade }).eq("id", dealId);
      } catch {
        // the deal keeps the address it had
      }
      // The memorandum's call for offers fills the deal's deadline (#467) —
      // only where nobody has set one, and only a whole date — so the
      // pipeline counts down to it and the Monday digest names it without
      // anyone typing it in. Best-effort, like the address.
      try {
        const due = offersDueOf(extraction)?.iso ?? null;
        if (due) {
          const { data: dated } = await admin
            .from("deals")
            .select("offers_due, is_sample")
            .eq("id", dealId)
            .maybeSingle();
          const next = dated && !dated.is_sample ? offersDueUpgrade(dated.offers_due as string | null, extraction) : null;
          if (next) await admin.from("deals").update({ offers_due: next }).eq("id", dealId).is("offers_due", null);
        }
      } catch {
        // the deal keeps the deadline it had
      }

      // Citation-level provenance (migration 0018): store one deal_facts row
      // per extracted figure, with its page VALIDATED against the OM's real
      // length (a page beyond the document is recorded "source not located",
      // never shown). Best-effort — a pre-0018 schema or a write failure must
      // never sink the screen.
      try {
        // The same count the extraction now stores (above).
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

    // The building's own photograph, out of the memorandum the run already
    // holds — beside the steps below, never in their way (liftPictureBeside).
    if (pdf && !manual) {
      pictureLift = liftPictureBeside(admin, dealId, deal.om_storage_path as string, pdf);
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
      // The extraction the notes below read, kept for the rates line's
      // class spread after them — and with the deal's kind, for the trap
      // lists the memorandum's own words call for.
      let challengeEx: ExtractionResult | null = null;
      let challengeKind: StrategyKind | null = null;
      // A forward purchase (lib/forward-purchase), set where its note is
      // among the notes: the challenger's plan paragraph is the purchase's.
      let challengeForward = false;
      try {
        const { data: dr } = await admin
          .from("deals")
          .select("discrepancies, extraction, first_signal, address")
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
        // against and how the plan's figures are read below. Read with the
        // first signal beside the extraction, as the deal context, the market
        // figures and the verdict read it — one kind for the whole screen.
        const ex = (dr?.extraction as ExtractionResult | null) ?? null;
        challengeEx = ex;
        const strategy = inferStrategy(ex, (dr?.first_signal as FirstSignal | null | undefined) ?? null);
        challengeKind = strategy.kind;

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
          ex,
        );
        if (plausibility) notes.push(plausibility);
        // A forward purchase or a build-to-suit bought at delivery
        // (lib/forward-purchase): the price at delivery, the clock to it and
        // to the outside date, the deposit and the yield at delivery, then
        // the forward-purchase traps by name — in place of the construction
        // paragraph a development gets, since the buyer carries no
        // construction (the instruction's own plan paragraph is swapped too).
        const forward = readForwardPurchase(ex, new Date(), strategy);
        if (forward) {
          notes.push(forwardNote(forward));
          challengeForward = true;
        }

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

        // A note the seller offers to carry (#462): the price that pays for
        // its rate, the balloon, the underlying loan, a second and the paper.
        const sellerNote = readSellerFinancing(ex, null);
        if (sellerNote) notes.push(sellerFinancingNote(sellerNote));
        // On a note, financing the seller offers is of the note's purchase:
        // said as that, never run against the model's property loan.
        const noteFinancing = notePurchaseFinancing(ex);
        if (noteFinancing) notes.push(notePurchaseFinancingContextLine(noteFinancing));

        // A covenant or a contract that sets the rents (#453): the
        // restriction's facts, then each program's traps by name — a
        // pro forma that marks restricted units to market is a misread.
        const affordable = readAffordable(ex);
        if (affordable) notes.push(affordableNote(affordable));

        // The rent rules that reach the building (lib/rent-regulation): the
        // regime, the regulated share as stated and the allowance in force,
        // then the regulation traps by name. The challenger runs BEFORE the
        // site flags are read (the comps step reads them), so this read is
        // the address's alone, with no Census place or county: a city's
        // regime it cannot place inside the city's limits reads "possibly
        // applies", that question named — the deal context, built after the
        // lookup, reads the building's own municipality.
        const regulation = screenRegulation({ extraction: ex, address: dr?.address, asset_class: assetClass }, null);
        if (regulation) notes.push(regulationNote(regulation));

        // One tenant leases the whole property (#454): the lease's facts,
        // then the single-tenant traps keyed to them by name — the
        // guarantor, the term at the exit, dark value, the increases.
        const singleTenant = readSingleTenant(ex);
        if (singleTenant) notes.push(singleTenantNote(singleTenant));

        // The listed tenants of a multi-tenant property (#457): the roll
        // against the sale, the anchors in and out of it, the rights that
        // ride on them — then the multi-tenant traps by name.
        const roster = readRoster(ex);
        if (roster) notes.push(rosterNote(roster));

        // A value-add renovation program (#460): the premium's proof, the
        // pace, the cost and the clock — the value-add traps by name.
        const valueAdd = readValueAdd(ex);
        if (valueAdd) notes.push(valueAddNote(valueAdd));

        // A property-tax abatement (#461): the NOI on an abated bill, the
        // burn-off, the transfer, the conditions and the assessment.
        const abatement = readTaxAbatement(ex);
        if (abatement) notes.push(taxAbatementNote(abatement));

        // What a hotel is sold with (#455): the flag, the manager, the
        // encumbrance and the PIP, then the contract traps by name.
        const hotel = readHotelDeal(ex);
        if (hotel) notes.push(hotelNote(hotel));

        // How it is sold (#456): an auction's bid and premium, a court's or
        // a lender's sale — the sale's traps by name.
        const sale = readSale(ex);
        if (sale) notes.push(saleNote(sale));

        // What the third-party reports found (#465): reliance, the Phase
        // I's age and findings, the immediate repairs, the reserves, the
        // seismic PML and the zoning — the site-report traps by name.
        const reports = readSiteReports(ex);
        if (reports) notes.push(siteReportsNote(reports));

        // A student building (#468): the pre-lease pace, the beds still to
        // sign against the model's vacancy, the rent per bed, the walk.
        const student = readStudentHousing(ex);
        if (student) notes.push(studentNote(student));
        // A manufactured-housing park (#470): the lot rent against the
        // comparable parks', the park-owned homes, the water and sewer the
        // park runs, the rent rules and the age restriction's compliance.
        const park = readManufacturedHousing(ex);
        if (park) notes.push(mhNote(park));
        // A self-storage facility (#471): the street rate against recent
        // move-ins, the premium sitting tenants pay, the economic
        // occupancy's definition, new supply and the platform's income.
        const storage = readSelfStorage(ex);
        if (storage) notes.push(storageNote(storage));
        // A mixed-use building (lib/mixed-use): the two incomes as stated,
        // then the traps the two add after the class's own MIXED_USE_TRAPS
        // (a)–(c) — the agency limit, the meters and CAM, the zoning.
        const mixedUse = readMixedUse(ex);
        if (mixedUse) notes.push(mixedUseNote(mixedUse));
        // An operating business on its real estate (lib/going-concern): the
        // operator's earnings, the rent and its coverage, the split and the
        // contracts as stated, then the operating-business traps by name —
        // a care operation's own after them.
        const goingConcern = readGoingConcern(ex);
        if (goingConcern) notes.push(goingConcernNote(goingConcern));
        // Condominium units bought in bulk (lib/condo): the buyer's share of
        // the association, its dues and a lender's limit on a single owner as
        // stated, then the condo traps by name.
        const condo = readCondo(ex);
        if (condo) notes.push(condoNote(condo));
        // A sandwich position (lib/sandwich-lease): the sublease income
        // against the master rent, the spread, its cover and the master
        // lease's end as stated, then the sandwich-lease traps by name.
        const sandwich = readSandwichLease(ex);
        if (sandwich) notes.push(sandwichNote(sandwich));

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
      // Today's rates, dated: the challenger judges the financing against
      // them rather than against a rate it remembers as current — and the
      // spread the site's model adds for the deal's class, as its default.
      const ratesLine = await todaysRatesLine(admin, challengeEx);
      if (ratesLine) reconNote = reconNote ? `${reconNote} ${ratesLine}` : ratesLine;
      // The class the deck turned out to be, where the deal was filed
      // "Auto" (shownAssetClass, as every page shows it): the extraction has
      // read it by now, so the challenger is handed that class's own trap
      // list rather than all sixteen (14.7k characters against 5.7k for an
      // apartment building). A phrase no class resolves keeps them all.
      const challengeClass =
        (assetClassKey(shownAssetClass(assetClass, challengeEx)) as AssetClass | null) ?? assetClass;
      // The trap lists the memorandum's own words call for beside the
      // class's (research pass 23): a cannabis tenant, a special-purpose
      // building sold to be converted, a lab, a cold-storage building.
      const keyed = keyedTrapsFor(challengeEx, challengeKind);
      const challenges = await challengeAssumptions(om(), challengeClass, reconNote, keyed, challengeForward);
      await writeResult(admin, dealId, "challenges", challenges);
      await markDone("challenge");
    }

    // Step 3 — broker-comp scrutiny (reads the comps out of the OM itself).
    // A manual deal has no OM comp set — store the explanatory stub so the
    // comps tab hands over to own-comps / public-web search instead.
    // The comp scrutiny and the market check are told what the screen
    // established — the deal's kind and, on a plan deal, the plan's figures —
    // so a conversion's comps are held against total cost, not the shell.
    // The site flags once, for both steps: the flood zone for the deal
    // context (#426), the census tract's county for the market (#447). A
    // run resumed past both reads the flags as stored, never looks again.
    const siteFlags =
      !completed.has("comps") || !completed.has("market")
        ? await siteFlagsForScreen(admin, dealId)
        : await storedSiteFlags(admin, dealId);
    // What the screen established, built ONCE for the comps, the market
    // check and the verdict, so the three are told the same thing.
    const dealContext = await dealContextFromDb(admin, dealId, siteFlags);
    if (!completed.has("comps")) {
      await patchJob(dealId, { status: "running", step: "comps", progress: 50 });
      const comps = manual ? manualCompsStub() : await scrutinizeComps(om(), dealContext);
      await writeResult(admin, dealId, "comps", comps);
      await markDone("comps");
    }

    // Step 4 — market plausibility check: rules of thumb, no live comps feed,
    // and — where the deal sits in a covered market — the metro's own
    // published figures, dated, handed in and stored with the result so the
    // page can say what the check read.
    if (!completed.has("market")) {
      await patchJob(dealId, { status: "running", step: "market", progress: 70 });
      const { primary, others, failed } = await liveMarketFromDb(admin, dealId, siteFlags);
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
        ...(b.placedBy ? { placedBy: b.placedBy } : {}),
      });
      const market: MarketResult = {
        ...checked,
        liveBrief: primary ? record(primary) : null,
        ...(others.length > 0 ? { otherBriefs: others.map(record) } : {}),
        // Stored so the page says the figures were not read that day, and
        // that a re-screen reads them (lib/market-read-failed).
        ...(failed ? { liveReadFailed: failed } : {}),
      };
      await writeResult(admin, dealId, "market", market);
      await markDone("market");
    }

    // Step 5 — verdict (synthesizes everything gathered above), told what
    // the screen established, as the comps and the market check were.
    await patchJob(dealId, { status: "running", step: "verdict", progress: 90 });
    await regenerateVerdict(admin, dealId, dealContext);

    await patchJob(dealId, {
      status: "done",
      step: "verdict",
      progress: 100,
      error: null,
    });
    // The run's clock stops here, when the reader sees the screen done —
    // never after the email, the picture lift or the cleanup below.
    finished = { doneAt: Date.now(), whole: resumedSteps === 0 };

    // Heads-up email (paused until RESEND_API_KEY and a sender a customer
    // receives mail from are set, lib/email; best-effort by design — the
    // screen itself is already complete), to whoever asked for the run.
    await notifyAnalysisReady(admin, dealId, { requestedBy });
  } catch (err) {
    // One sentence the analyst can act on; the raw failure goes to the log.
    const failure = describeRunFailure(err);
    console.error(`[pipeline] screen failed for deal ${dealId}: ${failure.detail}`);
    await patchJob(dealId, { status: "error", error: failure.message }).catch(() => {
      // the deal (and its job row) is gone — nothing left to tell
    });
    // The analyst has usually tabbed away; the screen-complete email never
    // comes for a run that stopped, so this one says so (best-effort).
    await notifyAnalysisFailed(createSupabaseAdminClient(), dealId, failure.message, { requestedBy });
  } finally {
    // Never rejects, and settles within SCREEN_PICTURE_MS: the turn is given
    // up with the memorandum the lift read, not while it still holds it.
    await pictureLift;
    releaseSlot?.();
    stopHeartbeat();
    await releaseOmSource(omSource);
  }
  return finished;
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
      .select("id, om_storage_path, extraction, first_signal, address, asset_class")
      .eq("id", dealId)
      .maybeSingle();

    if (error) throw new ScreenError(DATABASE_READ_FAILURE, error.message);
    if (!deal) throw new Error("Deal not found.");
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
    // construction and downtime is compared to the OM on the plan's terms —
    // the kind read with the first signal, as the screen's steps read it.
    // Built once, with the flood zone the screen's lookup stored, for the
    // reconciler and the verdict both.
    const flags = await storedSiteFlags(admin, dealId);
    const dealContext = dealContextFor(
      (deal.extraction as ExtractionResult | null) ?? null,
      flags ? { flood: flags.flood, pointIsBuilding: flags.pointIsBuilding } : null,
      (deal.first_signal as FirstSignal | null | undefined) ?? null,
      // The rent rules, read as the screen's own context reads them.
      screenRegulation(deal, flags),
    );
    const reconciliation = await reconcileModel(omSource, parsed, dealContext);

    await writeResult(admin, dealId, "reconciliation", reconciliation);

    // Fold the reconciliation into the verdict so the headline reflects it.
    await patchJob(dealId, { status: "running", step: "verdict", progress: 80 });
    await regenerateVerdict(admin, dealId, dealContext);

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
