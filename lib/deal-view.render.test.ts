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

  it("a market check that read the metro's published figures folds them open under the summary", () => {
    const p = sampleProps("analyses", "market");
    const withBrief: Props = {
      ...p,
      results: {
        ...p.results,
        market: {
          ...p.results.market!,
          liveBrief: {
            metro: "Philadelphia, PA",
            readOn: "2026-09-23",
            lines: [
              "Unemployment 4.1% (Jul 2026, Philadelphia MSA; FRED), +0.1 pt on the month before",
              "Asking rent, all home types: $1,890/mo, +2.4% from a year ago (Aug 2026; Zillow Research — listings, before concessions)",
            ],
          },
        },
      },
    };
    const html = render(withBrief);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/Read beside the Philadelphia, PA market’s own figures/);
    expect(text).toMatch(/2 published figures as of Sep 23, 2026/);
    expect(text).toMatch(/Unemployment 4\.1% \(Jul 2026, Philadelphia MSA; FRED\)/);
    expect(text).toMatch(/read beside the metro's published figures/);
    // Nothing read today → no "since" block at all.
    expect(text).not.toMatch(/Since this check ran/);
    // The sample itself was checked on typical ranges alone, and its aside still says so.
    const plain = textOf(render(p));
    expect(plain).toMatch(/rules-of-thumb, not pulled comps/);
    expect(plain).not.toMatch(/Read beside the/);

    // Opened weeks later, with the same figures read today: what moved, in each figure's unit.
    const later: Props = {
      ...withBrief,
      marketSince: {
        since: "2026-09-02",
        newer: 2,
        moved: 1,
        moves: [
          { key: "unemployment", label: "Unemployment", unit: "pts", from: 4.1, to: 4.4, fromAsOf: "2026-07-01", toAsOf: "2026-08-01", move: 0.3, moveUnit: "pts", kind: "moved" },
          { key: "zori_rent", label: "Asking rent, all home types", unit: "usd", from: 1890, to: 1890, fromAsOf: "2026-08-31", toAsOf: "2026-09-30", move: 0, moveUnit: "pct", kind: "unchanged" },
          { key: "rental_vacancy_msa", label: "Rental vacancy, metro area", unit: "pts", from: 6.6, to: 6.6, fromAsOf: "2026-04-01", toAsOf: "2026-04-01", move: 0, moveUnit: "pts", kind: "no_newer" },
        ],
      },
    };
    const laterHtml = render(later);
    expect(a11yIssues(laterHtml)).toEqual([]);
    const laterText = textOf(laterHtml);
    expect(gluedWords(laterText)).toEqual([]);
    expect(laterText).toMatch(/Since this check ran on Sep 2, 2026/);
    expect(laterText).toMatch(/2 of the 3 figures the check read have a newer observation; 1 moved\./);
    expect(laterText).toMatch(/Unemployment: \+0\.3 pt to 4\.4%/);
    expect(laterText).not.toMatch(/Asking rent, all home types: unchanged/);
  });

  it("the market section draws the metro area's payrolls by sector, with this building's sector drawn full", () => {
    const p = sampleProps("analyses", "market");
    const withDemand: Props = {
      ...p,
      metroDemand: {
        area: "Philadelphia MSA",
        newestMonth: "Aug 2026",
        mine: "Professional & business services",
        stale: ["Leisure & hospitality as of Aug 1"],
        rows: [
          { key: "PHIL942NA_YOY", label: "All payrolls", valuePct: 0.30686, text: "0.3%", href: "https://fred.stlouisfed.org/series/PHIL942NA", obsDate: "2026-08-01", fresh: true, all: true, mine: false },
          { key: "PHIL942PBSV_YOY", label: "Professional & business services", valuePct: 1.7451, text: "1.7%", href: "https://fred.stlouisfed.org/series/PHIL942PBSV", obsDate: "2026-08-01", fresh: true, all: false, mine: true },
          { key: "SMU42379804200000001SA_YOY", label: "Retail trade", valuePct: -1.85854, text: "\u22121.9%", href: "https://fred.stlouisfed.org/series/SMU42379804200000001SA", obsDate: "2026-08-01", fresh: true, all: false, mine: false },
          { key: "PHIL942LEIH_YOY", label: "Leisure & hospitality", valuePct: 2.65475, text: "2.7%", href: "https://fred.stlouisfed.org/series/PHIL942LEIH", obsDate: "2025-08-01", fresh: false, all: false, mine: false },
        ],
      },
    };
    const html = render(withDemand);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/The demand side today — payrolls by sector, Philadelphia MSA/);
    expect(text).toMatch(/Professional & business services is the sector that fills this building's kind, drawn full/);
    expect(text).toMatch(/Professional & business services · this building's sector/);
    expect(text).toMatch(/Aug 2026 · BLS payrolls via FRED, against the same month a year earlier/);
    expect(text).toMatch(/one sector's figure is stale: Leisure & hospitality as of Aug 1/);
    // Four bars, the deal's own full and the others faded; a negative change draws leftward.
    expect((html.match(/data-bar="demand"/g) ?? []).length).toBe(4);
    expect(html).toContain('data-bar="demand" class="absolute inset-y-0 left-1/2 bg-brand"');
    expect(html).toContain('data-bar="demand" class="absolute inset-y-0 right-1/2 bg-brand/35"');
    expect(html).toContain("https://fred.stlouisfed.org/series/PHIL942PBSV\"");
    // Rental housing singles nothing out, and the sample without a read draws nothing.
    const apt = textOf(render({ ...withDemand, metroDemand: { ...withDemand.metroDemand!, mine: null, rows: withDemand.metroDemand!.rows.map((r) => ({ ...r, mine: false })) } }));
    expect(apt).toMatch(/Rental housing runs on all payrolls, drawn first/);
    expect(apt).not.toMatch(/this building's sector/);
    expect(textOf(render(p))).not.toMatch(/The demand side today/);
  });

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

  it("the comps tab draws each sale comp's basis against the subject's", () => {
    const html = render(sampleProps("analyses", "comps"));
    // Three sale comps state a per-unit basis ($252k, $298k, $261k) and each
    // draws a bar with the subject's tick ($68M over 248 units, $274k) —
    // once in the table and once in the phone card (one layout shows at a
    // time); the lease comp ("$2,520/mo · 2BR") states no basis and draws
    // none. The phone gets a card per comp, the table hides below `sm`.
    expect((html.match(/data-comp-bar/g) ?? []).length).toBe(6);
    expect((html.match(/data-comp-subject/g) ?? []).length).toBe(6);
    expect(html).toContain('aria-label="Sale comps as cards"');
    expect(html).toContain('aria-label="Lease comps as cards"');
    expect(html).toMatch(/class="hidden overflow-x-auto[^"]*sm:block"/);
    const text = textOf(html);
    expect(text).toMatch(/the tick is the subject at \$274k\/unit/);
    expect(text).toMatch(/\$252k\/unit against the subject's \$274k\/unit/);
  });

  it("the reconciler tab draws each stated gap as a bar from a centre line", () => {
    const html = render(sampleProps("analyses", "reconciler"));
    // Two of the sample's three rows state a figure — "$174k below the OM"
    // and "300 bps higher", both unfavorable and each the widest of its own
    // unit — so two bars draw, each filling the left half in the kill
    // colour; "In agreement" (neutral) draws none. Dollars and basis points
    // are scaled apart, so both fill their whole half. Each bar draws once
    // in the phone card and once in the table (one layout shows at a time).
    expect((html.match(/data-gap-bar/g) ?? []).length).toBe(4);
    expect((html.match(/bg-kill" style="right:50%;width:50%"/g) ?? []).length).toBe(4);
    expect(html).not.toMatch(/bg-pass" style="left:50%/);
    expect(html).toContain("100% of the widest dollar gap in the table");
    expect(html).toContain("100% of the widest basis-point gap in the table");
    // The phone gets a card per row — metric and direction, the two figures
    // side by side, the gap and its bar — and the table hides below `sm`.
    expect((html.match(/aria-label="Reconciliation as cards"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/class="hidden overflow-x-auto[^"]*sm:block"/);
    expect((html.match(/>OM says</g) ?? []).length).toBe(4); // 3 cards + the table head
    expect(textOf(html)).toMatch(/Bars: each gap scaled to the widest of its kind/);
  });

  it("each section's count line draws as a split bar with the counts beside it", () => {
    // The reconciliation header: two unfavorable rows and one neutral — one
    // bar, two segments (two thirds kill, one third muted), the same words
    // as its tooltip and beside it.
    const recon = render(sampleProps("analyses", "reconciler"));
    expect((recon.match(/data-split-bar/g) ?? []).length).toBe(1);
    expect(recon).toContain('title="2 unfavorable · 1 neutral"');
    expect(recon).toMatch(/bg-kill" style="width:66\.6+%"/);
    expect(recon).toMatch(/bg-muted\/40" style="width:33\.3+%"/);
    expect(recon).toMatch(/text-kill">2 unfavorable<\/span>/);
    expect(recon).toMatch(/text-muted"> · <\/span>1 neutral<\/span>/);
    // The comps tab: a bar per comp table (sale and lease).
    const comps = render(sampleProps("analyses", "comps"));
    expect((comps.match(/data-split-bar/g) ?? []).length).toBe(2);
    // The challenger: its severity tally.
    const challenger = render(sampleProps("analyses", "challenger"));
    expect((challenger.match(/data-split-bar/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(challenger).toMatch(/title="\d+ high/);
  });

  it("the overview carries the verdict and the buy-box fit; the financials carry the price", () => {
    const overview = textOf(render(sampleProps("overview")));
    expect(overview).toMatch(/Caution/);
    const financials = textOf(render(sampleProps("financials")));
    expect(financials).toMatch(/\$68,000,000|\$68\.0M|\$68M/);
    const buybox = textOf(render(sampleProps("buybox")));
    expect(buybox).toMatch(/Basis \/ unit|Going-in cap|mandate/i);
  });

  it("the financials carry the model's assumptions against the published figures when the page read them", () => {
    // Nothing read → no card, not an empty one.
    const bare = textOf(render(sampleProps("financials")));
    expect(bare).not.toMatch(/Assumptions against the published figures/);
    const withRead: Props = {
      ...sampleProps("financials"),
      modelVsMarket: {
        readOn: "2026-09-21",
        metro: "Philadelphia",
        checks: [
          {
            key: "rent_growth",
            title: "Rent growth",
            model: "3.0%/yr",
            modelSource: "a screening default",
            published: [{ label: "Asking rent, all home types", text: "+2.3% over the year to Aug 2026", value: 2.3, asOf: "2026-08-31", publisher: "Zillow Research" }],
            tone: "ahead",
            toneLabel: "ahead of the published figures",
            scope: "metro",
            read: "The model grows rents 3.0%/yr. Over the past year the metro's asking rents moved +2.3% over the year to Aug 2026 (Zillow). The model runs ahead of every published figure, by 0.7 points. A trailing year is what the assumption is being asked to beat, not a forecast.",
          },
          {
            key: "exit_cap",
            title: "Exit cap",
            model: "6.00%",
            modelSource: "derived from the documents",
            published: [{ label: "10-year Treasury", text: "4.94% on Sep 17, 2026", value: 4.94, asOf: "2026-09-17", publisher: "FRED" }],
            tone: "compresses",
            toneLabel: "assumes cap compression",
            scope: "national",
            read: "The exit cap 6.00% is 106 bps over today's 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 6.50% is 156 bps over it, so the exit assumes the spread narrows 50 bps with the 10-year where it is today. Cap compression is not a plan: a return that needs the exit to price tighter than the entry is a bet on the market rather than the building.",
          },
        ],
      },
    };
    const html = render(withRead);
    const text = textOf(html);
    expect(text).toMatch(/Assumptions against the published figures/);
    expect(text).toMatch(/set against what the Philadelphia market and the national series have actually done, read on Sep 21, 2026\./);
    expect(text).toMatch(/Rent growth/);
    expect(text).toMatch(/ahead of the published figures/);
    expect(text).toMatch(/assumes cap compression/);
    expect(text).toMatch(/Cap compression is not a plan/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
