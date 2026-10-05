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
  evaluateBuyBox,
  foldBuyBoxChecks,
  type BuyBox,
  type BuyBoxCheck,
} from "@/lib/criteria";
import { scoreMandateFit, type MandateScore, type MandateVerdict } from "@/lib/mandate";
import { fitScoreLabel } from "@/lib/fit-label";
import { inferStrategy } from "@/lib/deal-strategy";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";

/** What the deal is judged on: the extraction when it is in, the first
 *  signal standing in until then, the deal's own address widening the
 *  place, and the kind the two imply (a plan deal keeps its "no going-in
 *  cap" reading, a development its land price). */
export function dealCheckSource(
  extraction: ExtractionResult | null,
  firstSignal: FirstSignal | null,
  dealAddress: { label?: string; county?: string; state?: string } | null,
): ReturnType<typeof buyBoxCheckSource> {
  return buyBoxCheckSource(extraction, firstSignal, dealAddress, inferStrategy(extraction, firstSignal).kind);
}

export type BuyBoxChipTone = "pass" | "caution" | "kill" | "muted";

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
}

export interface BuyBoxRead {
  /** every criterion the box sets, with its status */
  checks: BuyBoxCheck[];
  /** the single 0–100 mandate-fit read, null where nothing is checkable */
  mandate: MandateScore | null;
  /** the call as one chip */
  chip: BuyBoxChip;
}

const MANDATE_TONE: Record<MandateVerdict, BuyBoxChipTone> = {
  PURSUE: "pass",
  WATCH: "caution",
  PASS: "kill",
};

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
 * card's own words). Without a score the older fold (Outside / Near / Fits)
 * stands in.
 */
export function buyBoxChip(checks: BuyBoxCheck[], mandate: MandateScore | null): BuyBoxChip {
  if (mandate?.score != null && mandate.verdict) {
    const outside = foldBuyBoxChecks(checks) === "outside";
    return {
      label: fitScoreLabel(mandate.score, mandate.verdict, outside),
      tone: outside ? "kill" : MANDATE_TONE[mandate.verdict],
    };
  }
  if (checks.some((c) => c.status === "miss")) return { label: "Outside buy box", tone: "kill" };
  if (checks.some((c) => c.status === "near")) return { label: "Near buy box", tone: "caution" };
  if (checks.length > 0 && checks.every((c) => c.status === "pass")) return { label: "Fits buy box", tone: "pass" };
  return { label: "Buy box unverified", tone: "muted" };
}
