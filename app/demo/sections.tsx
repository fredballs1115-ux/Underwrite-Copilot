"use client";

import { useEffect, useRef, useState } from "react";
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
import { DemoPanel } from "../landing-interactive";
import { DealSectionTabs } from "../(app)/deals/[id]/section-tabs";
import {
  LEGACY_TABS,
  analysisCounts,
  sectionCounts,
  sectionStateOf,
  type AnalysisKey,
  type SectionKey,
} from "@/lib/deal-tabs";
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

/**
 * The sample deal's sections, as the signed-in sample deal's page draws
 * them: the deal page's own section bar (section-tabs: its segmented
 * control, each tab's dot and finding count, read by lib/deal-tabs on the
 * sample), then each section's components in
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
  // The deal page's dots and finding counts, by its own readers
  // (lib/deal-tabs) on the sample: no screen is running on it.
  const counts = sectionCounts(analysisCounts(results), data.buyBox.checks);
  const stateOf = (key: SectionKey) =>
    sectionStateOf(key, { results, live: false, step: null, buyBox: data.buyBox });

  return (
    <div className="flex flex-col gap-5">
      {/* The deal page's own section bar (section-tabs), in the deal page's
          strip. */}
      <div
        ref={tabStrip}
        className="overflow-x-auto max-md:[mask-image:linear-gradient(90deg,#000_calc(100%_-_1.75rem),transparent)]"
      >
        <DealSectionTabs active={section} stateOf={stateOf} counts={counts} onSelect={setSection} />
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
          // The deal page's Analyses tab: its pills and each view, the
          // challenger's broker questions in its own cards and email list.
          <DemoPanel
            tab="Analyses"
            analysis={analysis}
            demand={data.demand}
            onAnalysis={setAnalysis}
            onNavigate={navigate}
          />
        )}

        {section === "documents" && (
          // The deal page's Documents tab on the sample: its source
          // documents card, the memo's row linking the public sample's memo.
          // The report and the workbook are the header's tools, as on the
          // signed-in sample.
          <div className="flex flex-col gap-6">
            <DemoPanel tab="Documents" onNavigate={navigate} />
          </div>
        )}
      </div>
    </div>
  );
}
