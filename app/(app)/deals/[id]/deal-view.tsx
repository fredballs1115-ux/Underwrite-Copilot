"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
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

type TabKey =
  | "overview"
  | "terms"
  | "challenger"
  | "comps"
  | "reconciler"
  | "market"
  | "verdict"
  | "model";

const TABS: {
  key: TabKey;
  label: string;
  step: string;
  result: keyof Results | null;
}[] = [
  { key: "overview", label: "Overview", step: "", result: null },
  { key: "terms", label: "Terms", step: "extract", result: "extraction" },
  { key: "challenger", label: "Challenger", step: "challenge", result: "challenges" },
  { key: "comps", label: "Comps", step: "comps", result: "comps" },
  { key: "reconciler", label: "Reconciler", step: "reconcile", result: "reconciliation" },
  { key: "market", label: "Market", step: "market", result: "market" },
  { key: "verdict", label: "Verdict", step: "verdict", result: "verdict" },
  { key: "model", label: "Model", step: "model", result: null },
];

// The automatic pass, in order — drives the progress rail and pending/done logic.
const PIPELINE = ["extract", "challenge", "comps", "market", "verdict"];

const STEP_LABELS: Record<string, string> = {
  extract: "Reading the OM and extracting the key terms…",
  challenge: "Red-teaming the assumptions like an investment committee…",
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

export function DealView({
  dealId,
  initialTab,
  hasOm,
  modelErrorCode,
  job: initialJob,
  results,
  supplements,
  model,
  documents,
  compSearch,
  isPro,
}: {
  dealId: string;
  initialTab: string | null;
  hasOm: boolean;
  modelErrorCode: string | null;
  job: Job;
  results: Results;
  supplements: SupplementsMap;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  compSearch: CompSearchResult | null;
  isPro: boolean;
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

  // Default tab: an explicit ?tab wins; otherwise the verdict if it's ready,
  // else the first tab (which fills in first as analysis runs).
  const validInitial = TABS.find((t) => t.key === initialTab)?.key;
  const [activeTab, setActiveTab] = useState<TabKey>(validInitial ?? "overview");

  function selectTab(key: TabKey) {
    setActiveTab(key);
    // Reflect the tab in the URL (shareable / back-button) without a server
    // round-trip, so switching stays instant.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }

  function tabState(
    t: (typeof TABS)[number],
  ): "done" | "running" | "pending" | "idle" {
    if (t.key === "overview") {
      if (results.verdict || results.extraction) return "done";
      return active ? "running" : "idle";
    }
    if (t.key === "model") {
      if (model) return "done";
      if (active && job?.step === "model") return "running";
      return "idle";
    }
    if (t.result && results[t.result] != null) return "done";
    if (active) {
      if (job?.step === t.step) return "running";
      const cur = PIPELINE.indexOf(job?.step ?? "");
      const mine = PIPELINE.indexOf(t.step);
      if (mine >= 0 && (cur < 0 || mine > cur)) return "pending";
    }
    return "idle";
  }

  const activeDef = TABS.find((t) => t.key === activeTab)!;
  const activeHasData = activeDef.result
    ? results[activeDef.result] != null
    : true;

  // How many findings each tab holds — so a finished run still shows where
  // the problems live without opening every tab.
  function tabCount(key: TabKey): number {
    switch (key) {
      case "challenger":
        return (
          results.challenges?.challenges.filter((c) => c.severity === "high")
            .length ?? 0
        );
      case "comps": {
        const c = results.comps;
        if (!c) return 0;
        return (
          c.redFlags.length +
          [...c.saleComps, ...c.leaseComps].filter(
            (x) => x.support === "stretched",
          ).length
        );
      }
      case "market":
        return (
          results.market?.checks.filter((c) => c.assessment === "aggressive")
            .length ?? 0
        );
      case "reconciler":
        return (
          results.reconciliation?.rows.filter(
            (r) => r.direction === "unfavorable",
          ).length ?? 0
        );
      default:
        return 0;
    }
  }

  // Arrow-key navigation across the tablist (standard tabs pattern).
  function onTabKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex((t) => t.key === activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      selectTab(TABS[next].key);
      const el = document.getElementById(`tab-${TABS[next].key}`);
      el?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {active && <ProgressRail job={job!} />}

      {job?.status === "error" && (
        <div className="rounded-xl border border-kill/30 bg-kill/5 p-4">
          <p className="text-sm font-medium text-kill">Analysis failed</p>
          {job.error && <p className="mt-1 text-sm text-muted">{job.error}</p>}
          <RetryForm dealId={dealId} label="Try again" />
        </div>
      )}

      {/* Tab bar */}
      <div className="overflow-x-auto">
        <div
          role="tablist"
          aria-label="Deal analysis sections"
          onKeyDown={onTabKeyDown}
          className="flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm"
        >
          {TABS.map((t) => {
            const state = tabState(t);
            const isActiveTab = t.key === activeTab;
            const count = tabCount(t.key);
            return (
              <button
                key={t.key}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={isActiveTab}
                aria-controls="deal-tabpanel"
                tabIndex={isActiveTab ? 0 : -1}
                onClick={() => selectTab(t.key)}
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

      {/* Active tab content — re-keyed so it eases in on switch and on data arrival */}
      <div
        key={`${activeTab}-${activeHasData}`}
        id="deal-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="animate-rise"
      >
        <TabPanel
          tab={activeTab}
          state={tabState(activeDef)}
          results={results}
          dealId={dealId}
          hasOm={hasOm}
          active={active}
          onNavigate={(t) => selectTab(t as TabKey)}
          modelError={
            modelErrorCode ? MODEL_ERRORS[modelErrorCode] ?? null : null
          }
          supplements={supplements}
          model={model}
          documents={documents}
          compSearch={compSearch}
          isPro={isPro}
        />
      </div>
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
  // the 5-step pipeline rail.
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
/* Tab content router                                                  */
/* ------------------------------------------------------------------ */

function TabPanel({
  tab,
  state,
  results,
  dealId,
  hasOm,
  active,
  onNavigate,
  modelError,
  supplements,
  model,
  documents,
  compSearch,
  isPro,
}: {
  tab: TabKey;
  state: "done" | "running" | "pending" | "idle";
  results: Results;
  dealId: string;
  hasOm: boolean;
  active: boolean;
  onNavigate: (tab: string) => void;
  modelError: string | null;
  supplements: SupplementsMap;
  model: UnderwritingModel | null;
  documents: DealDocument[];
  compSearch: CompSearchResult | null;
  isPro: boolean;
}) {
  if (tab === "overview") {
    return (
      <OverviewView results={results} active={active} onNavigate={onNavigate} />
    );
  }

  if (tab === "model") {
    return (
      <ModelView
        dealId={dealId}
        model={model}
        documents={documents}
        active={active}
        isPro={isPro}
      />
    );
  }

  // Every detail tab gets a place to add your own data (notes + uploads).
  const tabSupp = supplements[tab];
  const footer = (
    <>
      {tabSupp && <Supplements dealId={dealId} tab={tab} data={tabSupp} />}
      <AddData dealId={dealId} tab={tab} />
    </>
  );

  // The reconciler tab always offers the model upload, plus the result if
  // present. Reconcile is NOT part of the automatic pipeline — only show its
  // skeleton when a reconcile run is genuinely in flight, and keep the upload
  // form visible (disabled) while other steps run.
  if (tab === "reconciler") {
    const reconciling = state === "running";
    return (
      <div className="flex flex-col gap-6">
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
        {footer}
      </div>
    );
  }

  const def = TABS.find((t) => t.key === tab)!;
  const data = def.result ? results[def.result] : null;

  let content: React.ReactNode;
  if (data) {
    content =
      tab === "terms" ? (
        <TermsView result={results.extraction!} />
      ) : tab === "challenger" ? (
        <ChallengerView result={results.challenges!} />
      ) : tab === "comps" ? (
        <BrokerComps
          result={results.comps!}
          dealId={dealId}
          compSearch={compSearch}
          active={active}
          isPro={isPro}
        />
      ) : tab === "market" ? (
        <MarketCheck result={results.market!} />
      ) : tab === "verdict" ? (
        <VerdictView result={results.verdict!} />
      ) : null;
  } else if (state === "running" || state === "pending") {
    content = <TabSkeleton tab={tab} />;
  } else if (hasOm) {
    // The OM exists but this step has no result — the fix is one click, not
    // "add your own data".
    content = (
      <EmptyState
        title="Analysis hasn’t run for this deal yet."
        action={<RetryForm dealId={dealId} label="Run analysis" />}
      />
    );
  } else if (tab === "terms") {
    content = <EmptyState title="No OM uploaded for this deal." />;
  } else {
    content = (
      <EmptyState title="Nothing here from the OM yet — add your own below." />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {content}
      {footer}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

function TabSkeleton({ tab }: { tab: TabKey }) {
  if (tab === "terms") return <StatGridSkeleton />;
  if (tab === "verdict") return <VerdictSkeleton />;
  return <CardListSkeleton />;
}

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
        <div className="skeleton mt-3 h-8 w-40 rounded" />
        <div className="skeleton mt-4 h-2.5 w-full max-w-xl rounded" />
        <div className="skeleton mt-2 h-2.5 w-2/3 rounded" />
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
    {/* The screen: range cards + deal-killers, so the final layout doesn't pop in */}
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {[0, 1, 2].map((j) => (
              <div key={j} className="bg-surface px-3 py-2">
                <div className="skeleton h-2 w-8 rounded" />
                <div className="skeleton mt-1.5 h-3.5 w-12 rounded" />
              </div>
            ))}
          </div>
          <div className="skeleton mt-2.5 h-2 w-3/4 rounded" />
        </div>
      ))}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton mt-2.5 h-2.5 w-full rounded" />
          <div className="skeleton mt-2 h-2.5 w-5/6 rounded" />
        </div>
      ))}
    </div>
    </div>
  );
}
