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
import type { SampleBuyBoxData } from "./sample-buy-box";
import { OverviewView } from "./(app)/deals/[id]/deal-sections-base";
import {
  CardListSkeleton,
  StatGridSkeleton,
  TableSkeleton,
  VerdictSkeleton,
} from "./(app)/deals/[id]/skeletons";

// The tabs past the Overview — the deal page's other sections and the
// model's returns (deal-sections-view, returns-headline), with the comps'
// subject tick — are one chunk of their own (./walkthrough-tabs), loaded once
// the walkthrough nears the screen or a tab is reached for: the homepage's
// first load carries the Overview alone.
type Walkthrough = typeof import("./walkthrough-tabs");
let walkthrough: Walkthrough | null = null;
let walkthroughLoad: Promise<Walkthrough> | null = null;

/** Loads the tabs past the Overview, once (exported for the render test,
 *  which draws every tab). */
export function loadWalkthrough(): Promise<Walkthrough> {
  walkthroughLoad ??= import("./walkthrough-tabs").then((m) => (walkthrough = m));
  return walkthroughLoad;
}

/** The tabs past the Overview, once their chunk has landed: a panel that
 *  draws them asks for the chunk itself (the homepage asks earlier, as the
 *  walkthrough nears the screen; /demo asks when a tab opens) and draws
 *  again when it arrives. */
function useWalkthrough(): Walkthrough | null {
  const [w, setW] = useState<Walkthrough | null>(walkthrough);
  useEffect(() => {
    if (w) return;
    let live = true;
    void loadWalkthrough().then((m) => {
      if (live) setW(m);
    });
    return () => {
      live = false;
    };
  }, [w]);
  return w;
}

/** A tab opened before its chunk has landed: the shape of the panel it
 *  opens, in the deal page's own skeletons (./(app)/deals/[id]/skeletons),
 *  never an empty panel, and a polite word for a screen reader. The word is
 *  set after the region mounts, so a reader that announces only a change in
 *  a live region hears it. */
function TabLoading({ what, children }: { what: string; children: ReactNode }) {
  const [said, setSaid] = useState("");
  useEffect(() => {
    const id = requestAnimationFrame(() => setSaid(`Loading ${what}…`));
    return () => cancelAnimationFrame(id);
  }, [what]);
  return (
    <div aria-busy="true" data-qa="walkthrough-loading">
      <p role="status" className="sr-only">
        {said}
      </p>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** The skeleton each analysis draws while the deal page's screen runs it
 *  (deal-view's AnalysesPanel: the verdict's hero, a list of cards), and
 *  a table for the two whose views are tables. */
const ANALYSIS_SKELETON: Record<AnalysisKey, () => ReactNode> = {
  verdict: () => <VerdictSkeleton />,
  challenger: () => <CardListSkeleton />,
  comps: () => <TableSkeleton />,
  market: () => <CardListSkeleton />,
  reconciler: () => <TableSkeleton />,
};

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
  // The sections, once their chunk has loaded (`loadWalkthrough`).
  const w = useWalkthrough();
  const label = ANALYSES.find((a) => a.key === analysis)!.label;
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
        {!w && <TabLoading what={`the ${label.toLowerCase()}`}>{ANALYSIS_SKELETON[analysis]()}</TabLoading>}
        {w && analysis === "verdict" && <w.VerdictView result={RESULTS.verdict} />}
        {w && analysis === "challenger" && (
          <w.ChallengerView
            result={RESULTS.challenges}
            dealName={SAMPLE_DEAL.name}
            totalPages={RESULTS.extraction.totalPages ?? null}
            sample
          />
        )}
        {w && analysis === "comps" && (
          // No map: the deal page's comps map geocodes each comp in the
          // visitor's browser, which a homepage section has no business
          // doing; /demo's comps tab draws none either.
          <w.BrokerComps
            result={RESULTS.comps}
            dealId="sample"
            compSearch={null}
            active={false}
            isPro={false}
            publicDemo
            subject={w.COMP_SUBJECT}
            noun={w.COMP_NOUN}
          />
        )}
        {w && analysis === "market" && <w.MarketCheck result={RESULTS.market} />}
        {w && analysis === "reconciler" && <w.Reconciliation result={RESULTS.reconciliation} />}
      </div>
    </div>
  );
}

