// Render smoke test for the deal page's client view on the sample deal — the
// first screen a new account opens. A static server render of every section
// catches what the unit tests cannot: a runtime error in the markup, a
// sentence glued to the number before it, a word doubled. Same fixture and
// the same pure functions the /demo page and the real deal page run.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals/sample",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {
    throw new Error("redirect() is not expected in a static render");
  },
}));

import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { evaluateBuyBox } from "@/lib/criteria";
import { scoreMandateFit } from "@/lib/mandate";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import { inferStrategy } from "@/lib/deal-strategy";
import { ToastProvider } from "@/app/(app)/toaster";
import { DealView } from "@/app/(app)/deals/[id]/deal-view";
import { a11yIssues, dumpView, gluedWords, visibleText as textOf } from "./render-lint";

type Props = Parameters<typeof DealView>[0];

function sampleProps(initialTab: string | null, initialAnalysis: string | null = null): Props {
  const extraction = SAMPLE_DEAL.extraction;
  const omPick = pickOmNoi(extraction.metrics, inferStrategy(extraction).kind);
  const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name, {
    rentRoll: { summary: SAMPLE_DEAL.rentRoll.summary, asOf: SAMPLE_DEAL.rentRoll.as_of_date },
    t12: { summary: SAMPLE_DEAL.t12.summary, periodEnd: SAMPLE_DEAL.t12.period_end_date },
  });
  const checkSource = {
    assetClass: extraction.assetClass,
    market: extraction.market,
    metrics: extraction.metrics,
  };
  return {
    dealId: "sample",
    dealName: SAMPLE_DEAL.name,
    initialTab,
    initialAnalysis,
    hasOm: false,
    modelErrorCode: null,
    job: null,
    results: {
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      reconciliation: SAMPLE_DEAL.reconciliation,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
    },
    supplements: {},
    model: SAMPLE_DEAL.model,
    documents: [],
    compSearch: null,
    isPro: false,
    buyBox: {
      checks: evaluateBuyBox(SAMPLE_DEAL.asset_class, checkSource, SAMPLE_DEMO_BOX),
      mandate: scoreMandateFit(SAMPLE_DEAL.asset_class, checkSource, SAMPLE_DEMO_BOX),
      scope: "personal",
      provisional: false,
      hasBox: true,
    },
    screenDiff: null,
    stageHistory: [],
    omUrl: null,
    isSample: true,
    actuals: {
      rentRoll: { asOf: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary },
      t12: { periodEnd: SAMPLE_DEAL.t12.period_end_date, summary: SAMPLE_DEAL.t12.summary },
      noiComparison: omPick ? compareNoi(omPick.noi, SAMPLE_DEAL.t12.summary.noi!, omPick) : null,
    },
    playground: {
      inputs: derived.inputs,
      dealAssetClass: SAMPLE_DEAL.asset_class,
      checkSource,
      box: SAMPLE_DEMO_BOX,
    },
    todayIso: "2026-09-08",
  } as unknown as Props;
}

function render(p: Props): string {
  return renderToStaticMarkup(
    React.createElement(ToastProvider, null, React.createElement(DealView, p)),
  );
}

const TABS: Array<[string | null, string | null]> = [
  [null, null],
  ["overview", null],
  ["financials", null],
  ["buybox", null],
  ["analyses", "verdict"],
  ["analyses", "challenger"],
  ["analyses", "comps"],
  ["analyses", "market"],
  ["analyses", "reconciler"],
  ["documents", null],
];

describe("DealView — the sample deal renders every section without a runtime error", () => {
  for (const [tab, analysis] of TABS) {
    it(`renders ${tab ?? "the default section"}${analysis ? ` / ${analysis}` : ""} and reads clean`, () => {
      const html = render(sampleProps(tab, analysis));
      expect(html.length).toBeGreaterThan(2_000);
      dumpView(`deal-${tab ?? "default"}${analysis ? `-${analysis}` : ""}`, html);
      expect(a11yIssues(html), `a11y ${tab}/${analysis}`).toEqual([]);
      const text = textOf(html);
      expect(gluedWords(text), `glued words in ${tab}/${analysis}`).toEqual([]);
      // The section nav is the one thing every render carries (the server page
      // renders the deal's name above this view, so the name is not asserted).
      expect(text).toMatch(/Overview/);
      expect(text).toMatch(/Financials/);
      expect(text).toMatch(/Buy box/);
    });
  }

  it("a screen that failed midway names the results it never reached, in the open", () => {
    // The ninth review's first finding: a comps-step failure left this run's
    // extraction beside the previous screen's verdict, shown as "5/5" with
    // the provider's raw error behind a "Technical details" toggle.
    const failed = (tab: string, analysis: string | null = null): Props => ({
      ...sampleProps(tab, analysis),
      job: {
        status: "error",
        step: "comps",
        progress: 50,
        error: "The analysis service is overloaded right now — try again in a few minutes.",
      },
      staleResults: ["comps", "market", "verdict"],
    });
    const html = render(failed("overview"));
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/overloaded right now/);
    expect(text).not.toMatch(/Technical details/);
    expect(text).toMatch(/2\/5/);
    expect(text).toMatch(/3 of these are from the previous screen/);
    expect(text).toMatch(/From the previous screen/);
    expect(textOf(render(failed("analyses", "verdict")))).toMatch(/From the previous screen/);
    // A clean screen carries no such mark anywhere.
    expect(textOf(render(sampleProps("overview")))).not.toMatch(/previous screen/);
  });

  it("the overview carries the verdict and the buy-box fit; the financials carry the price", () => {
    const overview = textOf(render(sampleProps("overview")));
    expect(overview).toMatch(/Caution/);
    const financials = textOf(render(sampleProps("financials")));
    expect(financials).toMatch(/\$68,000,000|\$68\.0M|\$68M/);
    const buybox = textOf(render(sampleProps("buybox")));
    expect(buybox).toMatch(/Basis \/ unit|Going-in cap|mandate/i);
  });
});
