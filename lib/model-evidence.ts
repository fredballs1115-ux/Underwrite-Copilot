// What the screening model runs its growth and its exit at, read off the
// figures the stress test decides by (the owner's rule of 2026-10-20,
// "published evidence first"). The model (lib/underwrite/inputs
// `deriveUnderwriteInputs`) had run rent and expense growth at a flat 3.0%
// and its exit at the going-in cap whatever the memorandum or the market
// said. For each of the three it now runs, in order:
//   1. the SAME deciding figure the stress test decides that row by
//      (lib/stress-deciders, through lib/stress-test's own row pieces —
//      never a second reading), where one is fresh and may be held to;
//   2. else the memorandum's stated figure, read by the row's own reader;
//   3. else today's default (3.0%; the going-in cap, else 6.0%).
// The exit's deciding figure is the OM's going-in cap, else the research
// tracker's cap range at its low end, so where the memorandum states a
// going-in cap on a building it is bought as, the exit stays at it; the
// memorandum's stated exit runs only where neither stands (a plan deal,
// whose going-in cap is struck on today's income; a memorandum that states
// none and a market no tracker range is held to).
//
// One read, every surface: the caller hands in the figures it already read
// for the model's assumptions against the market (lib/model-vs-market-read
// `todayReads`), and lib/model-market's `modelMarketFor` passes the result
// to the model — none for the sample, whose figures are pinned. A figure
// that is stale, absent, or of the wrong kind (land; a class the rent
// order reads none for) is no figure here, and the next step runs; never
// zero. Pure.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { shownAssetClass } from "@/lib/asset-class";
import { assetWords } from "@/lib/asset-words";
import { inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { modelVsMarketFor, type MarketReads } from "@/lib/model-vs-market";
import type { RegulationRead } from "@/lib/rent-regulation";
import type { DecidingFigure } from "@/lib/stress-deciders";
import { exitCapPieces, expenseGrowthPieces, omExitCap, omExpenseGrowth, omRentGrowth, rentGrowthPieces, type RowPieces } from "@/lib/stress-test";
import type { StressEvidence } from "@/lib/stress-test-types";

/** The figure a row is decided by, as the model's source note says it. */
export interface EvidenceFigure {
  /** in percent */
  pct: number;
  /** a published figure, or the memorandum's own (its going-in cap) */
  kind: StressEvidence["kind"];
  /** how a sentence names it: "Zillow's apartment asking rents" */
  name: string;
  /** the evidence's own label and text: "+2.4% over the year to Aug 2026" */
  label: string;
  text: string;
  /** whose figure: "Zillow Research", "BLS via FRED", "the offering memorandum" */
  publisher: string;
  /** the figure's own day or period, as the evidence carries it */
  asOf: string | null;
  /** where the figure is for — the metro's or the state's name, "the
   *  nation"; null for the memorandum's own figure */
  where: string | null;
}

/** A figure the memorandum states, as the stress test's row reads it. */
export interface StatedFigure {
  pct: number;
  label: string;
  value: string;
  page?: string;
}

export interface EvidenceFor {
  decided: EvidenceFigure | null;
  stated: StatedFigure | null;
}

export interface ModelEvidence {
  rentGrowth: EvidenceFor;
  expenseGrowth: EvidenceFor;
  exitCap: EvidenceFor;
}

function whereOf(e: StressEvidence, place: string | null): string | null {
  switch (e.scope) {
    case "nation":
      return "the nation";
    case "metro":
    case "state":
      return place;
    default:
      return null;
  }
}

function decidedOf(pieces: RowPieces, place: string | null): EvidenceFigure | null {
  const d: DecidingFigure | null = pieces.decided;
  if (!d) return null;
  const e = pieces.evidence[d.index];
  if (!e || e.value == null || !Number.isFinite(e.value)) return null;
  return { pct: e.value, kind: e.kind, name: d.name ?? e.label, label: e.label, text: e.text, publisher: e.publisher, asOf: e.asOf, where: whereOf(e, place) };
}

function statedOf(hit: { row: { label: string; value: string; page?: string }; pct: number } | null): StatedFigure | null {
  return hit ? { pct: hit.pct, label: hit.row.label, value: hit.row.value, ...(hit.row.page ? { page: hit.row.page } : {}) } : null;
}

/**
 * The figures the screening model runs its rent growth, expense growth and
 * exit at, for a deal: the published figures read once by the caller
 * (`reads`, the same figures its model-vs-market read uses — null where
 * the read failed or none was made, and then only the memorandum's own
 * figures stand), through the stress test's own row pieces. Never throws a
 * read of its own.
 */
export function modelEvidenceFor(args: {
  extraction: ExtractionResult | null;
  firstSignal?: FirstSignal | null;
  storedAssetClass: string | null | undefined;
  metro: { id: string; name: string; placedBy?: unknown } | null;
  reads: MarketReads | null;
  regulation?: RegulationRead | null;
}): ModelEvidence {
  const ex = args.extraction;
  const plan = isPlanDeal(inferStrategy(ex, args.firstSignal ?? null).kind);
  const assetClass = shownAssetClass(args.storedAssetClass ?? null, ex) || null;
  // Land earns no rent, has no expense base and sells at no cap: no figure
  // decides its rows, whatever is on file.
  const operating = assetWords(assetClass ?? undefined).operating;
  const mvm =
    args.reads && operating
      ? modelVsMarketFor({
          derived: null,
          extraction: ex,
          firstSignal: args.firstSignal ?? null,
          storedAssetClass: args.storedAssetClass,
          metro: args.metro,
          reads: args.reads,
          regulation: args.regulation ?? null,
        })
      : null;
  const place = mvm?.metro ?? null;
  return {
    rentGrowth: { decided: mvm ? decidedOf(rentGrowthPieces(mvm, assetClass), place) : null, stated: statedOf(omRentGrowth(ex)) },
    expenseGrowth: { decided: mvm ? decidedOf(expenseGrowthPieces(mvm), place) : null, stated: statedOf(omExpenseGrowth(ex)) },
    // The going-in cap decides without any read; the tracker's range only
    // with one.
    exitCap: { decided: operating ? decidedOf(exitCapPieces(ex, plan, mvm, null), place) : null, stated: statedOf(omExitCap(ex)) },
  };
}
