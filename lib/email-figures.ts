// The screen-complete email's figure tiles, the way a listing alert opens:
// the price with its basis under it, the cap (or a plan deal's yield on
// cost, or a note's own yield) and the size. Each is read through the reader
// the pipeline's card or the deal header reads it through — the card's slots
// (lib/pipeline-slots `pickSlots`) and its price (`compactPrice`), the cap
// slot's words (lib/cap-slot), and the header's size (lib/sample-header
// `headerFacts`) — so the email never says a figure the page it links to
// says another way. Pure; a figure the deal does not state is left out,
// never drawn as a dash in an email.

import type { StructuredAddress } from "@/lib/address";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { pickSlots } from "@/lib/pipeline-slots";
import { CAP_WITHHELD, ownYieldOf } from "@/lib/cap-slot";
import { headerFacts } from "@/lib/sample-header";
import { compactPrice } from "@/app/(app)/deals/deal-card-parts";

export interface EmailFigure {
  label: string;
  value: string;
  /** the line under the figure: the price's basis, what a yield runs to */
  sub?: string | null;
}

export function emailFigures(input: {
  name: string;
  assetClass: string | null;
  extraction: ExtractionResult | null;
  firstSignal: FirstSignal | null;
  address: StructuredAddress | null;
  /** the day the slots are read on (ISO) */
  today: string;
}): EmailFigure[] {
  const { extraction, firstSignal } = input;
  if (!extraction && !firstSignal) return [];
  const slots = pickSlots(extraction, firstSignal, input.assetClass ?? "", {
    address: input.address,
    siteFlags: null,
    today: input.today,
  });
  const out: EmailFigure[] = [];

  // The card's price tile: the figure as the card draws it, its basis under it.
  if (slots.price) out.push({ label: "Price", value: compactPrice(slots.price), sub: slots.basis ?? null });

  // The card's cap tile, its label and its words: a plan deal's yield on
  // cost, a note's or a position's own yield, or why no cap stands.
  const ownYield = !slots.cap && !slots.yoc && slots.noteYield;
  const capLabel =
    !slots.cap && (slots.yoc || slots.plan) ? "Yield on cost" : !slots.cap && slots.noteYield ? ownYieldOf(slots.capWithheld).label : "Cap";
  const capValue =
    slots.cap ??
    slots.yoc ??
    slots.noteYield ??
    (slots.capWithheld ? CAP_WITHHELD[slots.capWithheld].na : slots.yocWithheld ? "n/a" : null);
  if (capValue) {
    out.push({
      label: capLabel,
      value: capValue,
      sub: ownYield ? ownYieldOf(slots.capWithheld).to : null,
    });
  }

  // The header's size: the building's area, else its count in its own noun.
  const size = headerFacts({
    name: input.name,
    storedAssetClass: input.assetClass,
    extraction,
    firstSignal,
    address: input.address,
    verdict: null,
    box: null,
    asOf: new Date(`${input.today}T12:00:00Z`),
  }).figures.find((f) => f.label === "Size")?.value;
  if (size) out.push({ label: "Size", value: size });

  return out;
}
