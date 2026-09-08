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

/** The visible text of a render, block boundaries kept as newlines. */
function textOf(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/td|\/th|\/tr|\/section|\/span|\/a|\/button|\/dt|\/dd|\/summary|\/details|\/label)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

// Units a digit may legitimately touch: "5yr", "30bps", "10k", "250sf".
const UNIT_SUFFIX = /^(st|nd|rd|th|px|pt|bps|yr|yrs|mo|am|pm|k|m|mm|x|sf|ac|bn|hr|min|sec|kb|mb|gb|ft|in|ml|s)$/i;

/** Glued words a reader would trip on: a digit run into a word ("9real"),
 *  a word doubled ("aboutabout"), a doubled "the the". */
function gluedWords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d+)([a-z]{3,})\b/g)) if (!UNIT_SUFFIX.test(m[2])) out.add(m[0]);
  for (const m of text.matchAll(/\b([a-z]{3,})\1\b/g)) out.add(m[0]);
  for (const m of text.matchAll(/\b(a|an|the|of|to|in|on|for|and|or|with|at|by|from)\s+\1\b/gi)) out.add(m[0]);
  return [...out];
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
      const text = textOf(html);
      expect(gluedWords(text), `glued words in ${tab}/${analysis}`).toEqual([]);
      // The section nav is the one thing every render carries (the server page
      // renders the deal's name above this view, so the name is not asserted).
      expect(text).toMatch(/Overview/);
      expect(text).toMatch(/Financials/);
      expect(text).toMatch(/Buy box/);
    });
  }

  it("the overview carries the verdict and the buy-box fit; the financials carry the price", () => {
    const overview = textOf(render(sampleProps("overview")));
    expect(overview).toMatch(/Caution/);
    const financials = textOf(render(sampleProps("financials")));
    expect(financials).toMatch(/\$68,000,000|\$68\.0M|\$68M/);
    const buybox = textOf(render(sampleProps("buybox")));
    expect(buybox).toMatch(/Basis \/ unit|Going-in cap|mandate/i);
  });
});
