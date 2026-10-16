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
  TermsView,
  VerdictView,
} from "./(app)/deals/[id]/deal-sections-view";
import { ReturnsHeadline } from "./(app)/deals/[id]/returns-headline";

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
 *  `sampleBaseReturns`). The walkthrough's Financials tab draws the
 *  first-draft model's returns, as the deal page's does, and names the
 *  workbook's levered IRR beside them as the other model's. */
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
      // The deal page's Financials tab on the sample: the extracted terms,
      // then the first-draft model's returns, the card's own figures. Its
      // tiles' grids are held to three across: four of them in this column
      // left "$68,000,000" wider than its tile.
      return (
        <div className="flex flex-col gap-6 [&_section>.grid]:grid-cols-2 sm:[&_section>.grid]:grid-cols-3">
          <TermsView result={RESULTS.extraction} />
          <div className="flex flex-col gap-1.5">
            <ReturnsHeadline model={SAMPLE_DEAL.model} />
            {/* Two models, said as two, as the deal page and /demo say it:
                the workbook runs the screening model on its own base case. */}
            <p className="text-xs text-muted" data-qa="home-two-models">
              {`The Excel workbook is a separate model: its levered IRR is ${returns.irr}.`}
            </p>
          </div>
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
            {/* What the box judged, never more: on the sample the target
                return and cash-on-cash cannot be checked, and the count on
                the chip says so (lib/fit-label). */}
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Your criteria, checked in code — as many as the documents let it judge.
            </p>
          </div>
          {/* The sample deal's own checks against its demo buy box
              (lib/sample-deal SAMPLE_DEMO_BOX), every one the count counts. */}
          <CriteriaChips criteria={fit.criteria} />
          {/* The chip's own sentence (lib/fit-label `checkedSentence`), the
              one its tooltip and the verdict's brief say. */}
          {fit.note && <p className="text-[10px] leading-relaxed text-muted">{fit.note}</p>}
        </div>
      );
    case "Analyses":
      return <AnalysesView analysis={analysis} onSelect={onAnalysis} />;
    case "Documents":
      // What the deal page's Documents tab holds on the sample (deal-view's
      // DocumentsPanel): no memorandum was ever uploaded for it and no
      // document rows are stored, so the one row says so, and the memo the
      // verdict makes is the public sample's. Never a file name it has not.
      return (
        <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold tracking-tight">Source documents</h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            <li className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">Offering memorandum</span>
              <span className="text-xs text-muted">none uploaded</span>
            </li>
          </ul>
          <div className="mt-3">
            <a
              href="/api/demo/memo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
            >
              Download the IC memo (PDF)
            </a>
          </div>
        </section>
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