/** The deal page's Financials tab on the sample: the extracted terms,
 *  then the first-draft model's returns, the card's own figures. Its
 *  tiles' grids are held to three across: four of them in this column left
 *  "$68,000,000" wider than its tile. Drawn once its chunk has loaded
 *  (`useWalkthrough`), its shape until then. */
function FinancialsView({ returns }: { returns: SampleReturns }) {
  const w = useWalkthrough();
  if (!w) {
    return (
      <TabLoading what="the financials">
        <div className="flex flex-col gap-6">
          <StatGridSkeleton />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-4">
                <div className="skeleton h-2.5 w-16 rounded" />
                <div className="skeleton mt-3 h-6 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
      </TabLoading>
    );
  }
  return (
    <div className="flex flex-col gap-6 [&_section>.grid]:grid-cols-2 sm:[&_section>.grid]:grid-cols-3">
      <w.TermsView result={RESULTS.extraction} />
      <div className="flex flex-col gap-1.5">
        <w.ReturnsHeadline model={SAMPLE_DEAL.model} />
        {/* Two models, said as two, as the deal page and /demo say it:
            the workbook runs the screening model on its own base case. */}
        <p className="text-xs text-muted" data-qa="home-two-models">
          {`The Excel workbook is a separate model: its levered IRR is ${returns.irr}.`}
        </p>
      </div>
    </div>
  );
}

/** The deal page's Buy box tab on the sample (app/sample-buy-box), drawn
 *  once its chunk has loaded, its shape until then. */
function BuyBoxTab({ data }: { data?: SampleBuyBoxData }) {
  const w = useWalkthrough();
  if (!data) return null;
  if (!w) {
    return (
      <TabLoading what="the buy box">
        <CardListSkeleton />
      </TabLoading>
    );
  }
  return <w.SampleBuyBox data={data} />;
}

/** One tab's panel (exported for the homepage's render test). The
 *  Overview's jump links move the walkthrough as they move the deal page. */
export function DemoPanel({
  tab,
  buyBox,
  returns,
  analysis = "verdict",
  onAnalysis = () => {},
  onNavigate = () => {},
}: {
  tab: Tab;
  /** no longer drawn: the deal page's research panel sits under its tabs,
   *  in none of them (accepted until the page stops passing it) */
  legal?: SampleLegal;
  /** the Buy box tab's panel and the sample's box, read on the server */
  buyBox?: SampleBuyBoxData;
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
      return <FinancialsView returns={returns} />;
    case "Buy box":
      // The deal page's own Buy box tab, against the sample's example box,
      // said so over it (app/sample-buy-box).
      return <BuyBoxTab data={buyBox} />;
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
export function DemoTabs({
  buyBox,
  returns,
}: {
  legal?: SampleLegal;
  buyBox: SampleBuyBoxData;
  returns: SampleReturns;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [analysis, setAnalysis] = useState<AnalysisKey>("verdict");
  // The deal page's count on its Buy box tab: the criteria missed outright.
  const missed = buyBox.panel.checks.filter((c) => c.status === "miss").length;
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

  // The tabs past the Overview arrive in a chunk of their own: asked for
  // once the walkthrough nears the screen, or a tab is reached for, and drawn
  // by the panel that shows them when they land (`useWalkthrough`; a tab
  // opened before then draws its shape, `TabLoading`).
  const box = useRef<HTMLDivElement>(null);
  const want = () => {
    if (!walkthrough) void loadWalkthrough();
  };
  useEffect(() => {
    if (walkthrough) return;
    const el = box.current;
    const load = () => void loadWalkthrough();
    if (!el || typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
    <div
      ref={box}
      onPointerEnter={want}
      onFocus={want}
      className="shadow-float overflow-hidden rounded-2xl border border-line bg-surface"
    >
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
          buyBox={buyBox}
          returns={returns}
          analysis={analysis}
          onAnalysis={setAnalysis}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}
