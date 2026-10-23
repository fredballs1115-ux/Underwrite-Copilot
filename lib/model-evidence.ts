// What the screening model runs its growth and its exit at, read off the
// figures the stress test decides by and the memorandum's own (the owner's
// rules of 2026-10-20: "published evidence first", then "never more
// optimistic than the OM"). The model (lib/underwrite/inputs
// `deriveUnderwriteInputs`) had run rent and expense growth at a flat 3.0%
// and its exit at the going-in cap whatever the memorandum or the market
// said. For each of the three it now runs:
//   - where both stand, the more cautious of the SAME deciding figure the
//     stress test decides that row by (lib/stress-deciders, through
//     lib/stress-test's own row pieces — never a second reading) and the
//     memorandum's stated figure, read by the row's own reader: the lower
//     rent growth, the higher expense growth, the higher exit cap;
//   - where one stands, that one;
//   - else today's default (3.0%; the going-in cap, else 6.0%).
// The model's exit runs the OM's going-in cap, else the research tracker's
// cap range at its low end, so where the memorandum states a going-in cap on
// a building it is bought as, the exit is never tighter than it, nor than
// the memorandum's own stated exit — nor than its pro forma cap where that
// decides the stress test's exit row (the higher of the going-in cap and the
// OM's pro forma cap, the review of 2026-10-23; it reaches the model as the
// OM's own stated figure, below).
//
// One read, every surface: the caller hands in the figures it already read
// for the model's assumptions against the market (lib/model-vs-market-read
// `todayReads`), and lib/model-market's `modelMarketFor` passes the result
// to the model — none for the sample, whose figures are pinned. A figure
// that is stale, absent, or of the wrong kind (land; a class the rent
// order reads none for) is no figure here, and the reason is carried
// (`absent`) so the model's note says it; never zero. Pure.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { shownAssetClass } from "@/lib/asset-class";
import { assetWords } from "@/lib/asset-words";
import { datedLong } from "@/lib/debt-index";
import { buildingPriceOf, inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { modelVsMarketFor, type MarketReads } from "@/lib/model-vs-market";
import type { RegulationRead } from "@/lib/rent-regulation";
import { readsNoRentIndex } from "@/lib/rent-growth-decider";
import { PRO_FORMA_CAP_LABEL, type DecidingFigure } from "@/lib/stress-deciders";
import { exitCapPieces, expenseGrowthPieces, omExitCap, omExpenseGrowth, omProFormaCap, omRentGrowth, rentGrowthPieces, type RowPieces } from "@/lib/stress-test";
import type { StressEvidence } from "@/lib/stress-test-types";
import { houseShort, trackerFor } from "@/lib/tracker-read";

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
  /** why it decides, as the stress test's row says it: "the figure for this
   *  kind of rent", "the closest published figure, not a park's own kind of
   *  rent" — null where the decider gives none */
  why: string | null;
  /** a research tracker's cap range, where that is the figure: its two
   *  ends, the sector, the house, the period and the day it was read — so
   *  the note says it as research, never as a feed */
  research?: ResearchRange;
}

/** The research tracker's cap range the exit is decided by. */
export interface ResearchRange {
  /** percent */
  low: number;
  high: number;
  /** "apartment", "office" */
  sector: string;
  /** "Northmarq", or "publisher not recorded" */
  house: string;
  /** the figure's own period, "late 2025 / early 2026", or "undated" */
  period: string;
  /** the day the research was read, "Aug 25, 2026", or null */
  readOn: string | null;
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
  /** why no figure decides, where none does, as the model's note says it:
   *  "no fresh published figure decides the rent growth", "the class has
   *  no published rent index", "today's published figures were not read" */
  absent: string | null;
}

/** The exit adds why the going-in cap does not decide it, where it does
 *  not: the true reason, for the note of a figure run in its place. */
export interface ExitEvidenceFor extends EvidenceFor {
  goingInAbsent: string | null;
}

export interface ModelEvidence {
  rentGrowth: EvidenceFor;
  expenseGrowth: EvidenceFor;
  exitCap: ExitEvidenceFor;
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
  return { pct: e.value, kind: e.kind, name: d.name ?? e.label, label: e.label, text: e.text, publisher: e.publisher, asOf: e.asOf, where: whereOf(e, place), why: d.why ?? null };
}

const NOT_READ = "today's published figures were not read";
const NO_RENT_INDEX = "the class has no published rent index";

function statedOf(hit: { row: { label: string; value: string; page?: string }; pct: number } | null): StatedFigure | null {
  return hit ? { pct: hit.pct, label: hit.row.label, value: hit.row.value, ...(hit.row.page ? { page: hit.row.page } : {}) } : null;
}

/** The OM's own figure the model's exit is held to beside the deciding one:
 *  its stated exit, or — where the OM's pro forma cap decides the stress
 *  test's exit row and sits over the stated exit — the pro forma cap, the
 *  OM's own figure too, so the model never exits tighter than the row's. */
