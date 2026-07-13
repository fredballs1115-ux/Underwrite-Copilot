"use client";

import { useState } from "react";
import {
  TermsView,
  ChallengerView,
  BrokerComps,
  Reconciliation,
  MarketCheck,
  VerdictView,
} from "../(app)/deals/[id]/deal-sections";
import { ReturnsHeadline, StressPanel } from "../(app)/deals/[id]/model-view";
import {
  PropertyActuals,
  type ActualsData,
} from "../(app)/deals/[id]/property-actuals";
import { BuyBoxPanel, type BuyBoxPanelData } from "../(app)/deals/[id]/deal-view";
import {
  SensitivityPlayground,
  type PlaygroundData,
} from "../(app)/deals/[id]/sensitivity-playground";
import { DebtSizer } from "../(app)/deals/[id]/debt-sizer";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import type { UnderwritingModel } from "@/lib/model/types";

export interface DemoData {
  extraction: ExtractionResult;
  challenges: ChallengerResult;
  comps: BrokerCompsResult;
  reconciliation: ReconciliationResult;
  market: MarketResult;
  verdict: VerdictResult;
  model: UnderwritingModel;
  /** rent roll + T-12 consolidation (Feature 1), same card as the app */
  actuals?: ActualsData | null;
  /** the buy-box panel exactly as a logged-in user sees it (fixture box) */
  buyBox?: BuyBoxPanelData | null;
  /** the live sensitivity playground (fixture box drives the fit score) */
  playground?: PlaygroundData | null;
  /** the derived screening inputs — powers the FINANCING & CAPITAL card */
  underwrite?: UnderwriteInputs | null;
}

const TABS = [
  { key: "verdict", label: "Verdict" },
  { key: "buybox", label: "Buy box & fit" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "challenger", label: "Challenger" },
  { key: "comps", label: "Comps" },
  { key: "market", label: "Market" },
  { key: "reconciler", label: "Reconciler" },
  { key: "financials", label: "Financials & model" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** The sample screen, one section at a time — same components the app
 *  renders, driven by the illustrative fixture. */
export function DemoSections({ data }: { data: DemoData }) {
  const [tab, setTab] = useState<TabKey>("verdict");

  function onKeys(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next =
      e.key === "ArrowRight"
        ? TABS[(i + 1) % TABS.length]
        : TABS[(i - 1 + TABS.length) % TABS.length];
    setTab(next.key);
    document.getElementById(`demo-section-${next.key}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Sample analysis sections"
        onKeyDown={onKeys}
        className="flex flex-wrap gap-1.5"
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              id={`demo-section-${t.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line bg-surface text-muted hover:bg-faint hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div key={tab} role="tabpanel" className="animate-fade">
        {tab === "verdict" && <VerdictView result={data.verdict} />}
        {tab === "buybox" && data.buyBox && (
          <div className="flex flex-col gap-3">
            <BuyBoxPanel data={data.buyBox} />
            <p className="text-xs leading-relaxed text-muted">
              Judged against a hypothetical mandate (multifamily, ≥5.75%
              going-in, ≥13% IRR, ≥5% cash-on-cash). Signed in, this panel
              scores every deal against <em>your</em> buy box.
            </p>
          </div>
        )}
        {tab === "sensitivity" && data.playground && (
          <div className="flex flex-col gap-3">
            <SensitivityPlayground data={data.playground} />
            <p className="text-xs leading-relaxed text-muted">
              Live — drag the sliders. Returns and the mandate fit recompute
              in your browser from the same engine that builds the Excel
              model.
            </p>
          </div>
        )}
        {tab === "challenger" && (
          <ChallengerView
            result={data.challenges}
            dealName="The Maddox at Highland Park"
          />
        )}
        {tab === "comps" && (
          <BrokerComps
            result={data.comps}
            dealId="sample"
            compSearch={null}
            active={false}
            isPro={false}
            publicDemo
          />
        )}
        {tab === "market" && <MarketCheck result={data.market} />}
        {tab === "reconciler" && <Reconciliation result={data.reconciliation} />}
        {tab === "financials" && (
          <div className="flex flex-col gap-6">
            <TermsView result={data.extraction} />
            {data.actuals && <PropertyActuals data={data.actuals} />}
            <ReturnsHeadline model={data.model} />
            <DebtSizer
              model={data.model}
              extraction={data.extraction}
              underwrite={data.underwrite ?? null}
            />
            <StressPanel model={data.model} />
          </div>
        )}
      </div>
    </div>
  );
}
