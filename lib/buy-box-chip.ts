/**
 * A deal against its buy box, read ONE way for the two places a person sees
 * the call as a chip: the deal page's header and the screen-complete email
 * that links to it (lib/email). The email used to judge the extraction alone
 * — no first signal, no address, no mandate-fit score — so it could say
 * "Fits buy box" over a page whose header said "Fit 58 · Watch", or judge a
 * location the page's address answered as unknown. Both now take the same
 * source and the same fold from here. Pure: the page, the worker and the
 * tests share it.
 */
import {
  buyBoxCheckSource,
  buyBoxCoverage,
  evaluateBuyBox,
  foldBuyBoxChecks,
  type BuyBox,
  type BuyBoxCheck,
  type SourceReads,
} from "@/lib/criteria";
import { scoreMandateFit, type MandateScore } from "@/lib/mandate";
import { FOLD_WORD, checkedSentence, fitCellText, fitScoreLabel, fitTone, type FitTone } from "@/lib/fit-label";
import { inferStrategy, signalGoingInCap, statedBasisIsBuildings } from "@/lib/deal-strategy";
import { entityLoanWords, interestOf, isGpStake, isTenancyInCommon } from "@/lib/interest";
import { capSlotWithheld } from "@/lib/compare-interest";
import { compactUsd } from "@/lib/money";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";

/**
 * What the buy box reads off a deal beside its rows, by the readers its
 * slots read (lib/criteria `SourceReads`): what the price buys as
 * lib/interest reads it, why the cap slot holds no cap of the deal's own
 * (lib/compare-interest `capSlotWithheld`), whether a per-unit figure the
 * memorandum states is the building's (lib/deal-strategy
 * `statedBasisIsBuildings`), and the first signal's going-in cap as the
 * header reads it (lib/deal-strategy `signalGoingInCap`). A position's price
 * or a share's beside its entity's loan had been held to the box's cap floor
 * and its basis ceiling while the header beside the chip withheld both, and
 * the header printed the first signal's cap where the box said none could be
 * read (the audit of 2026-10-05).
 */
export function sourceReadsOf(extraction: ExtractionResult | null, firstSignal: FirstSignal | null): SourceReads {
  const { kind, entityLoan } = interestOf(extraction);
  // What a share holds, so the box says a tenancy in common and a GP stake
  // as what they are, never "a share of the owning entity" (the audit C3b
  // MED-4), with the stated loan in lib/interest's own words.
  const holding = kind !== "partial_interest" ? null : isTenancyInCommon(extraction) ? "tic" : isGpStake(extraction) ? "gp_stake" : null;
  const loanWords = holding === "tic" && entityLoan != null ? entityLoanWords(extraction, compactUsd(entityLoan)) : null;
  return {
    interestKind: kind,
    capWithheld: capSlotWithheld(extraction),
    statedBasisIsBuildings: statedBasisIsBuildings(extraction),
    signalCap: signalGoingInCap(firstSignal),
    ...(holding ? { holding } : {}),
    ...(loanWords ? { loanWords } : {}),
  };
}

/** What the deal is judged on: the extraction when it is in, the first
 *  signal standing in until then, the deal's own address widening the
 *  place, the kind the two imply (a plan deal keeps its "no going-in cap"
 *  reading, a development its land price), and what the price buys
 *  (`sourceReadsOf`). THE source: the deal page, the email, the pipeline's
 *  list and its workbook, the compare table, the batch upload's triage, the
 *  memo, the report and the verdict all build it here. */
export function dealCheckSource(
  extraction: ExtractionResult | null,
  firstSignal: FirstSignal | null,
  dealAddress: { label?: string; county?: string; state?: string } | null,
): ReturnType<typeof buyBoxCheckSource> {
  return buyBoxCheckSource(
    extraction,
    firstSignal,
    dealAddress,
    inferStrategy(extraction, firstSignal).kind,
    sourceReadsOf(extraction, firstSignal),
  );
}