function exitStated(
  exit: { row: { label: string; value: string; page?: string }; pct: number } | null,
  proForma: { row: { label: string; value: string; page?: string }; pct: number } | null,
): StatedFigure | null {
  return proForma && (!exit || proForma.pct > exit.pct + 1e-9) ? statedOf(proForma) : statedOf(exit);
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
  // Land earns no rent and has no expense base: no published figure decides
  // its growth rows, whatever is on file.
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
  const rentPieces = mvm ? rentGrowthPieces(mvm, assetClass) : null;
  const rentDecided = rentPieces ? decidedOf(rentPieces, place) : null;
  const expenseDecided = mvm ? decidedOf(expenseGrowthPieces(mvm), place) : null;
  // The exit's pieces are the stress row's own, whatever the class: the
  // going-in cap decides without any read, the tracker's range only with
  // one (lib/model-vs-market reads none for land, so land's exit is the
  // going-in cap the memorandum states, or none — as the row's).
  // The stress test's exit row is decided by the higher of the OM's going-in
  // cap and its pro forma cap (the review of 2026-10-23). The model's exit
  // reader (lib/underwrite/inputs) knows an OM-internal deciding figure only
  // as its own going-in cap, so it is handed the exit's pieces without the
  // pro forma cap (`proForma: false`): the going-in cap, else the tracker's
  // low end, as before. Where the pro forma cap decides the row, it reaches
  // the model as the OM's own figure it is (`stated`, below): the model runs
  // the higher of the deciding going-in cap and the OM's stated figure, so it
  // runs the pro forma cap, its note naming it as the OM's, never as more.
  const exitPieces = exitCapPieces(ex, plan, mvm, null, { proForma: false });
  const rowExit = exitCapPieces(ex, plan, mvm, null).decided;
  let exitDecided = decidedOf(exitPieces, place);
  if (exitDecided && exitDecided.kind === "published") {
    // The range the low end is of, said as research with its house, its
    // period and the day it was read — the model-vs-market read's own
    // tracker (the same call, `trackerFor`).
    const t = args.metro && !args.metro.placedBy ? trackerFor(args.metro.id, assetClass, ex?.assetClass ?? null) : null;
    if (t && t.capLow != null && Math.abs(t.capLow - exitDecided.pct) < 1e-9) {
      exitDecided = {
        ...exitDecided,
        research: {
          low: t.capLow,
          high: t.capHigh ?? t.capLow,
          sector: t.sectorLabel,
          house: t.cap ? houseShort(t.cap) : "publisher not recorded",
          period: t.cap?.period ?? "undated",
          readOn: t.asOf ? datedLong(t.asOf) : null,
        },
      };
    }
  }
  const goingInStated = exitPieces.goingIn != null && exitPieces.goingIn > 0;
  const goingInAbsent = exitDecided?.kind === "om_internal"
    ? null
    : !goingInStated
      ? "the OM states no going-in cap"
      : plan
        ? "on a value-add, lease-up, conversion or development deal the OM's going-in cap is struck on today's income, not the stabilized income the exit sells"
        : buildingPriceOf(ex, 1) == null
          ? "the price buys no building, so its going-in cap is no building's"
          : "the OM's going-in cap is outside the band a cap may be";
  const exitCheck = mvm?.checks.find((c) => c.key === "exit_cap") ?? null;
  const rangeAbsent = !args.reads
    ? NOT_READ
    : !operating
      ? "land sells at no cap a published range speaks to"
      : !exitCheck
        ? "no fresh 10-year Treasury was read, beside which a published cap range is read"
        : exitPieces.rangeRead
          ? "the research tracker's cap range is held to nothing (stale, undated or a narrower stock)"
          : "no published cap range is on file for this market and class";
  return {
    rentGrowth: {
      decided: rentDecided,
      stated: statedOf(omRentGrowth(ex)),
      absent: rentDecided
        ? null
        : !operating || (readsNoRentIndex(assetClass) && (rentPieces?.market ?? 0) === 0)
          ? NO_RENT_INDEX
          : !args.reads
            ? NOT_READ
            : "no fresh published figure decides the rent growth",
    },
    expenseGrowth: {
      decided: expenseDecided,
      stated: statedOf(omExpenseGrowth(ex)),
      absent: expenseDecided
        ? null
        : !operating
          ? "land has no expense base a published figure speaks to"
          : !args.reads
            ? NOT_READ
            : "no fresh published figure decides the expense growth",
    },
    exitCap: {
      decided: exitDecided,
      stated: exitStated(omExitCap(ex), rowExit?.label === PRO_FORMA_CAP_LABEL ? omProFormaCap(ex) : null),
      absent: exitDecided ? null : `${goingInAbsent ?? "no going-in cap decides the exit"}, and ${rangeAbsent}`,
      goingInAbsent,
    },
  };
}
