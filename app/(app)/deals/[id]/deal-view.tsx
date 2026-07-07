"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import type { BuyBoxCheck } from "@/lib/criteria";
import type { ScreenDiff } from "@/lib/screen-diff";
import {
  OverviewView,
  TermsView,
  ChallengerView,
  BrokerComps,
  Reconciliation,
  ReconcileSection,
  MarketCheck,
  VerdictView,
  RetryForm,
  EmptyState,
  Supplements,
  AddData,
  type TabSupplement,
} from "./deal-sections";
import { ModelView } from "./model-view";
import { SinceLastScreen } from "./since-last-screen";
import { ReplaceOm } from "./replace-om";
import { useToast } from "../../toaster";
import type { UnderwritingModel } from "@/lib/model/types";
import type { DealDocument } from "@/lib/documents";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";

type SupplementsMap = Partial<Record<string, TabSupplement>>;

type Job = {
  status: string;
  step: string | null;
  progress: number;
  error: string | null;
} | null;

type Results = {
  extraction: ExtractionResult | null;
  challenges: ChallengerResult | null;
  comps: BrokerCompsResult | null;
  reconciliation: ReconciliationResult | null;
  market: MarketResult | null;
  verdict: VerdictResult | null;
};

/*
  Information hierarchy: five top-level sections, ONE visible at a time.
  Inside Analyses, the five analysis views sit behind a secondary pill nav
  in the order an acquisitions analyst checks them — the verdict first,
  then the critique that produced it.
*/
type SectionKey =
  | "overview"
  | "financials"
  | "buybox"
  | "analyses"
  | "documents";
type AnalysisKey = "verdict" | "challenger" | "comps" | "market" | "reconciler";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "buybox", label: "Buy Box Screen" },
  { key: "analyses", label: "Analyses" },
  { key: "documents", label: "Documents" },
];

const ANALYSES: { key: AnalysisKey; label: string; result: keyof Results }[] = [
  { key: "verdict", label: "Verdict", result: "verdict" },
  { key: "challenger", label: "Challenger", result: "challenges" },
  { key: "comps", label: "Comps", result: "comps" },
  { key: "market", label: "Market", result: "market" },
  { key: "reconciler", label: "Reconciler", result: "reconciliation" },
];

/** Old ?tab= values (bookmarks, memo links, OverviewView jump links) map
 *  onto the new section structure instead of 404-ing to Overview. */
const LEGACY_TABS: Record<string, { section: SectionKey; analysis?: AnalysisKey }> = {
  overview: { section: "overview" },
  terms: { section: "financials" },
  model: { section: "financials" },
  financials: { section: "financials" },
  buybox: { section: "buybox" },
  analyses: { section: "analyses" },
  verdict: { section: "analyses", analysis: "verdict" },
  challenger: { section: "analyses", analysis: "challenger" },
  comps: { section: "analyses", analysis: "comps" },
  market: { section: "analyses", analysis: "market" },
  reconciler: { section: "analyses", analysis: "reconciler" },
  documents: { section: "documents" },
};

// The automatic pass, in order — drives the progress rail and pending logic.
const PIPELINE = ["signal", "extract", "challenge", "comps", "market", "verdict"];

const STEP_LABELS: Record<string, string> = {
  signal: "First pass — the headline read lands in about half a minute…",
  extract: "Reading the OM and extracting the key terms…",
  challenge: "Grilling the assumptions the way an investment committee would…",
  comps: "Scrutinizing the broker’s comps for cherry-picking…",
  market: "Sanity-checking the assumptions against market norms…",
  reconcile: "Reconciling your model against the OM…",
  verdict: "Writing the one-screen verdict…",
  model: "Reconciling your documents into a first-draft model…",
  comps_search: "Searching the public web for comparable sales…",
};

