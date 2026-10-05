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
import {
  SensitivityPlayground,
  playgroundFitLine,
  withScenarioReturns,
  type PlaygroundData,
} from "@/app/(app)/deals/[id]/sensitivity-playground";
import { PLAN_RETURNS_CAVEAT } from "@/lib/underwrite/plan-caveat";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { placeholderPageLine } from "@/lib/underwrite/report-grid";
import { modelReturnsRead } from "@/lib/compare-interest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { buyBoxRead } from "@/lib/buy-box-chip";
import { deriveRisks } from "@/app/(app)/deals/[id]/deal-sections";
import { omLoanTerms } from "@/app/(app)/deals/[id]/debt-sizer";
import { SIZER_LENDER_TESTS, modelLoanCoverageLine } from "@/lib/sizer-terms";
import { a11yIssues, dumpView, gluedWords, visibleText as textOf } from "./render-lint";
import { regulationForDeal } from "./rent-regulation";
import { readForwardPurchase } from "./forward-purchase";
import { ForwardPanel } from "@/app/forward-panel";
import { readMixedUse } from "./mixed-use";
import { MixedUsePanel } from "@/app/mixed-use-panel";
import { readGoingConcern } from "./going-concern";
import { GoingConcernPanel } from "@/app/going-concern-panel";
import { readCondo } from "./condo";
import { CondoPanel } from "@/app/condo-panel";
import { readSandwichLease } from "./sandwich-lease";
import { SandwichPanel } from "@/app/sandwich-panel";
import { modelVsMarket } from "./model-vs-market";
import { LOI_REFUSAL, LOI_REFUSAL_CODE } from "./loi-refusal";
import { STALE_MS } from "./screen-run";
import { supportMailto } from "./support-link";
import {
  NO_FIGURES_FAILURE,
  NO_OM_FAILURE,
  REJECTED_FAILURE,
  TOO_LARGE_FAILURE,
  pageCapFailure,
  refusalFailure,
} from "./anthropic/document-failures";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
      assetClass: SAMPLE_DEAL.asset_class,
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

  it("the sample's reading guide opens each section it names, never a card that does nothing (research pass 32)", () => {
    const html = render(sampleProps("overview"));
    expect(textOf(html)).toContain("How to read this screen");
    for (const to of ["verdict", "financials", "challenger"]) {
      expect(html).toMatch(new RegExp(`<button type="button" data-guide-step="${to}"`));
    }
  });

  it("draws where each range's base sits in one neutral colour, and calls no end of a range optimistic", () => {
    // The sample's vacancy base, 9.0% between 6.0% and 9.5%, hugs the high
    // end — the buyer's end on a vacancy, not the sponsor's.
    const html = render(sampleProps("analyses", "verdict"));
    expect(html.match(/title="Where the base sits inside the range"/g)?.length).toBe(SAMPLE_DEAL.verdict.screen?.ranges.length);
    expect(html).not.toContain("optimistic end of the range");
    expect(html).not.toMatch(/class="[^"]*\bbg-caution\b(?!\/)[^"]*"\s+style="left:/);
  });

  it("a portfolio across markets folds each market's figures under its own line, saying how many of the properties sit there (#413)", () => {
    const p = sampleProps("analyses", "market");
    const props: Props = {
      ...p,
      results: {
        ...p.results,
        market: {
          ...p.results.market!,
          liveBrief: {
            metro: "Pittsburgh PA",
            grain: "metro",
            readOn: "2026-09-23",
            lines: ["Unemployment 4.1% (Jul 2026, Pittsburgh MSA; FRED), -0.2 pt on the month before"],
            portfolio: { here: 2, of: 5 },
          },
          otherBriefs: [
            { metro: "Cleveland OH", grain: "metro", readOn: "2026-09-23", lines: ["Unemployment 4.4% (Jul 2026, Cleveland MSA; FRED)"], portfolio: { here: 2, of: 5 } },
            { metro: "Ohio", grain: "state", readOn: "2026-09-23", lines: ["Unemployment 4.9% (Aug 2026, Ohio; FRED)"], portfolio: { here: 1, of: 5 } },
          ],
        },
      },
    };
    const html = render(props);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/rules of thumb, read beside each market's published figures/);
    expect(text).toMatch(/Read beside the Pittsburgh PA market’s own figures — where 2 of the 5 properties sit\s+— 1 published figure as of Sep 23, 2026, each dated, each the metro’s rather than the submarket’s, and never the portfolio’s/);
    expect(text).toMatch(/Read beside the Cleveland OH market’s own figures — where 2 of the 5 properties sit/);
    expect(text).toMatch(/Read beside the state of Ohio’s own figures — where 1 of the 5 properties sits\s+— 1 published figure as of Sep 23, 2026, each dated, each the state’s rather than any metro’s, and never the portfolio’s/);
    expect(text).toMatch(/Unemployment 4\.4% \(Jul 2026, Cleveland MSA; FRED\)/);
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("a deal its county placed says so on the fold (#447)", () => {
    const p = sampleProps("analyses", "market");
    const props: Props = {
      ...p,
      results: {
        ...p.results,
        market: {
          ...p.results.market!,
          liveBrief: {
            metro: "Dallas-Fort Worth",
            grain: "metro",
            readOn: "2026-09-23",
            lines: ["Unemployment 4.1% (Jul 2026, Dallas–Fort Worth MSA; FRED)"],
            placedBy: { county: "Collin County, TX", area: "Dallas-Fort Worth-Arlington, TX" },
          },
        },
      },
    };
    const html = render(props);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(
      /Read beside the Dallas-Fort Worth market’s own figures — placed there by its county: Collin County, TX, which the Census Bureau files in the Dallas-Fort Worth-Arlington, TX metro area\s+— 1 published figure/,
    );
  });

  it("counts the nation's figures apart from the metro's — a block ending in the 10-year is never 'each the metro's'", () => {
    const p = sampleProps("analyses", "market");
    const props: Props = {
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
              "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED), -3 bps on the day before",
            ],
            national: 1,
          },
        },
      },
    };
    const text = textOf(render(props));
    expect(text).toMatch(/3 published figures as of Sep 23, 2026, each dated: 2 the metro’s rather than the submarket’s and 1 the nation’s\./);
    expect(text).not.toMatch(/each the metro’s rather than the submarket’s/);
  });

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
    expect(text).toMatch(/rules of thumb, read beside the metro's published figures/);
    // A deal outside the covered metros reads its state's figures, and the
    // section says so wherever it would have said "the metro's".
    const stateBrief: Props = {
      ...withBrief,
      results: {
        ...withBrief.results,
        market: {
          ...withBrief.results.market!,
          liveBrief: {
            metro: "Pennsylvania",
            grain: "state",
            readOn: "2026-09-23",
            lines: ["Unemployment 3.7% (Aug 2026, Pennsylvania; FRED), +0.1 pt on the month before"],
          },
        },
      },
    };
    const stateText = textOf(render(stateBrief));
    expect(stateText).toMatch(/Read beside the state of Pennsylvania’s own figures/);
    expect(stateText).toMatch(/each the state’s rather than any metro’s — the address lies outside the metros the site tracks/);
    expect(stateText).toMatch(/rules of thumb, read beside the state's published figures/);
    expect(stateText).not.toMatch(/market’s own figures/);
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
        grain: "metro",
        newestMonth: "Aug 2026",
        mine: "Professional & business services",
        intro: "Professional & business services is the sector that fills this building's kind, drawn full; the metro area's other sectors are beside it, faded, and all payrolls first.",
        supply: null,
        stale: ["Leisure & hospitality as of Aug 2025"],
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
    expect(text).toMatch(/one figure is stale: Leisure & hospitality as of Aug 2025/);
    // Four bars, the deal's own full and the others faded; a negative change draws leftward.
    expect((html.match(/data-bar="demand"/g) ?? []).length).toBe(4);
    expect(html).toContain('data-bar="demand" class="absolute inset-y-0 left-1/2 bg-brand"');
    expect(html).toContain('data-bar="demand" class="absolute inset-y-0 right-1/2 bg-brand/35"');
    expect(html).toContain("https://fred.stlouisfed.org/series/PHIL942PBSV\"");
    // Rental housing singles nothing out, and the sample without a read draws nothing.
    const apt = textOf(render({
      ...withDemand,
      metroDemand: {
        ...withDemand.metroDemand!,
        mine: null,
        intro: "Rental housing runs on all payrolls, drawn first; the sectors beneath say where the metro area's jobs are growing.",
        rows: withDemand.metroDemand!.rows.map((r) => ({ ...r, mine: false })),
      },
    }));
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

  it("a FIRST screen that failed claims no previous screen's results, and offers one way on (research pass 30)", () => {
    // A first screen stores nothing it did not reach, so the page hands no
    // previous-screen results (lib/screen-run `storedPreviousResults`); the
    // sections it never reached point at the reason at the top of the page.
    const failedFirst = (tab: string, analysis: string | null = null): Props =>
      ({
        ...sampleProps(tab, analysis),
        isSample: false,
        hasOm: true,
        omUrl: "/api/deals/d1/om",
        job: {
          status: "error",
          step: "extract",
          progress: 10,
          error: "The analysis service is overloaded right now — try again in a few minutes.",
        },
        results: { extraction: null, challenges: null, comps: null, reconciliation: null, market: null, verdict: null },
        staleResults: [],
        playground: null,
        actuals: { rentRoll: null, t12: null, noiComparison: null },
      }) as unknown as Props;
    for (const [tab, analysis] of [["overview", null], ["financials", null], ["analyses", "verdict"], ["analyses", "challenger"]] as const) {
      const html = render(failedFirst(tab, analysis));
      expect(a11yIssues(html), `${tab}/${analysis}`).toEqual([]);
      const text = textOf(html);
      expect(gluedWords(text), `${tab}/${analysis}`).toEqual([]);
      expect(text, `${tab}/${analysis}`).toMatch(/overloaded right now/);
      expect(text, `${tab}/${analysis}`).not.toMatch(/still show below|previous screen/);
      expect(text, `${tab}/${analysis}`).not.toMatch(/hasn.t run for this deal/);
      // One button for one action: the banner's.
      expect(text, `${tab}/${analysis}`).not.toMatch(/Run the screen/);
      expect((text.match(/Try again/g) ?? []).length, `${tab}/${analysis}`).toBe(1);
      if (tab !== "overview") expect(text).toContain("The last screen stopped before this step — the reason is at the top of the page.");
    }
    const overview = textOf(render(failedFirst("overview")));
    expect(overview).toContain("The screen stopped before its verdict — the reason is at the top of the page.");
    // Never "No concerns surfaced yet." — after a failed read it reads as a clean result.
    expect(overview).not.toMatch(/No concerns surfaced/);
    expect(overview).toContain("Nothing to digest yet — the screen stopped before it finished.");
    // A deal that has simply never been screened still offers the screen.
    const never = textOf(render({ ...failedFirst("financials"), job: null }));
    expect(never).toMatch(/The screen hasn.t run for this deal yet\./);
    expect(never).toMatch(/Run the screen/);
  });

  it("the support link under a stopped screen carries the deal, its id and the page's own sentence (research pass 30)", () => {
    const error = "The analysis service is overloaded right now — try again in a few minutes.";
    const html = render({
      ...sampleProps("overview"),
      dealId: "11111111-1111-4111-8111-111111111111",
      dealName: "Oakwood Flats",
      isSample: false,
      hasOm: true,
      job: { status: "error", step: "comps", progress: 50, error },
      staleResults: [],
    } as unknown as Props);
    const href = /href="(mailto:[^"]+)"/.exec(html)?.[1].replace(/&amp;/g, "&") ?? "";
    expect(href).toBe(
      supportMailto({ dealId: "11111111-1111-4111-8111-111111111111", dealName: "Oakwood Flats", step: "comps", error }),
    );
    const url = new URL(href);
    expect(url.pathname).toBe("underwritecopilot.support@gmail.com");
    expect(url.searchParams.get("subject")).toBe("Screen stopped — Oakwood Flats (11111111-1111-4111-8111-111111111111)");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("Deal id: 11111111-1111-4111-8111-111111111111");
    expect(body).toContain("Stopped at the comps step");
    expect(body).toContain(`What the page said: ${error}`);
    expect(body).toContain("\r\n");
    // The rail's "longer than usual" reads the clock after the page mounts:
    // the server's markup never says it (lib/screen-duration).
    const now = new Date().toISOString();
    const running = render({
      ...sampleProps("overview"),
      job: { status: "running", step: "challenge", progress: 30, error: null, updated_at: now, created_at: "2026-01-01T00:00:00Z" },
      typicalScreen: "about 3 minutes",
      typicalScreenMs: 180_000,
    } as unknown as Props);
    expect(running).not.toContain("longer-than-usual");
    expect(textOf(running)).toContain("Your screens usually take about 3 minutes");
  });

  it("a run waiting its turn says so, naming no analyst; a failure's toast on the deal points at the page's own banner (research pass 30)", () => {
    const now = new Date().toISOString();
    const queued = textOf(
      render({ ...sampleProps("overview"), job: { status: "queued", step: "signal", progress: 0, error: null, updated_at: now, created_at: now } } as unknown as Props),
    );
    expect(queued).toContain("Queued — waiting its turn to start…");
    expect(queued).not.toMatch(/analyst slot/);
    // The toast fires in the page's poll, which a static render does not
    // run: its words are held at the source.
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-view.tsx"), "utf8");
    expect(src).toContain('toast("The screen stopped — the reason is at the top of this page.", "error")');
    expect(src).not.toMatch(/toast\("[^"]*open the deal for details/);
  });

  it("a covered market whose figures could not be read says so on the market check, never 'not pulled comps' (research pass 30)", () => {
    const base = sampleProps("analyses", "market");
    const failed: Props = {
      ...base,
      results: {
        ...base.results,
        market: { ...base.results.market!, liveBrief: null, liveReadFailed: { market: "Philadelphia PA", grain: "metro" } },
      },
    };
    const html = render(failed);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-qa="live-read-failed"');
    expect(text).toContain(
      "The published figures for the Philadelphia PA market could not be read when this check ran, so it reasoned from rules of thumb alone — re-screen to include them.",
    );
    expect(text).toContain("rules of thumb — the published figures were not read");
    expect(text).not.toContain("not pulled comps");
    // A state's figures are the state's.
    const state = textOf(
      render({ ...failed, results: { ...failed.results, market: { ...failed.results.market!, liveReadFailed: { market: "Pennsylvania", grain: "state" } } } }),
    );
    expect(state).toContain("The published figures for the state of Pennsylvania could not be read");
    // The sample read none and failed none: it says nothing of the kind.
    expect(render(base)).not.toContain("live-read-failed");
  });

  it("a failure in the document offers Replace OM in its banner, never a 'Try again' that reads the same file the same way (research pass 30)", () => {
    const failed = (error: string, hasOm = true): Props =>
      ({
        ...sampleProps("overview"),
        isSample: false,
        hasOm,
        omUrl: hasOm ? "/api/deals/d1/om" : null,
        job: { status: "error", step: "extract", progress: 10, error },
        staleResults: [],
      }) as unknown as Props;
    const banner = (html: string) => html.slice(0, html.indexOf('aria-label="Deal sections"'));
    for (const error of [NO_FIGURES_FAILURE, pageCapFailure(700), TOO_LARGE_FAILURE]) {
      const html = render(failed(error));
      expect(a11yIssues(html), error).toEqual([]);
      const top = banner(html);
      const text = textOf(top);
      expect(gluedWords(text), error).toEqual([]);
      expect(text, error).not.toMatch(/Try again/);
      expect(text, error).toContain("Trying again would read the same file the same way.");
      expect(text, error).toContain("If this is the right file, email");
      expect(top, error).toContain('data-qa="document-failure"');
      expect(text, error).toMatch(/Replace OM/);
    }
    // The 400 that may yet pass, and a model's refusal, which a second read
    // may get past: Replace OM, and the retry beside it.
    for (const error of [REJECTED_FAILURE, refusalFailure("Extraction")]) {
      const either = textOf(banner(render(failed(error))));
      expect(either, error).toMatch(/Replace OM/);
      expect((either.match(/Try again/g) ?? []).length, error).toBe(1);
      expect(either, error).not.toContain("Trying again would read the same file");
    }
    // A deal with no OM is offered one, and never told a retry "would read
    // the same file" it does not have (the batch-2 audit).
    const noFile = textOf(banner(render(failed(NO_OM_FAILURE, false))));
    expect(noFile).toMatch(/Attach OM/);
    expect(noFile).toContain("Attach the OM to screen this deal.");
    expect(noFile).not.toMatch(/the same file|the right file/);
    // A passing fault keeps its retry and nothing else.
    const busy = banner(render(failed("The analysis service is overloaded right now — try again in a few minutes.")));
    expect(busy).not.toContain('data-qa="document-failure"');
    expect((textOf(busy).match(/Try again/g) ?? []).length).toBe(1);
    expect(textOf(busy)).toContain("If it fails twice, email");
  });

  it("a run that stopped making progress reads as stopped on every view — never 'in progress' — and Replace OM works (research pass 30)", () => {
    // The process died under a re-screen at the challenger eleven minutes
    // ago: the page's own read measured the row's age on the server's clock.
    const stalledJob = {
      status: "running",
      step: "challenge",
      progress: 30,
      error: null,
      updated_at: "2026-10-05T11:49:00Z",
      created_at: "2026-10-05T11:45:00Z",
      ageMs: STALE_MS + 60_000,
    };
    const stalled = (tab: string, analysis: string | null = null, job: unknown = stalledJob): Props =>
      ({
        ...sampleProps(tab, analysis),
        isSample: false,
        hasOm: true,
        omUrl: "/api/deals/d1/om",
        job,
        staleResults: ["challenges", "comps", "market", "verdict"],
      }) as unknown as Props;
    const html = render(stalled("overview"));
    dumpView("deal-stalled-overview", html);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    // The stall banner, from the first paint, and no rail or "in progress".
    expect(text).toContain("This screen stalled");
    expect(text).toContain("Start it again");
    expect(text).not.toMatch(/Step 3 of 6/);
    expect(text).not.toMatch(/Screening in progress|Until the run in progress|run in progress replaces/);
    expect(text).toContain("4 of these are from the previous screen — the latest run stopped making progress before reaching them. Start it again to bring them up to date.");
    expect(html).toContain('title="The latest screen stopped making progress before it reached the verdict.');
    // No section's dot pulses as running.
    const tabs = html.slice(html.indexOf('aria-label="Deal sections"'), html.indexOf('id="deal-tabpanel"'));
    expect(tabs).not.toContain("pulse-bar");
    // The OM can be replaced during a stall — a deck that kills the process
    // could otherwise only ever be started again.
    const docs = render(stalled("documents"));
    const replace = /<button type="button"([^>]*)>(?:(?!<\/button>)[\s\S])*Replace OM<\/button>/.exec(docs);
    expect(replace?.[1]).toBeDefined();
    expect(replace?.[1]).not.toContain('disabled=""');
    // A stalled FIRST screen: its unread sections say it stopped, no skeleton.
    const first = (tab: string, analysis: string | null = null): Props =>
      ({
        ...stalled(tab, analysis, { ...stalledJob, step: "extract", progress: 10 }),
        results: { extraction: null, challenges: null, comps: null, reconciliation: null, market: null, verdict: null },
        staleResults: [],
        playground: null,
      }) as unknown as Props;
    for (const [tab, analysis] of [["financials", null], ["analyses", "challenger"]] as const) {
      const t = textOf(render(first(tab, analysis)));
      expect(t, `${tab}/${analysis}`).toContain("The last screen stopped before this step — the reason is at the top of the page.");
      expect(t, `${tab}/${analysis}`).not.toMatch(/Run the screen/);
    }
    expect(textOf(render(first("overview")))).toContain("The screen stopped before its verdict");
    // The same run, still writing progress, is in progress.
    const live = textOf(render(stalled("overview", null, { ...stalledJob, ageMs: 30_000 })));
    expect(live).toMatch(/Step 3 of 6/);
    expect(live).not.toContain("This screen stalled");
    const liveDocs = render(stalled("documents", null, { ...stalledJob, ageMs: 30_000 }));
    expect(/<button type="button"([^>]*)>(?:(?!<\/button>)[\s\S])*Replace OM<\/button>/.exec(liveDocs)?.[1]).toContain('disabled=""');
  });

  it("a re-screen still running marks the results it has not reached, and says it is running", () => {
    // The research pass of 2026-09-30: mid re-screen, the page showed the
    // run's new terms beside the last run's call as one screen.
    const running = (tab: string, analysis: string | null = null): Props => ({
      ...sampleProps(tab, analysis),
      job: { status: "running", step: "market", progress: 70, error: null },
      staleResults: ["market", "verdict"],
    });
    const html = render(running("overview"));
    dumpView("deal-rescreen-overview", html);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    // The rail above counts the run's six steps; the meter's own count of
    // five results stands down while it runs, and the previous screen's
    // results are said in a line of their own.
    expect(text).toMatch(/Until the run in progress reaches them, 2 of this deal's results are the previous screen's\./);
    expect(text).not.toMatch(/Screening progress/);
    expect(text).not.toMatch(/\b\d\/5\b/);
    expect(text).not.toMatch(/failed before reaching them/);
    expect(html).toMatch(/title="A new screen of this deal is running\./);
    expect(textOf(render(running("analyses", "verdict")))).toMatch(/From the previous screen/);
  });

  it("the verdict says the day it was written", () => {
    const base = sampleProps("overview");
    const dated: Props = {
      ...base,
      results: { ...base.results, verdict: { ...base.results.verdict!, generatedAt: "2026-09-12T14:03:00.000Z" } },
    };
    const html = render(dated);
    expect(html).toMatch(/data-qa="verdict-date"/);
    expect(textOf(html)).toMatch(/Verdict\s*·\s*Sep 12, 2026/);
    // A verdict saved before the stamp says no date rather than a wrong one.
    expect(render(base)).not.toMatch(/data-qa="verdict-date"/);
  });

  it("a screen under way draws its rail with the clock; the clock is read after the page mounts, from the run's own start", () => {
    // The server's markup starts the clock at 0:00 (reading the time during
    // render would disagree with the client's first render); the effect then
    // counts from created_at, when the run was asked for (lib/run-clock).
    const html = render({
      ...sampleProps("overview"),
      job: {
        status: "running",
        step: "challenge",
        progress: 40,
        error: null,
        updated_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 170_000).toISOString(),
      },
    } as Props);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/Step 3 of 6 · 0:00/);
    // No measured runs handed in: the rail claims no duration of its own
    // (lib/screen-duration) — the clock says the time.
    expect(text).toMatch(/Finished sections open as they land/);
    expect(text).not.toMatch(/typically takes/);
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

  it("the comps tab pictures each comparable from the reader's own pipeline beside its name (#435)", () => {
    const html = render({
      ...sampleProps("analyses", "comps"),
      internalComps: [
        {
          dealId: "deal-2",
          name: "Girard Flats",
          market: "Philadelphia, PA",
          screenedAt: "2026-08-12T15:00:00Z",
          call: "caution",
          priceLabel: "$41,000,000",
          capLabel: "5.6%",
          basisLabel: "$215k/unit",
          kind: "stabilized",
          kindLabel: null,
          yieldOnCostLabel: null,
        },
      ],
    } as unknown as Props);
    expect(html).toContain("From your pipeline");
    expect(html).toContain('src="/api/deals/deal-2/image?w=64&amp;h=64&amp;fallback=cover&amp;google=0"');
    // Before the name, in the same cell.
    expect(html.indexOf("/api/deals/deal-2/image")).toBeLessThan(html.indexOf("Girard Flats"));
    expect(a11yIssues(html)).toEqual([]);
  });

  it("grades a reconciliation gap on the actuals card's band — the NOI gap that card calls In line is never HIGH (2026-09-30)", () => {
    // The research pass: Property actuals called the OM's NOI 4.7% over the
    // T-12 "In line", and the Risk digest beneath it ranked the same $174k
    // gap HIGH, because every unfavorable reconciliation row was HIGH.
    const p = sampleProps("overview");
    const html = render(p);
    expect(textOf(html)).toMatch(/Δ 4\.7% \(OM over actual\)\s*In line/);
    const risks = deriveRisks(p.results as Parameters<typeof deriveRisks>[0]);
    expect(risks.find((r) => r.title.startsWith("Year-1 NOI"))?.severity).toBe("low");
    // The vacancy gap, 300 bps on the model's 9.0%, stays outside the band.
    expect(risks.find((r) => r.title.startsWith("Vacancy"))?.severity).toBe("high");
    expect(html).toContain('title="3 high · 6 med · 2 low"');
    // A row whose size cannot be read on that footing keeps its old grade.
    const unread = deriveRisks({
      ...(p.results as Parameters<typeof deriveRisks>[0]),
      reconciliation: {
        rows: [{ metric: "Exit cap", omValue: "5.25%", myValue: "5.50%", gap: "Tighter than the model", direction: "unfavorable" }],
        takeaway: "",
      },
    });
    expect(unread.find((r) => r.title.startsWith("Exit cap:"))?.severity).toBe("high");
  });

  it("the section bar scrolls its own strip to the selected tab, never the page (2026-09-30)", () => {
    // The research pass: at 390px the selected Analyses tab sat at x 369–497,
    // off the screen. The effect is a browser's to run (lib/tab-strip holds
    // its arithmetic); here the strip it scrolls and the call are held.
    const html = render(sampleProps("analyses", "verdict"));
    expect(html).toMatch(/<div data-tab-strip="true" class="overflow-x-auto[^"]*"><div role="tablist"/);
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-view.tsx"), "utf8");
    // Set on mount and on every change of section, on the strip itself: a
    // scrollIntoView would move the page to a strip scrolled out of sight.
    expect(src).toMatch(/if \(left != null\) strip\.scrollLeft = left;\s*\}, \[section\]\);/);
    expect(src).not.toMatch(/scrollIntoView\(/);
  });

  it("the decision log's note box takes the card's width on a phone, its button beneath (2026-09-30)", () => {
    // The research pass: at 390px the box sat beside "Add note" at about
    // 210px, and its two rows cut the placeholder off at its third line.
    const html = render(sampleProps("overview"));
    const at = html.indexOf('aria-label="New decision note"');
    expect(at).toBeGreaterThan(-1);
    const form = html.slice(html.lastIndexOf("<form", at), html.indexOf("</form>", at));
    expect(form).toMatch(/<div class="flex flex-col gap-2 sm:flex-row sm:items-start">/);
    expect(form).toMatch(/<textarea[^>]*class="w-full min-w-0 [^"]*sm:flex-1"/);
    expect(form).toMatch(/<button type="submit" class="[^"]*self-end[^"]*sm:self-auto"/);
  });

  it("the challenger's 'Copy broker email' keeps one line, its row wrapping under the title (2026-09-30)", () => {
    // The research pass: at 390px it was squeezed onto three lines beside
    // "Assumption challenger" and the severity bar.
    const html = render(sampleProps("analyses", "challenger"));
    expect(html).toMatch(
      /<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"><h2 class="text-sm font-semibold tracking-tight">Assumption challenger<\/h2><div class="flex flex-wrap items-center gap-x-3 gap-y-1">/,
    );
    expect(html).toMatch(/<button type="button" class="whitespace-nowrap [^"]*">Copy broker email<\/button>/);
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

  it("the overview's meter stands down while a screen runs — never '0/5' under 'Step 2 of 6' — and stays for a side job", () => {
    const now = new Date().toISOString();
    const running = (step: string): Props =>
      ({
        ...sampleProps("overview"),
        job: { status: "running", step, progress: 20, error: null, updated_at: now, created_at: now },
      }) as unknown as Props;
    const screen = textOf(render(running("extract")));
    expect(screen).toMatch(/Step 2 of 6/);
    expect(screen).not.toMatch(/Screening progress/);
    expect(screen).not.toMatch(/\b\d\/5\b/);
    // The reconciler runs on its own (no six-step rail), and the meter stays.
    const recon = textOf(render(running("reconcile")));
    expect(recon).toMatch(/Screening progress/);
    expect(recon).toMatch(/5\/5/);
    // A finished deal keeps its quiet line.
    expect(textOf(render(sampleProps("overview")))).toMatch(/Screened · 5\/5/);
  });

  it("a running screen's rail claims a duration only as the reader's own runs measured it", () => {
    const now = new Date().toISOString();
    const running = (step: string, typicalScreen: string | null): Props =>
      ({
        ...sampleProps("overview"),
        job: { status: "running", step, progress: 30, error: null, updated_at: now, created_at: now },
        typicalScreen,
      }) as unknown as Props;
    const measured = textOf(render(running("challenge", "about 3 minutes")));
    expect(measured).toMatch(/Your screens usually take about 3 minutes — finished sections open as they land/);
    // Fewer than three measured runs: no duration at all, the clock says the time.
    const html = render(running("challenge", null));
    expect(a11yIssues(html)).toEqual([]);
    const bare = textOf(html);
    expect(gluedWords(bare)).toEqual([]);
    expect(bare).toMatch(/Finished sections open as they land/);
    expect(bare).not.toMatch(/2–4 minutes|typically takes|a minute or two|a few minutes|Your screens usually/);
    // The reconciler runs on its own, and the screens' median is not its time.
    const recon = textOf(render(running("reconcile", "about 3 minutes")));
    // It runs on if the reader leaves, and the note shows only while the
    // page is open (pass 14: "a toast will tell you" was true only then).
    expect(recon).toMatch(/It keeps running if you leave; with this page open, a note here says when it lands\./);
    expect(recon).not.toMatch(/about 3 minutes|a minute or two/);
    // The first step claims no time either.
    expect(textOf(render(running("signal", null)))).not.toMatch(/half a minute/);
  });

  it("the past-screens strip counts what it counts: the screens with a cap or basis on file", () => {
    const html = render({
      ...sampleProps("overview"),
      marketMemory: {
        assetClass: "multifamily",
        market: "Philadelphia, PA",
        marketKey: "philadelphia pa",
        count: 3,
        cap: { min: 5.2, median: 5.4, max: 5.6 },
        perUnit: { min: 240_000, median: 250_000, max: 262_000, basis: "unit" },
        calls: { pass: 1, caution: 2, pass_on: 0 },
        dealIds: ["a", "b", "c"],
      },
    } as unknown as Props);
    expect(a11yIssues(html)).toEqual([]);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    // The text tool breaks a line at each element's edge; the reader's
    // sentence runs straight through.
    // The figures are at the ask — struck on the memoranda's asking prices,
    // never trades — and the sentence says so.
    expect(text).toMatch(
      /You've screened\s+3\s+other Philadelphia, PA Multifamily\s+deals with a cap or basis on file: going-in cap 5\.20–5\.60% · basis \$240–262k\/unit\s*, at the ask\s*\./,
    );
    // A hotel's basis is per key (lib/market-memory's group noun).
    const hotel = textOf(
      render({
        ...sampleProps("overview"),
        marketMemory: {
          assetClass: "hospitality_str",
          market: "Nashville, TN",
          marketKey: "nashville tn",
          count: 1,
          cap: null,
          perUnit: { min: 225_000, median: 225_000, max: 225_000, basis: "unit", noun: "key" },
          calls: { pass: 0, caution: 1, pass_on: 0 },
          dealIds: ["h"],
        },
      } as unknown as Props),
    );
    const strip = hotel.match(/You've screened[\s\S]*?\/key[\s\S]*?\./)?.[0] ?? "";
    expect(strip).toMatch(/other Nashville, TN Hospitality \/ STR\s+deal with a cap or basis on file: basis \$225k\/key\s*, at the ask\s*\./);
    expect(strip).not.toMatch(/\/unit/);
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
            read: "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 6.50% is 156 bps over it, so the exit assumes the spread narrows 50 bps with the 10-year unchanged. Cap compression is not a plan: a return that needs the exit to price tighter than the entry is a bet on the market rather than the building.",
          },
        ],
      },
    };
    const html = render(withRead);
    const text = textOf(html);
    expect(text).toMatch(/Assumptions against the published figures/);
    expect(text).toMatch(/set against the published figures for the Philadelphia market and the nation, read on Sep 21, 2026\./);
    expect(text).not.toMatch(/actually done/);
    expect(text).toMatch(/Rent growth/);
    expect(text).toMatch(/ahead of the published figures/);
    expect(text).toMatch(/assumes cap compression/);
    expect(text).toMatch(/Cap compression is not a plan/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("the financials' rent-growth row names a regime's allowance first, beside the market's figures (lib/rent-regulation)", () => {
    const deck = {
      dealName: "The Walk-up",
      assetClass: "multifamily",
      metrics: [
        { label: "Asking price", value: "$14,000,000", flagged: false, page: "" },
        { label: "Units", value: "48", flagged: false, page: "" },
        { label: "Year built", value: "1931", flagged: false, page: "" },
        { label: "Rent-regulated units", value: "41", flagged: false, page: "" },
      ],
    };
    const regulation = regulationForDeal(
      { extraction: deck, address: { state: "NY", city: "Brooklyn", county: "Kings County" }, siteFlags: null, assetClass: "multifamily" },
      "2026-10-05",
    );
    // The page's read: one market figure (Zillow's asking rents), the model's
    // 3% default, and the regime's allowance in force on the reader's day.
    const read = modelVsMarket({
      inputs: { rentGrowthPct: 0.03, expenseGrowthPct: 0.03, vacancyPct: 0.05, exitCapPct: 0.06 },
      sources: { rentGrowthPct: { provenance: "assumption", note: "Default 3.0%/yr — set your view" } },
      assetClass: "multifamily",
      metro: { id: "nyc", name: "New York City" },
      zori: {
        rent: 3400,
        yoyPct: 2.6,
        asOf: "2026-08-31",
        note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, New York, NY metro area, month ending 2026-08-31. Data: Zillow Research.",
        shared: false,
        mfrRent: null,
        mfrYoyPct: null,
        homeValue: null,
        homeValueYoyPct: null,
        priceToRentYears: null,
      },
      rates: [],
      national: [],
      regulation,
      now: new Date("2026-10-05T12:00:00Z"),
    });
    const html = render({ ...sampleProps("financials"), modelVsMarket: read });
    const text = textOf(html);
    expect(text).toContain(
      "Under NYC rent stabilization, the allowance for leases commencing Oct 1, 2026 to Sep 30, 2027 is 0% on a one-year lease and 0% on a two-year lease",
    );
    expect(text).toContain("That is the regime's allowance for the units it regulates, not a market figure: the model's 3.0%/yr runs 3.0 points over both.");
    expect(text).toContain("For the market-rate units, over the past year the metro's asking rents moved +2.6%");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("DealView — a forward purchase carries no construction (lib/forward-purchase)", () => {
  type Ex = NonNullable<Props["results"]["extraction"]>;
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 4", basis: "na" as const });
  const deck = (summary: string): Ex =>
    ({
      dealName: "Ridgeline Homes",
      assetClass: "sfr_btr",
      totalPages: 40,
      strategy: { kind: "development", summary, capitalBudget: "", timeline: "" },
      metrics: [
        row("Purchase price", "$72,000,000"),
        row("Homes", "180"),
        row("NOI (stabilized, pro forma)", "$3,960,000"),
        row("Construction budget", "$58,000,000"),
        row("Estimated delivery", "June 2028"),
        row("Outside date", "December 31, 2028"),
        row("Deposit", "10% at signing, non-refundable after due diligence"),
      ],
    }) as Ex;
  const FORWARD = deck("Forward purchase of a 180-home build-to-rent community, purchase at certificate of occupancy");
  const OWN = deck("Ground-up 180-home build-to-rent community");
  const financials = (extraction: Ex) => {
    const p = sampleProps("financials");
    return render({ ...p, isSample: false, results: { ...p.results, extraction } } as Props);
  };

  it("the Financials tab draws no construction loan on a forward purchase, and draws one where the buyer builds the same deck", () => {
    const forward = financials(FORWARD);
    expect(forward).not.toContain('aria-label="Construction and take-out debt"');
    expect(financials(OWN)).toContain('aria-label="Construction and take-out debt"');
    expect(a11yIssues(forward)).toEqual([]);
    expect(gluedWords(textOf(forward))).toEqual([]);
  });

  it("the deal page draws the purchase with the derived model's exit cap and read, on the reader's day", () => {
    // As app/(app)/deals/[id]/page.tsx draws it: the read on the page's day
    // with the page's kind, the model's exit cap and `meta.forward.read`.
    const today = "2026-10-05";
    const derived = deriveUnderwriteInputs(FORWARD, "Ridgeline Homes");
    const html = renderToStaticMarkup(
      React.createElement(ForwardPanel, {
        forward: readForwardPurchase(FORWARD, new Date(`${today}T12:00:00Z`), inferStrategy(FORWARD)),
        today,
        exitCapPct: derived.inputs.exitCapPct * 100,
        modelLine: derived.meta.forward?.read ?? "",
      }),
    );
    const text = textOf(html);
    expect(html.match(/data-bar="fwd-exit"/g)).toHaveLength(1);
    expect(text).toContain(`The model's exit cap, ${(derived.inputs.exitCapPct * 100).toFixed(2)}%`);
    expect(text).toContain("5.50% at delivery, the stated NOI over the price");
    expect(text).toContain("Its year-one NOI is an assumed 6.00% of the price, $4.32M, above the $3.96M the memorandum states at delivery.");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the deal page's mixed-use panel reads the derived model (lib/mixed-use)", () => {
  it("draws the two incomes with the model's own exit cap and growth rate in its read", () => {
    // As app/(app)/deals/[id]/page.tsx draws it: the read on the page's day,
    // with `meta.mixedUse.read` from the derived model.
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "Retail / Multifamily",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Residential income", value: "$1,520,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "Commercial income", value: "$610,000", flagged: false, page: "", basis: "in_place" as const },
      ],
    };
    const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name);
    const html = renderToStaticMarkup(
      React.createElement(MixedUsePanel, {
        mixedUse: readMixedUse(extraction, new Date("2026-10-05T12:00:00Z")),
        modelLine: derived.meta.mixedUse?.read ?? "",
      }),
    );
    const text = textOf(html);
    expect(html.match(/data-bar="mu-income"/g)).toHaveLength(2);
    expect(text).toContain(
      `The model capitalises the $610k of commercial income at the same ${(derived.inputs.exitCapPct * 100).toFixed(2)}% exit cap as the residential and grows it at the same ${(derived.inputs.rentGrowthPct * 100).toFixed(1)}% a year`,
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the deal page's operating-business panel reads the derived model (lib/going-concern)", () => {
  it("draws a business sold with its real estate with the model's own year-one income and exit cap in its read", () => {
    // As app/(app)/deals/[id]/page.tsx draws it: the read on the page's day,
    // with `meta.goingConcern.read` from the derived model.
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Route 9 Fuel & Market",
      assetClass: "Gas Station / Convenience Store",
      strategy: { kind: "stabilized" as const, summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Asking price", value: "$3,200,000", flagged: false, page: "", basis: "na" as const },
        { label: "NOI (in-place)", value: "$256,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "EBITDA (T-12)", value: "$410,000", flagged: false, page: "", basis: "in_place" as const },
      ],
    };
    const derived = deriveUnderwriteInputs(extraction, "Route 9 Fuel & Market");
    const html = renderToStaticMarkup(
      React.createElement(GoingConcernPanel, {
        goingConcern: readGoingConcern(extraction, new Date("2026-10-05T12:00:00Z")),
        modelLine: derived.meta.goingConcern?.read ?? "",
      }),
    );
    const text = textOf(html);
    expect(html).toContain('data-qa="going-concern-panel"');
    expect(text).toMatch(/The model capitalises its \$256k year-one income at an? [\d.]+% exit cap as if it were rent/);
    expect(text).toContain(`${(derived.inputs.exitCapPct * 100).toFixed(2)}% exit cap`);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the deal page's condominium panel reads the derived model (lib/condo)", () => {
  it("draws the units with the model's own exit cap in its read", () => {
    // As app/(app)/deals/[id]/page.tsx draws it: the read on the page's day,
    // with `meta.condo.read` from the derived model.
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Harbor View",
      assetClass: "Condominium Units (bulk sale)",
      metrics: [
        { label: "Asking price", value: "$16,800,000", flagged: false, page: "", basis: "na" as const },
        { label: "Units", value: "42", flagged: false, page: "", basis: "na" as const },
        { label: "NOI (in-place)", value: "$840,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "HOA dues", value: "$650 per unit per month", flagged: false, page: "", basis: "in_place" as const },
        { label: "Units in building", value: "120", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const derived = deriveUnderwriteInputs(extraction, "Harbor View");
    const html = renderToStaticMarkup(
      React.createElement(CondoPanel, {
        condo: readCondo(extraction, new Date("2026-10-05T12:00:00Z")),
        modelLine: derived.meta.condo?.read ?? "",
      }),
    );
    const text = textOf(html);
    expect(html).toContain('data-qa="condo-panel"');
    expect(html.match(/data-bar="condo-limit"/g)).toHaveLength(1);
    expect(text).toContain(`The model sells the 42 units as one building at its ${(derived.inputs.exitCapPct * 100).toFixed(2)}% exit cap`);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the deal page's sandwich panel reads the derived model (lib/sandwich-lease)", () => {
  it("draws the master lease's term against the model's hold, and the model's own read", () => {
    // As app/(app)/deals/[id]/page.tsx draws it: the read on the page's day,
    // the hold and `meta.sandwich.read` from the derived model.
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Founders Plaza",
      assetClass: "Office",
      interest: {
        kind: "leasehold" as const,
        summary: "Leasehold interest under a master lease of the building, sublet to 14 office tenants",
        share: "",
        groundLease: "Master lease of the building from its owner",
        loan: "",
        page: "",
      },
      metrics: [
        { label: "Asking price", value: "$6,500,000", flagged: false, page: "", basis: "na" as const },
        { label: "Master lease rent", value: "$1,100,000 a year", flagged: false, page: "", basis: "in_place" as const },
        { label: "Sublease income", value: "$1,820,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "NOI (T-12)", value: "$720,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "Master lease expiration", value: "December 31, 2091", flagged: false, page: "", basis: "na" as const },
      ],
    };
    const derived = deriveUnderwriteInputs(extraction, "Founders Plaza");
    const html = renderToStaticMarkup(
      React.createElement(SandwichPanel, {
        sandwich: readSandwichLease(extraction, new Date("2026-10-05T12:00:00Z")),
        holdYears: derived.inputs.holdMonths / 12,
        modelLine: derived.meta.sandwich?.read ?? "",
      }),
    );
    const text = textOf(html);
    expect(html).toContain('data-qa="sandwich-panel"');
    for (const bar of ["sandwich-master", "sandwich-spread", "lease-hold", "lease-term"]) expect(html.match(new RegExp(`data-bar="${bar}"`, "g")), bar).toHaveLength(1);
    expect(text).toContain(`The model's hold, ${derived.inputs.holdMonths / 12} years`);
    expect(text).toContain("The model capitalises the position's income at its sale as if it ran forever; the master lease ends Dec 2091");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("the debt sizer lists a stated loan under whose loan it is (2026-09-30)", () => {
  // The research pass: "Financing stated in the OM" listed a note's own
  // amortization and maturity as if they were the buyer's financing, and the
  // seller's assumable loan as a plain "Loan amount" and "Rate".
  type Ex = NonNullable<Props["results"]["extraction"]>;
  const row = (label: string, value: string, page = "p. 12") => ({ label, value, flagged: false, page, basis: "na" as const });
  const withRows = (rows: ReturnType<typeof row>[], interest?: Ex["interest"]): Ex =>
    ({ ...SAMPLE_DEAL.extraction, totalPages: 60, metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows], ...(interest ? { interest } : {}) }) as Ex;
  const ASSUMABLE = [
    row("Assumable loan balance", "$40,000,000"),
    row("Assumable loan rate", "3.45%"),
    row("Assumable loan maturity", "June 30, 2033"),
    row("Assumable loan amortization", "Interest-only"),
    row("Assumption fee", "1%"),
  ];
  const NOTE_ROWS = [
    row("Unpaid principal balance", "$24,400,000", "p. 5"),
    row("Note rate", "5.25%", "p. 5"),
    row("Maturity date", "March 31, 2028", "p. 5"),
    row("Amortization", "Interest-only", "p. 5"),
  ];

  it("keeps the memorandum's own financing assumptions as they were", () => {
    const t = omLoanTerms(SAMPLE_DEAL.extraction as Ex);
    expect(t.offered).toEqual([{ label: "LTV", value: "60%", page: "p. 44" }]);
    expect(t.assumable).toEqual([]);
    expect(t.seller).toEqual([]);
  });

  it("lists the seller's loan offered for assumption as that loan, never as a plain loan amount and rate", () => {
    const t = omLoanTerms(withRows(ASSUMABLE));
    expect(t.assumable.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Balance: $40,000,000",
      "Rate: 3.45%",
      "Maturity: June 30, 2033",
      "Amortization: Interest-only",
      "Assumption fee: 1%",
    ]);
    expect(t.offered.map((r) => r.label)).toEqual(["LTV"]);
  });

  it("lists a seller's loan's term as that loan's even where its balance is not stated (the audit, 2026-10-01)", () => {
    const rateOnly = omLoanTerms(withRows([row("Assumable loan rate", "3.45%")]));
    expect(rateOnly.assumable.map((r) => `${r.label}: ${r.value}`)).toEqual(["Rate: 3.45%"]);
    expect(rateOnly.offered.map((r) => r.label)).toEqual(["LTV"]);
    const amortOnly = omLoanTerms(withRows([row("Seller financing amortization", "25 years")]));
    expect(amortOnly.seller.map((r) => r.label)).toEqual(["Amortization"]);
    expect(amortOnly.offered.map((r) => r.label)).toEqual(["LTV"]);
  });

  it("lists the note the seller offers to carry as the seller's note", () => {
    const t = omLoanTerms(
      withRows([
        row("Seller financing amount", "70% of the purchase price"),
        row("Seller financing rate", "5.00%"),
        row("Seller financing term", "5 years"),
        row("Seller financing amortization", "25 years"),
      ]),
    );
    expect(t.seller.map((r) => r.label)).toEqual(["Amount", "Rate", "Term", "Amortization"]);
    expect(t.offered.map((r) => r.label)).toEqual(["LTV"]);
  });

  it("lists nothing as financing on a note, whose terms are the asset, or on a leased fee", () => {
    const note = omLoanTerms(withRows(NOTE_ROWS, { kind: "note", summary: "Sale of the first mortgage note", share: "", groundLease: "", loan: "", page: "p. 5" } as Ex["interest"]));
    expect(note).toEqual({ offered: [], assumable: [], seller: [] });
    const leasedFee = omLoanTerms(
      withRows(ASSUMABLE, { kind: "leased_fee", summary: "The land under the tower, with its ground lease", share: "", groundLease: "", loan: "", page: "p. 4" } as Ex["interest"]),
    );
    expect(leasedFee).toEqual({ offered: [], assumable: [], seller: [] });
  });

  it("lists nothing as financing on a preferred equity position: the senior loan ahead of it is the entity's (lib/position)", () => {
    const rows = [row("Preferred equity amount", "$15,000,000"), row("Senior loan balance", "$52,000,000"), row("Senior loan maturity", "December 2029")];
    const position = omLoanTerms(withRows(rows, { kind: "preferred_equity", summary: "", share: "", groundLease: "", loan: "", page: "p. 3" } as Ex["interest"]));
    expect(position).toEqual({ offered: [], assumable: [], seller: [] });
    // Read as a building, the senior loan's maturity would list as the OM's own loan term.
    expect(omLoanTerms(withRows(rows)).offered.map((r) => r.label)).toContain("Maturity");
  });

  it("draws each group under its own heading on the Financials tab", () => {
    const p = sampleProps("financials");
    const assumable = textOf(render({ ...p, results: { ...p.results, extraction: withRows(ASSUMABLE) } }));
    expect(assumable).toMatch(/Financing stated in the OM\s*LTV:\s*60%/);
    expect(assumable).toMatch(/The loan in place, offered for assumption\s*The seller's loan, as the OM states it — not a quote for new financing\.\s*Balance:\s*\$40,000,000\s*· p\. 12/);
    expect(assumable).not.toMatch(/Loan amount:/);
    const note = render({
      ...p,
      results: {
        ...p.results,
        extraction: withRows(NOTE_ROWS, { kind: "note", summary: "Sale of the first mortgage note", share: "", groundLease: "", loan: "", page: "p. 5" } as Ex["interest"]),
      },
    });
    expect(a11yIssues(note)).toEqual([]);
    expect(textOf(note)).not.toMatch(/Financing stated in the OM/);
    expect(textOf(note)).not.toMatch(/Amortization:\s*Interest-only/);
  });
});

describe("the Documents tab opens each source document", () => {
  it("links a document the deal lists through the route that signs it on click", () => {
    const base = sampleProps("documents");
    const dealId = "0b5c6c1e-2f7a-4b8e-9d3c-5a1e7f2b9c40";
    const doc = {
      id: "d1",
      deal_id: dealId,
      kind: "rent_roll",
      filename: "Rent roll June.xlsx",
      storage_path: `documents/${dealId}/1c9a2f3e-rent_roll_june.xlsx`,
      content_type: null,
      created_at: "2026-09-12T14:03:00.000Z",
    };
    const stray = { ...doc, id: "d2", filename: "Elsewhere.pdf", storage_path: "documents/another-deal/x.pdf" };
    const bov = {
      ...doc,
      id: "d3",
      kind: "bov",
      filename: "CBRE BOV.pdf",
      storage_path: `documents/${dealId}/5b2e-cbre_bov.pdf`,
      content_type: "application/pdf",
    };
    const html = render({ ...base, dealId, documents: [doc, stray, bov] } as Props);
    dumpView("deal-documents", html);
    expect(a11yIssues(html)).toEqual([]);
    const href = `/api/deals/${dealId}/file?p=${encodeURIComponent(doc.storage_path)}`;
    expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
    // A spreadsheet is stored to download, so its link says so; a PDF opens.
    expect(html).toMatch(/aria-label="Download Rent roll June\.xlsx"/);
    expect(html).toMatch(/aria-label="View CBRE BOV\.pdf"/);
    // A BOV's kind is said as a word, never its raw key.
    expect(textOf(html)).toMatch(/CBRE BOV\.pdf\s*BOV/);
    expect(textOf(html)).not.toMatch(/\bbov\b/);
    // A path that is not this deal's own draws its name and no link.
    expect(textOf(html)).toMatch(/Elsewhere\.pdf/);
    expect(html).not.toMatch(/aria-label="View Elsewhere\.pdf"/);
    // Never a storage host's signed URL minted at render.
    expect(html).not.toMatch(/token=|\/storage\/v1\/object\/sign/);
  });
});

describe("the add-a-note box says what it does", () => {
  // Its note and file are kept with the deal (deals.supplements) and read by
  // nothing in the analysis, so the box never promises a correction.
  it("offers a note or a file kept with the deal, on the Documents tab and under each analysis", () => {
    for (const [tab, analysis] of [["documents", null], ["analyses", "verdict"]] as const) {
      const text = textOf(render(sampleProps(tab, analysis)));
      expect(text, `${tab}/${analysis}`).toMatch(/Add a note or a file to this section/);
      expect(text, `${tab}/${analysis}`).not.toMatch(/Add info or upload/);
    }
  });

  it("its open form keeps a note with the deal and says the analysis does not read it", () => {
    // The form renders only once the box is opened, which a static render
    // cannot do: its words are read off the component's source.
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-sections.tsx"), "utf8");
    const start = src.indexOf("export function AddData(");
    const body = src.slice(start, src.indexOf("\nexport function ", start + 1));
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/placeholder="A note to keep with this deal…"/);
    expect(body).toMatch(/the analysis does not read\s+notes or files added here/);
    expect(body).not.toMatch(/correction|the analysis missed/i);
  });
});

describe("the sensitivity playground says whose figures it runs", () => {
  // The documents-against-the-page audit (2026-09-30): on a plan deal the
  // report omits its IRR page as not the plan's return, while the page
  // printed the same returns with no word; and the playground called the
  // model's year-1 NOI over the price "Going-in cap" beside a header that
  // prints the OM's stated cap.
  const playground = (strategy: string | null) => {
    const p = sampleProps(null) as unknown as { playground: Record<string, unknown> };
    return renderToStaticMarkup(
      React.createElement(SensitivityPlayground, { data: { ...p.playground, strategy } as never }),
    );
  };

  it("its fit chip is the header's chip, says what it scored, and keeps the memorandum's fit apart (2026-09-30)", () => {
    // The research pass: the header read "Fit 63 · Outside box" and the Buy
    // box tab "63 / 100 · Watch", while the playground said a red
    // "Pass · 36/100" — the model's IRR and cash-on-cash scored against the
    // box's 13% and 5% floors, with nothing saying so.
    const p = sampleProps(null) as unknown as { playground: PlaygroundData };
    const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data: p.playground }));
    const at = html.indexOf('data-qa="playground-fit"');
    expect(at).toBeGreaterThan(-1);
    const fit = textOf(html.slice(html.indexOf(">", at) + 1));
    // The model's figures miss the box outright as the memorandum's do, so
    // the chip says so whatever the score's call (lib/fit-label: it had read
    // "Fit 36 · Pass" beside the pipeline card's "Outside box" wording).
    expect(fit).toMatch(/^Fit 36 · Outside box\s+with the model's IRR and cash-on-cash scored · Fit 63 on the memorandum's figures/);
    expect(fit).not.toMatch(/\/100/);
    // "The memorandum's figures" is the header's own read: the same scorer
    // on the same source the page's chip folds.
    const header = buyBoxRead(SAMPLE_DEAL.asset_class, p.playground.checkSource as never, SAMPLE_DEMO_BOX);
    expect(header.chip.label).toBe("Fit 63 · Outside box");
    expect(header.mandate?.score).toBe(63);
    expect(gluedWords(textOf(html))).toEqual([]);
  });

  it("its exit-cap slider runs the base ± 200 bps and never opens on a cap no deal trades at (2026-09-30)", () => {
    // The research pass: the sample's 5.45% slider ran from 1.45% to 9.45%.
    const p = sampleProps(null) as unknown as { playground: PlaygroundData };
    const text = textOf(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data: p.playground })));
    expect(text).toMatch(/Exit cap\s*5\.45%\s*base 5\.45%\s*3\.45%\s*7\.45%/);
    expect(text).not.toContain("1.45%");
  });

  it("keeps the memorandum's return where the model could not compute its own (2026-10-01)", () => {
    // The audit: a model IRR that did not compute dropped the memorandum's
    // IRR row and put nothing in its place, so the box scored one dimension
    // fewer while the chip's line said "the memorandum's figures".
    const om = [
      { label: "Price", value: "$10,000,000" },
      { label: "Levered IRR", value: "14.2%" },
      { label: "Cash-on-Cash Return", value: "6.1%" },
    ];
    expect(withScenarioReturns(om, null, null)).toEqual(om);
    expect(withScenarioReturns(om, Number.NaN, 0.072)).toEqual([
      { label: "Price", value: "$10,000,000" },
      { label: "Levered IRR", value: "14.2%" },
      { label: "Cash-on-cash", value: "7.2%" },
    ]);
    expect(withScenarioReturns(om, 0.118, null)).toEqual([
      { label: "Price", value: "$10,000,000" },
      { label: "Cash-on-Cash Return", value: "6.1%" },
      { label: "IRR", value: "11.8%" },
    ]);
  });

  it("says what a moved slider's fit is against, and names nothing it did not score", () => {
    const s = { score: 52, base: 36, scored: ["IRR", "cash-on-cash"], onMemorandum: 63 };
    expect(playgroundFitLine(s, false)).toBe("with the model's IRR and cash-on-cash scored · Fit 63 on the memorandum's figures");
    expect(playgroundFitLine(s, true)).toBe(
      "with the model's IRR and cash-on-cash scored · Fit 36 at the base case · Fit 63 on the memorandum's figures",
    );
    expect(playgroundFitLine({ ...s, score: 36 }, true)).toBe(
      "with the model's IRR and cash-on-cash scored · unchanged — these returns don't cross a mandate threshold · Fit 63 on the memorandum's figures",
    );
    // A box with no return floor scores nothing of the model's: the chip is
    // the memorandum's own read, said once.
    expect(playgroundFitLine({ score: 63, base: 63, scored: [], onMemorandum: 63 }, false)).toBe(
      "mandate fit on the memorandum's figures",
    );
    expect(playgroundFitLine({ ...s, scored: ["IRR"] }, false)).toBe("with the model's IRR scored · Fit 63 on the memorandum's figures");
  });

  // Research pass 27: the model's loan is a share of cost with no coverage
  // test, so a deal bought under about a 5.45% cap was given a levered
  // return on a loan the page's own debt sizer refuses at 1.25x, and the
  // page said nothing. Display only: the model's loan is never resized.
  it("says where the model's loan falls under the coverage the debt sizer tests, and that it sizes by cost alone", () => {
    const p = sampleProps(null) as unknown as { playground: PlaygroundData };
    const draw = (price: number) =>
      renderToStaticMarkup(
        React.createElement(SensitivityPlayground, {
          data: { ...p.playground, inputs: { ...p.playground.inputs, purchasePrice: price } },
        }),
      );
    const dscrShown = (html: string) => Number(textOf(html).match(/Year-1 DSCR\s*(-?\d+\.\d\d)x/)![1]);
    const ask = p.playground.inputs.purchasePrice;
    // The sample's own ask: the tile reads 1.25x, at the sizer's test — no line.
    const atTest = draw(ask);
    expect(dscrShown(atTest)).toBe(SIZER_LENDER_TESTS.minDscr);
    expect(atTest).not.toContain('data-qa="playground-dscr-test"');
    // Cheaper, the loan is smaller on the same NOI: over the test — no line.
    const over = draw(ask * 0.9);
    expect(dscrShown(over)).toBeGreaterThan(SIZER_LENDER_TESTS.minDscr);
    expect(over).not.toContain('data-qa="playground-dscr-test"');
    // Dearer, the loan is larger on the same NOI: under the test, said by how much.
    const under = draw(ask * 1.2);
    const shown = dscrShown(under);
    expect(shown).toBeLessThan(SIZER_LENDER_TESTS.minDscr);
    const gap = (SIZER_LENDER_TESTS.minDscr - shown).toFixed(2);
    const text = textOf(under);
    expect(text).toContain(
      `The model's loan is ${gap}x under the debt sizer's 1.25x coverage test: it sizes the loan by cost alone (60% of the acquisition cost).`,
    );
    // Under the tile, never above it.
    expect(under.indexOf('data-qa="playground-dscr-test"')).toBeGreaterThan(under.indexOf("Year-1 DSCR"));
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(under)).toEqual([]);
  });

  it("reads the coverage at the tile's own precision, and says nothing where the model carries no debt", () => {
    // 1.2496 shows as 1.25x: at the test, so no line that would read "0.00x under".
    expect(modelLoanCoverageLine(1.2496, 0.6)).toBeNull();
    expect(modelLoanCoverageLine(1.25, 0.6)).toBeNull();
    expect(modelLoanCoverageLine(1.2449, 0.6)).toBe(
      "The model's loan is 0.01x under the debt sizer's 1.25x coverage test: it sizes the loan by cost alone (60% of the acquisition cost).",
    );
    expect(modelLoanCoverageLine(1.03, 0.625)).toBe(
      "The model's loan is 0.22x under the debt sizer's 1.25x coverage test: it sizes the loan by cost alone (62.5% of the acquisition cost).",
    );
    expect(modelLoanCoverageLine(null, 0.6)).toBeNull();
    expect(modelLoanCoverageLine(Number.NaN, 0.6)).toBeNull();
  });

  it("names its model — the workbook's and the report's — beside the Financials tab's first-draft model (research pass 34)", () => {
    // The Overview's 9.3% and the Financials tab's 8.72% for one deal, with
    // no word on either which model it was.
    expect(textOf(playground(null))).toContain("The screening model — the one the Excel workbook and the full report carry.");
  });

  it("says a plan deal's returns are the screening model's, not the plan's", () => {
    const plan = textOf(playground("conversion"));
    expect(plan).toContain(PLAN_RETURNS_CAVEAT);
    expect(plan).toContain("Cap on Yr-1 income (as modelled)");
    const held = textOf(playground("stabilized"));
    expect(held).not.toContain(PLAN_RETURNS_CAVEAT);
    // The model's cap is named as the model's, never "Going-in cap".
    expect(held).toContain("Cap on Yr-1 NOI (as modelled)");
    expect(held).not.toMatch(/Going-in cap/);
  });

  // Research pass 34: an unpriced memorandum ("Call for offers", $2M NOI)
  // printed a 73.0% levered IRR, a 9.86x multiple and a max bid against a
  // $10,000,000 placeholder, while the full report left them out as the
  // placeholder's. The tiles and the bid are withheld on the report's rule,
  // the reason said over them, until the reader types a price.
  const unpricedRows = (more: ExtractionResult["metrics"] = []): ExtractionResult => ({
    dealName: "Unpriced Court",
    assetClass: "multifamily",
    market: "Philadelphia, PA",
    metrics: [
      { label: "Asking price", value: "Call for offers", flagged: false, page: "p. 2" },
      { label: "NOI (in-place)", value: "$2,000,000", flagged: false, page: "p. 8" },
      { label: "Units", value: "120", flagged: false, page: "p. 2" },
      ...more,
    ],
  });
  const drawFor = (ex: ExtractionResult, withSources = true) => {
    const d = deriveUnderwriteInputs(ex, ex.dealName!);
    const data: PlaygroundData = {
      inputs: d.inputs,
      dealAssetClass: "multifamily",
      checkSource: { assetClass: ex.assetClass, market: ex.market, metrics: ex.metrics },
      box: SAMPLE_DEMO_BOX,
      ...(withSources ? { sources: d.sources } : {}),
    };
    return { d, html: renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })) };
  };

  it("withholds a placeholder price's returns and max bid, says why over the tiles, and leaves the price to the reader", () => {
    const { d, html } = drawFor(unpricedRows());
    expect(d.sources.purchasePrice?.provenance).toBe("assumption");
    const text = textOf(html);
    expect(text).toContain(
      "The returns and the max bid are withheld: no price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns would be the placeholder's. Type the price you would pay above to run the model on it.",
    );
    // The placeholder's own IRR, which the tile had printed, is nowhere.
    const irr = computeUnderwrite(d.inputs).returns.leveredIrrPct!;
    expect(irr).toBeGreaterThan(0.5);
    expect(text).not.toContain(`${(irr * 100).toFixed(1)}%`);
    expect(text.match(/n\/a — no price/g)?.length).toBe(4);
    expect(html).not.toContain("Max bid");
    expect(html).not.toContain("Add an IRR");
    // The price field waits for the reader's figure: no placeholder in it,
    // and no cap struck on one.
    expect(html).not.toContain('value="$10,000,000"');
    expect(html).toMatch(/placeholder="Type a price"/);
    expect(text).toContain("no price was read — type the price you would pay");
    expect(text).not.toContain("at the modeled price");
    // The box scores the memorandum's own figures, never the placeholder's.
    const at = html.indexOf('data-qa="playground-fit"');
    expect(textOf(html.slice(html.indexOf(">", at) + 1))).toMatch(/mandate fit on the memorandum's figures/);
    expect(html).toMatch(/<p role="status" class="sr-only">Levered IRR withheld<\/p>/);
    // "These returns carry …" would name figures the card does not show.
    expect(html).not.toContain('data-qa="playground-costs"');
    expect(text).not.toContain("These returns carry");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("keeps an assumed NOI's returns withheld whatever price is typed, and names a leased fee's ground rent", () => {
    // A leased fee stating its rent and no cap: the model runs an assumed
    // 6% of the price, and typing a price cannot lift that.
    const fee: ExtractionResult = {
      ...unpricedRows(),
      interest: { kind: "leased_fee", summary: "", share: "", groundLease: "", loan: "", page: "" },
      metrics: [
        { label: "Asking price", value: "$15,000,000", flagged: false, page: "p. 2" },
        { label: "Ground rent", value: "$600,000", flagged: false, page: "p. 4" },
      ],
    };
    const { html } = drawFor(fee);
    const text = textOf(html);
    expect(text).toContain(
      "The returns and the max bid are withheld: the model does not run the memorandum's $600,000 ground rent as its year-1 income, so it runs on an assumed NOI and its returns would be the assumption's.",
    );
    expect(text).not.toContain("Type the price");
    expect(text.match(/n\/a — assumed NOI/g)?.length).toBe(4);
    // The price is the memorandum's, so it stands in its field.
    expect(html).toContain('value="$15,000,000"');
    expect(placeholderPageLine(deriveUnderwriteInputs(fee, "x").inputs, deriveUnderwriteInputs(fee, "x").sources, { priceEntered: true, maxBid: false })).toBe(
      "The returns are withheld: the model does not run the memorandum's $600,000 ground rent as its year-1 income, so it runs on an assumed NOI and its returns would be the assumption's.",
    );
  });

  // Research pass 34: on a note, a share beside its entity's loan and a
  // preferred equity position, the compare table and the first-draft card
  // withhold the model's returns, while the playground printed "Levered IRR
  // 52.0%" and "Cap on Yr-1 NOI (as modelled) 12.86%" bare.
  it("withholds the returns of a model whose price did not buy the building, with the first-draft card's own line", () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    const base = (interest: ExtractionResult["interest"], more: ExtractionResult["metrics"] = []): ExtractionResult => ({
      dealName: "Harbor View",
      assetClass: "multifamily",
      market: "Philadelphia, PA",
      interest,
      metrics: [
        { label: "Asking price", value: "$42,000,000", flagged: false, page: "p. 2" },
        { label: "NOI (in-place)", value: "$2,600,000", flagged: false, page: "p. 8" },
        { label: "Units", value: "200", flagged: false, page: "p. 2" },
        ...more,
      ],
    });
    const cases: [ExtractionResult, string][] = [
      [base({ ...blank, kind: "note" }), "note"],
      [base({ ...blank, kind: "partial_interest", share: "A 49% limited partnership interest" }, [{ label: "Entity loan balance", value: "$56,500,000", flagged: false, page: "p. 9" }]), "share"],
      [base({ ...blank, kind: "preferred_equity" }, [{ label: "Preferred equity amount", value: "$8,000,000", flagged: false, page: "p. 2" }]), "position"],
    ];
    for (const [ex, word] of cases) {
      const d = deriveUnderwriteInputs(ex, ex.dealName!);
      const noi = computeUnderwrite(d.inputs).cashFlow[0].noi;
      const interest = modelReturnsRead(ex, { purchasePrice: d.inputs.purchasePrice, year1Noi: noi, goingInCapPct: (noi / d.inputs.purchasePrice) * 100 });
      expect(interest.withheld, word).toBe(word);
      const data: PlaygroundData = {
        inputs: d.inputs,
        dealAssetClass: "multifamily",
        checkSource: { assetClass: ex.assetClass, market: ex.market, metrics: ex.metrics },
        box: SAMPLE_DEMO_BOX,
        sources: d.sources,
        interest,
      };
      const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
      const text = textOf(html);
      expect(text, word).toContain(`${interest.line!} The max bid, solved on them, is withheld too.`);
      // The four tiles; the cap field says it as its value (below).
      expect(text.match(new RegExp(`n/a — ${word}`, "g"))?.length, word).toBe(4);
      const irr = computeUnderwrite(d.inputs).returns.leveredIrrPct!;
      expect(text, word).not.toContain(`${(irr * 100).toFixed(1)}%`);
      expect(text, word).not.toContain(`${((noi / d.inputs.purchasePrice) * 100).toFixed(2)}%`);
      expect(html, word).toMatch(new RegExp(`<input readOnly=""[^>]*aria-label="Going-in cap scenario"[^>]*value="n/a — ${word}"`));
      expect(html, word).not.toContain("Max bid");
      expect(a11yIssues(html), word).toEqual([]);
      expect(gluedWords(text), word).toEqual([]);
    }
  });

  it("lifts a placeholder price's half once a price is typed, and draws a priced deal exactly as before", () => {
    const d = deriveUnderwriteInputs(unpricedRows(), "Unpriced Court");
    expect(placeholderPageLine(d.inputs, d.sources, { priceEntered: true, maxBid: true })).toBeNull();
    // The sample is priced from its memorandum: its sources change nothing.
    const sample = sampleProps(null) as unknown as { playground: PlaygroundData };
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name, {
      rentRoll: { summary: SAMPLE_DEAL.rentRoll.summary, asOf: SAMPLE_DEAL.rentRoll.as_of_date },
      t12: { summary: SAMPLE_DEAL.t12.summary, periodEnd: SAMPLE_DEAL.t12.period_end_date },
    });
    const without = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data: sample.playground }));
    const withSources = renderToStaticMarkup(
      React.createElement(SensitivityPlayground, { data: { ...sample.playground, sources: derived.sources } }),
    );
    expect(withSources).toBe(without);
    expect(withSources).not.toContain('data-qa="playground-withheld"');
    expect(textOf(withSources)).toContain("Max bid");
    // The returns it shows carry the costs the card names under them.
    expect(withSources).toContain('data-qa="playground-costs"');
    expect(textOf(withSources)).toContain("These returns carry");
  });
});

describe("DealView — the debt sizer reads the playground's model and the page's deal kind", () => {
  // Research pass 34: with no first-draft model the sizer seeded the OM's
  // in-place NOI beside a playground running the T-12's, and read the deal's
  // kind without the first signal the header reads.
  it("hands the sizer the screening model's sources, so it starts from the NOI the playground runs", () => {
    const p = sampleProps("financials") as unknown as Props & { playground: PlaygroundData };
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name, {
      rentRoll: { summary: SAMPLE_DEAL.rentRoll.summary, asOf: SAMPLE_DEAL.rentRoll.as_of_date },
      t12: { summary: SAMPLE_DEAL.t12.summary, periodEnd: SAMPLE_DEAL.t12.period_end_date },
    });
    const html = render({
      ...p,
      model: null,
      playground: { ...p.playground, inputs: derived.inputs, sources: derived.sources },
      dealStrategy: inferStrategy(SAMPLE_DEAL.extraction),
    } as Props);
    const noi = Math.round(computeUnderwrite(derived.inputs).cashFlow[0].noi).toLocaleString("en-US");
    expect(html).toMatch(new RegExp(`aria-label="Year-1 NOI"[^>]*value="\\$${noi}"`));
    expect(textOf(html)).toContain("NOI from the screening model the playground and the workbook run");
  });
});

