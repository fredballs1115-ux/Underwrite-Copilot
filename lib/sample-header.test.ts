// The sample's header, held to the deal page's own code path: what
// app/(app)/deals/[id]/page.tsx hands `DealHero` for the signed-in sample
// deal, read through the same readers (research pass on the homepage and
// /demo against the signed-in product, H1/H7: the homepage card had dropped
// "Sample — ", printed "$68M" where the header states "$68,000,000",
// hard-coded the deal type and took its cap from the first-draft model).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetClassLabel, shownAssetClass } from "./asset-class";
import { countNoun } from "./asset-words";
import { BUY_BOX_CHIP_CLS, buyBoxChipText, buyBoxRead, dealCheckSource } from "./buy-box-chip";
import { goingInCapFigure } from "./compare-interest";
import { buildingSfRow, findGoingInCap, screenYearOf } from "./criteria";
import { findPriceMetric, inferStrategy, planSummary, planWithBasisChecked, unitCountRow } from "./deal-strategy";
import { priceFigureOf } from "./hero-figure";
import { dealTypeLabel, interestTag } from "./interest";
import { countyOf, placeDeal } from "./market-county";
import { marketPictureFor } from "./market-picture";
import { HERO_AERIAL } from "./photos";
import { SKYLINES } from "./skyline";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "./sample-deal";
import { VERDICT_PILL, headerFacts, sampleHeader } from "./sample-header";
import { buildingFacts } from "./hero-figure";
import { yearBuiltRow } from "./criteria";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const AS_OF = new Date("2026-10-16T12:00:00Z");
const PAGE = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "page.tsx"), "utf8");
const OWN = readFileSync(join(__dirname, "sample-header.ts"), "utf8");
/** A source with its whitespace folded, so a re-wrapped line still matches. */
const fold = (s: string) => s.replace(/\s+/g, " ");

describe("the sample's header is the deal page's", () => {
  it("reads the sample the way the deal page reads it, figure for figure", () => {
    // The deal page's own expressions for the sample's row: no first signal
    // (the sample seeds none), the address it seeds, no screen running.
    const extraction = SAMPLE_DEAL.extraction;
    const metrics = extraction.metrics;
    const strategy = inferStrategy(extraction, null);
    const plan = planWithBasisChecked(extraction, strategy, planSummary(extraction, strategy));
    const shownClass = shownAssetClass(SAMPLE_DEAL.asset_class, extraction);
    const unitsRow = unitCountRow(metrics);
    const price = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? null;
    const tag = interestTag(extraction, AS_OF);
    const size =
      buildingSfRow(metrics)?.value ??
      (unitsRow && /^[\d,]+$/.test(unitsRow.value.trim()) ? `${unitsRow.value.trim()} ${countNoun(unitsRow.label, shownClass)}` : unitsRow?.value ?? null);
    const cap = plan ? null : (findGoingInCap(metrics)?.value ?? null);
    const box = buyBoxRead(SAMPLE_DEAL.asset_class, dealCheckSource(extraction, null, SAMPLE_DEAL.address), SAMPLE_DEMO_BOX);

    const h = sampleHeader(AS_OF);
    expect(h.title).toBe(SAMPLE_DEAL.name);
    expect(h.pill).toEqual(VERDICT_PILL[SAMPLE_DEAL.verdict.verdict]);
    expect(h.fit).toEqual({ label: buyBoxChipText(box.chip), cls: BUY_BOX_CHIP_CLS[box.chip.tone], note: box.chip.note });
    expect(h.subtitle).toBe(`${extraction.address || SAMPLE_DEAL.address.label} · ${assetClassLabel(shownClass)}`);
    expect(h.figures).toEqual([
      priceFigureOf(`Price${tag ? ` · ${tag}` : ""}`, price),
      { label: "Size", value: size, figure: true },
      { ...goingInCapFigure(extraction, cap, AS_OF), figure: true },
      { label: "Deal type", value: dealTypeLabel(strategy.label, extraction), title: strategy.summary || undefined },
    ]);
  });

  it("says what the signed-in sample's header says", () => {
    const h = sampleHeader(AS_OF);
    expect(h.title).toBe("Sample — The Maddox at Brewerytown");
    expect(h.pill).toEqual({ label: "Caution", cls: "bg-caution/10 text-caution" });
    expect(h.fit?.label).toBe("Fit 63 · Outside box · 3 of 5 checked");
    expect(h.fit?.cls).toBe(BUY_BOX_CHIP_CLS.kill);
    expect(h.subtitle).toBe("Brewerytown, Philadelphia, PA · Multifamily");
    // The price as stated, never the compact "$68M" the old card drew.
    expect(h.figures.map((f) => [f.label, f.value])).toEqual([
      ["Price", "$68,000,000"],
      ["Size", "248 units"],
      ["Going-in cap", "5.45%"],
      ["Deal type", "Stabilized"],
    ]);
  });

  it("wears the photograph the deal page places it under: its market's, Philadelphia's", () => {
    // The deal page places the deal through lib/market-county (by its
    // county where the site flags name one) and hands the placement to
    // marketPictureFor; the sample's neighbourhood address lands in
    // Philadelphia either way.
    const address = SAMPLE_DEAL.address;
    const placement = placeDeal(address, countyOf(address, null));
    const page = marketPictureFor(address, SAMPLE_DEAL.extraction.market ?? null, placement.briefed ?? placement.read, placement.county);
    const h = sampleHeader(AS_OF);
    expect(h.market).toEqual(page);
    expect(h.market?.id).toBe("philadelphia");
    // The homepage's hero band opens on the same city as the card in it,
    // named in the skyline table's own words.
    expect(HERO_AERIAL.metro).toBe(h.market?.id);
    expect(HERO_AERIAL.place).toBe(SKYLINES[HERO_AERIAL.metro].place);
  });

  it("judges no fit without a box and draws no call without a verdict", () => {
    const h = headerFacts({
      name: "x",
      storedAssetClass: "multifamily",
      extraction: SAMPLE_DEAL.extraction,
      firstSignal: null,
      address: null,
      verdict: null,
      box: null,
      asOf: AS_OF,
    });
    expect(h.pill).toBeNull();
    expect(h.fit).toBeNull();
  });
});