const MODEL_ERRORS: Record<string, string> = {
  modelfile: "Please choose your model file to upload.",
  modeltype: "Please upload your model as .xlsx, .csv, or PDF.",
  modelsize: "That file is larger than 22 MB — please try a smaller export.",
  omfile: "Choose the reissued OM (PDF) to upload.",
  ompdf: "The replacement OM must be a PDF.",
  omsize: "That PDF is larger than 22 MB — please try a smaller file.",
  omupload:
    "The upload didn’t complete — the stored OM is unchanged. Please try again.",
  ompermission:
    "Only the deal’s creator or the team owner can replace its OM.",
  busy: "An analysis is already running on this deal — let it finish first.",
  memoempty: "Run the analysis first — the memo needs a verdict to export.",
  delete: "Couldn’t delete the deal — please try again.",
  stage: "Couldn’t save the stage — please try again.",
};

function isActive(status: string | undefined): boolean {
  return status === "queued" || status === "running";
}

function completionMessage(step: string | null): string {
  switch (step) {
    case "model":
      return "Your model is ready.";
    case "reconcile":
      return "Reconciliation complete.";
    case "comps_search":
      return "Public-web comp search complete.";
    default:
      return "Screening complete — the verdict is ready.";
  }
}

/** Which analyses/steps light which section while a run is in flight. */
const SECTION_STEPS: Record<SectionKey, string[]> = {
  overview: ["signal"],
  financials: ["extract", "model"],
  buybox: [],
  analyses: ["challenge", "comps", "market", "verdict", "reconcile", "comps_search"],
  documents: [],
};

export interface BuyBoxPanelData {
  checks: BuyBoxCheck[];
  scope: "team" | "personal";
  /** the checks came from the first signal, not the full extraction yet */
  provisional: boolean;
  hasBox: boolean;
}

