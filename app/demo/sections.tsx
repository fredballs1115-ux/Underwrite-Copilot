"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
// The deal page's parts from the modules that carry no server action and
// no comps map (deal-sections.tsx and deal-view.tsx carry both); /demo draws
// no map. lib/home-bundle.test.ts holds this page to it.
import { OverviewView } from "../(app)/deals/[id]/deal-sections-base";
import { TermsView } from "../(app)/deals/[id]/deal-sections-view";
import { PropertyActuals, type ActualsData } from "../(app)/deals/[id]/property-actuals";
import type { BuyBoxPanelData } from "../(app)/deals/[id]/buy-box-panel";
import { SampleBuyBox } from "../sample-buy-box";
import { SampleModelCard } from "../sample-model-card";
import { SensitivityPlayground, type PlaygroundData } from "../(app)/deals/[id]/sensitivity-playground";
import { DebtSizer } from "../(app)/deals/[id]/debt-sizer";
import { ModelVsMarketCard } from "../(app)/deals/[id]/model-vs-market-card";
import { SampleGuide } from "../(app)/deals/[id]/sample-guide";
import { DemoPanel, type AnalysisKey } from "../landing-interactive";
import { revealScrollLeft } from "@/lib/tab-strip";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type { DealRateSeeds } from "@/lib/debt-index";
import type { DealStrategy } from "@/lib/deal-strategy";
import type { MetroDemand } from "@/lib/metro-demand";
import type { ModelVsMarket } from "@/lib/model-vs-market";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import { BrokerQuestions } from "./broker-questions";

/** The sample deal as the signed-in sample deal's page hands it to its
 *  sections (app/(app)/deals/[id]/page.tsx → DealView), each part read on
 *  the server by the deal page's own readers. */
export interface DemoData {
  extraction: ExtractionResult;
  challenges: ChallengerResult;
  comps: BrokerCompsResult;
  reconciliation: ReconciliationResult;
  market: MarketResult;
  verdict: VerdictResult;
  model: UnderwritingModel;
  /** what the price buys, read against the model's returns as the deal
   *  page reads it (lib/compare-interest `modelReturnsRead`) */
  modelInterest: ModelReturnsRead | null;
  /** the rent roll and the T-12, the Overview's actuals card */
  actuals: ActualsData;
  /** the buy box tab, against the public sample's box */
  buyBox: BuyBoxPanelData;
  /** the sample's box, one line a criterion (lib/criteria `buyBoxLines`) */
  boxLines: string[];
  /** the Overview's sensitivity playground */
  playground: PlaygroundData;
  /** the derived screening model the debt sizer starts from */
  underwrite: UnderwriteInputs;
  /** where the derived model's inputs came from */
  underwriteSources: PlaygroundData["sources"];
  rateSeeds: DealRateSeeds;
  strategy: DealStrategy;
  /** the model's assumptions against the published figures, null where
   *  nothing was read */
  modelVsMarket: ModelVsMarket | null;
  /** the metro area's payrolls by sector, read today; null where nothing was */
  demand: MetroDemand | null;
}

