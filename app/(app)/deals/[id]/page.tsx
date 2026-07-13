import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { signedSupplementUrl } from "@/lib/storage";
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
import { StageSelect } from "./stage-select";
import { OffersDueControl } from "../offers-due";
import { ShareControl, type ShareRow } from "./share-control";
import { parseStageHistory } from "@/lib/stages";
import { parseDealNotes, parseDealQa } from "@/lib/deals";
import { deriveInternalComps } from "@/lib/internal-comps";
import { buildComps, marketMemoryFor } from "@/lib/market-memory";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox, foldBuyBoxChecks, buyBoxCheckSource, type BuyBoxCheck } from "@/lib/criteria";
import { scoreMandateFit, type MandateScore, type MandateVerdict } from "@/lib/mandate";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { ActualsData } from "./property-actuals";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import type { PlaygroundData } from "./sensitivity-playground";

const VERDICT_PILL = {
  pass: { label: "Go", cls: "bg-pass/15 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution" },
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

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tab?: string; a?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode, tab, a: analysisParam } = await searchParams;

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
        .select("status, step, progress, error")
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
  const offersDue =
    ((deal as { offers_due?: string | null }).offers_due as string | null) ??
    null;
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
  // market + asset class, aggregated. Own-account only — filter the siblings
  // (which RLS may include team deals in) to this user's deals.
  const ownSiblings = ((siblings.data ?? []) as Array<{ user_id?: string }>).filter(
    (s) => s.user_id === user?.id,
  );
  const currentClass =
    deal.asset_class && deal.asset_class !== "auto"
      ? (deal.asset_class as string)
      : (extraction?.assetClass ?? "");
  const marketMemory = extraction?.market
    ? marketMemoryFor(
        buildComps(ownSiblings as Parameters<typeof buildComps>[0]),
        deal.id,
        currentClass,
        extraction.market,
      )
    : null;

  const documents = (docsData ?? []) as DealDocument[];

  const job = jobData as {
    status: string;
    step: string | null;
    progress: number;
    error: string | null;
  } | null;

  const pill = verdict ? VERDICT_PILL[verdict.verdict] : null;

  // Retrade watch: once a RE-screen finishes, diff it against the snapshot the
  // pipeline took of the previous run. Hidden while a job is in flight (the
  // stored results are mid-overwrite and would diff against themselves).
  const jobActive = job?.status === "queued" || job?.status === "running";
  const priorScreen = (deal.prior_screen as PriorScreen | undefined) ?? null;
  const screenDiff =
    !jobActive && priorScreen && extraction
      ? computeScreenDiff(priorScreen, extraction, verdict)
      : null;

  // User-added supplements, with short-lived signed URLs minted for any files.
  type RawSupp = {
    notes?: { id: string; text: string; createdAt: string }[];
    files?: { id: string; name: string; path: string; createdAt: string }[];
  };
  const rawSupp = (deal.supplements as Record<string, RawSupp> | null) ?? {};
  // Signed link so the user can re-open the OM they uploaded (1-hour expiry).
  const omUrlPromise = deal.om_storage_path
    ? signedSupplementUrl(deal.om_storage_path)
    : Promise.resolve(null);
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
  const [omUrl, buyBox] = await Promise.all([
    omUrlPromise,
    getBuyBoxForDeal(ownership.user_id, ownership.team_id).catch(() => null),
    ...Object.entries(rawSupp).map(async ([tabKey, s]) => {
      const files = await Promise.all(
        (s.files ?? []).map(async (f) => ({
          id: f.id,
          name: f.name,
          createdAt: f.createdAt,
          url: await signedSupplementUrl(f.path),
        })),
      );
      supplements[tabKey] = { notes: s.notes ?? [], files };
    }),
  ]);

  // Judge the buy box against the full extraction when it's in; until then,
  // the first signal stands in — so "outside your box" can surface ~30s into
  // a screen instead of minutes later. The user-entered property address
  // widens the location haystack in every case (city, county, state).
  const dealAddress =
    (deal.address as import("@/lib/address").StructuredAddress | undefined) ??
    null;
  const checkSource = buyBoxCheckSource(extraction, firstSignal, dealAddress);
  const buyBoxChecks: BuyBoxCheck[] = buyBox
    ? evaluateBuyBox(deal.asset_class, checkSource, buyBox)
    : [];
  // The single 0–100 mandate-fit read (Feature 4) — same evidence as the
  // per-criterion checks above, rolled into one number and a PURSUE/WATCH/PASS
  // call. Null until there's a box AND something checkable against it.
  const mandate: MandateScore | null =
    buyBox && checkSource
      ? scoreMandateFit(deal.asset_class, checkSource, buyBox)
      : null;

  // The three summary-bar figures — a 5-second read, nothing more. The full
  // metric set lives one click away in Financials.
  const metrics = extraction?.metrics ?? [];

  // Property actuals (Feature 1): the consolidated rent roll + T-12, if either
  // was uploaded. Best-effort — the tables arrived in migration 0020; on an
  // older schema the queries error and read null (the card simply doesn't
  // render). Any per-number reference dates come from the stored extraction.
  const [rrRes, t12Res] = await Promise.all([
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
  ]);
  const t12Summary = (t12Res.data?.summary as T12Summary | undefined) ?? null;
  // OM assumed NOI vs the T-12 actual — the shared picker (word-bounded,
  // per-unit-safe, same one the challenger note uses). Degenerate actual NOI
  // (0 / non-finite) renders no comparison rather than an infinite delta.
  const omNoi = pickOmNoi(metrics)?.noi ?? null;
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
        ? compareNoi(omNoi, t12Summary.noi)
        : null,
  };

  // Sensitivity playground (Feature 2 of the competitive spec): the deal's
  // base underwriting model — actuals folded in — computed once server-side;
  // the sliders recompute it in the browser via the same pure engine.
  const playground: PlaygroundData | null = extraction
    ? {
        inputs: deriveUnderwriteInputs(extraction, deal.name, {
          rentRoll: actuals.rentRoll
            ? { summary: actuals.rentRoll.summary, asOf: actuals.rentRoll.asOf }
            : null,
          t12: actuals.t12
            ? { summary: actuals.t12.summary, periodEnd: actuals.t12.periodEnd }
            : null,
        }).inputs,
        dealAssetClass: deal.asset_class,
        checkSource,
        box: buyBox,
      }
    : null;

  // Citation facts, keyed by field label for the source chips (Feature 2).
  // Empty for deals screened before migration 0018 — no chips, never faked.
  const factsByField: Record<string, DealFact> = {};
  for (const row of (factsRes.data ?? []) as Record<string, unknown>[]) {
    const f = parseFactRow(row);
    if (!(f.field in factsByField)) factsByField[f.field] = f;
  }
  const summaryPrice =
    findValue(metrics, /purchase price|asking price|\bprice\b/i, /unit|\/sf|per sf|per unit|psf/i) ??
    (firstSignal?.askPrice.trim() || null);
  const sizeSf = findValue(
    metrics,
    /\b(total sf|square (foot|feet|footage)|sq\.? ?ft|rentable|nra|gla|building size|\bsf\b)/i,
    /price|\$|per|\/|psf/i,
  );
  const sizeUnits = findValue(metrics, /\bunits?\b|unit count/i, /price|\$|per|\//i);
  // A bare unit count ("248") reads wrong in a Size slot — say what it counts.
  const summarySize =
    sizeSf ??
    (sizeUnits
      ? /^[\d,]+$/.test(sizeUnits.trim())
        ? `${sizeUnits.trim()} units`
        : sizeUnits
      : null) ??
    (firstSignal?.size.trim() || null);
  const summaryCap =
    findValue(metrics, /going[- ]?in cap/i) ??
    findValue(metrics, /\bcap rate\b/i, /exit|terminal|reversion/i) ??
    (firstSignal?.goingInCap.trim() || null);

  // The buy-box call as one chip. When there's a numeric mandate-fit score,
  // it leads — "Buy box 82 · Pursue", coloured by the PURSUE/WATCH/PASS call.
  // Otherwise the older fold (Outside / Near / Fits) stands in.
  const MANDATE_PILL: Record<MandateVerdict, string> = {
    PURSUE: "bg-pass/10 text-pass",
    WATCH: "bg-caution/10 text-caution",
    PASS: "bg-kill/10 text-kill",
  };
  // The fold covers ALL criteria (incl. the price band / per-unit cap, which
  // the 0–100 score deliberately doesn't weigh). A deal outside the box on one
  // of those must never show a green Pursue — so a hard "outside" fold wins the
  // chip even when the scored dimensions look strong.
  const buyBoxFold = buyBox ? foldBuyBoxChecks(buyBoxChecks) : null;
  const buyBoxChip = !buyBox
    ? null
    : mandate?.score != null && mandate.verdict
      ? buyBoxFold === "outside" && mandate.verdict !== "PASS"
        ? {
            label: `Buy box ${mandate.score} · Outside box`,
            cls: "bg-kill/10 text-kill",
          }
        : {
            label: `Buy box ${mandate.score} · ${mandate.verdict === "PURSUE" ? "Pursue" : mandate.verdict === "WATCH" ? "Watch" : "Pass"}`,
            cls: MANDATE_PILL[mandate.verdict],
          }
      : buyBoxChecks.some((c) => c.status === "miss")
        ? { label: "Outside buy box", cls: "bg-kill/10 text-kill" }
        : buyBoxChecks.some((c) => c.status === "near")
          ? { label: "Near buy box", cls: "bg-caution/10 text-caution" }
          : buyBoxChecks.length > 0 &&
              buyBoxChecks.every((c) => c.status === "pass")
            ? { label: "Fits buy box", cls: "bg-pass/10 text-pass" }
            : { label: "Buy box unverified", cls: "bg-faint text-muted" };

  const addressLine =
    extraction?.address ||
    dealAddress?.label ||
    extraction?.market ||
    firstSignal?.market ||
    null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deals"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← All deals
      </Link>

      {/* THE summary bar — the deal in five seconds, no scrolling:
          name, verdict, buy-box call, address, asset type, and exactly
          three figures. Everything else is one click below. */}
      <header className="shadow-card rounded-2xl border border-line bg-surface px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {deal.name}
              </h1>
              {pill && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
                >
                  {pill.label}
                </span>
              )}
              {buyBoxChip && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${buyBoxChip.cls}`}
                >
                  {buyBoxChip.label}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">
              {addressLine ? <>{addressLine} · </> : null}
              <span className="capitalize">{deal.asset_class}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
            <OffersDueControl
              key={`due-${offersDue ?? "unset"}`}
              dealId={id}
              value={offersDue}
            />
            <StageSelect
              key={((deal as { stage?: string }).stage as string) ?? "screening"}
              dealId={id}
              stage={((deal as { stage?: string }).stage as string) ?? "screening"}
            />
            <DealActions dealId={id} dealName={deal.name} />
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2">
          {(
            [
              ["Price", summaryPrice],
              ["Size", summarySize],
              ["Going-in cap", summaryCap],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] uppercase tracking-wide text-muted">
                {label}
              </dt>
              <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                {value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>

        {!extraction && firstSignal?.take && (
          <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">
            {firstSignal.take}
          </p>
        )}
      </header>

      <DealView
        dealId={id}
        dealName={deal.name}
        initialTab={tab ?? null}
        initialAnalysis={analysisParam ?? null}
        hasOm={!!deal.om_storage_path}
        modelErrorCode={errorCode ?? null}
        job={job}
        results={{ extraction, challenges, comps, reconciliation, market, verdict }}
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
        isSample={!!(deal as { is_sample?: boolean }).is_sample}
        marketMemory={marketMemory}
        actuals={actuals}
        playground={playground}
      />
    </div>
  );
}