export function DealView({
  dealId,
  dealName,
  initialTab,
  initialAnalysis,
  hasOm,
  modelErrorCode,
  job: initialJob,
  results,
  supplements,
  model,
  documents,
  compSearch,
  isPro,
  buyBox,
  screenDiff,
  omUrl,
}: {
  dealId: string;
  dealName: string;
  initialTab: string | null;
  initialAnalysis: string | null;
  hasOm: boolean;
  modelErrorCode: string | null;
  job: Job;
  results: Results;
  supplements: SupplementsMap;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  compSearch: CompSearchResult | null;
  isPro: boolean;
  buyBox: BuyBoxPanelData;
  screenDiff: ScreenDiff | null;
  omUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  // Live job status, kept fresh by polling. Server data (results) arrives via
  // props on each router.refresh(); this just tracks the in-flight step/%.
  const [job, setJob] = useState<Job>(initialJob);
  const lastStep = useRef<string | null>(initialJob?.step ?? null);
  // Fire the "complete" toast once per run.
  const notified = useRef(false);

  const active = isActive(job?.status);

  // Poll the lightweight status endpoint while a run is in flight. When the
  // step changes (or the run ends), pull the freshly-written section data.
  useEffect(() => {
    if (!isActive(initialJob?.status) && !isActive(job?.status)) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as NonNullable<Job>;
        if (cancelled) return;

        const stepChanged = data.step !== lastStep.current;
        const endedStep = data.step ?? lastStep.current;
        lastStep.current = data.step;
        setJob(data);

        if (data.status === "running" || data.status === "queued") {
          notified.current = false;
        } else if (
          (data.status === "done" || data.status === "error") &&
          !notified.current
        ) {
          notified.current = true;
          if (data.status === "error") {
            toast("Analysis hit a problem — open the deal for details.", "error");
          } else {
            toast(completionMessage(endedStep), "success");
          }
        }

        if (stepChanged || data.status === "done" || data.status === "error") {
          router.refresh();
        }
      } catch {
        // transient blip — keep polling
      }
    };

    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Depend on `active` (not the raw status) so the interval isn't torn down
    // and recreated on every step change — only when polling starts/stops.
    // `router` is a stable app-router ref, so it's intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, active]);

  // Initial selection: an explicit ?tab wins (legacy values map onto the new
  // sections), else Overview.
  const initial = initialTab ? LEGACY_TABS[initialTab] : undefined;
  const [section, setSection] = useState<SectionKey>(
    initial?.section ?? "overview",
  );
  const [analysis, setAnalysis] = useState<AnalysisKey>(
    (initialAnalysis && ANALYSES.some((a) => a.key === initialAnalysis)
      ? (initialAnalysis as AnalysisKey)
      : undefined) ??
      initial?.analysis ??
      (results.verdict ? "verdict" : "challenger"),
  );

  function syncUrl(nextSection: SectionKey, nextAnalysis?: AnalysisKey) {
    // Reflect the selection in the URL (shareable / back-button) without a
    // server round-trip, so switching stays instant.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextSection);
    if (nextSection === "analyses") {
      url.searchParams.set("a", nextAnalysis ?? analysis);
    } else {
      url.searchParams.delete("a");
    }
    window.history.replaceState(null, "", url);
  }

  function selectSection(key: SectionKey) {
    setSection(key);
    syncUrl(key);
  }
  function selectAnalysis(key: AnalysisKey) {
    setAnalysis(key);
    setSection("analyses");
    syncUrl("analyses", key);
  }

  /** Jump links from Overview still use the old keys — map and go. */
  function navigateLegacy(key: string) {
    const target = LEGACY_TABS[key];
    if (!target) return;
    if (target.analysis) selectAnalysis(target.analysis);
    else selectSection(target.section);
  }

  function sectionState(
    key: SectionKey,
  ): "done" | "running" | "pending" | "idle" {
    const steps = SECTION_STEPS[key];
    if (active && job?.step && steps.includes(job.step)) return "running";
    switch (key) {
      case "overview":
        return results.verdict || results.extraction
          ? "done"
          : active
            ? "running"
            : "idle";
      case "financials":
        if (results.extraction) return "done";
        break;
      case "analyses":
        if (
          results.verdict ||
          results.challenges ||
          results.comps ||
          results.market
        )
          return "done";
        break;
      case "buybox":
        return buyBox.hasBox && buyBox.checks.length ? "done" : "idle";
      case "documents":
        return "idle";
    }
    if (active && steps.length) {
      const cur = PIPELINE.indexOf(job?.step ?? "");
      const first = PIPELINE.indexOf(steps[0]);
      if (first >= 0 && (cur < 0 || first > cur)) return "pending";
    }
    return "idle";
  }

  // Finding counts, so a finished run shows where the problems live without
  // opening every section.
  const analysisCounts: Record<AnalysisKey, number> = {
    verdict: 0,
    challenger:
      results.challenges?.challenges.filter((c) => c.severity === "high")
        .length ?? 0,
    comps: results.comps
      ? results.comps.redFlags.length +
        [...results.comps.saleComps, ...results.comps.leaseComps].filter(
          (x) => x.support === "stretched",
        ).length
      : 0,
    market:
      results.market?.checks.filter((c) => c.assessment === "aggressive")
        .length ?? 0,
    reconciler:
      results.reconciliation?.rows.filter((r) => r.direction === "unfavorable")
        .length ?? 0,
  };
  const sectionCounts: Record<SectionKey, number> = {
    overview: 0,
    financials: 0,
    buybox: buyBox.checks.filter((c) => c.status === "miss").length,
    analyses:
      analysisCounts.challenger +
      analysisCounts.comps +
      analysisCounts.market +
      analysisCounts.reconciler,
    documents: 0,
  };

  // Arrow-key navigation across the tablist (standard tabs pattern).
  function onTabKeyDown(e: React.KeyboardEvent) {
    const idx = SECTIONS.findIndex((t) => t.key === section);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % SECTIONS.length;
    else if (e.key === "ArrowLeft")
      next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SECTIONS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      selectSection(SECTIONS[next].key);
      document.getElementById(`tab-${SECTIONS[next].key}`)?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {active && <ProgressRail job={job!} />}

      {job?.status === "error" && (
        <div className="rounded-xl border border-kill/30 bg-kill/5 p-4">
          <p className="text-sm font-medium text-kill">
            The screen hit a snag and stopped
          </p>
          <p className="mt-1 text-sm text-muted">
            Nothing was lost — try again below. If it fails twice, email{" "}
            <a
              className="font-medium text-brand hover:text-brand-strong"
              href="mailto:underwritecopilot.support@gmail.com"
            >
              underwritecopilot.support@gmail.com
            </a>{" "}
            and we&apos;ll dig in.
          </p>
          {job.error && (
            <p className="mt-2 break-words font-mono text-[11px] text-muted/80">
              {job.error}
            </p>
          )}
          <RetryForm dealId={dealId} label="Try again" />
        </div>
      )}

      {/* Section bar — one section visible at a time. */}
      <div className="overflow-x-auto max-md:[mask-image:linear-gradient(90deg,#000_calc(100%_-_1.75rem),transparent)]">
        <div
          role="tablist"
          aria-label="Deal sections"
          onKeyDown={onTabKeyDown}
          className="flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm max-md:mr-8"
        >
          {SECTIONS.map((t) => {
            const state = sectionState(t.key);
            const isActiveTab = t.key === section;
            const count = sectionCounts[t.key];
            return (
              <button
                key={t.key}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={isActiveTab}
                aria-controls="deal-tabpanel"
                tabIndex={isActiveTab ? 0 : -1}
                onClick={() => selectSection(t.key)}
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActiveTab
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-faint hover:text-ink"
                }`}
              >
                <TabDot state={state} active={isActiveTab} />
                {t.label}
                {count > 0 && (
                  <span
                    title={`${count} finding${count === 1 ? "" : "s"}`}
                    className={`rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums ${
                      isActiveTab ? "bg-white/20 text-white" : "bg-kill/10 text-kill"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section — re-keyed so it eases in on switch */}
      <div
        key={section}
        id="deal-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${section}`}
        className="animate-rise"
      >
        {section === "overview" && (
          <div className="flex flex-col gap-6">
            {screenDiff && <SinceLastScreen diff={screenDiff} />}
            <OverviewView
              results={results}
              active={active}
              onNavigate={navigateLegacy}
            />
          </div>
        )}

        {section === "financials" && (
          <FinancialsPanel
            results={results}
            active={active}
            step={job?.step ?? null}
            hasOm={hasOm}
            dealId={dealId}
            model={model}
            documents={documents}
            isPro={isPro}
            supplement={supplements["terms"]}
          />
        )}

        {section === "buybox" && <BuyBoxPanel data={buyBox} />}

        {section === "analyses" && (
          <AnalysesPanel
            analysis={analysis}
            onSelect={selectAnalysis}
            counts={analysisCounts}
            results={results}
            active={active}
            step={job?.step ?? null}
            dealId={dealId}
            dealName={dealName}
            hasOm={hasOm}
            compSearch={compSearch}
            isPro={isPro}
            modelError={modelErrorCode ? MODEL_ERRORS[modelErrorCode] ?? null : null}
            supplements={supplements}
          />
        )}

        {section === "documents" && (
          <DocumentsPanel
            dealId={dealId}
            hasOm={hasOm}
            omUrl={omUrl}
            canMemo={isPro && !!results.verdict}
            hasVerdict={!!results.verdict}
            documents={documents}
            supplements={supplements}
            active={active}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section panels                                                      */
/* ------------------------------------------------------------------ */

/** Financials: the extracted terms first; the Excel model workflow lives in a
 *  collapsed block below — supporting detail, one click away. */
function FinancialsPanel({
  results,
  active,
  step,
  hasOm,
  dealId,
  model,
  documents,
  isPro,
  supplement,
}: {
  results: Results;
  active: boolean;
  step: string | null;
  hasOm: boolean;
  dealId: string;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  isPro: boolean;
  supplement: TabSupplement | undefined;
}) {
  return (
    <div className="flex flex-col gap-6">
      {results.extraction ? (
        <TermsView result={results.extraction} />
      ) : active && (step === "extract" || step === "signal") ? (
        <StatGridSkeleton />
      ) : hasOm ? (
        <EmptyState
          title="Analysis hasn’t run for this deal yet."
          action={<RetryForm dealId={dealId} label="Run analysis" />}
        />
      ) : (
        <EmptyState title="No OM uploaded for this deal." />
      )}

      <details
        className="rounded-2xl border border-line bg-surface shadow-card"
        open={!!model}
      >
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Excel model {model ? "— ready" : ""}
            <span className="text-xs font-normal text-muted">
              {model ? "download or regenerate" : "generate from your documents"}
            </span>
          </span>
        </summary>
        <div className="border-t border-line p-5">
          <ModelView
            dealId={dealId}
            model={model}
            documents={documents}
            active={active}
            isPro={isPro}
          />
        </div>
      </details>

      {supplement && <Supplements dealId={dealId} tab="terms" data={supplement} />}
      <AddData dealId={dealId} tab="terms" />
    </div>
  );
}

/** The mandate check, full detail — the bar carries only the chip. */
function BuyBoxPanel({ data }: { data: BuyBoxPanelData }) {
  if (!data.hasBox) {
    return (
      <EmptyState
        title="No buy box set yet."
        action={
          <Link
            href="/criteria"
            className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Set your buy box
          </Link>
        }
      />
    );
  }
  if (!data.checks.length) {
    return (
      <EmptyState title="The screen hasn’t produced anything to check against your mandate yet." />
    );
  }
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            The deal against your mandate
          </h2>
          <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            {data.scope === "team" ? "Team" : "Personal"}
          </span>
          {data.provisional && (
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
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.checks.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border p-3 ${
              c.status === "miss"
                ? "border-kill/25 bg-kill/[0.04]"
                : c.status === "near"
                  ? "border-caution/30 bg-caution/[0.05]"
                  : c.status === "pass"
                    ? "border-line bg-surface"
                    : "border-line bg-faint"
            }`}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <span
                aria-hidden
                className={
                  c.status === "miss"
                    ? "text-kill"
                    : c.status === "near"
                      ? "text-caution"
                      : c.status === "pass"
                        ? "text-pass"
                        : "text-muted"
                }
              >
                {c.status === "miss"
                  ? "✕"
                  : c.status === "near"
                    ? "≈"
                    : c.status === "pass"
                      ? "✓"
                      : "—"}
              </span>
              {c.label}
              {c.status === "near" && (
                <span className="rounded-full bg-caution/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-caution">
                  Near-miss
                </span>
              )}
              <span className="sr-only">
                {c.status === "miss"
                  ? "outside the mandate"
                  : c.status === "near"
                    ? "a near-miss against the mandate"
                    : c.status === "pass"
                      ? "inside the mandate"
                      : "not determinable yet"}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Analyses: secondary pill nav over the five analysis views — verdict first,
 *  then the critique behind it. One at a time here too. */
function AnalysesPanel({
  analysis,
  onSelect,
  counts,
  results,
  active,
  step,
  dealId,
  dealName,
  hasOm,
  compSearch,
  isPro,
  modelError,
  supplements,
}: {
  analysis: AnalysisKey;
  onSelect: (key: AnalysisKey) => void;
  counts: Record<AnalysisKey, number>;
  results: Results;
  active: boolean;
  step: string | null;
  dealId: string;
  dealName: string;
  hasOm: boolean;
  compSearch: CompSearchResult | null;
  isPro: boolean;
  modelError: string | null;
  supplements: SupplementsMap;
}) {
  const STEP_FOR: Record<AnalysisKey, string> = {
    verdict: "verdict",
    challenger: "challenge",
    comps: "comps",
    market: "market",
    reconciler: "reconcile",
  };

  const def = ANALYSES.find((a) => a.key === analysis)!;
  const data = results[def.result];
  const running = active && step === STEP_FOR[analysis];
  const pending =
    active &&
    !data &&
    !running &&
    PIPELINE.indexOf(STEP_FOR[analysis]) > PIPELINE.indexOf(step ?? "");

  const supp = supplements[analysis];
  const footer = (
    <>
      {supp && <Supplements dealId={dealId} tab={analysis} data={supp} />}
      <AddData dealId={dealId} tab={analysis} />
    </>
  );

  let content: React.ReactNode;
  if (analysis === "reconciler") {
    const reconciling = running;
    content = (
      <>
        {results.reconciliation && (
          <Reconciliation result={results.reconciliation} />
        )}
        {reconciling && !results.reconciliation && <TableSkeleton />}
        {hasOm && !reconciling && (
          <ReconcileSection
            dealId={dealId}
            hasResult={!!results.reconciliation}
            error={modelError}
            disabled={active}
          />
        )}
      </>
    );
  } else if (data) {
    content =
      analysis === "verdict" ? (
        <VerdictView result={results.verdict!} />
      ) : analysis === "challenger" ? (
        <ChallengerView result={results.challenges!} dealName={dealName} />
      ) : analysis === "comps" ? (
        <BrokerComps
          result={results.comps!}
          dealId={dealId}
          compSearch={compSearch}
          active={active}
          isPro={isPro}
        />
      ) : (
        <MarketCheck result={results.market!} />
      );
  } else if (running || pending) {
    content = analysis === "verdict" ? <VerdictSkeleton /> : <CardListSkeleton />;
  } else if (hasOm) {
    content = (
      <EmptyState
        title="Analysis hasn’t run for this deal yet."
        action={<RetryForm dealId={dealId} label="Run analysis" />}
      />
    );
  } else {
    content = (
      <EmptyState title="Nothing here from the OM yet — add your own below." />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Analyses"
        className="flex flex-wrap gap-1.5"
      >
        {ANALYSES.map((a) => {
          const on = a.key === analysis;
          const has = results[a.result] != null;
          return (
            <button
              key={a.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(a.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-brand bg-brand/10 text-brand"
                  : has
                    ? "border-line bg-surface text-ink hover:bg-faint"
                    : "border-line bg-surface text-muted hover:bg-faint"
              }`}
            >
              {a.label}
              {counts[a.key] > 0 && (
                <span className="rounded-full bg-kill/10 px-1.5 py-px font-mono text-[10px] tabular-nums text-kill">
                  {counts[a.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div key={analysis} className="animate-fade flex flex-col gap-6">
        {content}
        {footer}
      </div>
    </div>
  );
}

/** Documents: the OM itself, the memo export, uploaded documents, and every
 *  note/file added along the way — one home for all of it. */
function DocumentsPanel({
  dealId,
  hasOm,
  omUrl,
  canMemo,
  hasVerdict,
  documents,
  supplements,
  active,
}: {
  dealId: string;
  hasOm: boolean;
  omUrl: string | null;
  canMemo: boolean;
  hasVerdict: boolean;
  documents: DealDocument[];
  supplements: SupplementsMap;
  active: boolean;
}) {
  const KIND_LABEL: Record<string, string> = {
    om: "Offering memorandum",
    rent_roll: "Rent roll",
    t12: "T-12",
    financials: "Financials",
    loan_terms: "Loan terms",
    other: "Document",
  };
  const SUPP_LABEL: Record<string, string> = {
    terms: "Financials",
    challenger: "Challenger",
    comps: "Comps",
    reconciler: "Reconciler",
    market: "Market",
    verdict: "Verdict",
    documents: "General",
  };
  const suppEntries = Object.entries(supplements).filter(
    ([, s]) => s && ((s.notes?.length ?? 0) > 0 || (s.files?.length ?? 0) > 0),
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold tracking-tight">Source documents</h2>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          <li className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">
              Offering memorandum
            </span>
            {omUrl && (
              <a
                href={omUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens the uploaded OM (link valid for 1 hour)"
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                View
              </a>
            )}
            {hasOm && <ReplaceOm dealId={dealId} disabled={active} />}
            {!hasOm && (
              <span className="text-xs text-muted">none uploaded</span>
            )}
          </li>
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              <span className="shrink-0 text-xs text-muted">
                {KIND_LABEL[d.kind] ?? d.kind}
              </span>
            </li>
          ))}
        </ul>
        {hasVerdict && (
          <div className="mt-3">
            {canMemo ? (
              <a
                href={`/api/deals/${dealId}/memo`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
              >
                Download the one-page memo (PDF)
              </a>
            ) : (
              <Link
                href="/billing"
                className="inline-flex items-center gap-1.5 rounded-lg border border-caution/30 bg-caution/5 px-3 py-1.5 text-xs font-medium text-caution transition-colors hover:bg-caution/10"
              >
                Upgrade for the PDF memo
              </Link>
            )}
          </div>
        )}
      </section>

      {suppEntries.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Your notes &amp; files
          </h2>
          {suppEntries.map(([key, s]) => (
            <div key={key}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                {SUPP_LABEL[key] ?? key}
              </p>
              <Supplements dealId={dealId} tab={key} data={s!} />
            </div>
          ))}
        </section>
      )}

      <AddData dealId={dealId} tab="documents" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab bar bits                                                        */
/* ------------------------------------------------------------------ */

function TabDot({
  state,
  active,
}: {
  state: "done" | "running" | "pending" | "idle";
  active: boolean;
}) {
  const base = "h-1.5 w-1.5 rounded-full";
  if (state === "done") {
    return <span className={`${base} ${active ? "bg-white" : "bg-pass"}`} />;
  }
  if (state === "running") {
    return (
      <span className={`${base} pulse-bar ${active ? "bg-white" : "bg-brand"}`} />
    );
  }
  if (state === "pending") {
    return <span className={`${base} ${active ? "bg-white/50" : "bg-line"}`} />;
  }
  return (
    <span
      className={`${base} ${
        active ? "bg-white/40" : "bg-transparent ring-1 ring-inset ring-line"
      }`}
    />
  );
}

/** mm:ss elapsed since mount — a moving number so a long step never reads as
 *  "hung" the way a frozen percentage does. */
function useElapsed(): string {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(secs / 60);
  const sec = String(secs % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function ProgressRail({ job }: { job: NonNullable<Job> }) {
  const elapsed = useElapsed();

  // Reconcile and model generation run on their own — a simple indicator, not
  // the 6-step pipeline rail.
  if (
    job.step === "reconcile" ||
    job.step === "model" ||
    job.step === "comps_search"
  ) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm">
            {STEP_LABELS[job.step] ?? "Working…"}
          </span>
          <span className="ml-auto font-mono text-xs tabular-nums text-muted">
            {elapsed}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Usually a minute or two — you can keep browsing; a toast will tell
          you when it lands.
        </p>
      </div>
    );
  }

  const steps = [
    { key: "signal", label: "Signal" },
    { key: "extract", label: "Extract" },
    { key: "challenge", label: "Challenge" },
    { key: "comps", label: "Comps" },
    { key: "market", label: "Market" },
    { key: "verdict", label: "Verdict" },
  ];
  const cur = steps.findIndex((s) => s.key === job.step);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="text-sm">
          {STEP_LABELS[job.step ?? ""] ?? "Analyzing…"}
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted">
          {cur >= 0 ? `Step ${cur + 1} of ${steps.length} · ` : ""}
          {elapsed}
        </span>
      </div>
      <ol className="mt-4 flex items-end gap-2">
        {steps.map((s, i) => {
          const done = cur < 0 ? false : i < cur;
          const current = i === cur;
          return (
            <li key={s.key} className="flex-1">
              <div
                className={`h-1 overflow-hidden rounded-full ${
                  done ? "bg-brand" : current ? "skeleton" : "bg-line"
                }`}
              >
                {current && <div className="h-full w-1/3 bg-brand/60" />}
              </div>
              <p
                className={`mt-1.5 text-[10px] ${
                  done || current ? "text-ink" : "text-muted"
                }`}
              >
                {s.label}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">
        A full screen typically takes 2–4 minutes — finished sections open as
        they land, so feel free to explore them meanwhile.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Working"
      className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="skeleton mt-3 h-5 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

function CardListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton mt-3 h-2.5 w-full rounded" />
          <div className="skeleton mt-2 h-2.5 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2.5">
          <div className="skeleton h-3 w-1/4 rounded" />
          <div className="skeleton h-3 w-1/5 rounded" />
          <div className="skeleton h-3 w-1/5 rounded" />
          <div className="skeleton h-3 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}

function VerdictSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="p-6">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="mt-4 flex items-center gap-3">
            <div className="skeleton h-11 w-11 rounded-full" />
            <div className="skeleton h-7 w-40 rounded" />
          </div>
          <div className="skeleton mt-5 h-2.5 w-full rounded" />
          <div className="skeleton mt-2 h-2.5 w-3/4 rounded" />
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="bg-surface p-5">
              <div className="skeleton h-2.5 w-20 rounded" />
              <div className="skeleton mt-3 h-2.5 w-full rounded" />
              <div className="skeleton mt-2 h-2.5 w-5/6 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
