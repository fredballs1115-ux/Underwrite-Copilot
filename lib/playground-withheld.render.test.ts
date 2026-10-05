// The deal page's sensitivity playground on research pass 38's fixtures:
// figures no building could have, struck at rest on the page beside a report
// that read the same deal another way. Each case renders the playground the
// way the deal page builds its data, and asserts the page agrees with the
// report or withholds the figure with its sentence.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { buildSensitivityData, maxBidSentence, nearlyVacantReason, screeningCompareModel } from "@/lib/underwrite/report-grid";
import { modelReturnsRead, withheldWord } from "@/lib/compare-interest";
import { compareReturns } from "@/lib/compare-figures";
import { leaseholdExitSentence, readLeaseholdExit } from "@/lib/leasehold-exit";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { DebtSizer } from "@/app/(app)/deals/[id]/debt-sizer";
import { ReturnsHeadline } from "@/app/(app)/deals/[id]/model-view";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { a11yIssues, gluedWords, visibleText as textOf } from "./render-lint";

/** A fixture as the pass wrote it: the rows, each on a page, with a basis
 *  where the pass gave one. */
const deal = (assetClass: string, rows: [string, string, string?][], more: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "1200 Corporate Drive",
  assetClass,
  market: "",
  metrics: rows.map(([label, value, basis]) => ({ label, value, flagged: false, page: "p. 3", ...(basis ? { basis: basis as "in_place" } : {}) })),
  ...more,
});

/** The playground's data as the deal page builds it from the derived model. */
const drawn = (ex: ExtractionResult, extra: Partial<PlaygroundData> = {}) => {
  const d = deriveUnderwriteInputs(ex, ex.dealName!);
  const data: PlaygroundData = {
    inputs: d.inputs,
    dealAssetClass: ex.assetClass ?? "auto",
    checkSource: { assetClass: ex.assetClass, market: ex.market, metrics: ex.metrics },
    box: SAMPLE_DEMO_BOX,
    sources: d.sources,
    occupancyPct: d.meta.occupancyPct,
    ...extra,
  };
  const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
  return { d, html, text: textOf(html) };
};

/** The cap field's value as drawn. */
const capField = (html: string) => html.match(/<input[^>]*aria-label="Going-in cap scenario"[^>]*value="([^"]*)"/)?.[1] ?? null;