// The deal page's sections and their legacy jump keys (deal-view.tsx
// SECTIONS and LEGACY_TABS), so the Overview's links land where they land
// on the signed-in sample.
const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "buybox", label: "Buy box" },
  { key: "analyses", label: "Analyses" },
  { key: "documents", label: "Documents" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

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

/** The deal page's tab dot on a finished section, or an idle one's ring. */
function TabDot({ done, active }: { done: boolean; active: boolean }) {
  const base = "h-1.5 w-1.5 rounded-full";
  if (done) return <span aria-hidden className={`${base} ${active ? "bg-white" : "bg-pass"}`} />;
  return <span aria-hidden className={`${base} ${active ? "bg-white/40" : "bg-transparent ring-1 ring-inset ring-line"}`} />;
}

/**
 * The sample deal's sections, as the signed-in sample deal's page draws
 * them: the deal page's section bar (its segmented control, each tab's dot
 * and finding count, class for class), then each section's components in
 * the deal page's order on the fixture. The Analyses and Documents tabs are
 * the homepage walkthrough's own panel (`DemoPanel`), so the homepage and
 * this page draw one product. What a visitor cannot use — the tasks, Ask,
 * the decision log, adding data — is left off, never imitated.
 * `initialSection` and `initialAnalysis` open another section first (the
 * render tests read each).
 */
export function DemoSections({
  data,
  initialSection = "overview",
  initialAnalysis = "verdict",
}: {
  data: DemoData;
  initialSection?: SectionKey;
  initialAnalysis?: AnalysisKey;
}) {
  const [section, setSection] = useState<SectionKey>(initialSection);
  const [analysis, setAnalysis] = useState<AnalysisKey>(initialAnalysis);

  // The finding counts the deal page's tabs carry (deal-view's
  // `analysisCounts` and `sectionCounts`), counted on the sample.
  const counts: Record<SectionKey, number> = {
    overview: 0,
    financials: 0,
    buybox: data.buyBox.checks.filter((c) => c.status === "miss").length,
    analyses:
      data.challenges.challenges.filter((c) => c.severity === "high").length +
      data.comps.redFlags.length +
      [...data.comps.saleComps, ...data.comps.leaseComps].filter((c) => c.support === "stretched").length +
      data.market.checks.filter((c) => c.assessment === "aggressive").length +
      data.reconciliation.rows.filter((r) => r.direction === "unfavorable").length,
    documents: 0,
  };
  // Every section but the documents holds a finished result on the sample
  // (deal-view's `sectionState`).
  const done = (k: SectionKey) => k !== "documents";

  // The strip scrolls the selected tab into view on a phone (lib/tab-strip),
  // its own scrollLeft, never the page's — as the deal page's does.
  const tabStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabStrip.current;
    const tab = strip?.querySelector<HTMLElement>(`#tab-${section}`);
    if (!strip || !tab) return;
    const s = strip.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const css = getComputedStyle(strip);
    const mask = css.getPropertyValue("mask-image") || css.getPropertyValue("-webkit-mask-image");
    const fade = /gradient/.test(mask) ? 1.75 * parseFloat(getComputedStyle(document.documentElement).fontSize) : 0;
    const left = revealScrollLeft(
      { left: s.left, clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth, scrollLeft: strip.scrollLeft },
      { left: t.left, right: t.right },
      fade,
    );
    if (left != null) strip.scrollLeft = left;
  }, [section]);

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = SECTIONS.findIndex((t) => t.key === section);
    const n = SECTIONS.length;
    const next =
      e.key === "ArrowRight" ? (idx + 1) % n : e.key === "ArrowLeft" ? (idx - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setSection(SECTIONS[next].key);
    document.getElementById(`tab-${SECTIONS[next].key}`)?.focus();
  }

  /** A jump from the Overview or the guide, by the deal page's own keys;
   *  focus moves to the tab now open. */
  function navigate(key: string) {
    const target = LEGACY_TABS[key];
    if (!target) return;
    if (target.analysis) setAnalysis(target.analysis);
    setSection(target.section);
    requestAnimationFrame(() => document.getElementById(`tab-${target.section}`)?.focus());
  }

  const results = {
    extraction: data.extraction,
    challenges: data.challenges,
    comps: data.comps,
    reconciliation: data.reconciliation,
    market: data.market,
    verdict: data.verdict,
  };

  return (
    <div className="flex flex-col gap-5">
      {/* The deal page's section bar, class for class (deal-view). */}
      <div
        ref={tabStrip}
        className="overflow-x-auto max-md:[mask-image:linear-gradient(90deg,#000_calc(100%_-_1.75rem),transparent)]"
      >
        <div
          role="tablist"
          aria-label="Deal sections"
          onKeyDown={onTabKeyDown}
          className="flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm max-md:mr-8"
        >
          {SECTIONS.map((t) => {
            const on = t.key === section;
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="deal-tabpanel"
                tabIndex={on ? 0 : -1}
                onClick={() => setSection(t.key)}
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  on ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-faint hover:text-ink"
                }`}
              >
                <TabDot done={done(t.key)} active={on} />
                {t.label}
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

      <div key={section} id="deal-tabpanel" role="tabpanel" aria-labelledby={`tab-${section}`} className="animate-rise">
        {section === "overview" && (
          <div className="flex flex-col gap-6">
            <SampleGuide onNavigate={navigate} />
            <PropertyActuals data={data.actuals} />
            <OverviewView results={results} active={false} onNavigate={navigate} />
            <SensitivityPlayground data={data.playground} />
          </div>
        )}

        {section === "financials" && (
          <div className="flex flex-col gap-6">
            <TermsView result={data.extraction} />
            <DebtSizer
              model={data.model}
              extraction={data.extraction}
              underwrite={data.underwrite}
              underwriteSources={data.underwriteSources ?? null}
              rateSeeds={data.rateSeeds}
              strategy={data.strategy}
            />
            <ModelVsMarketCard read={data.modelVsMarket} />
            {/* The deal page's first-draft model card, open as it opens
                with a model, its body the card's own (model-body). */}
            <SampleModelCard model={data.model} interest={data.modelInterest} />
          </div>
        )}

        {section === "buybox" && (
          // The deal page's panel against the sample's example box, said so
          // over it (app/sample-buy-box), as the homepage's walkthrough draws it.
          <SampleBuyBox data={{ panel: data.buyBox, lines: data.boxLines }} />
        )}

        {section === "analyses" && (
          <div className="flex flex-col gap-6">
            <DemoPanel
              tab="Analyses"
              analysis={analysis}
              demand={data.demand}
              onAnalysis={setAnalysis}
              onNavigate={navigate}
            />
            {analysis === "challenger" && <BrokerQuestions />}
          </div>
        )}

        {section === "documents" && (
          <div className="flex flex-col gap-6">
            <DemoPanel tab="Documents" onNavigate={navigate} />
            <Deliverables />
          </div>
        )}
      </div>
    </div>
  );
}

/** The sample's three documents, free here: the files the header's tools
 *  download, which a Pro account exports from a deal of its own. */
function Deliverables() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Take the deliverables with you</h2>
        <p className="mt-1 text-sm text-muted">The files a Pro analyst exports, free for the sample.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/demo/memo"
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Sample IC memo (PDF)
        </a>
        <a
          href="/api/demo/report"
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-faint"
        >
          Full report (PDF)
        </a>
        <a
          href="/api/demo/underwrite.xlsx"
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-faint"
        >
          Sample model (.xlsx)
        </a>
      </div>
    </section>
  );
}