export type BuyBoxChipTone = FitTone;

/** The chip's colours by tone — the deal header's, and the sensitivity
 *  playground's, which draws its own read of the box in the same chip. */
export const BUY_BOX_CHIP_CLS: Record<BuyBoxChipTone, string> = {
  pass: "bg-pass/10 text-pass",
  caution: "bg-caution/10 text-caution",
  kill: "bg-kill/10 text-kill",
  muted: "bg-faint text-muted",
};

export interface BuyBoxChip {
  label: string;
  tone: BuyBoxChipTone;
  /** which of the box's criteria could not be checked, as a sentence —
   *  the chip's tooltip — where not every one could (lib/fit-label
   *  `checkedSentence`) */
  note?: string;
}

export interface BuyBoxRead {
  /** every criterion the box sets, with its status */
  checks: BuyBoxCheck[];
  /** the single 0–100 mandate-fit read, null where nothing is checkable */
  mandate: MandateScore | null;
  /** the call as one chip */
  chip: BuyBoxChip;
}

/** The deal's checks, its mandate-fit score and the one chip they fold to. */
export function buyBoxRead(
  dealAssetClass: string,
  source: ReturnType<typeof buyBoxCheckSource>,
  box: BuyBox,
): BuyBoxRead {
  const checks = evaluateBuyBox(dealAssetClass, source, box);
  // Same evidence as the per-criterion checks, rolled into one number and a
  // PURSUE/WATCH/PASS call; null until there is something checkable.
  const mandate = source ? scoreMandateFit(dealAssetClass, source, box) : null;
  return { checks, mandate, chip: buyBoxChip(checks, mandate) };
}

/**
 * The buy-box call as one chip. With a numeric mandate-fit score it leads —
 * "Fit 82 · Pursue", toned by the PURSUE/WATCH/PASS call — except that the
 * fold covers ALL criteria (the price band and per-unit cap included, which
 * the 0–100 score deliberately does not weigh), so a deal outside the box on
 * one of those never shows a green Pursue: a hard "outside" wins the chip,
 * whatever the score's call (lib/fit-label `fitScoreLabel`, the pipeline
 * card's own words). Without a score the fold (Outside / Near / Fits)
 * stands in, in the words below.
 *
 * Where the screen could not check every criterion the box sets, the chip
 * says how many it did, and is never green while one the price decides is
 * among those it could not (lib/criteria `buyBoxCoverage`, lib/fit-label):
 * a note read "Fit 100 · Pursue" in green on its asset class and its unit
 * count alone, the box's cap and return never judged (research pass 35).
 *
 * Without a score the chip says what the pipeline's CSV and the meeting
 * workbook's cell say, in lib/fit-label's words (`fitCellText`, `fitTone`):
 * "Fits", "Near (1 of 2)", "Outside (2 of 3)". It had read "Buy box
 * unverified" over a deal the cell called "Fits (1 of 2)" (the audit of
 * 2026-10-05). Only a box none of whose criteria could be judged — no
 * pass, near or miss to fold — stays unverified, its note saying so.
 */
export function buyBoxChip(checks: BuyBoxCheck[], mandate: MandateScore | null): BuyBoxChip {
  const coverage = buyBoxCoverage(checks, mandate);
  const note = checkedSentence(coverage) ?? undefined;
  const withNote = (chip: BuyBoxChip): BuyBoxChip => (note ? { ...chip, note } : chip);
  const fold = foldBuyBoxChecks(checks);
  if (mandate?.score != null && mandate.verdict) {
    return withNote({
      label: fitScoreLabel(mandate.score, mandate.verdict, fold === "outside", coverage),
      tone: fitTone(mandate.verdict, fold, coverage),
    });
  }
  if (fold) return withNote({ label: fitCellText(FOLD_WORD[fold], coverage), tone: fitTone(null, fold, coverage) });
  return withNote({ label: "Buy box unverified", tone: "muted" });
}