describe("a building the model runs nearly vacant (research pass 38, item 1)", () => {
  // A vacant office at a stated 7.00% cap: the model's NOI is the price times
  // the cap, its rent line that grossed up through its 99% vacancy.
  const OCC0_CAP = deal("Office", [["Asking price", "8,500,000"], ["Total SF", "42,000 SF"], ["Occupancy", "0%", "in_place"], ["Cap rate", "7.00%"]]);

  it("withholds the tiles, the cap on year-1 NOI and the max bid with one sentence, where the page had printed 160.2%", () => {
    const { d, html, text } = drawn(OCC0_CAP);
    const reason = nearlyVacantReason(d.inputs, d.meta.occupancyPct)!;
    expect(text).toContain(`The returns, the cap on year-1 NOI and the max bid are withheld: ${reason}`);
    expect(text.match(/n\/a — 99% vacant/g)?.length).toBe(4);
    // The pass's page: 160.2%, 28.47x, 129.9%, 13.28x and a 57.91% cap field.
    for (const figure of ["160.2%", "28.47x", "129.9%", "13.28x", "57.91%"]) expect(text).not.toContain(figure);
    expect(capField(html)).toBe("n/a — 99% vacant");
    expect(html).not.toContain("Max bid");
    // The report's max bid says the same reason in its place.
    const report = buildSensitivityData(d.inputs, null, { sources: d.sources, occupancyPct: d.meta.occupancyPct });
    expect(maxBidSentence(report)).toBe(`No max bid: ${reason}`);
    // The fit chip scores the memorandum's figures, never these returns.
    const at = html.indexOf('data-qa="playground-fit"');
    expect(textOf(html.slice(html.indexOf(">", at) + 1))).toMatch(/mandate fit on the memorandum's figures/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("says the stated 3% where the memorandum states it", () => {
    const { text } = drawn(deal("Office", [["Asking price", "8,500,000"], ["Total SF", "42,000 SF"], ["Occupancy", "3%", "in_place"], ["NOI (in-place)", "45,000", "in_place"]]));
    expect(text).toContain("stated 3% occupied, the model's rent line is that space's revenue grossed up through 97% vacancy");
    expect(text.match(/n\/a — 97% vacant/g)?.length).toBe(4);
  });
});

describe("figures the plausibility check finds do not tie withhold the tiles (research pass 38, item 4)", () => {
  // A retail strip whose NOI the memorandum states a month at a time: the
  // model ran it as a year's, and the page printed "Equity multiple −1.53x"
  // and "Year-1 DSCR 0.16x" with no finding.
  const MONTHLY = deal("Retail", [["Asking price", "6,500,000"], ["NOI (monthly)", "45,000", "in_place"], ["Total SF", "28,000 SF"]]);

  it("withholds the tiles and the max bid with the finding's own claim, as a placeholder's are", () => {
    const findings = assessPlausibility(MONTHLY, inferStrategy(MONTHLY));
    expect(findings.map((f) => f.code)).toEqual(["implied_cap_low"]);
    const { d, html, text } = drawn(MONTHLY, { findings });
    expect(text).toContain(
      "The returns and the max bid are withheld: NOI (monthly) of $45k implies a 0.69% cap rate on the $6.5M price, and returns built on figures that do not tie would be a misread's.",
    );
    expect(text.match(/n\/a — figures don't tie/g)?.length).toBe(4);
    const r = computeUnderwrite(d.inputs);
    expect(r.returns.leveredEquityMultiple!).toBeLessThan(0);
    for (const figure of ["−1.53x", "-1.53x", "0.16x", "−9.6%", "-9.6%"]) expect(text).not.toContain(figure);
    expect(html).not.toContain("Max bid");
    expect(html).not.toContain('data-qa="playground-dscr-test"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("leaves a building whose figures tie exactly as before", () => {
    const priced = deal("Retail", [["Asking price", "6,500,000"], ["NOI (in-place)", "520,000", "in_place"], ["Total SF", "28,000 SF"]]);
    const findings = assessPlausibility(priced, inferStrategy(priced));
    expect(findings).toEqual([]);
    expect(drawn(priced, { findings }).html).toBe(drawn(priced).html);
  });
});

describe("the cap field never strikes a cap on an assumed NOI (research pass 38, C3)", () => {
  it("says the NOI is assumed where an assumed 6% printed 6.00%", () => {
    // A priced building that states no NOI and no cap: the model assumes 6%.
    const { d, html } = drawn(deal("Multifamily", [["Asking price", "18,000,000"], ["Units", "96"]]));
    expect(d.sources.inPlaceRentAnnual?.provenance).toBe("assumption");
    expect((computeUnderwrite(d.inputs).cashFlow[0].noi / d.inputs.purchasePrice) * 100).toBeCloseTo(6, 6);
    expect(capField(html)).toBe("n/a — assumed NOI");
    expect(html).toMatch(/<input readOnly=""[^>]*aria-label="Going-in cap scenario"/);
    // The price is the memorandum's, and still a field to type in.
    expect(html).toContain('value="$18,000,000"');
  });

  it("says it on a vacant building that states neither, where the field printed 49.64%", () => {
    const { html, text } = drawn(deal("Office", [["Asking price", "8,500,000"], ["Total SF", "42,000 SF"], ["Occupancy", "0%", "in_place"], ["Year built", "1999"]]));
    expect(capField(html)).toBe("n/a — assumed NOI");
    expect(text).not.toContain("49.64%");
    expect(html).not.toContain("49.64%");
    // One sentence: the assumed NOI's, the more basic reason.
    expect(text).toContain("The returns and the max bid are withheld: no year-1 NOI the model could run on was read from the memorandum");
    expect(text).not.toContain("the cap on year-1 NOI and the max bid are withheld");
  });
});

describe("an NOI of zero or less beside a stated cap: the price × the cap is an assumption (research pass 38, item 8)", () => {
  // The pass's fixture: a 3%-occupied office whose memorandum states an NOI
  // of −$310,000 and a 7.25% cap. The model runs the price × the cap,
  // $616,250 — unchanged — and the report had printed a 13.31% IRR on it,
  // the debt sizer a loan, the finding in another card.
  const OCC3_NEG_CAP = deal("Office", [
    ["Asking price", "8,500,000"],
    ["Total SF", "42,000 SF"],
    ["Occupancy", "3%", "in_place"],
    ["NOI (in-place)", "(310,000)", "in_place"],
    ["Cap rate", "7.25%"],
  ]);
  // …and the same building with no occupancy stated, so nothing else withholds.
  const NEG_CAP = { ...OCC3_NEG_CAP, metrics: OCC3_NEG_CAP.metrics.filter((m) => m.label !== "Occupancy") };
  const REASON =
    "the model does not run the memorandum's −$310,000 NOI (in-place) as its year-1 income, so it runs on an assumed NOI and its returns would be the assumption's.";

  it("runs the model unchanged, and names the memorandum's figure with its minus outside the dollar", () => {
    for (const ex of [OCC3_NEG_CAP, NEG_CAP]) {
      const d = deriveUnderwriteInputs(ex, "x");
      const r = computeUnderwrite(d.inputs);
      expect(r.cashFlow[0].noi).toBeCloseTo(616_250, 4);
      expect(r.returns.leveredIrrPct).toBeCloseTo(0.13312635, 6);
      expect(d.sources.inPlaceRentAnnual).toEqual({
        provenance: "assumption",
        note: "The OM's NOI (in-place) is −$310,000 — no income in place to anchor year 1 on. Year-1 NOI set from price × the stated going-in cap instead",
        notRun: { label: "NOI (in-place)", value: -310_000 },
      });
    }
    // A stated NOI the price cannot support, above the ceiling, is a misread
    // the cap stands in for: still derived, its returns standing.
    const high = deriveUnderwriteInputs(deal("Office", [["Asking price", "8,500,000"], ["NOI (in-place)", "3,400,000", "in_place"], ["Cap rate", "7.25%"]]), "x");
    expect(high.sources.inPlaceRentAnnual?.provenance).toBe("derived");
    expect(buildSensitivityData(high.inputs, null, { sources: high.sources }).withheld).toBeNull();
  });

  it("withholds the page's tiles, the cap field and the report's grids with one reason — where both had printed 13.31%", () => {
    for (const ex of [OCC3_NEG_CAP, NEG_CAP]) {
      const { d, html, text } = drawn(ex);
      expect(text).toContain(`The returns and the max bid are withheld: ${REASON}`);
      expect(text.match(/n\/a — assumed NOI/g)?.length).toBe(4);
      expect(capField(html)).toBe("n/a — assumed NOI");
      // The pass's report base case: 13.31% IRR, DSCR 1.66x, CoC 6.31%.
      for (const figure of ["13.3%", "1.66x", "6.3%"]) expect(text, figure).not.toContain(figure);
      expect(text).not.toContain("$-310,000");
      const report = buildSensitivityData(d.inputs, 15, { sources: d.sources, occupancyPct: d.meta.occupancyPct });
      expect(report.withheld).toBe(`The IRR grids and the max bid are left out: ${REASON}`);
      expect(a11yIssues(html)).toEqual([]);
      expect(gluedWords(text)).toEqual([]);
    }
  });

  it("seeds the debt sizer no NOI from it", () => {
    for (const ex of [OCC3_NEG_CAP, NEG_CAP]) {
      const d = deriveUnderwriteInputs(ex, "x");
      const html = renderToStaticMarkup(
        React.createElement(DebtSizer, { model: null, extraction: ex, underwrite: d.inputs, underwriteSources: d.sources, rateSeeds: null }),
      );
      const noiField = html.match(/<input[^>]*aria-label="Year-1 NOI"[^>]*>/)?.[0] ?? "";
      expect(noiField).not.toBe("");
      expect(noiField.match(/value="([^"]*)"/)?.[1]).toBe("");
      expect(html).not.toContain("$616,250");
      expect(textOf(html)).not.toContain("NOI from the screening model");
    }
  });
});

describe("a leasehold whose lease ends inside the hold has no sale to return on (research pass 38, item 9)", () => {
  // The pass's fixture: a retail leasehold, $12M at a stated 9.17% cap, its
  // ground lease ending December 31, 2028 with no options. Page and report
  // printed "Levered IRR 17.7%", a 2.01x multiple and a max bid of $12.6M
  // (+5.0%), each on a year-5 sale of a building that reverted in year 3.
  const AS_OF = new Date("2026-10-05T12:00:00Z");
  const LEASE2 = deal(
    "Retail",
    [
      ["Asking price", "12,000,000"],
      ["NOI (in-place)", "1,100,000", "in_place"],
      ["Going-in cap rate", "9.17%"],
      ["Total SF", "64,000 SF"],
      ["Ground lease expiration", "December 31, 2028"],
    ],
    { interest: { kind: "leasehold", summary: "Leasehold interest under a ground lease", share: "", groundLease: "Ground lease expires December 31, 2028; no extension options", loan: "", page: "p. 4" } },
  );
  const SENTENCE =
    "The ground lease ends Dec 2028, in year 3 of the model's 5-year hold: the building reverts to the landowner before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.";
  const d = deriveUnderwriteInputs(LEASE2, LEASE2.dealName!);
  const read = modelReturnsRead(LEASE2, screeningCompareModel(d.inputs), AS_OF);

  it("withholds the page's tiles and its max bid over the leasehold card's own sentence; the cap stands", () => {
    // The card's sentence and the read's are one.
    expect(leaseholdExitSentence(readLeaseholdExit(LEASE2, d.inputs, AS_OF)!)).toBe(SENTENCE);
    expect(read).toMatchObject({ withheld: "lease", word: "lease ends in year 3", line: SENTENCE });
    const { html, text } = drawn(LEASE2, { interest: read });
    expect(text).toContain(`${SENTENCE} The max bid, solved on them, is withheld too.`);
    expect(text.match(/n\/a — lease ends in year 3/g)?.length).toBe(4);
    for (const figure of ["17.7%", "2.01x", "$12.6M", "+5.0%"]) expect(text, figure).not.toContain(figure);
    expect(html).not.toContain("Max bid");
    // Year 1 is inside the lease: the cap on it stands, at the model's figure.
    expect(capField(html)).toBe("9.17%");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("leaves the report's grids and max bid out over the same sentence", () => {
    const report = buildSensitivityData(d.inputs, 15, { sources: d.sources, occupancyPct: d.meta.occupancyPct, interest: read });
    expect(report.withheld).toBe(`The IRR grids and the max bid are left out. ${SENTENCE}`);
    // Without the read, the grids stood, as before.
    expect(buildSensitivityData(d.inputs, 15, { sources: d.sources }).withheld).toBeNull();
  });

  it("says it on the first-draft model's card and the compare table, by that model's own hold", () => {
    const model = { ...SAMPLE_DEAL.model!, holdYears: 5 };
    const card = renderToStaticMarkup(
      React.createElement(ReturnsHeadline, { model, interest: modelReturnsRead(LEASE2, { ...model.returns, holdYears: model.holdYears }, AS_OF) }),
    );
    expect(textOf(card)).toContain(SENTENCE);
    expect(textOf(card).match(/n\/a — lease ends in year 3/g)?.length).toBe(3);
    // A model held ten years would sell it in year 10, after the reversion too;
    // the compare table's cells say so by that hold.
    const figs = compareReturns(LEASE2, { ...screeningCompareModel(d.inputs), holdYears: 5 }, inferStrategy(LEASE2), AS_OF);
    expect(figs).toMatchObject({ withheld: "lease" });
    expect(withheldWord(figs)).toBe("lease ends in year 3");
    const col: Col = {
      id: "lease2",
      name: "Plaza Shops (leasehold)",
      assetClass: "retail",
      market: "",
      coveredMarket: null,
      verdict: null,
      reason: null,
      hasModel: true,
      fit: null,
      fitNote: null,
      strategy: "Stabilized",
      planDeal: false,
      irr: null,
      em: null,
      coc: null,
      cap: figs.cap,
      yoc: null,
      leverage: null,
      price: "$12,000,000",
      noi: "$1,100,000",
      withheld: figs.withheld,
      withheldWord: withheldWord(figs),
    };
    // The table's three return rows (the phone's cards say them again).
    const html = renderToStaticMarkup(React.createElement(CompareTable, { cols: [col] }));
    const table = textOf(html.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? "");
    expect(table.match(/n\/a — lease ends in year 3/g)?.length).toBe(3);
  });
});
