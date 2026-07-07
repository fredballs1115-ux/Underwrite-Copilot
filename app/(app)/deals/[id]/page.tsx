import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { DealActions } from "./deal-actions";
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import { StageSelect } from "./stage-select";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox, type BuyBoxCheck } from "@/lib/criteria";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // These four don't depend on each other — fetch them in one round trip's
  // worth of wall clock instead of four.
  const [pro, { data, error }, { data: docsData }, { data: jobData }] =
    await Promise.all([
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
    ]);

  if (error || !data) {
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
  const addressHaystack = [
    extraction?.address,
    dealAddress?.label,
    dealAddress?.county,
    dealAddress?.state,
  ]
    .filter(Boolean)
    .join(" ");
  const signalMetrics = firstSignal
    ? [
        { label: "Asking price", value: firstSignal.askPrice },
        { label: "Going-in cap rate", value: firstSignal.goingInCap },
        {
          // Broad per-area test: "sf", "psf", "sq ft", "square foot", "/ft"
          // must all count — a per-SF figure misread as per-unit would give
          // the buy-box check a confidently wrong basis.
          label: /sf|sq|square|psf|\/\s?ft/i.test(firstSignal.perUnit)
            ? "Price per SF"
            : "Price per unit",
          value: firstSignal.perUnit,
        },
      ].filter((m) => m.value.trim())
    : [];
  const checkSource =
    extraction || firstSignal || dealAddress
      ? {
          assetClass:
            extraction?.assetClass ?? firstSignal?.assetClass ?? "",
          market: extraction?.market ?? firstSignal?.market ?? "",
          address: addressHaystack,
          metrics: extraction?.metrics ?? signalMetrics,
        }
      : null;
  const buyBoxChecks: BuyBoxCheck[] = buyBox
    ? evaluateBuyBox(deal.asset_class, checkSource, buyBox)
    : [];

  // The three summary-bar figures — a 5-second read, nothing more. The full
  // metric set lives one click away in Financials.
  const metrics = extraction?.metrics ?? [];
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

  // The buy-box verdict as one chip: any hard miss → Outside; else near
  // misses → Near; else all pass → Fits; else unverified.
  const buyBoxChip = !buyBox
    ? null
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
          <div className="flex shrink-0 items-center gap-2">
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
          scope: ownership.team_id ? "team" : "personal",
          provisional: !extraction && !!firstSignal,
          hasBox: !!buyBox,
        }}
        screenDiff={screenDiff}
        omUrl={omUrl}
      />
    </div>
  );
}
