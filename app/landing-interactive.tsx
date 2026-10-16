"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { SampleLegal } from "@/lib/sample-legal";
import type { BoxCriterion } from "@/lib/buy-box-chip";
import { assetWords } from "@/lib/asset-words";
import { subjectBasis } from "@/lib/comp-detail";
import { condoUnitsOffered } from "@/lib/condo-units";
import { screenYearOf } from "@/lib/criteria";
import { inferStrategy } from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";
import {
  BrokerComps,
  ChallengerView,
  MarketCheck,
  OverviewView,
  Reconciliation,
  VerdictView,
} from "./(app)/deals/[id]/deal-sections";

/** The sample's fit against its demo buy box, read on the server through
 *  the deal header's own reader (lib/buy-box-chip `buyBoxRead`), so the
 *  walkthrough's call is the header's, never a word typed here. */
export interface SampleFit {
  label: string;
  /** the chip's colours, the header's (`BUY_BOX_CHIP_CLS`) */
  cls: string;
  /** which criteria could not be checked, as the chip's tooltip says it */
  note?: string;
  /** every criterion the box sets (`boxCriteria`), as the count counts them */
  criteria: BoxCriterion[];
}

/** The sample's base-case returns, formatted on the server from the one
 *  derivation the Excel tile and the stress bench read (lib/sample-derive
 *  `sampleBaseReturns`), so the walkthrough prints the page's one IRR. */
export interface SampleReturns {
  irr: string;
  equityMultiple: string;
  cashOnCash: string;
  exitCap: string;
}

const CRITERION_MARK: Record<BoxCriterion["status"], [string, string, string]> = {
  pass: ["✓", "text-pass border-line", "met"],
  near: ["~", "text-caution border-caution/30", "just short"],
  miss: ["✕", "text-kill border-kill/30 bg-kill/[0.04]", "missed"],
  unknown: ["—", "text-muted border-line", "not checked"],
};

/** The box's criteria as a row of chips: each one's mark, its name, and
 *  for a screen reader what the mark says. */
