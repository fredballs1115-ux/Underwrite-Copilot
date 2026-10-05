// Render tests for the deal page's debt sizer (Financials tab): where its
// starting figures come from, said where a reader sees them. Plain React on
// pure math, so a static server render reads the field values and the
// sentences beside them.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { DebtIndex } from "@/lib/debt-index";
import { DebtSizer } from "@/app/(app)/deals/[id]/debt-sizer";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { FLAT_SIZER_RATE_PCT, sizerStartingRate } from "@/lib/sizer-terms";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const OM: ExtractionResult = {
  dealName: "Harbor Point Apartments",
  assetClass: "multifamily",
  market: "Baltimore, MD",
  address: "100 Harbor Point Dr, Baltimore, MD",
  metrics: [
    { label: "Asking price", value: "$40,000,000", flagged: false, page: "p. 3" },
    { label: "NOI (in-place)", value: "$2,400,000", flagged: false, page: "p. 8" },
    { label: "Units", value: "200", flagged: false, page: "p. 3" },
  ],
};

/** The 5-year Treasury as the runner's own table printed it (lib/live-rates.fixture.ts). */
const FIVE: DebtIndex = { id: "DGS5", short: "5-yr", pct: 4.78, asOf: "2026-09-17", kind: "treasury" };

type SizerProps = Parameters<typeof DebtSizer>[0];
const render = (p: SizerProps) => renderToStaticMarkup(React.createElement(DebtSizer, p));

