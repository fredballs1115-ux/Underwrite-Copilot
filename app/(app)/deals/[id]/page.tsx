import Link from "next/link";
import { cookies } from "next/headers";
import { addressUpgrade } from "@/lib/address";
import { TZ_COOKIE, readerToday } from "@/lib/reader-day";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { FILED_PERSONAL, filedPersonalNotice } from "@/lib/personal-deal";
import { notFound } from "next/navigation";
import { ResearchPanel } from "./research-panel";
import { SectorFieldsForm } from "./sector-fields-form";
import type { SectorFieldValues } from "@/lib/sector-fields";
import { PublicCompsPanel } from "./public-comps-panel";
import { PropertyVisual } from "./property-visual";
import { DealHero, priceFigureOf, type HeroFigure } from "./deal-hero";
import { marketPictureFor } from "@/lib/market-picture";
import { DealStickyBar } from "./deal-sticky-bar";
import { PortfolioCard } from "@/app/portfolio-card";
import { InterestPanel } from "@/app/interest-panel";
import { AffordablePanel } from "@/app/affordable-panel";
import { RegulationPanel } from "@/app/regulation-panel";
import { regulationForDeal } from "@/lib/rent-regulation";
import { SingleTenantPanel } from "@/app/single-tenant-panel";
import { HotelPanel } from "@/app/hotel-panel";
import { StudentHousingPanel } from "@/app/student-housing-panel";
import { readStudentHousing } from "@/lib/student-housing";
import { ManufacturedHousingPanel } from "@/app/manufactured-housing-panel";
import { readManufacturedHousing } from "@/lib/manufactured-housing";
import { SelfStoragePanel } from "@/app/self-storage-panel";
import { readSelfStorage } from "@/lib/self-storage";
import { ForwardPanel } from "@/app/forward-panel";
import { readForwardPurchase } from "@/lib/forward-purchase";
import { MixedUsePanel } from "@/app/mixed-use-panel";
import { readMixedUse } from "@/lib/mixed-use";
import { GoingConcernPanel } from "@/app/going-concern-panel";
import { readGoingConcern } from "@/lib/going-concern";
import { CondoPanel } from "@/app/condo-panel";
import { readCondo } from "@/lib/condo";
import { SandwichPanel } from "@/app/sandwich-panel";
import { readSandwichLease } from "@/lib/sandwich-lease";
import { exchangeForDeal } from "@/lib/exchange-deal";
import { ExchangeChip } from "./exchange-chip";
import { SalePanel } from "@/app/sale-panel";
import { RosterPanel } from "@/app/roster-panel";
import { ValueAddPanel } from "@/app/value-add-panel";
import { TaxAbatementPanel } from "@/app/tax-abatement-panel";
import { SiteReportsPanel } from "@/app/site-reports-panel";
import { ListingTeam } from "./listing-team";
import { listingTeamOf, offersDueOf, offersDueUpgrade } from "@/lib/offering";
import { readAffordable } from "@/lib/affordable";
import { readSingleTenant } from "@/lib/single-tenant";
import { readHotelDeal } from "@/lib/hotel-deal";
import { readSale } from "@/lib/sale-terms";
import { readRoster } from "@/lib/tenant-roster";
import { readValueAdd } from "@/lib/value-add";
import { readTaxAbatement } from "@/lib/tax-abatement";
import { readSiteReports } from "@/lib/site-reports";
import { SALE_HURDLE_PCT, saleCeiling } from "@/lib/sale-ceiling";
import { withArticle } from "@/lib/article";
import { dealTypeLabel, interestTag, readInterest } from "@/lib/interest";
import { yieldOnCostText } from "@/lib/plan-facts";
import { goingInCapFigure, modelReturnsRead, noteCapSlot } from "@/lib/compare-interest";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { readSellerFinancing, sellerFinancingView } from "@/lib/seller-financing";
import { leaseholdExitView, readLeaseholdExit } from "@/lib/leasehold-exit";
import { readPortfolio } from "@/lib/portfolio";
import { loiTermsFor } from "@/lib/loi-terms";
import { PICTURE_CREDIT, ensureDealPicture, galleryPage, memorandumPhotoCredit } from "@/lib/deal-picture";
import { assetClassLabel } from "@/lib/asset-class";
import { countNoun } from "@/lib/asset-words";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { cacheFresh, resolveDealLocation, type DealVisualCache, placedByOpenStreetMap, pointIsBuilding } from "@/lib/deal-location";
import { claimRecordComps, runRecordComps } from "@/lib/public-comps/run";
import type { RecordCompsResult } from "@/lib/public-comps/core";
import { claimSiteFlags, runSiteFlags } from "@/lib/site-flags/run";
import { floodZoneLine, siteFlagsOutdated, siteFlagsStale, type NfhlLegendEntry, type SiteFlagsResult } from "@/lib/site-flags/core";
import { VENDORED_LEGEND, ensureFloodFrame, floodLegend } from "@/lib/flood-map";
import { FLOOD_FRAME_VERSION, floodFrameCurrent, pointKey } from "@/lib/flood-frame-core";
import { floodClassOfZone } from "@/lib/flood-style";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SiteFlagsCard } from "./site-flags-card";
import { PublicRecordCard } from "./public-record-card";
import { buildingSfRow, countNounOf, findGoingInCap, parsePrice, screenYearOf } from "@/lib/criteria";
import { after } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { dealTitle } from "@/lib/deal-title";
import { omLinkFor } from "@/lib/om-link";
import { dealFileLinkFor } from "@/lib/deal-file-link";
import { isPro } from "@/lib/billing";
import { type DealRow } from "@/lib/deals";
import { type DealDocument } from "@/lib/documents";
import type { UnderwritingModel } from "@/lib/model/types";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";
import {
  type ExtractionResult,
  type ChallengerResult,
  type BrokerCompsResult,
  type ReconciliationResult,
  type MarketResult,
  type VerdictResult,
  type ExtractedMetric,
  type FirstSignal,
} from "@/lib/anthropic/types";
import { DealView } from "./deal-view";
import { parseFactRow, type DealFact } from "@/lib/facts";
import type { ReconcileResult } from "@/lib/reconcile";
import { DealActions } from "./deal-actions";
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import { jobAgeMs, storedPreviousResults, verdictBehind } from "@/lib/screen-run";
import { documentKindWarning } from "@/lib/document-kind";
import { sameMemorandum, sameMemorandumTail, type SameMemorandum, type TwinDeal } from "@/lib/same-memorandum";
import { readingMemorandum } from "@/lib/screen-reading";
import {
  SCREEN_DURATION_SAMPLE,
  isScreenJob,
  typicalScreenMs,
  typicalScreenPhrase,
} from "@/lib/screen-duration";
import { StageSelect } from "./stage-select";
import { OffersDueControl } from "../offers-due";
import { ShareControl, type ShareRow } from "./share-control";
import { parseStageHistory } from "@/lib/stages";
import { parseDealNotes, parseDealQa } from "@/lib/deals";
import { deriveInternalComps } from "@/lib/internal-comps";
import {
  buildComps,
  marketMemoryFor,
  memoryCandidates,
  type MarketGroup,
  type MemoryKeyRow,
} from "@/lib/market-memory";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { type BuyBoxCheck } from "@/lib/criteria";
import { type MandateScore } from "@/lib/mandate";
import { BUY_BOX_CHIP_CLS, buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { OM_NOI_BASIS_LABEL, compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import {
  signalGoingInCap,
  assessPlausibility,
  askingPriceOf,
  buildingPriceOf,
  findPriceMetric,
  inferStrategy,
  isPlanDeal,
  buildsSomething,
  planSummary,
  signalAskPrice,
  unitCountRow,
} from "@/lib/deal-strategy";
import { PlanStrip, PlausibilityPanel } from "./plausibility-panel";
import { PlanSensitivity } from "./plan-sensitivity";
import type { DealTask, TaskAssignee } from "@/lib/deal-tasks";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { ActualsData } from "./property-actuals";
import { HOLD_MONTHS, deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import { yearOneNoi } from "@/lib/underwrite/playground";
import { type DealRateSeeds } from "@/lib/debt-index";
import { constructionSeedFor, modelMarketFor } from "@/lib/model-market";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { countyOf, placeDeal } from "@/lib/market-county";
import { BRIEF_NATIONAL_IDS, liveMarketBrief } from "@/lib/live-market-brief";
import { metroDemand } from "@/lib/metro-demand";
import { briefDelta, type BriefDelta } from "@/lib/brief-delta";
import { modelVsMarketFor, type ModelVsMarket } from "@/lib/model-vs-market";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import { snapshotVersion } from "@/lib/bridge/versions";
import { listSubmarkets } from "@/lib/market/store";
import { dealSubmarketCheck } from "@/lib/market/deal-checks";
import { SubmarketCard } from "./submarket-card";
import type { PlaygroundData } from "./sensitivity-playground";

const VERDICT_PILL = {
  pass: { label: "Go", cls: "bg-pass/10 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/10 text-caution" },
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
} as const;

/** First metric matching the pattern — for the three summary-bar figures. */
function findValue(
  metrics: ExtractedMetric[],
  include: RegExp,
  exclude?: RegExp,
): string | null {
  return (
    metrics.find(
      (m) => include.test(m.label) && !(exclude && exclude.test(m.label)),
    )?.value ?? null
  );
}

/** The point the deal's location cache holds for its current address, while
 *  the cache is fresh — read here, outside the render, since it reads the
 *  clock. */
function knownPointOf(
  cache: DealVisualCache | null,
  address: import("@/lib/address").StructuredAddress | null,
): { lat: number; lng: number } | null {
  return cacheFresh(cache, Date.now(), address) && typeof cache?.lat === "number" && typeof cache?.lng === "number"
    ? { lat: cache.lat, lng: cache.lng }
    : null;
}

/** The derived model's price, year-1 NOI and going-in cap, in the shape the
 *  compare table's rule reads a model by (lib/compare-interest). */
function derivedReturnsOf(inputs: UnderwriteInputs): { purchasePrice: number; year1Noi: number; goingInCapPct: number | null } {
  const year1Noi = yearOneNoi(inputs);
  return {
    purchasePrice: inputs.purchasePrice,
    year1Noi,
    goingInCapPct: inputs.purchasePrice > 0 ? (year1Noi / inputs.purchasePrice) * 100 : null,
  };
}

/** The deal's job row with its age on this server's clock (lib/screen-run
 *  `jobAgeMs`) — read here, outside the render, since it reads the clock. */
function jobWithAge<T extends { updated_at?: string | null; status: string; step: string | null }>(
  row: T | null,
): (T & { ageMs: number | null }) | null {
  return row ? { ...row, ageMs: jobAgeMs(row, Date.now()) } : null;
}

/** The tab says the deal (lib/deal-title), never the homepage's tagline. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return dealTitle(id);
}

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tab?: string; a?: string; filed?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode, tab, a: analysisParam, filed } = await searchParams;

  const supabase = await createSupabaseServerClient();
  // Request-cached: shares the layout's auth call instead of a second hop.
  const user = await getCurrentUser();

  // These five don't depend on each other — fetch them in one round trip's
  // worth of wall clock instead of five.
  const [
    pro,
    { data, error },
    { data: docsData },
    { data: jobData },
    siblings,
    sharesRes,
    factsRes,
    ownKeys,
  ] = await Promise.all([
      user ? isPro(supabase, user.id) : Promise.resolve(false),
      supabase.from("deals").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("deal_documents")
        .select(
          "id, deal_id, kind, filename, storage_path, content_type, created_at",
        )
        .eq("deal_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("analysis_jobs")
        // created_at: when the run was asked for, so the progress clock of a
        // page reloaded mid-screen counts from the run's start (lib/jobs).
        .select("status, step, progress, error, updated_at, created_at")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Internal comps memory: the user's other screened deals (RLS scopes to
      // own + shared team deals). Derivation filters to this asset class.
      supabase
        .from("deals")
        .select("id, name, asset_class, created_at, is_sample, verdict, extraction, user_id")
        .neq("id", id)
        .not("extraction", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
      // Live share links (pre-0017 schema: the query errors and data reads
      // null — the Share button simply shows an empty list).
      supabase
        .from("deal_shares")
        .select("id, created_at, expires_at")
        .eq("deal_id", id)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5),
      // Citation facts (pre-0018 schema: query errors, data reads null — the
      // deal simply shows no source chips rather than faking them).
      supabase
        .from("deal_facts")
        .select("id, field, value, unit, doc_label, page_number, located, locator_snippet, confidence, provenance")
        .eq("deal_id", id)
        .order("id", { ascending: true }),
      // Deal memory's own read: every deal the READER screened, never a
      // teammate's — the forty newest above are the whole team's, so a
      // busy team pushed the reader's own screens out of the count. Light:
      // the class and the market only, the rows the strip needs in full
      // are read once this deal's own class and market are known.
      user
        ? supabase
            .from("deals")
            .select("id, asset_class, is_sample, market:extraction->>market, ext_class:extraction->>assetClass")
            .eq("user_id", user.id)
            .neq("id", id)
            .not("extraction", "is", null)
            .limit(1000)
        : Promise.resolve({ data: null }),
    ]);

  if (error) {
    // A transient DB failure must not read as "this deal was removed" — let
    // the error boundary offer a retry instead.
    throw new Error(`Couldn't load the deal: ${error.message}`);
  }
  if (!data) {
    notFound();
  }

  const deal = data as DealRow;
  const firstSignal = deal.first_signal
    ? (deal.first_signal as FirstSignal)
    : null;
  // What the uploaded document is by its own pages (the first signal's
  // read): a warning where it is not an offering memorandum. Only a deal
  // screened from an upload; a deal typed in by hand has no document.
  const documentKindNotice = deal.om_storage_path ? documentKindWarning(firstSignal?.documentKind) : null;
  const extraction = deal.extraction
    ? (deal.extraction as ExtractionResult)
    : null;
  const challenges = deal.challenges
    ? (deal.challenges as ChallengerResult)
    : null;
  const comps = deal.comps ? (deal.comps as BrokerCompsResult) : null;
  const reconciliation = deal.reconciliation
    ? (deal.reconciliation as ReconciliationResult)
    : null;
  const market = deal.market ? (deal.market as MarketResult) : null;
  const verdict = deal.verdict ? (deal.verdict as VerdictResult) : null;
  const model = deal.model ? (deal.model as UnderwritingModel) : null;
  const compSearch = deal.comp_search
    ? (deal.comp_search as CompSearchResult)
    : null;
  // Both columns arrived in migration 0013 — select("*") simply won't carry
  // them on an older schema, so these read null/[] gracefully.
  const offersDueStored =
    ((deal as { offers_due?: string | null }).offers_due as string | null) ??
    null;
  // The memorandum's call for offers (#467) fills a deadline nobody set —
  // a deal screened before the screen wrote it — once, and only where the
  // column is still empty when the write lands: a date the reader typed is
  // never replaced.
  const offersDueFilled = (deal as { is_sample?: boolean }).is_sample
    ? null
    : offersDueUpgrade(offersDueStored, extraction);
  if (offersDueFilled) {
    try {
      await supabase.from("deals").update({ offers_due: offersDueFilled }).eq("id", id).is("offers_due", null);
    } catch {
      // read right on this page all the same
    }
  }
  const offersDue = offersDueStored ?? offersDueFilled;
  // What the memorandum states about the offering: its call for offers as
  // written, and the brokers to call (lib/offering).
  const offeringDue = offersDueOf(extraction);
  const listingTeam = listingTeamOf(extraction);
  const stageHistory = parseStageHistory(
    (deal as { stage_history?: unknown }).stage_history,
  );

  // What the user's own past screens said about deals like this one.
  const internalComps = deriveInternalComps(
    deal.id,
    (deal.asset_class as string | null) ?? "auto",
    extraction,
    (siblings.data ?? []) as Parameters<typeof deriveInternalComps>[3],
  );

  // Deal memory (Feature 6): the account's OWN prior screens of this exact
  // market + asset class, aggregated — found in the reader's own deals
  // (lib/market-memory `memoryCandidates`), then read in full. Started now
  // and awaited where the view is built, so the second read overlaps the
  // page's other work rather than adding a round trip.
  const currentClass =
    deal.asset_class && deal.asset_class !== "auto"
      ? (deal.asset_class as string)
      : (extraction?.assetClass ?? "");
  const memoryIds =
    extraction?.market && ownKeys.data
      ? memoryCandidates(ownKeys.data as MemoryKeyRow[], deal.id, currentClass, extraction.market)
      : [];
  const memoryRead: Promise<MarketGroup | null> = memoryIds.length
    ? (async () => {
        // A hundred ids a request keeps each URL well inside a proxy's limit.
        const batches: string[][] = [];
        for (let i = 0; i < memoryIds.length; i += 100) batches.push(memoryIds.slice(i, i + 100));
        const reads = await Promise.all(
          batches.map((ids) =>
            supabase
              .from("deals")
              .select("id, name, asset_class, created_at, is_sample, verdict, extraction")
              .in("id", ids),
          ),
        );
        const rows = reads.flatMap((r) => (r.data ?? []) as Parameters<typeof buildComps>[0]);
        return marketMemoryFor(buildComps(rows), deal.id, currentClass, extraction!.market!);
      })().catch(() => null)
    : Promise.resolve(null);

  const documents = (docsData ?? []) as DealDocument[];

  // The same memorandum, byte for byte, on an EARLIER deal the reader can see
  // (lib/same-memorandum): the fingerprint every screen stores with its
  // extraction, read once this deal's own screen has stored one. Said on the
  // newer deal with a link; never a reason to refuse anything. Started now,
  // awaited where the page is drawn.
  const fingerprint =
    deal.om_storage_path && !(deal as { is_sample?: boolean }).is_sample ? (extraction?.omFingerprint ?? null) : null;
  const twinRead: Promise<SameMemorandum | null> = fingerprint
    ? (async () => {
        let q = supabase
          .from("deals")
          .select("id, name, created_at")
          .neq("id", id)
          .eq("extraction->>omFingerprint", fingerprint);
        if (deal.created_at) q = q.lt("created_at", deal.created_at);
        const { data } = await q.order("created_at", { ascending: true }).limit(6);
        return sameMemorandum((data ?? []) as TwinDeal[]);
      })().catch(() => null)
    : Promise.resolve(null);

  const jobRow = jobData as {
    status: string;
    step: string | null;
    progress: number;
    error: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  } | null;
  // The row's age on THIS server's clock: a run past the stale line is
  // stalled (lib/screen-run `isStalled`) from the page's first paint, and
  // the browser never judges it on a clock of its own.
  const job = jobWithAge(jobRow);

  // A screen that failed midway, or one still running, leaves a MIXED
  // generation: the results from its step onward still belong to the
  // previous screen. Every surface below marks them, and the count of
  // finished steps excludes them (lib/screen-run) — only the ones the deal
  // stores: a first screen has no previous screen's results to mark.
  const staleResults = storedPreviousResults(job, { extraction, challenges, comps, market, verdict });
  const verdictLag = verdictBehind(job);

  // The call in the header and the sticky bar. While the verdict on file
  // is the previous screen's, it is drawn dashed and says so, so the header
  // never presents the last call as this run's.
  const basePill = verdict ? VERDICT_PILL[verdict.verdict] : null;
  const pill: { label: string; cls: string; note?: string } | null = basePill
    ? verdictLag
      ? {
          label: basePill.label,
          cls: `${basePill.cls} border border-dashed border-current`,
          note:
            verdictLag === "running"
              ? "The previous screen's call — a new screen of this deal is running and replaces it when it reaches the verdict"
              : verdictLag === "stalled"
                ? "The previous screen's call — the latest screen stopped making progress before it reached the verdict; start it again on this page"
                : "The previous screen's call — the latest screen failed before it reached the verdict",
        }
      : { label: basePill.label, cls: basePill.cls }
    : null;

  // Retrade watch: once a RE-screen finishes, diff it against the snapshot the
  // pipeline took of the previous run. Hidden while a job is in flight (the
  // stored results are mid-overwrite and would diff against themselves), and
  // after a FAILED run (a half-new extraction would diff against the old
  // snapshot under a verdict that never re-ran).
  const jobActive = job?.status === "queued" || job?.status === "running";
  // How long the reader's own screens have taken (lib/screen-duration):
  // read only while a screen is running, and only its newest finished runs'
  // stored times, start to finish (`usage.wallMs` — a reconciliation keeps
  // the row's step at "verdict" but never writes a ledger, so the time read
  // is the screen's) — one small query, overlapped with the rest of the
  // page. Fewer than three and the rail says no duration at all.
  const typicalScreenRead: Promise<{ phrase: string | null; ms: number | null }> =
    jobActive && user && isScreenJob(job?.step)
      ? (async () => {
          const { data } = await supabase
            .from("analysis_jobs")
            .select("ms:usage->wallMs, deals!inner(user_id)")
            .eq("deals.user_id", user.id)
            .eq("status", "done")
            .eq("step", "verdict")
            .not("usage", "is", null)
            .order("updated_at", { ascending: false })
            .limit(SCREEN_DURATION_SAMPLE);
          const ms = ((data ?? []) as Array<{ ms?: unknown }>).map((r) => r.ms);
          const median = typicalScreenMs(ms);
          return { phrase: typicalScreenPhrase(median), ms: median };
        })().catch(() => ({ phrase: null, ms: null }))
      : Promise.resolve({ phrase: null, ms: null });
  const priorScreen = (deal.prior_screen as PriorScreen | undefined) ?? null;
  const screenDiff =
    !jobActive && job?.status !== "error" && priorScreen && extraction
      ? computeScreenDiff(priorScreen, extraction, verdict)
      : null;

  // User-added supplements (deals.supplements): a note or a file per tab.
  type RawSupp = {
    notes?: { id: string; text: string; createdAt: string }[];
    files?: { id: string; name: string; path: string; createdAt: string }[];
  };
  const rawSupp = (deal.supplements as Record<string, RawSupp> | null) ?? {};
  // The link to the OM the user uploaded, and the base of every "p. N"
  // chip: a route that signs the file when it is clicked (lib/om-link), so
  // a page left open past the signed URL's hour still opens it.
  const omUrl = omLinkFor(id, deal.om_storage_path);
  // The building's own photograph — the cover of its memorandum, lifted out
  // on the first view and stored — leads the visual below. Null means the
  // overhead leads, as before.
  const picture = await ensureDealPicture(supabase, id, {
    omPath: (deal.om_storage_path as string | null) ?? null,
    isSample: !!(deal as { is_sample?: boolean }).is_sample,
    cache: (deal.photo as DealVisualCache | null) ?? null,
  });
  // The memorandum's other photographs (#448), as stored: read behind the
  // cover on an earlier view, never on the sample deal.
  const gallery = (deal as { is_sample?: boolean }).is_sample
    ? []
    : (((deal.photo as DealVisualCache | null)?.gallery ?? []).map((g) => ({
        // A page the deal's owner wrote is printed only as a page number.
        page: galleryPage(g.page),
        credit: memorandumPhotoCredit(g.page),
        // Its colours before its pixels (#463).
        preview: g.preview ?? null,
        // Its stored sizes, for the srcset a dense screen chooses from.
        width: g.width,
        height: g.height,
        fullWidth: g.fullWidth ?? null,
      })));
  const supplements: Record<
    string,
    {
      notes: { id: string; text: string; createdAt: string }[];
      files: { id: string; name: string; createdAt: string; url: string | null }[];
    }
  > = {};
  const ownership = deal as unknown as {
    user_id: string;
    team_id: string | null;
  };
  const buyBox = await getBuyBoxForDeal(ownership.user_id, ownership.team_id).catch(() => null);
  // Each file links to the route that signs it when it is clicked
  // (lib/deal-file-link), as the OM's link does, so a page left open past a
  // signed URL's hour still opens it. Nothing is signed at render.
  for (const [tabKey, s] of Object.entries(rawSupp)) {
    supplements[tabKey] = {
      notes: s.notes ?? [],
      files: (s.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
        url: dealFileLinkFor(id, f.path),
      })),
    };
  }

  // A team member's new deal the create action filed in their own pipeline
  // (`?filed=personal`, lib/personal-deal): said where they land, since the
  // pipeline they share will not show it. Only while it is still so — the
  // reader's own deal, in no team's pipeline, and the reader on a team.
  const filedPersonal =
    filed === FILED_PERSONAL && !!user && ownership.user_id === user.id && !ownership.team_id
      ? !!(await supabase.from("team_members").select("team_id").eq("user_id", user.id).maybeSingle()).data
      : false;

  // Delete is the creator's or the team owner's (the RLS delete policy); a
  // teammate is not offered it rather than refused after the fact.
  let canDelete = !!user && ownership.user_id === user.id;
  if (!canDelete && user && ownership.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("owner_id")
      .eq("id", ownership.team_id)
      .maybeSingle();
    canDelete = team?.owner_id === user.id;
  }

  // Judge the buy box against the full extraction when it's in; until then,
  // the first signal stands in — so "outside your box" can surface ~30s into
  // a screen instead of minutes later. The user-entered property address
  // widens the location haystack in every case (city, county, state).
  // Placed by its address (#441): a deal uploaded with the address box empty
  // takes the one its memorandum states, and a typed line gets the street,
  // city and state it names — written once, so the pictures, the flood map
  // and the market check read it too.
  const addressUpgraded = (deal as { is_sample?: boolean }).is_sample
    ? null
    : addressUpgrade(deal.address, extraction);
  if (addressUpgraded) {
    try {
      await supabase.from("deals").update({ address: addressUpgraded }).eq("id", id);
    } catch {
      // read right on this page all the same
    }
  }
  const dealAddress =
    addressUpgraded ??
    (deal.address as import("@/lib/address").StructuredAddress | undefined) ??
    null;
  // The kind rides along as the page infers it (extraction + first signal),
  // so the buy box judges a development's land cost and keeps a plan
  // deal's "no going-in cap" reading — the same read the summary bar makes.
  // lib/buy-box-chip is the one read the screen-complete email makes too,
  // so its chip never disagrees with this page's.
  const checkSource = dealCheckSource(extraction, firstSignal, dealAddress);
  const boxRead = buyBox ? buyBoxRead(deal.asset_class, checkSource, buyBox) : null;
  const buyBoxChecks: BuyBoxCheck[] = boxRead?.checks ?? [];
  // The single 0–100 mandate-fit read (Feature 4) — same evidence as the
  // per-criterion checks above, rolled into one number and a PURSUE/WATCH/PASS
  // call. Null until there's a box AND something checkable against it.
  const mandate: MandateScore | null = boxRead?.mandate ?? null;

  // Site flags (flood zone / Opportunity Zone / census tract): same stored-
  // result + backfill-on-render protocol as public comps below. The column
  // may predate migration 0030 on a live DB — a missing column simply reads
  // as null here and the claim's update no-ops server-side, so the card
  // shows "checking…" instead of erroring. Flags looked up for the address
  // the deal had before an edit are the old building's (#447): not shown,
  // not read for the county, and looked up again.
  const storedFlags =
    ((deal as { site_flags?: SiteFlagsResult | null }).site_flags) ?? null;
  const flagsStale = siteFlagsStale(storedFlags, dealAddress?.label);
  const siteFlags = flagsStale ? null : storedFlags;
  // A lookup made before the place was read (#452) still stands for its
  // tract and flood zone, and is made again behind the page so the rules
  // can read the building's municipality.
  const flagsOutdated = siteFlagsOutdated(siteFlags);
  if (dealAddress?.label && (!siteFlags || siteFlags.status === "pending" || flagsOutdated)) {
    after(async () => {
      try {
        if (await claimSiteFlags(id, flagsStale || flagsOutdated)) await runSiteFlags(id);
      } catch {
        // pre-0030 DB — nothing to store onto yet
      }
    });
  }
  // Where the deal is, answered once for every surface on the page
  // (lib/market-county, #447): the briefed market its address names, a
  // metro area whose figures are read, the market the live figures are
  // read for — the metro area its county sits in where the address names
  // no place a market's keywords know — and the county itself.
  const placement = placeDeal(dealAddress, countyOf(dealAddress, siteFlags));

  // Since this screen (lib/brief-delta): the figures the market check read
  // on the day it ran, against the same figures read today through the
  // page's cached readers — so a check opened weeks later says whether the
  // asking rent, the metro's vacancy or the permits year moved since. Only
  // where the check stored figures and the deal still maps to a covered
  // market; a read that fails leaves the check as it was.
  // The figures are read ONCE, through the page's cached readers, for two
  // checks: this one, and the model's assumptions against the published
  // figures further down (lib/model-vs-market), which needs the national
  // table for every deal and the metro's own series inside a covered market.
  let marketSince: BriefDelta | null = null;
  const storedBrief = market?.liveBrief ?? null;
  // The market the live figures are read for: the covered metro where the
  // address sits in one, the state's own series otherwise (the same table,
  // filed under `state:PA`), every surface saying which grain it read.
  const liveMarket = placement.live;
  let reads: TodayReads | null = null;
  if (extraction || (storedBrief?.figures && storedBrief.figures.length > 0)) {
    try {
      reads = await todayReads(liveMarket);
    } catch (err) {
      console.warn("live figures read failed:", err instanceof Error ? err.message : err);
    }
  }
  // Only against the same market: a check stored for the state before the
  // county placed the deal in its metro area, or for an address since
  // edited, is a different market's figures, and no move between the two
  // is a move.
  // The deal's class as every surface shows it (shownAssetClass): the
  // analyst's where they filed one, the deck's where they left "Auto". The
  // market check reads the same (lib/anthropic/pipeline), so the page's
  // since-this-screen, demand card and portfolio card read one class.
  const readClass = shownAssetClass(deal.asset_class as string | null, extraction) || null;
  if (storedBrief?.figures && storedBrief.figures.length > 0 && liveMarket && reads && storedBrief.metro === liveMarket.name) {
    const today = liveMarketBrief({
      metro: liveMarket,
      rates: reads.rates,
      zori: reads.zori,
      realtor: reads.realtor,
      now: reads.now,
      national: reads.national.filter((r) => BRIEF_NATIONAL_IDS.includes(r.meta.id)),
      assetClass: readClass,
      deckWords: extraction?.assetClass ?? null,
      plan: isPlanDeal(inferStrategy(extraction, firstSignal).kind),
      builds: buildsSomething(extraction, inferStrategy(extraction, firstSignal).kind),
    });
    marketSince = briefDelta(storedBrief.readOn, storedBrief.figures, today?.figures ?? []);
  }

  // The three summary-bar figures — a 5-second read, nothing more. The full
  // metric set lives one click away in Financials.
  const metrics = extraction?.metrics ?? [];

  // What kind of deal this is, what its plan says (stabilized NOI, cost,
  // yield on cost), and whether its headline figures can all be true at
  // once — pure code over the extraction. On a conversion a $21M stabilized
  // NOI over a $20M price is the plan and shows as such; on a deal read as
  // stabilized the same pair is a misread, and is named as such, above
  // every number built on it. Read first: the actuals check, the summary
  // bar and every panel below take the kind from here.
  const strategy = inferStrategy(extraction, firstSignal);
  const plan = planSummary(extraction, strategy);
  const plausibility = assessPlausibility(extraction, strategy);
  const interest = readInterest(extraction, askingPriceOf(extraction));
  // A note's or a leased fee's deal type describes a building the price does
  // not buy, so the header says whose (lib/interest `dealTypeLabel`).
  const summaryStrategy = strategy.kind === "unknown" ? null : dealTypeLabel(strategy.label, extraction);

  // Property actuals (Feature 1), deal tasks (Feature 7), and the team
  // roster — four independent reads, one round-trip. All best-effort: the
  // actuals/tasks tables arrived in 0020/0022, and on an older schema the
  // queries error and read null (the cards simply don't render).
  const [rrRes, t12Res, tasksRes, versionsRes, memberRes] = await Promise.all([
    supabase
      .from("deal_rent_rolls")
      .select("as_of_date, summary")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("deal_t12_statements")
      .select("period_end_date, summary")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("deal_tasks")
      .select(
        "id, title, assignee_user_id, due_date, done, completed_at, source, created_by, created_at",
      )
      .eq("deal_id", id)
      .order("created_at", { ascending: true }),
    // Saved assumption versions (Phase 1). Best-effort: pre-0030 schemas
    // error and the bridge link simply doesn't render.
    supabase
      .from("deal_versions")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", id),
    ownership.team_id
      ? supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", ownership.team_id)
      : Promise.resolve({ data: null }),
  ]);
  const t12Summary = (t12Res.data?.summary as T12Summary | undefined) ?? null;
  // The OM's NOI vs the T-12 actual — the shared picker (word-bounded,
  // per-unit-safe, same one the challenger note uses), which reads the
  // deal's kind: on a plan deal the in-place or Year-1 figure is compared
  // and the stabilized pro forma never is — it describes the finished
  // project, three years away, and is judged on yield on cost. Degenerate
  // actual NOI (0 / non-finite) renders no comparison rather than an
  // infinite delta.
  const omPick = pickOmNoi(metrics, strategy.kind);
  const omNoi = omPick?.noi ?? null;
  const noiNote = isPlanDeal(strategy.kind)
    ? omPick
      ? `${withArticle(strategy.label.toLowerCase(), true)}: the T-12 is held against the OM's ${OM_NOI_BASIS_LABEL[omPick.basis]}. The stabilized pro forma describes the finished project and is judged on yield on cost, never against today's actuals.`
      : t12Summary
        ? `${withArticle(strategy.label.toLowerCase(), true)}: the OM states only the finished project's NOI, so there is nothing to hold the T-12 against until an in-place figure is stated. The stabilized pro forma is judged on yield on cost.`
        : null
    : null;
  const actuals: ActualsData = {
    rentRoll: rrRes.data?.summary
      ? {
          asOf: (rrRes.data.as_of_date as string | null) ?? null,
          summary: rrRes.data.summary as RentRollSummary,
        }
      : null,
    t12: t12Summary
      ? {
          periodEnd: (t12Res.data?.period_end_date as string | null) ?? null,
          summary: t12Summary,
        }
      : null,
    noiComparison:
      omNoi != null &&
      t12Summary?.noi != null &&
      Number.isFinite(t12Summary.noi) &&
      t12Summary.noi !== 0
        ? compareNoi(omNoi, t12Summary.noi, omPick)
        : null,
    noiNote,
    // An apartment roll is read per unit a month, an office's per foot.
    assetClass: readClass,
  };

  // Sensitivity playground (Feature 2 of the competitive spec): the deal's
  // base underwriting model — actuals folded in — computed once server-side;
  // the sliders recompute it in the browser via the same pure engine.
  // Today's debt indices off the rates table (lib/debt-index-read): the
  // model's rate starts from the Treasury tenor nearest its hold plus the
  // class spread, the construction panel's from 30-day SOFR plus its own —
  // the same read the workbook and report routes make, so no two surfaces
  // print a different rate for one deal on one day. Never on the sample,
  // whose figures are pinned (lib/model-market).
  const debt = await liveDebtSeeds(HOLD_MONTHS);
  // Today on the reader's own calendar (their browser's zone, from its
  // cookie — lib/reader-day), read once here and handed to what the page
  // draws: the offers-due countdown in the header, the tasks' due dates, the
  // Opportunity Zone round's line and the rent allowance in force.
  const todayIso = readerToday((await cookies()).get(TZ_COOKIE)?.value);
  // The rent rules that reach the building (lib/rent-regulation), read once
  // through the one call every surface makes — at the address the page reads
  // the deal at, with the Census place and county only from flags answered
  // for it, in the deal's one class, on the reader's day — for the panel, the
  // model's cover lines and its rent-growth check against the market.
  const regulation = regulationForDeal(
    { extraction, address: dealAddress, siteFlags, assetClass: deal.asset_class as string | null },
    todayIso,
  );
  const derived = extraction
    ? deriveUnderwriteInputs(
        extraction,
        deal.name,
        {
          rentRoll: actuals.rentRoll
            ? { summary: actuals.rentRoll.summary, asOf: actuals.rentRoll.asOf }
            : null,
          t12: actuals.t12
            ? { summary: actuals.t12.summary, periodEnd: actuals.t12.periodEnd }
            : null,
        },
        modelMarketFor((deal as { is_sample?: boolean }).is_sample, debt),
        { regulation },
      )
    : null;
  // The seller's loan, where the memorandum offers it for assumption
  // (#417): priced against the model's own new loan at the model's own
  // rate — today's index plus the class spread wherever the table seeded
  // it. Only where the price buys the building (lib/assumable-debt).
  const assumableRead = extraction ? readAssumable(extraction, derived?.inputs ?? null) : null;
  const assumable = assumableRead
    ? assumableView(assumableRead, derived?.sources.allInRatePct?.note ?? null, !!derived?.meta.rateSeed)
    : null;
  // A note the seller offers to carry (#462): the same comparison, the
  // note in the seller's loan's place.
  const sellerRead = extraction ? readSellerFinancing(extraction, derived?.inputs ?? null) : null;
  const sellerNote = sellerRead
    ? sellerFinancingView(sellerRead, derived?.sources.allInRatePct?.note ?? null, !!derived?.meta.rateSeed)
    : null;
  // A leasehold's exit, valued on the term its ground lease has left at the
  // model's sale (#421) — only where the memorandum states when it ends.
  const leaseholdRead = extraction ? readLeaseholdExit(extraction, derived?.inputs ?? null) : null;
  const leaseholdExit = leaseholdRead ? leaseholdExitView(leaseholdRead) : null;
  const rateSeeds: DealRateSeeds = {
    permanent: derived?.meta.rateSeed ?? null,
    construction: constructionSeedFor((deal as { is_sample?: boolean }).is_sample, debt),
  };
  const playground: PlaygroundData | null = derived
    ? {
        inputs: derived.inputs,
        dealAssetClass: deal.asset_class,
        checkSource,
        box: buyBox,
        // A plan deal's price ⇄ cap control must say its cap is year-1
        // income as modelled, not the finished project's pro forma.
        strategy: derived.meta.strategy ?? null,
        // Where each input came from: a placeholder price or an assumed NOI
        // makes the returns a placeholder's, withheld as the report withholds
        // them (lib/underwrite/report-grid).
        sources: derived.sources,
        // What the price buys, by the compare table's rule on this model
        // (lib/compare-interest): a note's, a position's or such a share's
        // returns are the building's at a price that did not buy it, and
        // the tiles withhold them as the first-draft card does.
        interest: modelReturnsRead(extraction, derivedReturnsOf(derived.inputs), new Date(`${todayIso}T12:00:00Z`)),
      }
    : null;
  // The cap the plan's yield on cost is measured against: the model's own
  // exit-cap assumption, with its provenance, so the spread is against a
  // number the reader can see and change.
  const refCap = derived
    ? {
        pct: derived.inputs.exitCapPct,
        provenance: derived.sources.exitCapPct?.provenance ?? ("assumption" as const),
      }
    : null;

  // Submarket supply & pipeline (Phase 4). Both reads are best-effort: on a
  // pre-0033 schema the queries error, the card doesn't render, and nothing
  // else on the page notices.
  const [userSubmarkets, submarketCheck] = await Promise.all([
    user
      ? listSubmarkets(supabase, user.id).catch(() => [])
      : Promise.resolve([]),
    dealSubmarketCheck(supabase, id, deal.name, extraction).catch(() => null),
  ]);

  // Assumption Bridge (Phase 1): snapshot the deal's live assumption set
  // whenever it has actually MOVED since the last version. Deferred with
  // after() so it never sits in the render path, and silent on a pre-0030
  // schema — a missing versions table must not break the deal page.
  const versionCount = versionsRes.error ? 0 : (versionsRes.count ?? 0);
  if (playground && user) {
    const snapshotInputs = playground.inputs;
    after(async () => {
      try {
        const client = await createSupabaseServerClient();
        await snapshotVersion(client, {
          dealId: id,
          userId: user.id,
          assumptions: snapshotInputs,
        });
      } catch {
        // best-effort
      }
    });
  }

  // Deal tasks (Feature 7): assignable to-dos with owners and due dates.
  // Best-effort — pre-0022 schemas error and the card doesn't render.
  const dealTasks: DealTask[] | null = tasksRes.error
    ? null
    : ((tasksRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        assigneeUserId: (r.assignee_user_id as string | null) ?? null,
        dueDate: (r.due_date as string | null) ?? null,
        done: !!r.done,
        completedAt: (r.completed_at as string | null) ?? null,
        source: r.source === "verdict" ? "verdict" : "manual",
        createdBy: (r.created_by as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }));

  // Who a task can be assigned to: the viewer, plus (team deals) the roster.
  // Teammate emails read under the "teammates read profiles" policy (0007).
  const taskAssignees: TaskAssignee[] = [];
  // Who asked each of Ask's questions on a team deal, named the way the
  // pipeline names who added a deal (`full_name`, else the email) — from
  // the same profile rows, so it costs no query of its own. Null on a
  // personal deal, whose thread names no one.
  const askerNames: Record<string, string> | null = ownership.team_id ? {} : null;
  if (user) {
    taskAssignees.push({
      userId: user.id,
      label: user.email ? `${user.email.split("@")[0]} (you)` : "You",
    });
    if (ownership.team_id) {
      const otherIds = ((memberRes.data ?? []) as { user_id: string }[])
        .map((m) => m.user_id)
        .filter((uid) => uid !== user.id);
      if (otherIds.length) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", otherIds);
        for (const p of (profileRows ?? []) as {
          id: string;
          email: string | null;
          full_name: string | null;
        }[]) {
          taskAssignees.push({
            userId: p.id,
            label:
              (p.full_name ?? "").trim() ||
              (p.email ? p.email.split("@")[0] : "teammate"),
          });
          if (askerNames) askerNames[p.id] = p.full_name || p.email || "Teammate";
        }
      }
    }
  }

  // Citation facts, keyed by field label for the source chips (Feature 2).
  // Empty for deals screened before migration 0018 — no chips, never faked.
  const factsByField: Record<string, DealFact> = {};
  for (const row of (factsRes.data ?? []) as Record<string, unknown>[]) {
    const f = parseFactRow(row);
    if (!(f.field in factsByField)) factsByField[f.field] = f;
  }
  // The shared price reader; on a development with no asking price the land
  // or site cost is what is being bought. Before the extraction lands the
  // first signal's ask fills the slot — only when it is a figure, never an
  // "unpriced" or a "call for offers" printed where a price goes.
  const summaryPrice =
    findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? signalAskPrice(firstSignal);
  // The shared size reader: the building's row, never the land's or a
  // unit's.
  const sizeSf = buildingSfRow(metrics)?.value ?? null;
  // The shared count reader: the row that counts the units, never a "Unit
  // mix" row ahead of it.
  const sizeUnits = unitCountRow(metrics)?.value ?? null;
  // A bare count ("248") reads wrong in a Size slot — say what it counts, in
  // the row's own noun (a hotel's "Keys" row says keys) or the class's.
  const shownClass = shownAssetClass(deal.asset_class as string | null, extraction);
  const sizeUnitsRow = unitCountRow(metrics);
  const summarySize =
    sizeSf ??
    (sizeUnits
      ? /^[\d,]+$/.test(sizeUnits.trim())
        ? `${sizeUnits.trim()} ${countNoun(sizeUnitsRow?.label, shownClass)}`
        : sizeUnits
      : null) ??
    (firstSignal?.size.trim() || null);
  // The going-in cap only: a stabilized / pro forma cap or a yield on cost
  // describes the finished project on a plan deal, and would read as the
  // price's cap rate in this slot.
  // The first signal's cap is a fast read with no label to check; before the
  // extraction lands it fills this slot only when it can be a cap on the
  // price at all (a 105% "cap" is a yield on cost or a pro forma, not a cap).
  // The shared going-in cap reader — the same call the buy box, the mandate
  // and the memories make. A plan deal has no going-in cap (the pipeline
  // row's rule, `pickSlots`): its slot carries the yield on total cost.
  const summaryCap = plan
    ? null
    : (findGoingInCap(metrics)?.value ?? signalGoingInCap(firstSignal)?.text ?? null);
  const summaryYoc = plan?.yieldOnCost != null ? yieldOnCostText(plan.yieldOnCost) : null;

  // The model's assumptions against the published figures (lib/model-vs-market):
  // rent growth against the metro's asking rents and its sitting tenants'
  // rents, expense growth against consumer prices, vacancy against the
  // survey's metro figure inside its margin, and the exit cap's spread over
  // today's 10-year beside the going-in cap's — the same reads as above,
  // the memorandum's stated cap (the summary bar's own rule, read inside
  // `modelVsMarketFor` so the report and the workbook set the exit against
  // the same figure; none on a note, whose bar withholds it while the model
  // runs the collateral as if bought outright); where it states none, the
  // cap its NOI implies on its price, said as such; no model call.
  // Null where there is no model or nothing fresh to read it against.
  const modelRead: ModelVsMarket | null =
    derived && reads
      ? modelVsMarketFor({
          derived,
          extraction,
          firstSignal,
          storedAssetClass: deal.asset_class as string | null,
          metro: liveMarket,
          reads,
          regulation,
        })
      : null;
  // Year built feeds the rules engine's age-based coverage tests (NYC
  // pre-1974, JC pre-1987, LA pre-1979, MoCo's rolling-age exemption). The
  // plausibility window guards against a mis-matched metric value.
  const yearBuiltRaw = findValue(metrics, /\byear built\b/i)?.match(/\d{4}/)?.[0];
  const yearBuiltNum = yearBuiltRaw ? Number(yearBuiltRaw) : null;
  const summaryYearBuilt =
    yearBuiltNum != null && yearBuiltNum >= 1700 && yearBuiltNum <= 2100 ? yearBuiltNum : null;

  // Public-record comps (auto-comps v2): render whatever the background pull
  // stored; when a deal has an address but nothing stored yet (pre-feature
  // deals, or a save whose after() died in a deploy), kick the pull now —
  // claimRecordComps's sentinel makes double-fires harmless.
  const publicComps =
    ((deal as { public_comps?: RecordCompsResult | null }).public_comps) ?? null;
  // The price the building's own figures describe (#415) — a share's
  // grossed up to the whole, none for a note or a leased fee — which the
  // public-record comps' median call and the research panel's per-unit
  // read divide; the header still shows the price as asked.
  const priceTag = interestTag(extraction);
  const subjectPriceNumber = buildingPriceOf(extraction, summaryPrice ? parsePrice(summaryPrice) : null);
  // Also re-kick a lingering "pending" sentinel: a deploy can kill the
  // after() worker between claim and result, and claimRecordComps's
  // stale-pending reclaim (10-min threshold) is only reachable if someone
  // calls it — page refreshes are that someone.
  if (dealAddress?.label && (!publicComps || publicComps.status === "pending")) {
    after(async () => {
      if (await claimRecordComps(id)) await runRecordComps(id);
    });
  }

  // The Flood tab (#472): the deal's flood frame, drawn once and kept
  // (lib/flood-map). Where the location this page already knows has a
  // current frame, its key rides with the page; where it has none, the frame
  // is drawn behind the page, so it is usually there by the time the view is
  // opened — the view waits for it otherwise. A street address only, and
  // never a placement no finer than a neighbourhood: neither centre is the
  // building. FEMA's legend names the building's zone: its own, cached a
  // day, or the runner's copy when it has not answered in 1.5 s.
  const floodStreet = !!dealAddress?.street?.trim();
  const visualCache = (deal.photo as DealVisualCache | null) ?? null;
  const knownPoint = knownPointOf(visualCache, dealAddress);
  const floodArea = !!knownPoint && visualCache?.geoPrecision === "area";
  const floodFrame = knownPoint && floodFrameCurrent(visualCache?.floodFrame, knownPoint) ? visualCache?.floodFrame ?? null : null;
  if (floodStreet && !floodArea && !floodFrame) {
    after(async () => {
      try {
        const admin = createSupabaseAdminClient();
        const loc = await resolveDealLocation(admin, id, dealAddress, visualCache);
        if (loc && loc.precision !== "area") await ensureFloodFrame(admin, id, loc, visualCache);
      } catch {
        // drawn on the view's own ask instead
      }
    });
  }
  const floodLegendRead: Promise<NfhlLegendEntry[]> = floodStreet
    ? Promise.race([
        floodLegend(),
        new Promise<NfhlLegendEntry[]>((resolve) => setTimeout(() => resolve(VENDORED_LEGEND), 1500)),
      ])
    : Promise.resolve(VENDORED_LEGEND);

  // The buy-box call as one chip (lib/buy-box-chip's `buyBoxChip`: the
  // mandate-fit score leads — "Fit 82 · Pursue" — unless a hard "outside"
  // fold wins, and the older fold stands in without a score), toned by the
  // same map the sensitivity playground's chip reads.
  const buyBoxChip = boxRead
    ? { label: boxRead.chip.label, cls: BUY_BOX_CHIP_CLS[boxRead.chip.tone] }
    : null;

  const addressLine =
    extraction?.address ||
    dealAddress?.label ||
    extraction?.market ||
    firstSignal?.market ||
    null;

  const floodLegendEntries = await floodLegendRead;
  const marketMemory = await memoryRead;
  const typicalScreen = await typicalScreenRead;
  const sameFile = await twinRead;

  // The photograph the deal's market is known by, leading the picture where
  // the building has none of its own and no Street View (#439) — the one its
  // pipeline card shows (#438), from the same reader.
  const marketPicture = marketPictureFor(dealAddress, extraction?.market ?? null, placement.briefed ?? placement.read, placement.county);

  // A development's price row is its land cost, and a plan deal's cap slot is
  // its yield on total cost — the same words the pipeline row and the meeting
  // .xlsx use. The price as asked, labelled with what it buys where that is
  // not the building outright (#415): "Price · 49% share". The header draws
  // both, and the bar that keeps the deal in view repeats them word for word
  // (#437), so a price never stands alone without what it buys. A price
  // stated as a range is drawn short, the range as stated in its title.
  const priceFigure: HeroFigure = priceFigureOf(
    `${plan?.priceLabel === "Land cost" ? "Land cost" : "Price"}${priceTag ? ` · ${priceTag}` : ""}`,
    summaryPrice ?? null,
  );
  // A note has no going-in cap (lib/compare-interest, #423's rule, which the
  // key terms and the compare table keep): the collateral's income over a
  // loan's price is a cap nobody earns, so the slot says the note's yield to
  // maturity at its price, or that the cap is withheld — and a preferred
  // equity position's yield to redemption, its price buying a rate and a
  // redemption, never a slice of the building.
  const returnFigure: HeroFigure = plan
    ? { label: "Yield on cost", value: summaryYoc ?? null, figure: true }
    : { ...goingInCapFigure(extraction, summaryCap ?? null), figure: true };
  const noteCap = noteCapSlot(extraction);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deals"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← All deals
      </Link>

      {filedPersonal && (
        <p role="status" data-qa="filed-personal" className="rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
          {filedPersonalNotice(TEAM_TRIAL_DEALS)}
        </p>
      )}

      {/* The first signal read the upload as something other than an
          offering memorandum (lib/document-kind): said, never acted on —
          the screen runs as it would on an OM. */}
      {documentKindNotice && (
        <p role="status" data-qa="document-kind" className="rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
          {documentKindNotice}
        </p>
      )}

      {/* The same file already on an earlier deal (lib/same-memorandum). */}
      {sameFile && (
        <p role="status" data-qa="same-memorandum" className="rounded-lg bg-brand/5 px-3 py-2 text-sm">
          {"This same memorandum, byte for byte, is already on "}
          <Link href={`/deals/${sameFile.id}`} className="font-medium text-brand hover:text-brand-strong">
            {sameFile.name}
          </Link>
          {sameMemorandumTail(sameFile)}
        </p>
      )}

      {/* THE summary bar — the deal in five seconds, no scrolling: the
          building's picture, its name, the call, the buy-box fit, the
          address and class, and exactly three figures, laid out the way a
          listing opens (#433). Everything else is one click below. */}
      <DealHero
        title={deal.name as string}
        chips={
          <>
            {pill && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
                title={pill.note}
                data-qa={pill.note ? "call-previous" : undefined}
              >
                {pill.label}
                {pill.note ? <span className="sr-only">, the previous screen&apos;s call</span> : null}
              </span>
            )}
            {buyBoxChip && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${buyBoxChip.cls}`}>
                {buyBoxChip.label}
              </span>
            )}
          </>
        }
        subtitle={
          <>
            {addressLine ? <>{addressLine} · </> : null}
            {/* The class as the label map says it — never a stored
                "self_storage" or a form's "auto" — and, on a deal filed
                "Auto-detect", what the deck turned out to be. */}
            {assetClassLabel(shownClass) || "Asset class not read yet"}
          </>
        }
        figures={[
          priceFigure,
          { label: "Size", value: summarySize ?? null, figure: true },
          returnFigure,
          { label: "Deal type", value: summaryStrategy ?? null, title: strategy.summary || undefined },
        ]}
        // While a first screen has not yet written the terms of a memorandum,
        // a figure not read yet shimmers; once they are written, a missing
        // one keeps its dash — the pipeline row's own rule (`readingTerms`).
        // A deal typed in by hand has no memorandum to read, and a re-screen
        // shows the terms on file until the new ones land.
        reading={!!deal.om_storage_path && !extraction && readingMemorandum(job)}
        picture={
          /* What the place actually looks like. The USGS aerial needs no
             API key, so something real renders for every deal with an
             address; the Street and Satellite views need GOOGLE_MAPS_API_KEY
             (two separate Google APIs on the one key) and are where the
             sharp imagery comes from. */
          dealAddress?.label || picture || marketPicture || gallery.length > 0 ? (
            <PropertyVisual
              dealId={id}
              label={dealAddress?.label ?? (deal.name as string)}
              hasStreetAddress={!!dealAddress?.street}
              // The aerial's centre is ringed only where it is the building's
              // own point (lib/deal-location), never a street's or a town's.
              pointIsBuilding={pointIsBuilding(visualCache, dealAddress)}
              // Photon placed the point (the Census geocoder found nothing):
              // the pictures framed on it credit OpenStreetMap.
              osmPlaced={placedByOpenStreetMap(visualCache, dealAddress)}
              // Never Google's: the visual draws USGS's aerial, FEMA's flood
              // map and an OpenStreetMap view beside its pictures, and Google's
              // Maps Platform terms (zori probe run 37266021924) forbid its
              // services "with or near a non-Google Map" — Street View "and
              // non-Google Maps on the same screen" by name.
              googleEnabled={false}
              hasAddress={!!dealAddress?.label}
              picture={
                picture
                  ? {
                      credit: PICTURE_CREDIT[picture.source],
                      source: picture.source,
                      preview: picture.preview ?? null,
                      width: picture.width,
                      height: picture.height,
                      fullWidth: picture.fullWidth ?? null,
                    }
                  : null
              }
              canReplace={!(deal as { is_sample?: boolean }).is_sample}
              market={marketPicture}
              gallery={gallery}
              flood={
                floodStreet && !floodArea
                  ? {
                      src: `/api/deals/${id}/flood?v=${FLOOD_FRAME_VERSION}.${knownPoint ? pointKey(knownPoint) : "0"}`,
                      classes: floodFrame ? { page: floodFrame.classes.page, full: floodFrame.classes.full } : null,
                      here:
                        siteFlags?.flood && siteFlags.flood !== "unavailable"
                          ? floodClassOfZone(floodLegendEntries, siteFlags.flood.zone, siteFlags.flood.subtype)
                          : null,
                      zone: siteFlags?.flood && siteFlags.flood !== "unavailable" ? `Zone ${siteFlags.flood.zone}` : null,
                      line: floodZoneLine(siteFlags?.flood, floodLegendEntries),
                    }
                  : null
              }
            />
          ) : null
        }
        actions={
          <>
            {verdict && !(deal as { is_sample?: boolean }).is_sample && (
              <ShareControl
                dealId={id}
                shares={((sharesRes.data ?? []) as ShareRow[])}
                appUrl={
                  process.env.NEXT_PUBLIC_APP_URL ??
                  "https://underwrite-copilot.onrender.com"
                }
              />
            )}
            {verdict && (
              <a
                href={`/api/deals/${id}/memo`}
                title={
                  pro
                    ? "One-page IC screening memo — verdict, buy-box fit, flags, next steps"
                    : "One-page IC screening memo — part of Pro"
                }
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-muted"
                  aria-hidden
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M15 2v5h5" />
                  <path d="M10 12h4" />
                  <path d="M10 16h4" />
                </svg>
                IC memo
                {!pro && (
                  <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
                    Pro
                  </span>
                )}
              </a>
            )}
            {verdict && (
              <a
                href={`/api/deals/${id}/report`}
                title={
                  pro
                    ? "The full screening report — memo plus every term, challenge, comp, and market check"
                    : "The full screening report — part of Pro"
                }
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-muted"
                  aria-hidden
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                Full report
                {!pro && (
                  <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
                    Pro
                  </span>
                )}
              </a>
            )}
            {extraction && (
              <a
                href={`/api/deals/${id}/underwrite.xlsx`}
                title={
                  pro
                    ? "Institutional acquisition model (Excel) — live formulas; change the exit cap and levered IRR recalculates"
                    : "Institutional acquisition model (Excel) — part of Pro"
                }
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-muted"
                  aria-hidden
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                </svg>
                Underwrite model
                {!pro && (
                  <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
                    Pro
                  </span>
                )}
              </a>
            )}
            <Link
              href={`/deals/${id}/rent-roll`}
              title="Rent roll engine — WALT, rollover, mark-to-market, and a live-formula Excel model"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-muted"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 4v16" />
              </svg>
              Rent roll
            </Link>
            {extraction && (
              <Link
                href={`/deals/${id}/valuations`}
                title="BOV reconciler — decompose the gap between two opinions of value"
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-muted"
                  aria-hidden
                >
                  <path d="M12 3v18M5 8l7-5 7 5" />
                  <path d="M3 12h6l-3 6-3-6zM15 12h6l-3 6-3-6z" />
                </svg>
                Valuations
              </Link>
            )}
            {versionCount >= 2 && (
              <Link
                href={`/deals/${id}/bridge`}
                title="Assumption bridge — which input moved the IRR, and by how much"
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 text-muted"
                  aria-hidden
                >
                  <path d="M4 19V9M10 19V5M16 19v-7M22 19h-20" />
                </svg>
                Bridge
                <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
                  {versionCount}
                </span>
              </Link>
            )}
          </>
        }
        controls={
          <>
            <OffersDueControl
              key={`due-${offersDue ?? "unset"}`}
              dealId={id}
              value={offersDue}
              today={todayIso}
              fromMemorandum={offersDue != null && offersDue === offeringDue?.iso ? offeringDue.page : null}
              calendarHref={offersDue ? `/api/deals/${id}/offers-due.ics` : null}
            />
            {/* The buyer's 1031 clock (lib/exchange-deal), where the reader's
                buy box holds an exchange still running: the deadlines against
                this deal's offers-due day and what its price buys, read on the
                reader's own day. Never on the shared screen. */}
            <ExchangeChip exchange={exchangeForDeal(buyBox?.exchange, extraction, offersDue, new Date(`${todayIso}T12:00:00Z`))} />
            <StageSelect
              key={((deal as { stage?: string }).stage as string) ?? "screening"}
              dealId={id}
              stage={((deal as { stage?: string }).stage as string) ?? "screening"}
            />
            <DealActions
              dealId={id}
              dealName={deal.name}
              canDelete={canDelete}
              canRename={!(deal as { is_sample?: boolean }).is_sample}
            />
          </>
        }
      >
        {/* The plan, as the OM states it, when the deal is not a stabilized
            asset — it changes what every figure above means. Then anything
            that genuinely does not tie. Its basis is per the counting row's
            own noun (a hotel counting "Rooms" is per room), as the Size
            slot, the card and the workbook say it — else the class's. */}
        <PlanStrip strategy={strategy} plan={plan} noun={countNounOf(metrics, shownClass).one} />
        {/* What is being sold (#414): a note, a share, a leasehold — said
            before any figure is believed, since it changes what the price
            buys (lib/interest). Nothing for a plain fee simple. */}
        <InterestPanel interest={interest} />
        {/* A sandwich position (lib/sandwich-lease): the sublease income
            against the master rent with the spread filled, its cover, the
            master lease's term against the model's hold, and what the model
            does with a position that ends. Read on the reader's day. */}
        <SandwichPanel
          sandwich={readSandwichLease(extraction, new Date(`${todayIso}T12:00:00Z`))}
          holdYears={derived ? derived.inputs.holdMonths / 12 : null}
          modelLine={derived?.meta.sandwich?.read ?? ""}
        />
        {/* How it is sold (#456): an auction's starting bid is where the
            price starts — the bid, the premium on top, the model's ceiling
            at the buyer's hurdle; a court's or a lender's sale says who is
            selling (lib/sale-terms). */}
        <SalePanel
          sale={readSale(extraction)}
          ceiling={derived ? saleCeiling(extraction, derived.inputs, buyBox?.minIrrPct ?? SALE_HURDLE_PCT) : null}
        />
        {/* A forward purchase or a build-to-suit bought at delivery
            (lib/forward-purchase): the clock from today to the delivery and
            the outside date, the deposit's share of the price, and the yield
            at delivery against the model's exit cap — the buyer carries no
            construction. Read on the reader's day, with the page's kind. */}
        <ForwardPanel
          forward={readForwardPurchase(extraction, new Date(`${todayIso}T12:00:00Z`), strategy)}
          today={todayIso}
          exitCapPct={derived ? derived.inputs.exitCapPct * 100 : null}
          modelLine={derived?.meta.forward?.read ?? ""}
        />
        {/* An operating business on its real estate (lib/going-concern):
            the operator's EBITDAR against its rent with the 1.0x line, the
            price as the memorandum splits it, the contracts as stated, and
            what the model does with the business's income. */}
        <GoingConcernPanel
          goingConcern={readGoingConcern(extraction, new Date(`${todayIso}T12:00:00Z`))}
          modelLine={derived?.meta.goingConcern?.read ?? ""}
        />
        {/* A covenant or a contract that sets the rents (#453): the units it
            binds, until when, each tier against its limit — said before any
            rent growth is believed (lib/affordable). */}
        <AffordablePanel affordable={readAffordable(extraction)} />
        {/* The rent rules that reach the building (lib/rent-regulation):
            each regime and whether it applies, the regulated share as
            stated, the allowance in force against the model's one growth
            rate on one scale, and the period with today's tick. */}
        <RegulationPanel
          regulation={regulation}
          today={todayIso}
          modelGrowthPct={derived ? derived.inputs.rentGrowthPct * 100 : null}
          modelLine={derived?.meta.regulation?.read ?? ""}
        />
        {/* One tenant leases the whole property (#454): its guarantor, the
            term left today and at the model's sale, the options, and the
            lease's increases against the model's growth (lib/single-tenant). */}
        <SingleTenantPanel
          lease={readSingleTenant(extraction)}
          model={
            derived
              ? {
                  holdMonths: derived.inputs.holdMonths,
                  rentGrowthPct: derived.inputs.rentGrowthPct,
                  vacancyPct: derived.inputs.vacancyPct,
                  exitCapPct: derived.inputs.exitCapPct,
                }
              : null
          }
        />
        {/* A multi-tenant property's listed tenants (#457): the roll to the
            model's sale a year at a time, the building by the space each
            leases with an anchor outside the sale drawn apart, and each
            tenant's end and rights. */}
        <RosterPanel roster={readRoster(extraction)} modelLine={derived?.meta.roster?.read ?? ""} />
        {/* A value-add renovation program (#460): the doors done and to
            go, the premium priced on against the one achieved with the
            break-even at the model's exit cap, and the pace the period
            asks of turnover. */}
        <ValueAddPanel
          program={readValueAdd(extraction)}
          exitCapPct={derived ? derived.inputs.exitCapPct : null}
          modelLine={derived?.meta.valueAdd?.read ?? ""}
        />
        {/* A property-tax abatement (#461): the years still abated against
            the model's sale, the bill today against the full one, and the
            share of the NOI that goes to taxes when it ends. */}
        <TaxAbatementPanel
          abatement={readTaxAbatement(extraction)}
          holdYears={derived ? derived.inputs.holdMonths / 12 : null}
          modelLine={derived?.meta.taxAbatement?.read ?? ""}
        />
        {/* What a hotel is sold with (#455): the flag, the manager, the
            encumbrance and the PIP — the basis a key with the PIP on top,
            the agreements' clocks against the model's sale, the rooms. */}
        <HotelPanel
          hotel={readHotelDeal(extraction)}
          holdYears={derived ? derived.inputs.holdMonths / 12 : null}
          modelLine={derived?.meta.hotel?.read ?? ""}
        />
        {/* A student building (#468): the pre-leasing against last year's
            and the occupancy the model runs at, the beds, the walk to
            campus (lib/student-housing). */}
        <StudentHousingPanel
          student={readStudentHousing(extraction)}
          modelLine={derived?.meta.student?.read ?? ""}
          modelOccupancyPct={derived ? Math.round((1 - derived.inputs.vacancyPct) * 1000) / 10 : null}
        />
        {/* A manufactured-housing park (#470): whose homes stand on the pads,
            the lot rent against the memorandum's market, the water and
            sewer, and what the model does with each
            (lib/manufactured-housing). */}
        <ManufacturedHousingPanel park={readManufacturedHousing(extraction)} modelLine={derived?.meta.mh?.read ?? ""} />
        {/* A self-storage facility (#471): its units, area and rent let
            against the 85% line, the in-place rent against the street rate,
            and whose platform it rides on (lib/self-storage). */}
        <SelfStoragePanel storage={readSelfStorage(extraction)} modelLine={derived?.meta.storage?.read ?? ""} />
        {/* A mixed-use building (lib/mixed-use): the residential and
            commercial incomes on one bar, the commercial share of the area,
            and what the model's one exit cap does to both. */}
        <MixedUsePanel
          mixedUse={readMixedUse(extraction, new Date(`${todayIso}T12:00:00Z`))}
          modelLine={derived?.meta.mixedUse?.read ?? ""}
        />
        {/* Condominium units bought in bulk (lib/condo): the buyer's share of
            the association with a lender's limit on a single owner, a year of
            the dues, the reserves and restrictions as stated, and what the
            model does with the units. */}
        <CondoPanel condo={readCondo(extraction, new Date(`${todayIso}T12:00:00Z`))} modelLine={derived?.meta.condo?.read ?? ""} />
        {/* What the third-party reports found (#465): a tile a report, the
            Phase I's age against the 180-day and one-year marks, the PML
            against the lenders' 20%, and what the model does with the
            immediate repairs. */}
        <SiteReportsPanel reports={readSiteReports(extraction)} modelLine={derived?.meta.siteReports?.read ?? ""} />
        {/* Who is selling it and when offers are due (#467): the brokers as
            the memorandum prints them, a tap to call or write, and the call
            for offers as written (lib/offering). */}
        <ListingTeam team={listingTeam} offersDue={offeringDue} />
        <PlausibilityPanel findings={plausibility} strategy={strategy} />
        <PlanSensitivity plan={plan} refCap={refCap} />

        {!extraction && firstSignal?.take && (
          <p className="mt-4 text-sm leading-relaxed text-muted">{firstSignal.take}</p>
        )}
      </DealHero>

      {/* The deal, kept in view once the header scrolls away (#437): the
          header's own price and return figures, a blank left out. */}
      <DealStickyBar
        dealId={id}
        name={deal.name as string}
        chip={pill ?? null}
        figures={[priceFigure, returnFigure].flatMap((f) => (f.value ? [{ label: f.label, value: f.value, title: f.title }] : []))}
      />

      {/* A portfolio OM's properties, one row each (lib/portfolio): absent
          for a single-property memorandum. */}
      <PortfolioCard
        portfolio={readPortfolio(extraction)}
        assetClass={readClass}
      />

      {/* Submarket supply (Phase 4): the deal's rent growth, exit cap and
          vacancy, checked against what the linked submarket has actually
          done. Absent entirely on a pre-0033 schema. */}
      <SubmarketCard
        dealId={id}
        view={submarketCheck?.view ?? null}
        warnings={submarketCheck?.warnings ?? []}
        submarkets={userSubmarkets}
      />

      <DealView
        dealId={id}
        dealName={deal.name}
        rateSeeds={rateSeeds}
        marketSince={marketSince}
        modelVsMarket={modelRead}
        assumable={assumable}
        sellerNote={sellerNote}
        leaseholdExit={leaseholdExit}
        // What the letter of intent drafts, read by the LOI route's own
        // reader from the same row — so the panel names the clauses the
        // download carries (lib/loi-terms).
        loi={loiTermsFor(extraction, firstSignal)}
        // The first-draft model's returns where the price is not the
        // building's — the compare table's rule (lib/compare-interest): a
        // note's cap and returns withheld, its yield in the cap's place; a
        // share's cap struck on the whole, its returns standing only where
        // the model ran at that whole.
        modelInterest={model ? modelReturnsRead(extraction, model.returns) : null}
        metroDemand={
          reads && liveMarket
            ? metroDemand(reads.rates, readClass)
            : null
        }
        initialTab={tab ?? null}
        initialAnalysis={analysisParam ?? null}
        hasOm={!!deal.om_storage_path}
        modelErrorCode={errorCode ?? null}
        job={job}
        typicalScreen={typicalScreen.phrase}
        typicalScreenMs={typicalScreen.ms}
        results={{ extraction, challenges, comps, reconciliation, market, verdict }}
        staleResults={staleResults}
        firstSignal={firstSignal}
        supplements={supplements}
        model={model}
        documents={documents}
        compSearch={compSearch}
        isPro={pro}
        buyBox={{
          checks: buyBoxChecks,
          mandate,
          scope: ownership.team_id ? "team" : "personal",
          provisional: !extraction && !!firstSignal,
          hasBox: !!buyBox,
        }}
        screenDiff={screenDiff}
        stageHistory={stageHistory}
        internalComps={internalComps}
        omUrl={omUrl}
        facts={factsByField}
        discrepancies={
          ((deal as { discrepancies?: ReconcileResult | null }).discrepancies) ?? null
        }
        notes={parseDealNotes((deal as { notes?: unknown }).notes)}
        userEmail={user?.email ?? null}
        userId={user?.id ?? null}
        qa={parseDealQa((deal as { qa?: unknown }).qa)}
        askerNames={askerNames}
        isSample={!!(deal as { is_sample?: boolean }).is_sample}
        marketMemory={marketMemory}
        actuals={actuals}
        playground={playground}
        // The deal's kind the header reads (the first signal included), so
        // the debt sizer's plan block and price read the same kind.
        dealStrategy={strategy}
        tasks={dealTasks}
        taskAssignees={taskAssignees}
        todayIso={todayIso}
      />

      <div className="mt-6 space-y-4">
        <PublicCompsPanel
          dealId={id}
          result={publicComps}
          hasAddress={!!dealAddress?.label}
          subjectPrice={subjectPriceNumber}
        />
        <SiteFlagsCard result={siteFlags} hasAddress={!!dealAddress?.label} today={todayIso} />
        <PublicRecordCard
          address={dealAddress}
          market={placement.briefed}
          subject={publicComps?.subject ?? siteFlags?.subject ?? null}
        />
        {/* Anchor target for the Regulation panel's "answer in Deal facts"
            links; scroll-mt keeps the jump clear of the sticky header. */}
        <div id="deal-facts" className="scroll-mt-24">
          <SectorFieldsForm
            dealId={id}
            assetClass={(deal.asset_class as string) ?? "auto"}
            values={
              ((deal as { sector_fields?: SectorFieldValues | null }).sector_fields) ?? null
            }
          />
        </div>
        <ResearchPanel
          address={dealAddress}
          placement={placement}
          census={siteFlags && siteFlags.status !== "pending" ? { place: siteFlags.place, county: siteFlags.county } : null}
          sizeText={summarySize}
          priceText={subjectPriceNumber != null ? String(Math.round(subjectPriceNumber)) : null}
          // The leverage read spreads the BUYER's cap against debt, so on a
          // note it does not run on the collateral's, nor on a preferred
          // equity position on the building's (lib/compare-interest): the
          // panel says why instead.
          capText={noteCap ? null : summaryCap}
          capWithheld={noteCap?.of ?? null}
          planLabel={isPlanDeal(strategy.kind) ? strategy.label : null}
          yearBuilt={summaryYearBuilt}
          sectorFields={
            ((deal as { sector_fields?: SectorFieldValues | null }).sector_fields) ?? null
          }
          assetClass={shownClass || null}
          rateSeed={rateSeeds.permanent}
          tenYear={debt.tenYear}
          survey30={debt.survey30}
        />
      </div>
      {/* Room at the foot for the deal's bar on a phone (#437), so the
          page's last lines never sit under it. */}
      <div aria-hidden className="h-12 md:hidden" />
    </div>
  );
}
