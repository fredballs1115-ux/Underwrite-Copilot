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
import { FirstReadCard } from "./first-read";
import { SinceLastScreen } from "./since-last-screen";
import { ReplaceOm } from "./replace-om";
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

// Headline figures for the persistent deal header. Prefer the deal-defining
// metrics; fall back to the first few so the strip is never empty.
function pickKeyStats(metrics: ExtractedMetric[]): ExtractedMetric[] {
  const priority = [
    /going[- ]?in cap/i,
    /pro ?forma cap/i,
    /exit cap/i,
    /\bprice\b/i,
    /\bnoi\b/i,
    /\birr\b/i,
    /occupancy/i,
  ];
  const chosen: ExtractedMetric[] = [];
  for (const re of priority) {
    const m = metrics.find((x) => re.test(x.label) && !chosen.includes(x));
    if (m) chosen.push(m);
    if (chosen.length >= 4) break;
  }
  for (const m of metrics) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(m)) chosen.push(m);
  }
  return chosen.slice(0, 4);
}

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode, tab } = await searchParams;

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

  const keyStats = extraction ? pickKeyStats(extraction.metrics) : [];
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
  // a screen instead of minutes later. The per-unit figure only counts as a
  // per-unit basis when it isn't actually a per-SF number.
  const checkSource =
    extraction ??
    (firstSignal
      ? {
          assetClass: firstSignal.assetClass,
          market: firstSignal.market,
          metrics: [
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
          ].filter((m) => m.value.trim()),
        }
      : null);
  const buyBoxChecks: BuyBoxCheck[] = buyBox
    ? evaluateBuyBox(deal.asset_class, checkSource, buyBox)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deals"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← All deals
      </Link>

      {/* Persistent deal header — the anchor that stays put across tabs. */}
      <header className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {/* The verdict lives with the title — it's the headline, not an action. */}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                {deal.name}
              </h1>
              {pill && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.cls}`}
                >
                  {pill.label}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              <span className="capitalize">{deal.asset_class}</span>
              {extraction?.market ? (
                <> · {extraction.market}</>
              ) : firstSignal?.market ? (
                <> · {firstSignal.market}</>
              ) : null}
              {extraction?.address ? <> · {extraction.address}</> : null}
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

        {/* One horizontal action row instead of a stacked right rail. */}
        {(omUrl || verdict || deal.om_storage_path) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {omUrl && (
              <a
                href={omUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the offering memorandum you uploaded (link valid for 1 hour)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d="M14 3h7v7" />
                  <path d="M10 14 21 3" />
                  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
                View OM
              </a>
            )}
            {verdict &&
              (pro ? (
                <a
                  href={`/api/deals/${id}/memo`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  Download memo
                </a>
              ) : (
                <Link
                  href="/billing"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/5 px-3 py-1.5 text-xs font-medium text-caution transition-colors hover:bg-caution/10"
                >
                  Upgrade for PDF memo
                </Link>
              ))}
            {deal.om_storage_path && (
              <ReplaceOm dealId={id} disabled={jobActive} />
            )}
          </div>
        )}

        {keyStats.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {keyStats.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-faint px-3 py-2"
              >
                <p className="flex items-center gap-1 text-[11px] text-muted">
                  <span className="truncate">{m.label}</span>
                  {m.flagged && <span className="shrink-0 text-caution">⚑</span>}
                </p>
                <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* First read — the instant signal, until the full extraction lands. */}
      {!extraction && firstSignal && <FirstReadCard signal={firstSignal} />}

      {/* Retrade watch — what moved since the previous screen of this deal. */}
      {screenDiff && <SinceLastScreen diff={screenDiff} />}

      {/* The buy box — this deal against YOUR standing criteria. When every
          check passes it collapses to one quiet row; misses earn the card. */}
      {buyBoxChecks.length > 0 &&
      buyBoxChecks.every((c) => c.status === "pass") ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-pass/25 bg-pass/[0.04] px-4 py-2.5 text-sm">
          <span aria-hidden className="font-bold text-pass">
            ✓
          </span>
          <span className="font-medium">Fits your buy box</span>
          <span className="text-xs text-muted">
            {buyBoxChecks.map((c) => c.label).join(" · ")}
          </span>
          <Link
            href="/criteria"
            className="ml-auto text-xs font-medium text-brand transition-colors hover:text-brand-strong"
          >
            Edit criteria →
          </Link>
        </div>
      ) : buyBoxChecks.length > 0 ? (
        <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Your buy box
              </h2>
              <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                {ownership.team_id ? "Team" : "Personal"}
              </span>
              {!extraction && firstSignal && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                  First read
                </span>
              )}
            </div>
            <Link
              href="/criteria"
              className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
            >
              Edit criteria →
            </Link>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {buyBoxChecks.map((c) => (
              <div
                key={c.label}
                className={`rounded-lg border p-2.5 ${
                  c.status === "fail"
                    ? "border-kill/25 bg-kill/[0.04]"
                    : c.status === "pass"
                      ? "border-line bg-surface"
                      : "border-line bg-faint"
                }`}
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    aria-hidden
                    className={
                      c.status === "fail"
                        ? "text-kill"
                        : c.status === "pass"
                          ? "text-pass"
                          : "text-muted"
                    }
                  >
                    {c.status === "fail" ? "✕" : c.status === "pass" ? "✓" : "—"}
                  </span>
                  {c.label}
                  <span className="sr-only">
                    {c.status === "fail"
                      ? "outside your criteria"
                      : c.status === "pass"
                        ? "within your criteria"
                        : "not determinable yet"}
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {c.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        !buyBox && (
          <p className="text-xs text-muted">
            Tip: set your{" "}
            <Link
              href="/criteria"
              className="font-medium text-brand hover:text-brand-strong"
            >
              buy box
            </Link>{" "}
            and every screen gets checked against your own criteria
            automatically.
          </p>
        )
      )}

      <DealView
        dealId={id}
        dealName={deal.name}
        initialTab={tab ?? null}
        hasOm={!!deal.om_storage_path}
        modelErrorCode={errorCode ?? null}
        job={job}
        results={{ extraction, challenges, comps, reconciliation, market, verdict }}
        supplements={supplements}
        model={model}
        documents={documents}
        compSearch={compSearch}
        isPro={pro}
      />
    </div>
  );
}