/** An input's value, read off its tag whatever the attributes' order. */
function inputValue(html: string, ariaLabel: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*aria-label="${ariaLabel}"[^>]*>`))?.[0] ?? "";
  return tag.match(/value="([^"]*)"/)?.[1] ?? null;
}

function clean(html: string) {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
}

describe("the debt sizer's starting rate is the model's, on a day the table seeds nothing", () => {
  it("starts from the derived screening model's own rate — the workbook's and the report's — and says it is a placeholder", () => {
    // A stale rates table: the model keeps its flat default and no seed.
    const derived = deriveUnderwriteInputs(OM, "Harbor Point Apartments");
    expect(derived.meta.rateSeed).toBeNull();
    const html = render({ model: null, extraction: OM, underwrite: derived.inputs, rateSeeds: null });
    clean(html);
    // One rate for one loan: the figure the workbook's AllInRate cell holds.
    expect(Number(inputValue(html, "Interest rate percent"))).toBeCloseTo(derived.inputs.allInRatePct * 100, 10);
    expect(inputValue(html, "Interest rate percent")).toBe("6");
    expect(visibleText(html)).toContain(
      "Rate starts from the screening model's 6.00% placeholder — no fresh index seeded it; enter your quote.",
    );
  });

  it("on land, says the model carries no permanent loan to seed — never that the table was stale", () => {
    const land: ExtractionResult = { ...OM, assetClass: "land_infill" as ExtractionResult["assetClass"] };
    const derived = deriveUnderwriteInputs(land, "Harbor Point land", undefined, { debtIndex: FIVE });
    expect(derived.meta.rateSeed).toBeNull();
    const html = render({ model: null, extraction: land, underwrite: derived.inputs, rateSeeds: null });
    clean(html);
    expect(inputValue(html, "Interest rate percent")).toBe("6");
    const text = visibleText(html);
    expect(text).toContain(
      "Rate starts from the screening model's 6.00% placeholder — land carries no permanent loan to seed a rate from; enter the land loan's rate.",
    );
    expect(text).not.toContain("no fresh index");
  });

  it("keeps a flat placeholder only where there is no derived model at all, and labels it as one", () => {
    const html = render({ model: null, extraction: null, underwrite: null, rateSeeds: null });
    clean(html);
    expect(inputValue(html, "Interest rate percent")).toBe(String(FLAT_SIZER_RATE_PCT));
    expect(visibleText(html)).toContain(
      "Rate starts from a flat 6.50% placeholder — there is no screening model to start from; enter your quote.",
    );
  });

  it("a fresh seed still starts it, with the seed's own dated note — the model's seeded rate, so the two agree", () => {
    const derived = deriveUnderwriteInputs(OM, "Harbor Point Apartments", undefined, { debtIndex: FIVE });
    const seed = derived.meta.rateSeed!;
    expect(seed.pct).toBe(6.78);
    const html = render({ model: null, extraction: OM, underwrite: derived.inputs, rateSeeds: { permanent: seed, construction: null } });
    clean(html);
    expect(inputValue(html, "Interest rate percent")).toBe("6.78");
    expect(Number(inputValue(html, "Interest rate percent"))).toBeCloseTo(derived.inputs.allInRatePct * 100, 10);
    expect(visibleText(html)).toContain(
      "Rate seeded from the live curve: 5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps multifamily spread, a screening default — enter your quote.",
    );
    expect(visibleText(html)).not.toContain("placeholder");
  });

  it("a rate a loan's own paper states outranks the model's placeholder and needs no placeholder note", () => {
    // The sample's first-draft model states 6.00% from its term sheet; at
    // 5.25% it is plainly not the derived model's 6.00%.
    const model = {
      ...SAMPLE_DEAL.model,
      inputs: { ...SAMPLE_DEAL.model.inputs, loan: { ...SAMPLE_DEAL.model.inputs.loan!, ratePct: 5.25 } },
      metrics: SAMPLE_DEAL.model.metrics.map((m) =>
        m.key === "rate" ? { ...m, chosenValue: "5.25%", sources: [{ ...m.sources[0], value: "5.25%" }] } : m,
      ),
    };
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    const html = render({ model, extraction: SAMPLE_DEAL.extraction, underwrite: derived.inputs, rateSeeds: null });
    clean(html);
    expect(inputValue(html, "Interest rate percent")).toBe("5.25");
    expect(visibleText(html)).not.toContain("placeholder");
  });
});

describe("the debt sizer's opening sentence names where its starting figures come from", () => {
  // It had said "its figures start from the OM's" (or "the first-draft
  // model's") over a 65% LTV, a 1.25x DSCR and an 8% debt yield that are
  // neither — and over a 30-year amortization the OM never stated.
  const opening = (html: string) => html.match(/<p class="text-sm text-muted">([^<]*)<\/p>/)?.[1] ?? "";

  it("from the OM: the price and NOI as the OM's, the amortization and the lender tests as screening defaults", () => {
    const html = render({ model: null, extraction: OM, underwrite: deriveUnderwriteInputs(OM, "Harbor Point Apartments").inputs, rateSeeds: null });
    clean(html);
    expect(opening(html)).toBe(
      "Price and NOI from the OM; the amortization and lender tests are screening defaults — replace them with a lender&#x27;s terms.",
    );
    expect(visibleText(html)).not.toContain("its figures start from");
    // The defaults the sentence names are the ones the fields start at.
    expect(inputValue(html, "Maximum loan to value percent")).toBe("65");
    expect(inputValue(html, "Minimum debt service coverage ratio")).toBe("1.25");
    expect(inputValue(html, "Minimum debt yield percent")).toBe("8");
    expect(inputValue(html, "Amortization years")).toBe("30");
  });

  it("names only what the OM gave: a price with no NOI is the price alone", () => {
    const priceOnly: ExtractionResult = { ...OM, metrics: OM.metrics.filter((m) => !/NOI/.test(m.label)) };
    const html = render({ model: null, extraction: priceOnly, underwrite: null, rateSeeds: null });
    expect(opening(html)).toBe(
      "Price from the OM; the amortization and lender tests are screening defaults — replace them with a lender&#x27;s terms.",
    );
  });

  it("from the first-draft model: its price, NOI, stated rate and amortization, and the lender tests as defaults", () => {
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    const html = render({ model: SAMPLE_DEAL.model, extraction: SAMPLE_DEAL.extraction, underwrite: derived.inputs, rateSeeds: null });
    clean(html);
    expect(opening(html)).toBe(
      "Price, NOI, rate and amortization from the first-draft model; the lender tests are screening defaults — replace them with a lender&#x27;s terms.",
    );
  });

  it("a first-draft model whose rate no document states keeps the rate out of the model's list — its note says what it is", () => {
    const assumed = {
      ...SAMPLE_DEAL.model,
      metrics: SAMPLE_DEAL.model.metrics.map((m) => (m.key === "rate" ? { ...m, authority: "Market", sources: [{ ...m.sources[0], doc: "Market" }] } : m)),
    };
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    const html = render({ model: assumed, extraction: SAMPLE_DEAL.extraction, underwrite: derived.inputs, rateSeeds: null });
    expect(opening(html)).toBe(
      "Price, NOI and amortization from the first-draft model; the lender tests are screening defaults — replace them with a lender&#x27;s terms.",
    );
    expect(visibleText(html)).toContain("Rate starts from the screening model's 6.00% placeholder");
  });

  it("with nothing to start from, asks for the deal's figures and still names the defaults", () => {
    const html = render({ model: null, extraction: null, underwrite: null, rateSeeds: null });
    expect(opening(html)).toBe(
      "Enter the deal&#x27;s figures; the amortization and lender tests are screening defaults — replace them with a lender&#x27;s terms.",
    );
  });
});

describe("sizerStartingRate — the precedence, one rule", () => {
  const seed = { pct: 6.78, note: "5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps multifamily spread, a screening default — enter your quote" };
  it("stated, then the seed, then the model's own rate, then the flat placeholder", () => {
    expect(sizerStartingRate({ statedPct: 5.25, seed, modelRateDec: 0.0678, operating: true })).toEqual({ pct: 5.25, from: "stated", note: null });
    expect(sizerStartingRate({ statedPct: null, seed, modelRateDec: 0.0678, operating: true }).from).toBe("seed");
    // Decimals in, a percent out, to two places (0.0703 × 100 is 7.030000000000001).
    expect(sizerStartingRate({ statedPct: null, seed: null, modelRateDec: 0.0703, operating: true }).pct).toBe(7.03);
    expect(sizerStartingRate({ statedPct: null, seed: null, modelRateDec: null, operating: true })).toMatchObject({
      pct: FLAT_SIZER_RATE_PCT,
      from: "flat",
    });
    // A model rate that is no rate is no starting point.
    expect(sizerStartingRate({ statedPct: null, seed: null, modelRateDec: Number.NaN, operating: true }).from).toBe("flat");
  });
});
