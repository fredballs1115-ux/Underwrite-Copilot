// Whether the deal may be set against the recorded median at all, and on
// what (the comps research pass's H3). The call had been made for every deal
// with a price: an office building against all recorded sales — rowhouses,
// condominiums and land — a development's land price against standing
// buildings, a portfolio's whole price against the sales around one address,
// and a deal filed "auto" against an unfiltered set although its deck said
// apartments; and it was coloured red or green at ±10%, a rule of thumb
// dressed as a verdict.
//
// Now: the call is made only where the sales are the deal's own kind (the
// filter is the deal's shown class, lib/asset-class `shownAssetClass`, read
// as lib/asset-words `dealClassKey`), the deal is one building, and its price
// is a building's price (not a development's or a conversion's plan, not
// land). It compares price a square foot with price a square foot where both
// exist, with the count of sales that state an area, and the whole price
// otherwise, under the readout's own floors (MEDIAN_FLOOR) and band. It is
// said in a neutral tone: how far from the middle, never "rich" or "cheap".
//
// Pure.

import { compEvidence, MEDIAN_FLOOR, type RecordCompsStats } from "./core";
import { SUBJECT_BAND } from "./picture";

/** What the deal brings to the comparison. */
export interface SubjectForCall {
  /** the building's price (lib/deal-strategy `buildingPriceOf`), or null */
  price: number | null;
  /** the building's price a square foot (lib/comp-detail `subjectBasis`),
   *  or null */
  perSf: number | null;
  /** the deal's class key (lib/asset-words `dealClassKey`), "" unknown */
  classKey: string;
  /** what the class is called on a page ("Office") */
  classLabel: string;
  /** the memorandum lists several properties (lib/portfolio) */
  portfolio: boolean;
  /** the price is a plan's — a development's or a conversion's — or land's */
  planOrLand: boolean;
}

export type VsMedianRead =
  | {
      kind: "call";
      /** signed, whole percent: above the middle is positive */
      pct: number;
      on: "per_sf" | "price";
      /** the sales behind the middle compared against */
      count: number;
    }
  | { kind: "withheld"; reason: string };

/** The class a search's filter holds the sales to, as a class key, or null
 *  for all recorded sales. "multifamily/mixed" (a live provider's filter)
 *  is multifamily's. */
export function filterClassKey(classFilter: string | null | undefined): string | null {
  const f = (classFilter ?? "").trim().toLowerCase();
  if (!f || f === "all sales") return null;
  return f.split("/")[0].trim().replace(/\s+/g, "_") || null;
}

/**
 * The call, the reason it is withheld, or null where there is nothing to
 * compare (no subject, no middle).
 */
export function vsMedianRead(
  stats: RecordCompsStats | undefined,
  classFilter: string | null | undefined,
  subject: SubjectForCall | null,
): VsMedianRead | null {
  if (!stats || !subject || (subject.price == null && subject.perSf == null)) return null;
  if (subject.portfolio) {
    return { kind: "withheld", reason: "The deal is a portfolio, and these are the sales around one address, so its price is not set against their middle." };
  }
  if (subject.planOrLand) {
    return { kind: "withheld", reason: "The deal's price is a plan's or land's, not a standing building's, so it is not set against these sales' middle." };
  }
  const filtered = filterClassKey(classFilter);
  if (!subject.classKey || filtered !== subject.classKey) {
    const kind = subject.classLabel ? subject.classLabel.toLowerCase() : "the deal's kind of building";
    return {
      kind: "withheld",
      reason: filtered
        ? `These sales are filed as ${filtered.replace(/_/g, " ")}, not ${kind}, so the deal's price is not set against their middle.`
        : `These are all recorded sales here, not ${kind} alone, so the deal's price is not set against their middle.`,
    };
  }
  const sfCount = stats.perSqftCount ?? 0;
  if (subject.perSf != null && stats.medianPerSqft != null && sfCount >= MEDIAN_FLOOR) {
    const ratio = subject.perSf / stats.medianPerSqft;
    if (ratio >= SUBJECT_BAND.low && ratio <= SUBJECT_BAND.high) {
      return { kind: "call", pct: Math.round((ratio - 1) * 100), on: "per_sf", count: sfCount };
    }
  }
  if (subject.price != null && stats.medianPrice > 0 && compEvidence(stats.count) !== "individual") {
    const ratio = subject.price / stats.medianPrice;
    if (ratio >= SUBJECT_BAND.low && ratio <= SUBJECT_BAND.high) {
      return { kind: "call", pct: Math.round((ratio - 1) * 100), on: "price", count: stats.count };
    }
    return {
      kind: "withheld",
      reason: "The subject's scale differs from the surrounding recorded stock, so a whole-price comparison isn't meaningful here.",
    };
  }
  return null;
}

/** The call said: "This deal's $245/SF is 12% above the median of the 6
 *  sales that state an area." Neutral: a distance from the middle. */
export function vsMedianSentence(read: Extract<VsMedianRead, { kind: "call" }>, subjectText: string): string {
  const side = read.pct === 0 ? "at" : `${Math.abs(read.pct)}% ${read.pct > 0 ? "above" : "below"}`;
  const of =
    read.on === "per_sf"
      ? `the median of the ${read.count} sales that state an area`
      : `the median of the ${read.count} recorded sales`;
  return `This deal's ${subjectText} is ${side} ${of}.`;
}
