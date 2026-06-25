"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { rerunAnalysis, reconcileWithModel } from "../actions";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  BrokerComp,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";

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
  | "terms"
  | "challenger"
  | "comps"
  | "reconciler"
  | "market"
  | "verdict";

const TABS: {
  key: TabKey;
  label: string;
  step: string;
  result: keyof Results;
}[] = [
  { key: "terms", label: "Terms", step: "extract", result: "extraction" },
  { key: "challenger", label: "Challenger", step: "challenge", result: "challenges" },
  { key: "comps", label: "Comps", step: "comps", result: "comps" },
  { key: "reconciler", label: "Reconciler", step: "reconcile", result: "reconciliation" },
  { key: "market", label: "Market", step: "market", result: "market" },
  { key: "verdict", label: "Verdict", step: "verdict", result: "verdict" },
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
};

const MODEL_ERRORS: Record<string, string> = {
  modelfile: "Please choose your model file to upload.",
  modeltype: "Please upload your model as .xlsx, .csv, or PDF.",
  modelsize: "That file is larger than 22 MB — please try a smaller export.",
};

function isActive(status: string | undefined): boolean {
  return status === "queued" || status === "running";
}

export function DealView({
  dealId,
  initialTab,
  hasOm,
  modelErrorCode,
  job: initialJob,
  results,
}: {
  dealId: string;
  initialTab: string | null;
  hasOm: boolean;
  modelErrorCode: string | null;
  job: Job;
  results: Results;
}) {
  const router = useRouter();

  // Live job status, kept fresh by polling. Server data (results) arrives via
  // props on each router.refresh(); this just tracks the in-flight step/%.
  const [job, setJob] = useState<Job>(initialJob);
  const lastStep = useRef<string | null>(initialJob?.step ?? null);

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
        lastStep.current = data.step;
        setJob(data);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, job?.status, router]);

  // Default tab: an explicit ?tab wins; otherwise the verdict if it's ready,
  // else the first tab (which fills in first as analysis runs).
  const validInitial = TABS.find((t) => t.key === initialTab)?.key;
  const [activeTab, setActiveTab] = useState<TabKey>(
    validInitial ?? (results.verdict ? "verdict" : "terms"),
  );

  function selectTab(key: TabKey) {
    setActiveTab(key);
    // Reflect the tab in the URL (shareable / back-button) without a server
    // round-trip, so switching stays instant.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }

  function tabState(t: (typeof TABS)[number]): "done" | "running" | "pending" | "idle" {
    if (results[t.result] != null) return "done";
    if (active) {
      if (job?.step === t.step) return "running";
      const cur = PIPELINE.indexOf(job?.step ?? "");
      const mine = PIPELINE.indexOf(t.step);
      if (mine >= 0 && (cur < 0 || mine > cur)) return "pending";
    }
    return "idle";
  }

  const activeDef = TABS.find((t) => t.key === activeTab)!;
  const activeHasData = results[activeDef.result] != null;

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
        <div className="flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
          {TABS.map((t) => {
            const state = tabState(t);
            const isActiveTab = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActiveTab
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-faint hover:text-ink"
                }`}
              >
                <TabDot state={state} active={isActiveTab} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab content — re-keyed so it eases in on switch and on data arrival */}
      <div key={`${activeTab}-${activeHasData}`} className="animate-rise">
        <TabPanel
          tab={activeTab}
          state={tabState(activeDef)}
          results={results}
          dealId={dealId}
          hasOm={hasOm}
          active={active}
          modelError={modelErrorCode ? MODEL_ERRORS[modelErrorCode] ?? null : null}
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
      <span
        className={`${base} pulse-bar ${active ? "bg-white" : "bg-brand"}`}
      />
    );
  }
  if (state === "pending") {
    return <span className={`${base} ${active ? "bg-white/50" : "bg-line"}`} />;
  }
  return (
    <span
      className={`${base} ${active ? "bg-white/40" : "bg-transparent ring-1 ring-inset ring-line"}`}
    />
  );
}

function ProgressRail({ job }: { job: NonNullable<Job> }) {
  // Reconcile runs after the main pass — show a simple indicator, not the rail.
  if (job.step === "reconcile") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <Spinner />
        <span className="text-sm">{STEP_LABELS.reconcile}</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted">
          {job.progress}%
        </span>
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
        <span className="text-sm">{STEP_LABELS[job.step ?? ""] ?? "Analyzing…"}</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted">
          {job.progress}%
        </span>
      </div>
      <ol className="mt-4 flex items-end gap-2">
        {steps.map((s, i) => {
          const done = cur < 0 ? false : i < cur;
          const current = i === cur;
          return (
            <li key={s.key} className="flex-1">
              <div
                className={`h-1 rounded-full ${
                  done
                    ? "bg-brand"
                    : current
                      ? "bg-brand/50 pulse-bar"
                      : "bg-line"
                }`}
              />
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
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand"
      aria-hidden
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
  modelError,
}: {
  tab: TabKey;
  state: "done" | "running" | "pending" | "idle";
  results: Results;
  dealId: string;
  hasOm: boolean;
  active: boolean;
  modelError: string | null;
}) {
  // The reconciler tab is special: it always offers the upload, plus the
  // result if present.
  if (tab === "reconciler") {
    return (
      <div className="flex flex-col gap-5">
        {results.reconciliation && (
          <Reconciliation result={results.reconciliation} />
        )}
        {hasOm && !active && (
          <ReconcileSection
            dealId={dealId}
            hasResult={!!results.reconciliation}
            error={modelError}
          />
        )}
        {active && !results.reconciliation && <TableSkeleton />}
      </div>
    );
  }

  const def = TABS.find((t) => t.key === tab)!;
  const data = results[def.result];

  if (data) {
    switch (tab) {
      case "terms":
        return <TermsView result={results.extraction!} />;
      case "challenger":
        return <ChallengerView result={results.challenges!} />;
      case "comps":
        return <BrokerComps result={results.comps!} />;
      case "market":
        return <MarketCheck result={results.market!} />;
      case "verdict":
        return <VerdictView result={results.verdict!} />;
    }
  }

  // No data yet — skeleton while the step is running/pending, otherwise an
  // empty state (with a run affordance on the Terms tab).
  if (state === "running" || state === "pending") {
    return <TabSkeleton tab={tab} />;
  }

  if (tab === "terms" && hasOm) {
    return (
      <EmptyState
        title="Analysis hasn’t run for this deal yet."
        action={<RetryForm dealId={dealId} label="Run analysis" />}
      />
    );
  }
  if (tab === "terms") {
    return <EmptyState title="No OM uploaded for this deal." />;
  }
  return (
    <EmptyState title="Run the analysis to populate this section." />
  );
}

function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
      <p className="text-sm text-muted">{title}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
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
  );
}

/* ------------------------------------------------------------------ */
/* Redesigned tabs (Slice 1): Terms + Verdict                          */
/* ------------------------------------------------------------------ */

function TermsView({ result }: { result: ExtractionResult }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Extracted terms</h2>
        <span className="text-xs text-caution">⚑ verify against source</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {result.metrics.map((m, i) => (
          <div
            key={i}
            className="rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              <span className="truncate">{m.label}</span>
              {m.flagged && <span className="shrink-0 text-caution">⚑</span>}
            </p>
            <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
              {m.value}
            </p>
            {m.page && <p className="mt-2 text-[10px] text-muted">{m.page}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function VerdictView({ result }: { result: VerdictResult }) {
  const v =
    {
      pass: {
        word: "Pass",
        sub: "Worth deeper work",
        dot: "bg-pass",
        tint: "from-pass/10",
      },
      caution: {
        word: "Caution",
        sub: "Proceed only with named conditions",
        dot: "bg-caution",
        tint: "from-caution/10",
      },
      pass_on: {
        word: "Pass on",
        sub: "Kill it",
        dot: "bg-kill",
        tint: "from-kill/10",
      },
    }[result.verdict] ?? {
      word: "Caution",
      sub: "",
      dot: "bg-caution",
      tint: "from-caution/10",
    };

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className={`bg-gradient-to-b ${v.tint} to-transparent p-6`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${v.dot}`} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Verdict
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{v.word}</p>
        {v.sub && <p className="mt-0.5 text-sm text-muted">{v.sub}</p>}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">{result.reason}</p>
      </div>
      {(result.topRisks.length > 0 || result.nextSteps.length > 0) && (
        <div className="grid gap-px bg-line sm:grid-cols-2">
          <div className="bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Top risks
            </p>
            <ul className="mt-3 space-y-2">
              {result.topRisks.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill" />
                  <span className="text-muted">{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Next steps
            </p>
            <ul className="mt-3 space-y-2">
              {result.nextSteps.map((n, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden className="text-brand">
                    →
                  </span>
                  <span className="text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ported tabs (restyled in later slices): Challenger / Comps /        */
/* Market / Reconciler                                                 */
/* ------------------------------------------------------------------ */

function ChallengerView({ result }: { result: ChallengerResult }) {
  const sev = {
    high: { ring: "border-l-kill", badge: "bg-kill/10 text-kill" },
    medium: { ring: "border-l-caution", badge: "bg-caution/10 text-caution" },
    low: { ring: "border-l-brand", badge: "bg-brand/10 text-brand" },
  } as const;

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Assumption challenger
      </h2>
      <div className="mt-4 space-y-3">
        {result.challenges.map((c, i) => {
          const s = sev[c.severity] ?? sev.medium;
          return (
            <div
              key={i}
              className={`rounded-xl border border-line border-l-4 ${s.ring} bg-surface p-4 shadow-sm`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.assumption}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${s.badge}`}
                >
                  {c.severity}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {c.challenge}
              </p>
              {c.question && (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-medium">Ask the broker:</span>{" "}
                  <span className="text-muted">{c.question}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
      {result.stressTest && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
          <p className="text-sm font-medium">Stress test</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {result.stressTest}
          </p>
        </div>
      )}
    </section>
  );
}

function BrokerComps({ result }: { result: BrokerCompsResult }) {
  const hasComps =
    result.saleComps.length > 0 || result.leaseComps.length > 0;

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Broker-comp scrutiny
      </h2>

      {result.summary && (
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed shadow-sm">
          {result.summary}
        </p>
      )}

      {hasComps && (
        <div className="mt-3 space-y-5">
          <CompGroup title="Sale comps" comps={result.saleComps} />
          <CompGroup title="Lease comps" comps={result.leaseComps} />
        </div>
      )}

      {result.redFlags.length > 0 && (
        <div className="mt-3 rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">Cherry-picking &amp; omissions</p>
          <ul className="mt-2 space-y-1.5">
            {result.redFlags.map((flag, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span aria-hidden className="text-kill">
                  ⚑
                </span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CompGroup({ title, comps }: { title: string; comps: BrokerComp[] }) {
  const rating = {
    supports: { label: "Supports", badge: "bg-pass/10 text-pass" },
    favorable: { label: "Favorable", badge: "bg-caution/10 text-caution" },
    stretched: { label: "Stretched", badge: "bg-kill/10 text-kill" },
  } as const;

  if (comps.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      <div className="mt-2 space-y-2">
        {comps.map((c, i) => {
          const r = rating[c.support] ?? rating.favorable;
          return (
            <div
              key={i}
              className="rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.detail && (
                    <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                  )}
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                >
                  {r.label}
                </span>
              </div>
              {c.note && (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {c.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketCheck({ result }: { result: MarketResult }) {
  const tone = {
    "in-line": { badge: "bg-pass/10 text-pass", label: "In-line" },
    aggressive: { badge: "bg-kill/10 text-kill", label: "Aggressive" },
    conservative: { badge: "bg-brand/10 text-brand", label: "Conservative" },
  } as const;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Market plausibility check
        </h2>
        <span className="text-xs text-muted">rules-of-thumb, not pulled comps</span>
      </div>
      <div className="mt-4 space-y-2">
        {result.checks.map((c, i) => {
          const t = tone[c.assessment] ?? tone["in-line"];
          return (
            <div
              key={i}
              className="rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.assumption}</span>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.badge}`}
                >
                  {t.label}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                <span>
                  OM: <span className="font-mono tabular-nums text-ink">{c.omSays}</span>
                </span>
                <span>
                  Typical:{" "}
                  <span className="font-mono tabular-nums text-ink">
                    {c.typicalRange}
                  </span>
                </span>
              </div>
              {c.note && (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {c.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {result.summary && (
        <p className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm leading-relaxed text-muted">
          {result.summary}
        </p>
      )}
    </section>
  );
}

function Reconciliation({ result }: { result: ReconciliationResult }) {
  const dir = {
    unfavorable: { badge: "bg-kill/10 text-kill", label: "Unfavorable" },
    favorable: { badge: "bg-pass/10 text-pass", label: "Favorable" },
    neutral: { badge: "bg-brand/10 text-brand", label: "Neutral" },
  } as const;

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Reconciliation — your model vs. the OM
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Metric</th>
              <th className="px-4 py-2.5 font-medium">OM says</th>
              <th className="px-4 py-2.5 font-medium">Your model</th>
              <th className="px-4 py-2.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => {
              const d = dir[r.direction] ?? dir.neutral;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{r.metric}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.omValue}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.myValue}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                    >
                      {d.label}
                    </span>
                    {r.gap && <p className="mt-1 text-muted">{r.gap}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.takeaway && (
        <p className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm leading-relaxed">
          <span className="font-medium">Takeaway: </span>
          <span className="text-muted">{result.takeaway}</span>
        </p>
      )}
    </section>
  );
}

function ReconcileSection({
  dealId,
  hasResult,
  error,
}: {
  dealId: string;
  hasResult: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        {hasResult ? "Reconcile a different model" : "Reconcile your model"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Upload your own underwriting — Excel (.xlsx), CSV, or a PDF / ARGUS
        export — and we’ll line it up against the OM and surface every gap, from
        your perspective. This is the part the OM can’t tell you.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {error}
        </p>
      )}

      <form
        action={reconcileWithModel}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="dealId" value={dealId} />
        <input
          type="file"
          name="model"
          accept=".xlsx,.xls,.csv,application/pdf"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-strong"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Reconcile
        </button>
      </form>
    </section>
  );
}

function RetryForm({ dealId, label }: { dealId: string; label: string }) {
  return (
    <form action={rerunAnalysis} className="mt-3">
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        {label}
      </button>
    </form>
  );
}