describe("DealView — the LOI panel says what the download drafts", () => {
  it("hands the panel the terms the page read on the server, the LOI route's own reader (lib/loi-terms)", () => {
    // A deal of the reader's own on the Documents tab, where the panel sits.
    const html = render({
      ...sampleProps("documents"),
      isSample: false,
      isPro: true,
      loi: {
        plan: { kind: "conversion", label: "Conversion" },
        refusal: null,
        leasehold: null,
        seller: null,
        shortSale: null,
        properties: [],
        notes: [],
      },
    } as Props);
    // The panel's own section (the tab around it carries the OM controls).
    const at = html.lastIndexOf("<section", html.indexOf(">LOI draft<"));
    const panel = html.slice(at, html.indexOf("</section>", at) + "</section>".length);
    expect(panel).toMatch(/Download LOI draft/);
    expect(a11yIssues(panel)).toEqual([]);
    const text = textOf(panel);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/This deal is a conversion: the draft’s diligence clause covers/);
    expect(text).toMatch(/carries an entitlements contingency/);
  });

  it("a refused letter: the route's code lands as a banner in the panel's own sentence", () => {
    // What the LOI route redirects with on a note (lib/loi-refusal).
    const html = render({
      ...sampleProps("documents"),
      isSample: false,
      isPro: true,
      modelErrorCode: LOI_REFUSAL_CODE.note,
      loi: {
        plan: null,
        refusal: { kind: "note", sentence: LOI_REFUSAL.note },
        leasehold: null,
        seller: null,
        shortSale: null,
        properties: [],
        notes: [],
      },
    } as Props);
    const text = textOf(html);
    // Once in the banner, once in the panel, which offers no form.
    expect(text.split(LOI_REFUSAL.note).length - 1).toBe(2);
    expect(html).not.toMatch(/Download LOI draft/);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("DealView — the Model tab reads the price for what it buys", () => {
  it("hands the tab the page's read: a note's returns are withheld there, as the compare table withholds them", () => {
    const html = render({
      ...sampleProps("financials"),
      modelInterest: {
        tag: "Note",
        cap: null,
        noteYtmPct: 13.8,
        withheld: "note",
        share: false,
        line: "A note's price is a loan's: this model runs the collateral as if bought outright at it, so its cap and returns are the collateral's, not the note's, and are withheld.",
      },
    } as Props);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/A note's price is a loan's/);
    expect(text).toMatch(/Levered IRR\s*n\/a — note/);
    expect(text).toMatch(/Yield to maturity\s*13\.80%/);
  });

  it("and a preferred equity position's, with its yield to redemption in the cap's place (lib/position)", () => {
    const html = render({
      ...sampleProps("financials"),
      modelInterest: {
        tag: "Pref equity, 12% to Jun 2029",
        cap: null,
        noteYtmPct: 14.3,
        withheld: "position",
        share: false,
        line: "A preferred equity position's price is a position's: this model runs the whole building as if bought outright at it, so its cap and returns are the building's, not the position's, and are withheld.",
      },
    } as Props);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/A preferred equity position's price is a position's/);
    expect(text).toMatch(/Levered IRR\s*n\/a — position/);
    expect(text).toMatch(/Yield to redemption\s*14\.30%/);
    expect(text).not.toMatch(/Yield to maturity/);
  });
});

describe("DealView — Ask's thread on a team deal", () => {
  it("names who asked each question, from the names the page read, and links the current memorandum's pages", () => {
    const me = "11111111-1111-4111-8111-111111111111";
    const mate = "33333333-3333-4333-8333-333333333333";
    const html = render({
      ...sampleProps("overview"),
      isSample: false,
      hasOm: true,
      isPro: true,
      userId: me,
      omUrl: "/api/deals/d1/om",
      askerNames: { [mate]: "Jordan Lee" },
      qa: [
        { at: "2026-09-01T00:00:00.000Z", q: "What is the coupon?", answer: "4.25%, p. 12.", cites: [{ page: "p. 12", note: "loan terms" }], by: mate, earlier: false },
        { at: "2026-09-02T00:00:00.000Z", q: "Who is the seller?", answer: "A receiver.", cites: [], by: me, earlier: false },
      ],
    } as Props);
    const text = textOf(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toMatch(/What is the coupon\?\s*Sep 1 · asked by Jordan Lee/);
    expect(text).toMatch(/Who is the seller\?\s*Sep 2 · asked by you/);
    expect(html).toContain('href="/api/deals/d1/om#page=12"');
  });
});
