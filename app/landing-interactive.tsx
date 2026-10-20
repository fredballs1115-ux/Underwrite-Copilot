"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { SAMPLE_OM_HREF } from "@/lib/sample-om-link";
import type { BoxCriterion } from "@/lib/buy-box-chip";
import type { SampleBuyBoxData } from "./sample-buy-box";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type { ModelSources } from "@/lib/underwrite/report-grid";
import type { DealRateSeeds } from "@/lib/debt-index";
import type { DealStrategy } from "@/lib/deal-strategy";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import type { MetroDemand } from "@/lib/metro-demand";
import type { StressTest } from "@/lib/stress-test-types";
import { OverviewView } from "./(app)/deals/[id]/deal-sections-base";
import { AnalysisTabs, DealSectionTabs } from "./(app)/deals/[id]/section-tabs";
import {
  ANALYSES,
  LEGACY_TABS,
  SECTIONS,
  analysisCounts,
  sectionCounts,
  sectionStateOf,
  type AnalysisKey,
  type SectionKey,
} from "@/lib/deal-tabs";
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

/** The Financials tab's server reads, made as /demo makes them
 *  (app/demo/demo-data): the derived screening model the debt sizer starts
 *  from and where its inputs came from, the sizer's rate seeds (none for the
 *  sample, which is never seeded from today's rates: lib/model-market), the
 *  deal's kind, and what the price buys against the model card's returns. */
export interface SampleFinancials {
  underwrite: UnderwriteInputs;
  underwriteSources: ModelSources | null;
  rateSeeds: DealRateSeeds;
  strategy: DealStrategy;
  modelInterest: ModelReturnsRead | null;
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

// The REAL deal page's section list and analyses (lib/deal-tabs, which the
// deal page reads) — the product's own information architecture. A panel is
// named by its section's label, as the deal page's section bar says it.
type Tab = (typeof SECTIONS)[number]["label"];
export type { AnalysisKey };

/** The finding counts the deal page's tabs carry, counted on the sample by
 *  the deal page's own reader (lib/deal-tabs `analysisCounts`). */
const ANALYSIS_COUNTS = analysisCounts(RESULTS);

/** The Analyses tab's own sub-tabs and the view each opens — the deal
 *  page's AnalysesPanel, its classes and its components, on the sample. */
function AnalysesView({
  analysis,
  onSelect,
  demand = null,
}: {
  analysis: AnalysisKey;
  onSelect: (key: AnalysisKey) => void;
  /** the metro area's payrolls by sector, read today, which the market
   *  check draws where the deal page draws it; null where none was read */
  demand?: MetroDemand | null;
}) {
  // The sections, once their chunk has loaded (`loadWalkthrough`).
  const w = useWalkthrough();
  const label = ANALYSES.find((a) => a.key === analysis)!.label;
  return (
    <div className="flex flex-col gap-5">
      {/* The deal page's own Analyses pills (section-tabs). */}
      <AnalysisTabs active={analysis} counts={ANALYSIS_COUNTS} has={() => true} onSelect={onSelect} />
      <div
        key={analysis}
        id="analysis-tabpanel"
        role="tabpanel"
        aria-labelledby={`analysis-tab-${analysis}`}
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
          // The deal page's comps on the sample, handed what the signed-in
          // sample's page hands them (deal-view's AnalysesPanel): its map
          // context marked the sample's, so no comp is geocoded or pinned
          // and the table says why, each comp cites its memorandum page, and
          // no public-web search is offered for a fictional building. No map
          // component is handed in, so none loads.
          <w.BrokerComps
            result={RESULTS.comps}
            dealId="sample"
            compSearch={null}
            active={false}
            isPro={false}
            subject={w.COMP_SUBJECT}
            noun={w.COMP_NOUN}
            mapContext={w.COMP_MAP_CONTEXT}
          />
        )}
        {w && analysis === "market" && <w.MarketCheck result={RESULTS.market} demand={demand} />}
        {w && analysis === "reconciler" && <w.Reconciliation result={RESULTS.reconciliation} />}
      </div>
    </div>
  );
}

/** The deal page's Financials tab on the sample, in its order: the
 *  extracted terms, the debt sizer, then the first-draft model card
 *  (app/sample-model-card, the card's own body). The model's read against
 *  the published figures, which the deal page draws between the two, is
 *  left out of the walkthrough rather than imitated (/demo draws it). The terms' tiles are held to three across:
 *  four of them in this column left "$68,000,000" wider than its tile.
 *  Drawn once its chunk has loaded (`useWalkthrough`), its shape until then. */