export function CriteriaChips({ criteria }: { criteria: BoxCriterion[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
      {criteria.map(({ label, status }) => {
        const [mark, cls, said] = CRITERION_MARK[status];
        return (
          <span key={label} className={`flex items-center gap-1 rounded-md border px-2 py-1 ${cls}`}>
            <span aria-hidden>{mark}</span>
            <span className="text-ink">{label}</span>
            <span className="sr-only">{`: ${said}`}</span>
          </span>
        );
      })}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Fades/slides children in the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${shown ? "reveal-in" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** A stat, rendered statically — single-digit figures earn no animation.
 *  (Kept as a component so callers and tests didn't have to change.) */
export function CountUp({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {value}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The walkthrough — the signed-in sample deal's own tabs, on the       */
/* homepage. Each tab draws the deal page's REAL components             */
/* (app/(app)/deals/[id]/deal-sections) over the sample fixture, so its */
/* words, chips and figures are the product's, never a re-drawing of    */
/* them. All data is an ILLUSTRATIVE SAMPLE, labelled so in the UI.     */
/* ------------------------------------------------------------------ */

/** The sample's stored results, as the deal page hands them to its tabs. */
const RESULTS = {
  extraction: SAMPLE_DEAL.extraction,
  challenges: SAMPLE_DEAL.challenges,
  comps: SAMPLE_DEAL.comps,
  reconciliation: SAMPLE_DEAL.reconciliation,
  market: SAMPLE_DEAL.market,
  verdict: SAMPLE_DEAL.verdict,
};

/** The comps table's subject tick, read as the deal page reads it
 *  (deal-view's `compSubject`): the building's basis by the deal's kind. */
const COMP_SUBJECT = subjectBasis(
  RESULTS.extraction.metrics,
  inferStrategy(RESULTS.extraction).kind,
  screenYearOf(RESULTS.extraction),
  interestOf(RESULTS.extraction),
  RESULTS.extraction.assetClass,
  condoUnitsOffered(RESULTS.extraction),
);

// The REAL deal page's section list and analyses (deal-view.tsx SECTIONS
// and ANALYSES) — the product's own information architecture.
const TABS = ["Overview", "Financials", "Buy box", "Analyses", "Documents"] as const;
type Tab = (typeof TABS)[number];
/** A tab's id, its label with no space in it ("Buy box" read as two). */
const tabId = (t: Tab) => `demo-tab-${t.toLowerCase().replace(/\s+/g, "-")}`;
const ANALYSES = [
  { key: "verdict", label: "Verdict", result: "verdict" },
  { key: "challenger", label: "Challenger", result: "challenges" },
  { key: "comps", label: "Comps", result: "comps" },
  { key: "market", label: "Market", result: "market" },
  { key: "reconciler", label: "Reconciler", result: "reconciliation" },
] as const;
export type AnalysisKey = (typeof ANALYSES)[number]["key"];

/** Where the Overview's jump links land (deal-view's LEGACY_TABS): the
 *  terms are the Financials tab's, each analysis its own sub-tab. */
function landing(key: string): { tab: Tab; analysis?: AnalysisKey } | null {
  if (key === "terms") return { tab: "Financials" };
  const a = ANALYSES.find((x) => x.key === key);
  return a ? { tab: "Analyses", analysis: a.key } : null;
}

/** The finding counts the deal page's tabs carry (deal-view's
 *  `analysisCounts` and `sectionCounts`), counted on the sample. */
const ANALYSIS_COUNTS: Record<AnalysisKey, number> = {
  verdict: 0,
  challenger: RESULTS.challenges.challenges.filter((c) => c.severity === "high").length,
  comps:
    RESULTS.comps.redFlags.length +
    [...RESULTS.comps.saleComps, ...RESULTS.comps.leaseComps].filter((c) => c.support === "stretched").length,
  market: RESULTS.market.checks.filter((c) => c.assessment === "aggressive").length,
  reconciler: RESULTS.reconciliation.rows.filter((r) => r.direction === "unfavorable").length,
};

/** The deal page's tab dot (deal-view's TabDot): a finished section's,
 *  or an idle one's ring. */
function TabDot({ done, active }: { done: boolean; active: boolean }) {
  const base = "h-1.5 w-1.5 rounded-full";
  if (done) return <span aria-hidden className={`${base} ${active ? "bg-white" : "bg-pass"}`} />;
  return (
    <span
      aria-hidden
      className={`${base} ${active ? "bg-white/40" : "bg-transparent ring-1 ring-inset ring-line"}`}
    />
  );
}

function RangeRow({
  label,
  low,
  base,
  high,
  src,
}: {
  label: string;
  low: string;
  base: string;
  high: string;
  src: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-[10px] text-muted">range</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {[
          ["Low", low, false],
          ["Base", base, true],
          ["High", high, false],
        ].map(([k, v, e]) => (
          <div
            key={k as string}
            // Opaque, so the grid's line colour never shows through the
            // base's tint (research pass 33).
            className={`px-2.5 py-1.5 ${e ? "bg-[color-mix(in_oklab,var(--color-brand)_5%,var(--color-surface))]" : "bg-surface"}`}
          >
            <p className="text-[9px] uppercase tracking-wide text-muted">
              {k as string}
            </p>
            <p
              className={`mt-0.5 font-mono tabular-nums ${
                e ? "text-sm font-semibold text-brand" : "text-xs"
              }`}
            >
              {v as string}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
        <span className="font-medium text-ink">Source:</span> {src}
      </p>
    </div>
  );
}

/** The Analyses tab's own sub-tabs and the view each opens — the deal
 *  page's AnalysesPanel, its classes and its components, on the sample. */
function AnalysesView({
  analysis,
  onSelect,
}: {
  analysis: AnalysisKey;
  onSelect: (key: AnalysisKey) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Analyses"
        onKeyDown={(e) => {
          const at = ANALYSES.findIndex((a) => a.key === analysis);
          const n = ANALYSES.length;
          const next =
            e.key === "ArrowRight" ? (at + 1) % n : e.key === "ArrowLeft" ? (at - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
          if (next < 0) return;
          e.preventDefault();
          onSelect(ANALYSES[next].key);
          document.getElementById(`demo-analysis-tab-${ANALYSES[next].key}`)?.focus();
        }}
        className="flex flex-wrap gap-1.5"
      >
        {ANALYSES.map((a) => {
          const on = a.key === analysis;
          const count = ANALYSIS_COUNTS[a.key];
          return (
            <button
              key={a.key}
              id={`demo-analysis-tab-${a.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="demo-analysis-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(a.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on ? "border-brand bg-brand/10 text-brand" : "border-line bg-surface text-ink hover:bg-faint"
              }`}
            >
              {a.label}
              {count > 0 && (
                <span className="rounded-full bg-kill/10 px-1.5 py-px font-mono text-[10px] tabular-nums text-kill">
                  {count}
                  <span className="sr-only">{` finding${count === 1 ? "" : "s"}`}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        key={analysis}
        id="demo-analysis-tabpanel"
        role="tabpanel"
        aria-labelledby={`demo-analysis-tab-${analysis}`}
        className="animate-fade flex flex-col gap-6"
      >
        {analysis === "verdict" && <VerdictView result={RESULTS.verdict} />}
        {analysis === "challenger" && (
          <ChallengerView
            result={RESULTS.challenges}
            dealName={SAMPLE_DEAL.name}
            totalPages={RESULTS.extraction.totalPages ?? null}
            sample
          />
        )}
        {analysis === "comps" && (
          // No map: the deal page's comps map geocodes each comp in the
          // visitor's browser, which a homepage section has no business
          // doing; /demo's comps tab draws none either.
          <BrokerComps
            result={RESULTS.comps}
            dealId="sample"
            compSearch={null}
            active={false}
            isPro={false}
            publicDemo
            subject={COMP_SUBJECT}
            noun={assetWords(RESULTS.extraction.assetClass).noun?.one}
          />
        )}
        {analysis === "market" && <MarketCheck result={RESULTS.market} />}
        {analysis === "reconciler" && <Reconciliation result={RESULTS.reconciliation} />}
      </div>
    </div>
  );
}

/** One tab's panel (exported for the homepage's render test). The
 *  Overview's jump links move the walkthrough as they move the deal page. */
export function DemoPanel({
  tab,
  fit,
  returns,
  analysis = "verdict",
  onAnalysis = () => {},
  onNavigate = () => {},
}: {
  tab: Tab;
  /** no longer drawn: the deal page's research panel sits under its tabs,
   *  in none of them (accepted until the page stops passing it) */
  legal?: SampleLegal;
  fit: SampleFit;
  returns: SampleReturns;
  /** the Analyses tab's open sub-tab */
  analysis?: AnalysisKey;
  onAnalysis?: (key: AnalysisKey) => void;
  /** a jump from the Overview, by the deal page's own tab keys */
  onNavigate?: (key: string) => void;
}) {
  switch (tab) {
    case "Overview":
      return <OverviewView results={RESULTS} active={false} onNavigate={onNavigate} />;
    case "Financials":
      return (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Projected returns · the Excel workbook&apos;s base case
          </p>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            {(
              [
                ["Levered IRR", returns.irr],
                ["Equity multiple", returns.equityMultiple],
                ["Cash-on-cash (Yr 1)", returns.cashOnCash],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-surface px-2 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted">{k}</p>
                <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <RangeRow
            label="Exit cap"
            low="5.25%"
            base={returns.exitCap}
            high="5.75%"
            src="the market check's typical range, a rule of thumb; the OM holds 5.25%."
          />
          <RangeRow
            label="Market rent / unit"
            low="$2,400"
            base="$2,480"
            high="$2,600"
            src="rent roll actuals · OM p.12 pro forma flagged +8%."
          />
        </div>
      );
    case "Buy box":
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium">Mandate fit</p>
              <span title={fit.note} className={`rounded-full px-2.5 py-0.5 text-right text-xs font-semibold ${fit.cls}`}>
                {fit.label}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Your saved criteria, checked in code on every screen — cap floor,
              return targets, geographies, hard dealbreakers.
            </p>
          </div>
          {/* The sample deal's own checks against its demo buy box
              (lib/sample-deal SAMPLE_DEMO_BOX), every one the count counts. */}
          <CriteriaChips criteria={fit.criteria} />
          <p className="text-[10px] leading-relaxed text-muted">
            A deal can be well-underwritten and still be outside the box — it
            says so, from the first signal onward, and the verdict judges the
            fit out loud.
          </p>
        </div>
      );
    case "Analyses":
      return <AnalysesView analysis={analysis} onSelect={onAnalysis} />;
    case "Documents":
      return (
        <div className="space-y-2.5">
          {(
            [
              ["offering-memorandum.pdf", "screened — all six stages, page-cited", "bg-pass/10 text-pass", "Screened"],
              ["rent-roll.csv", "actuals beat pro forma in every conflict", "bg-brand/10 text-brand", "Reconciled"],
              ["t12-operating.pdf", "expense load anchored to the trailing twelve", "bg-brand/10 text-brand", "Reconciled"],
            ] as const
          ).map(([file, meta, cls, chip]) => (
            <div
              key={file}
              className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{file}</p>
                <p className="truncate text-[10px] text-muted">{meta}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${cls}`}>
                {chip}
              </span>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-muted">
            Add a rent roll, T-12, or loan terms any time — the screen
            re-anchors itself and flags where the OM&apos;s pro forma drifts.
          </p>
        </div>
      );
  }
}

/** The walkthrough: the deal page's section bar — its segmented control,
 *  each tab's dot and finding count — over the sample deal's own tabs. */
export function DemoTabs({ fit, returns }: { legal?: SampleLegal; fit: SampleFit; returns: SampleReturns }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [analysis, setAnalysis] = useState<AnalysisKey>("verdict");
  const missed = fit.criteria.filter((c) => c.status === "miss").length;
  const counts: Record<Tab, number> = {
    Overview: 0,
    Financials: 0,
    "Buy box": missed,
    Analyses: ANALYSIS_COUNTS.challenger + ANALYSIS_COUNTS.comps + ANALYSIS_COUNTS.market + ANALYSIS_COUNTS.reconciler,
    Documents: 0,
  };
  // Every section but the documents holds a finished result on the sample,
  // so its dot is the deal page's "done" (deal-view's `sectionState`).
  const done = (t: Tab) => t !== "Documents";

  function onKeys(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (i - 1 + TABS.length) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]);
    document.getElementById(tabId(TABS[next]))?.focus();
  }

  function navigate(key: string) {
    const to = landing(key);
    if (!to) return;
    if (to.analysis) setAnalysis(to.analysis);
    setTab(to.tab);
    requestAnimationFrame(() => document.getElementById(tabId(to.tab))?.focus());
  }

  return (
    <div className="shadow-float overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-faint p-2">
        {/* The deal page's section bar, class for class (deal-view). It
            scrolls sideways where the column is narrower than the five
            tabs, under the same fade at its edge. */}
        <div className="min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(90deg,#000_calc(100%_-_1.75rem),transparent)]">
          <div
            role="tablist"
            aria-label="Sample deal sections"
            onKeyDown={onKeys}
            className="mr-8 flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm"
          >
            {TABS.map((t) => {
              const on = tab === t;
              const count = counts[t];
              return (
                <button
                  key={t}
                  id={tabId(t)}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="demo-tabpanel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(t)}
                  className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    on ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-faint hover:text-ink"
                  }`}
                >
                  <TabDot done={done(t)} active={on} />
                  {t}
                  {count > 0 && (
                    <span
                      title={`${count} finding${count === 1 ? "" : "s"}`}
                      className={`rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums ${
                        on ? "bg-white/20 text-white" : "bg-kill/10 text-kill"
                      }`}
                    >
                      {count}
                      <span className="sr-only">{` finding${count === 1 ? "" : "s"}`}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <span className="hidden shrink-0 pr-1 text-[10px] font-medium uppercase tracking-wide text-muted sm:block">
          Sample data
        </span>
      </div>
      <div
        key={tab}
        id="demo-tabpanel"
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="animate-rise min-h-[24rem] p-4"
      >
        <DemoPanel
          tab={tab}
          fit={fit}
          returns={returns}
          analysis={analysis}
          onAnalysis={setAnalysis}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}
