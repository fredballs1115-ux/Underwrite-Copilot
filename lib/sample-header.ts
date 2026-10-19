// The deal header's facts — the name, the call, the buy-box fit, the
// subtitle, the four figures and the market's photograph — built through the
// deal page's own readers, so a public page that draws the sample's header
// (the homepage's hero card, /demo's summary) draws exactly what the
// signed-in sample deal shows (app/(app)/deals/[id]/page.tsx, the lines
// that build `DealHero`'s props).
//
// Pure: no I/O, no clock unless the caller gives none. The deal page reads
// the same readers in the same order; lib/sample-header.test.ts holds this
// module to that page's code path, and its source to the readers it calls.

import type { StructuredAddress } from "@/lib/address";
import type { ExtractionResult, FirstSignal, VerdictResult } from "@/lib/anthropic/types";
import { assetClassLabel, shownAssetClass } from "@/lib/asset-class";
import { countNoun } from "@/lib/asset-words";
import { BUY_BOX_CHIP_CLS, buyBoxChipText, buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { goingInCapFigure } from "@/lib/compare-interest";
import { type BuyBox, buildingSfRow, findGoingInCap, screenYearOf } from "@/lib/criteria";
import {
  findPriceMetric,
  inferStrategy,
  notYetDelivered,
  planSummary,
  planWithBasisChecked,
  signalAskPrice,
  signalGoingInCap,
  unitCountRow,
} from "@/lib/deal-strategy";
import { type FigureHow, type HeroFigure, buildingFacts, priceFigureOf } from "@/lib/hero-figure";
import { fitHow, heroHow } from "@/lib/hero-how";
import { typedByHand } from "@/lib/manual-deal";
import { dealTypeLabel, interestTag } from "@/lib/interest";
import { type MarketPicture, marketPictureFor } from "@/lib/market-picture";
import { yieldOnCostText } from "@/lib/plan-facts";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";

/** The call's chip as the deal header draws it (the deal page's
 *  `VERDICT_PILL`, word for word and class for class). */
export const VERDICT_PILL = {
  pass: { label: "Go", cls: "bg-pass/10 text-pass" },
  caution: { label: "Caution", cls: "bg-caution/10 text-caution" },
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
} as const;

/** A chip beside the deal's name: its words, its tone's classes and, where
 *  it has one, the tooltip that says what it stands on. */
export interface HeaderChip {
  label: string;
  cls: string;
  note?: string;
  /** how the chip is read, opened from it (lib/hero-how `fitHow`): the
   *  buy-box fit's criteria and their lines */
  how?: FigureHow;
}

/** Everything `DealHero` is handed but the picture's markup and the tools. */
export interface HeaderFacts {
  title: string;
  /** the call, null before a verdict */
  pill: HeaderChip | null;
  /** the buy-box fit against the box given, null without one */
  fit: HeaderChip | null;
  /** the address line, then the asset class as the label map says it */
  subtitle: string;
  figures: HeroFigure[];
  /** the year built and today's occupancy, only where the memorandum
   *  states them (lib/hero-figure `buildingFacts`) */
  facts: HeroFigure[];
  /** the photograph the deal's market is known by, which leads the picture
   *  where the building has none of its own (#439) */
  market: MarketPicture | null;
  /** what the picture is of, for a screen reader (property-visual's
   *  `label`): the address line, else the deal's name */
  pictureLabel: string;
}

export interface HeaderInput {
  name: string;
  storedAssetClass: string | null;
  extraction: ExtractionResult | null;
  firstSignal: FirstSignal | null;
  address: Partial<StructuredAddress> | null;
  verdict: VerdictResult | null;
  /** the buy box the fit is judged against */
  box: BuyBox | null;
  /** the day the header is read on (the price tag's and a note's cap
   *  slot's dates); the deal page passes the reader's noon */
  asOf: Date;
  /** where a server page has placed the deal (lib/market-county
   *  `placeDeal`); unset, the address matchers' own answer */
  placed?: { id: string; name: string } | null;
  county?: { cbsa: string | null; area: string | null } | null;
}

/**
 * The header's facts, read the way the deal page reads them: the price row
 * through `findPriceMetric` and `priceFigureOf` (with what the price buys
 * beside "Price"), the building's area or its count in its own noun, the
 * going-in cap (or a plan deal's yield on cost) through `goingInCapFigure`,
 * the deal type through `dealTypeLabel`, the call through `VERDICT_PILL` and
 * the fit through lib/buy-box-chip.
 */
export function headerFacts(input: HeaderInput): HeaderFacts {
  const { extraction, firstSignal, asOf } = input;
  const metrics = extraction?.metrics ?? [];
  const strategy = inferStrategy(extraction, firstSignal);
  const plan = planWithBasisChecked(extraction, strategy, planSummary(extraction, strategy));
  const summaryStrategy = strategy.kind === "unknown" ? null : dealTypeLabel(strategy.label, extraction);

  const priceRow = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction));
  const summaryPrice = priceRow?.value ?? signalAskPrice(firstSignal);
  const sizeSfRow = buildingSfRow(metrics);
  const sizeSf = sizeSfRow?.value ?? null;
  const sizeUnitsRow = unitCountRow(metrics);
  const sizeUnits = sizeUnitsRow?.value ?? null;
  const shownClass = shownAssetClass(input.storedAssetClass, extraction);
  const summarySize =
    sizeSf ??
    (sizeUnits
      ? /^[\d,]+$/.test(sizeUnits.trim())
        ? `${sizeUnits.trim()} ${countNoun(sizeUnitsRow?.label, shownClass)}`
        : sizeUnits
      : null) ??
    (firstSignal?.size.trim() || null);
  const capRow = plan ? null : findGoingInCap(metrics);
  const summaryCap = plan ? null : (capRow?.value ?? signalGoingInCap(firstSignal)?.text ?? null);
  const summaryYoc = plan?.yieldOnCost != null ? yieldOnCostText(plan.yieldOnCost) : null;
  const priceTag = interestTag(extraction, asOf);

  const priceFigure = priceFigureOf(
    `${plan?.priceLabel === "Land cost" ? "Land cost" : "Price"}${priceTag ? ` · ${priceTag}` : ""}`,
    summaryPrice ?? null,
  );
  const capFigure = plan ? null : { ...goingInCapFigure(extraction, summaryCap ?? null, asOf), figure: true };
  const returnFigure: HeroFigure = plan
    ? plan.yieldWithheld && summaryYoc == null
      ? { label: "Yield on cost", value: "n/a", figure: true, title: plan.yieldWithheld }
      : { label: "Yield on cost", value: summaryYoc ?? null, figure: true }
    : capFigure!;
  const how = heroHow({
    extraction,
    strategy,
    plan,
    price: { row: priceRow, stated: summaryPrice ?? null, figure: priceFigure, tag: priceTag },
    size: { sfRow: sizeSfRow, unitsRow: sizeUnitsRow, value: summarySize ?? null },
    cap: capFigure ? { row: capRow, figure: capFigure } : null,
    dealType: summaryStrategy ?? null,
    byHand: typedByHand(extraction),
  });

  const boxRead = input.box
    ? buyBoxRead(input.storedAssetClass ?? "", dealCheckSource(extraction, firstSignal, input.address), input.box)
    : null;
  const fit: HeaderChip | null = boxRead
    ? {
        label: buyBoxChipText(boxRead.chip),
        cls: BUY_BOX_CHIP_CLS[boxRead.chip.tone],
        ...(boxRead.chip.note ? { note: boxRead.chip.note } : {}),
        how: fitHow(boxRead),
      }
    : null;
  const pill: HeaderChip | null = input.verdict ? { ...VERDICT_PILL[input.verdict.verdict] } : null;

  const addressLine = extraction?.address || input.address?.label || extraction?.market || firstSignal?.market || null;
  const subtitle = `${addressLine ? `${addressLine} · ` : ""}${assetClassLabel(shownClass) || "Asset class not read yet"}`;

  return {
    title: input.name,
    pill,
    fit,
    subtitle,
    figures: [
      { ...priceFigure, how: how.price },
      { label: "Size", value: summarySize ?? null, figure: true, how: how.size },
      { ...returnFigure, how: how.ret },
      { label: "Deal type", value: summaryStrategy ?? null, title: strategy.summary || undefined, how: how.dealType },
    ],
    facts: buildingFacts(metrics, { screenYear: screenYearOf(extraction), notYetDelivered: notYetDelivered(strategy.kind) }),
    market: marketPictureFor(input.address, extraction?.market ?? null, input.placed, input.county),
    pictureLabel: input.address?.label ?? input.name,
  };
}

/**
 * The sample deal's header, as the signed-in sample deal's page draws it —
 * judged against the public sample's buy box (lib/sample-deal
 * `SAMPLE_DEMO_BOX`), the box the memo, the report and the walkthrough
 * judge it against. The sample has no first signal and its address is
 * never sharpened past the neighbourhood, so its market is its address's.
 */
export function sampleHeader(asOf: Date = new Date()): HeaderFacts {
  return headerFacts({
    name: SAMPLE_DEAL.name,
    storedAssetClass: SAMPLE_DEAL.asset_class,
    extraction: SAMPLE_DEAL.extraction,
    firstSignal: null,
    address: SAMPLE_DEAL.address,
    verdict: SAMPLE_DEAL.verdict,
    box: SAMPLE_DEMO_BOX,
    asOf,
  });
}
