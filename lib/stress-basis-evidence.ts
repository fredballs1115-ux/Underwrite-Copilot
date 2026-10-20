// The stress test's basis row is set against two things no extraction
// carries: the recorded sales the deal's public-record pull stored, and the
// reader's own past screens of the same market and class (lib/stress-test
// `RecordedSalesEvidence`, `PastScreensEvidence`). The deal page built them
// inline and the memo, the report, the shared screen and the verdict's brief
// built none, so their basis rows judged one deal on less evidence than the
// page did. This is the ONE builder every surface calls, on the reads the
// page already makes (lib/stress-basis-read reads them for a surface that
// has not). Pure.
//
// Its rules:
//   - recorded sales stand as evidence only where the comps tab sets the
//     deal against their price a foot (lib/public-comps/vs-median: a call
//     `on: "per_sf"`), with that call's own count — the sales that state an
//     area — never the whole set's;
//   - the past screens' median stands only over three screens that state a
//     basis (lib/public-comps `MEDIAN_FLOOR`), said with that count;
//   - the sample deal's building and price are invented: neither is set
//     against it;
//   - a surface whose words reach someone other than the reader withholds
//     the reader's past screens by name (`PAST_SCREENS_ON_SHARE`,
//     `PAST_SCREENS_IN_BRIEF`), never as none found.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { assetClassLabel, shownAssetClass } from "@/lib/asset-class";
import { dealClassKey } from "@/lib/asset-words";
import { subjectBasis } from "@/lib/comp-detail";
import { condoUnitsOffered } from "@/lib/condo-units";
import { parsePrice, screenYearOf } from "@/lib/criteria";
import { buildingPriceOf, findPriceMetric, inferStrategy, signalAskPrice } from "@/lib/deal-strategy";
import { interestOf, isMasterLeasehold } from "@/lib/interest";
import type { MarketGroup } from "@/lib/market-memory";
import { readPortfolio } from "@/lib/portfolio";
import { lastGoodOf, type RecordCompsResult } from "@/lib/public-comps/core";
import { vsMedianRead, type SubjectForCall } from "@/lib/public-comps/vs-median";
import type { PastScreensEvidence, RecordedSalesEvidence } from "@/lib/stress-test";

/** The shared screen's reason: its reader is not the sender. */
export const PAST_SCREENS_ON_SHARE =
  "A shared screen never sets the price against the sender's own past screens: they are the sender's other deals, not this page's to show.";

/** The verdict's brief's reason: the call's words reach the shared screen. */
export const PAST_SCREENS_IN_BRIEF =
  "The call is never handed the reader's past screens: its words reach the shared screen, and they are the reader's own other deals.";

/**
 * What the recorded sales may be set against (lib/public-comps/vs-median):
 * the building's price and its price a square foot (the comps tab's own
 * reader, so the two never name different figures), the class the deal
 * shows, and whether it is one building at a building's price. The deal
 * page's comps tab reads this too. A master lease of the building buys no
 * building (lib/interest `isMasterLeasehold`), so it brings no price.
 */
export function compsCallSubjectOf(
  extraction: ExtractionResult | null,
  firstSignal: FirstSignal | null,
  storedClass: string | null,
): SubjectForCall {
  const strategy = inferStrategy(extraction, firstSignal);
  const priceRow = findPriceMetric(extraction?.metrics ?? [], strategy.kind, screenYearOf(extraction));
  const stated = priceRow?.value ?? signalAskPrice(firstSignal);
  const classKey = dealClassKey(storedClass, extraction);
  return {
    price: isMasterLeasehold(extraction) ? null : buildingPriceOf(extraction, stated ? parsePrice(stated) : null),
    perSf: subjectBasis(
      extraction?.metrics ?? [],
      strategy.kind,
      screenYearOf(extraction),
      interestOf(extraction),
      extraction?.assetClass,
      condoUnitsOffered(extraction),
    ).perSf,
    classKey,
    classLabel: assetClassLabel(shownAssetClass(storedClass, extraction)),
    portfolio: readPortfolio(extraction) !== null,
    planOrLand: strategy.kind === "development" || strategy.kind === "conversion" || classKey === "land_infill",
  };
}

/** The class a deal's past screens are grouped under (lib/market-memory
 *  `memoryCandidates`): the analyst's where they filed one, else the deck's. */
export function memoryClassOf(storedClass: string | null | undefined, extraction: ExtractionResult | null): string {
  return storedClass && storedClass !== "auto" ? storedClass : (extraction?.assetClass ?? "");
}

/** The basis row's two inputs no extraction carries, from what a surface has
 *  read: the deal's stored public-record pull and its market-memory group. */
export function stressBasisEvidence(input: {
  publicComps: RecordCompsResult | null | undefined;
  subject: SubjectForCall;
  memoryGroup: MarketGroup | null | undefined;
  isSample: boolean;
}): { recordedSales: RecordedSalesEvidence | null; pastScreens: PastScreensEvidence | null } {
  if (input.isSample) return { recordedSales: null, pastScreens: null };
  const set = lastGoodOf(input.publicComps);
  const read = set?.stats ? vsMedianRead(set.stats, set.params, input.subject) : null;
  const recordedSales: RecordedSalesEvidence | null =
    set?.stats && read?.kind === "call" && read.on === "per_sf" && set.stats.medianPerSqft != null
      ? {
          count: set.stats.count,
          perSqftCount: read.count,
          medianPerSqft: set.stats.medianPerSqft,
          medianPerUnit: null,
          providerName: set.providerName ?? "public property records",
          retrievedAt: set.retrievedAt ?? null,
          href: set.datasetUrl ?? null,
        }
      : null;
  const group = input.memoryGroup ?? null;
  const stat = group?.perUnit ?? null;
  // The median rides with the screens behind it (`Stat.n`); the row strikes
  // it only from MEDIAN_FLOOR of them up, and says how few where it does not.
  const pastScreens: PastScreensEvidence | null =
    group && stat && group.count > 0
      ? {
          count: group.count,
          medianCount: stat.n ?? null,
          perUnitMedian: stat.basis === "unit" ? stat.median : null,
          perSfMedian: stat.basis === "sf" ? stat.median : null,
          market: group.market,
        }
      : null;
  return { recordedSales, pastScreens };
}