function FinancialsView({ financials }: { financials?: SampleFinancials }) {
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
    <div className="flex flex-col gap-6">
      <div className="[&_section>.grid]:grid-cols-2 sm:[&_section>.grid]:grid-cols-3">
        {/* Each term's page opens the sample's fictional memorandum there. */}
        <w.TermsView result={RESULTS.extraction} omUrl={SAMPLE_OM_HREF} />
      </div>
      {financials && (
        <w.DebtSizer
          model={SAMPLE_DEAL.model}
          extraction={RESULTS.extraction}
          underwrite={financials.underwrite}
          underwriteSources={financials.underwriteSources}
          rateSeeds={financials.rateSeeds}
          strategy={financials.strategy}
        />
      )}
      {/* The walkthrough's Overview draws no sensitivity playground, so
          the card's note does not name one (audit C10, L2). */}
      <w.SampleModelCard model={SAMPLE_DEAL.model} interest={financials?.modelInterest ?? null} playground={false} />
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
  financials,
  stressTest = null,
  demand = null,
  analysis = "verdict",
  onAnalysis = () => {},
  onNavigate = () => {},
}: {
  tab: Tab;
  /** the Buy box tab's panel and the sample's box, read on the server */
  buyBox?: SampleBuyBoxData;
  /** the Financials tab's server reads */
  financials?: SampleFinancials;
  /** the OM's assumptions tested on the sample (lib/sample-stress), built
   *  on the server, which the Overview leads with after the call */
  stressTest?: StressTest | null;
  /** the market check's demand card's rows, read today (/demo hands them
   *  in; the homepage's walkthrough draws none) */
  demand?: MetroDemand | null;
  /** the Analyses tab's open sub-tab */
  analysis?: AnalysisKey;
  onAnalysis?: (key: AnalysisKey) => void;
  /** a jump from the Overview, by the deal page's own tab keys */
  onNavigate?: (key: string) => void;
}) {
  switch (tab) {
    case "Overview":
      return <OverviewView results={RESULTS} active={false} onNavigate={onNavigate} stressTest={stressTest} />;
    case "Financials":
      return <FinancialsView financials={financials} />;
    case "Buy box":
      // The deal page's own Buy box tab, against the sample's example box,
      // said so over it (app/sample-buy-box).
      return <BuyBoxTab data={buyBox} />;
    case "Analyses":
      return <AnalysesView analysis={analysis} onSelect={onAnalysis} demand={demand} />;
    case "Documents":
      return <DocumentsTab />;
  }
}

/** The deal page's Documents tab on the sample (deal-view's
 *  DocumentsPanel, through the same SourceDocumentsView the signed-in
 *  sample draws): the memorandum's row opening the sample's fictional
 *  memorandum (app/api/demo/om), said to be fictional,
 *  the rent roll and the T-12 the sample was read with, each with its own
 *  date and no file to open, and the memo the verdict makes — the public
 *  sample's (audit C10, M4). Never a file name it has not. Drawn once its
 *  chunk has loaded, its shape until then. */
function DocumentsTab() {
  const w = useWalkthrough();
  if (!w) {
    return (
      <TabLoading what="the documents">
        <CardListSkeleton />
      </TabLoading>
    );
  }
  return (
    <w.SourceDocumentsView
      data={{
        dealId: "sample",
        hasOm: false,
        // The sample's fictional memorandum, the file every page chip opens.
        omUrl: SAMPLE_OM_HREF,
        sample: true,
        typedFacts: false,
        documents: [],
        sampleActuals: w.SAMPLE_DOCUMENT_ACTUALS,
        memo: { href: "/api/demo/memo" },
      }}
    />
  );
}

/** The walkthrough: the deal page's section bar — its segmented control,
 *  each tab's dot and finding count — over the sample deal's own tabs. */
export function DemoTabs({
  buyBox,
  financials,
  stressTest = null,
}: {
  buyBox: SampleBuyBoxData;
  financials: SampleFinancials;
  /** the OM's assumptions tested on the sample, built on the server */
  stressTest?: StressTest | null;
}) {
  const [section, setSection] = useState<SectionKey>("overview");
  const [analysis, setAnalysis] = useState<AnalysisKey>("verdict");
  // The deal page's dots and finding counts, read by its own readers
  // (lib/deal-tabs) on the sample: no screen is running on it.
  const counts = sectionCounts(ANALYSIS_COUNTS, buyBox.panel.checks);
  const stateOf = (key: SectionKey) =>
    sectionStateOf(key, { results: RESULTS, live: false, step: null, buyBox: buyBox.panel });
  const label = (key: SectionKey) => SECTIONS.find((t) => t.key === key)!.label as Tab;

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

  /** A jump from the Overview, by the deal page's own keys
   *  (lib/deal-tabs `LEGACY_TABS`); focus moves to the tab now open. */
  function navigate(key: string) {
    const to = LEGACY_TABS[key];
    if (!to) return;
    if (to.analysis) setAnalysis(to.analysis);
    setSection(to.section);
    requestAnimationFrame(() => document.getElementById(`tab-${to.section}`)?.focus());
  }

  return (
    <div
      ref={box}
      onPointerEnter={want}
      onFocus={want}
      className="shadow-float overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-line bg-faint p-2">
        {/* The deal page's own section bar (section-tabs). It scrolls
            sideways where the column is narrower than the five tabs, under
            the same fade at its edge. */}
        <div className="min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(90deg,#000_calc(100%_-_1.75rem),transparent)]">
          <DealSectionTabs
            active={section}
            stateOf={stateOf}
            counts={counts}
            onSelect={setSection}
            label="Sample deal sections"
            fadeAlways
          />
        </div>
        <span className="hidden shrink-0 pr-1 text-[10px] font-medium uppercase tracking-wide text-muted sm:block">
          Sample data
        </span>
      </div>
      <div
        key={section}
        id="deal-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${section}`}
        className="animate-rise min-h-[24rem] p-4"
      >
        <DemoPanel
          tab={label(section)}
          buyBox={buyBox}
          financials={financials}
          stressTest={stressTest}
          analysis={analysis}
          onAnalysis={setAnalysis}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}
