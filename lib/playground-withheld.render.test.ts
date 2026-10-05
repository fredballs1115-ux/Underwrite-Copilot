// The deal page's sensitivity playground on research pass 38's fixtures:
// figures no building could have, struck at rest on the page beside a report
// that read the same deal another way. Each case renders the playground the
// way the deal page builds its data, and asserts the page agrees with the
// report or withholds the figure with its sentence.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { buildSensitivityData, maxBidSentence, nearlyVacantReason } from "@/lib/underwrite/report-grid";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
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