describe("the header's line of the building's own facts: the year built and today's occupancy, only where stated", () => {
  const STANDING = { screenYear: 2026, notYetDelivered: false };
  const stated = [
    { label: "Stabilized occupancy", value: "96%" },
    { label: "Year built", value: "1987 / renovated 2015" },
    { label: "Occupancy (current)", value: "94.5%" },
  ];

  it("reads each through the shared reader, the row as stated in its title — never the stabilized figure", () => {
    expect(buildingFacts(stated, STANDING)).toEqual([
      { label: "Year built", value: "1987", figure: true, title: "As stated: 1987 / renovated 2015" },
      { label: "Occupancy", value: "94.5%", figure: true, title: "As stated: Occupancy (current), 94.5%" },
    ]);
    // The rent rules read the same year off the same row.
    expect(yearBuiltRow(stated, 2026)?.year).toBe(1987);
    expect(buildingFacts([{ label: "Stabilized occupancy", value: "96%" }], STANDING)).toEqual([]);
    expect(buildingFacts(null, STANDING)).toEqual([]);
    // The sample states neither, so the homepage's card is as it was.
    expect(sampleHeader(AS_OF).facts).toEqual([]);
  });

  it("reads the year the building was built: never a renovation, a projection, an effective or average year, or a year not yet come", () => {
    const year = (label: string, value: string, screenYear = 2026) => yearBuiltRow([{ label, value }], screenYear)?.year ?? null;
    // The audit's probes.
    expect(year("Year built / renovated", "Renovated 2019 (originally built 1964)")).toBe(1964);
    expect(year("Year built", "2027 (projected delivery)")).toBeNull();
    expect(year("Year built", "Est. Q3 2028")).toBeNull();
    expect(year("Effective year built", "2005")).toBeNull();
    expect(year("Average year built", "1982")).toBeNull();
    expect(year("Weighted average year built", "1991")).toBeNull();
    // A renovation clause, either side of the year built.
    expect(year("Year built / renovated", "1964 / renovated 2019")).toBe(1964);
    expect(year("Year built", "1964 (renovated 2018–2019)")).toBe(1964);
    expect(year("Year built", "2019 renovation; built 1964")).toBe(1964);
    expect(year("Year built", "Built 1964, remodeled in 2015")).toBe(1964);
    expect(year("Year built", "Rehabbed 2017")).toBeNull();
    expect(year("Year built", "Under construction, delivery Q2 2027")).toBeNull();
    expect(year("Year built", "Expected completion 2026")).toBeNull();
    // A year after the screen's is not built yet; the screen's own year is.
    expect(year("Year built", "2027")).toBeNull();
    expect(year("Year built", "2026")).toBe(2026);
    expect(year("Year built", "2027", 2027)).toBe(2027);
    // An effective year beside the real one: the real one reads.
    expect(
      yearBuiltRow(
        [
          { label: "Effective year built", value: "2005" },
          { label: "Year built", value: "1982" },
        ],
        2026,
      )?.year,
    ).toBe(1982);
    // A building yet to be delivered has no year built on the header.
    expect(buildingFacts([{ label: "Year built", value: "1962" }], { screenYear: 2026, notYetDelivered: true })).toEqual([]);
    expect(buildingFacts([{ label: "Year built", value: "1962" }], STANDING).map((f) => f.value)).toEqual(["1962"]);
  });

  it("draws them on one line under the four tiles, a phone's header kept to its two rows of tiles", () => {
    const html = renderToStaticMarkup(
      React.createElement(DealHero, { title: "Elm Court", subtitle: "Baltimore, MD · Multifamily", figures: sampleHeader(AS_OF).figures, facts: buildingFacts(stated, STANDING) }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    const line = html.match(/<dl data-qa="hero-facts"[\s\S]*?<\/dl>/)?.[0] ?? "";
    expect(visibleText(line)).toMatch(/Year built\s*1987[\s\S]*Occupancy\s*94\.5%/);
    // Still four tiles.
    expect((html.match(/<dt class="line-clamp-2/g) ?? []).length).toBe(4);
    const none = renderToStaticMarkup(React.createElement(DealHero, { title: "x", subtitle: "y", figures: [], facts: [] }));
    expect(none).not.toContain('data-qa="hero-facts"');
  });
});

describe("the deal page still builds its header from the readers this module calls", () => {
  it("draws the call in the same words and classes", () => {
    const literal = /const VERDICT_PILL = \{([\s\S]*?)\} as const;/.exec(PAGE)?.[1];
    expect(literal, "the deal page's VERDICT_PILL").toBeTruthy();
    for (const [key, { label, cls }] of Object.entries(VERDICT_PILL)) {
      expect(fold(literal!)).toContain(`${key}: { label: "${label}", cls: "${cls}" }`);
    }
  });

  it("reads each figure through the same call", () => {
    // Each pair: the page's expression, then this module's. A page that
    // changes a reader fails here until this module follows it.
    const pairs: [string, string][] = [
      ["findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? signalAskPrice(firstSignal)", "findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? signalAskPrice(firstSignal)"],
      ["buildingSfRow(metrics)?.value ?? null", "buildingSfRow(metrics)?.value ?? null"],
      ["countNoun(sizeUnitsRow?.label, shownClass)", "countNoun(sizeUnitsRow?.label, shownClass)"],
      ["findGoingInCap(metrics)?.value ?? signalGoingInCap(firstSignal)?.text ?? null", "findGoingInCap(metrics)?.value ?? signalGoingInCap(firstSignal)?.text ?? null"],
      ["goingInCapFigure(extraction, summaryCap ?? null, readerNoon)", "goingInCapFigure(extraction, summaryCap ?? null, asOf)"],
      ['plan?.priceLabel === "Land cost" ? "Land cost" : "Price"', 'plan?.priceLabel === "Land cost" ? "Land cost" : "Price"'],
      ["interestTag(extraction, readerNoon)", "interestTag(extraction, asOf)"],
      ['strategy.kind === "unknown" ? null : dealTypeLabel(strategy.label, extraction)', 'strategy.kind === "unknown" ? null : dealTypeLabel(strategy.label, extraction)'],
      ["buyBoxChipText(boxRead.chip)", "buyBoxChipText(boxRead.chip)"],
      ["BUY_BOX_CHIP_CLS[boxRead.chip.tone]", "BUY_BOX_CHIP_CLS[boxRead.chip.tone]"],
      ['assetClassLabel(shownClass) || "Asset class not read yet"', 'assetClassLabel(shownClass) || "Asset class not read yet"'],
      ["extraction?.address || dealAddress?.label || extraction?.market || firstSignal?.market || null", "extraction?.address || input.address?.label || extraction?.market || firstSignal?.market || null"],
      ["marketPictureFor(dealAddress, extraction?.market ?? null,", "marketPictureFor(input.address, extraction?.market ?? null,"],
      ["label={dealAddress?.label ?? (deal.name as string)}", "pictureLabel: input.address?.label ?? input.name"],
      [
        "facts={buildingFacts(metrics, { screenYear: screenYearOf(extraction), notYetDelivered: notYetDelivered(strategy.kind) })}",
        "facts: buildingFacts(metrics, { screenYear: screenYearOf(extraction), notYetDelivered: notYetDelivered(strategy.kind) })",
      ],
    ];
    for (const [page, own] of pairs) {
      expect(fold(PAGE), page).toContain(page);
      expect(fold(OWN), own).toContain(own);
    }
  });

  it("hands DealHero the four figures in the same order", () => {
    const at = fold(PAGE).indexOf("figures={[");
    expect(at).toBeGreaterThan(-1);
    const list = fold(PAGE).slice(at, fold(PAGE).indexOf("]}", at));
    expect(list).toMatch(/priceFigure, \{ label: "Size", value: summarySize \?\? null, figure: true \}, returnFigure, \{ label: "Deal type", value: summaryStrategy \?\? null, title: strategy\.summary \|\| undefined \},?/);
  });
});
