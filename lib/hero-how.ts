// How each of the deal header's figures was reached — the words its "how
// this is read" popover says (app/(app)/deals/[id]/figure-how.tsx). Built
// ONLY from what the header's own readers already hand back: the row the
// price, size or cap reader found (its words, its page held to the
// memorandum's real length by lib/facts `locatedPage`), the figure the
// tile prints, the cap slot's provenance (lib/compare-interest
// `goingInCapFigure`) and its own words, the plan's facts (lib/plan-facts
// `planFacts`), the strategy read and the buy box's checks. Nothing here
// computes a figure: a tile and its popover cannot disagree, since the
// popover quotes what the tile's reader returned.
//
// Pure. The deal page and lib/sample-header both call it on the values
// they hand `DealHero`.

import type { ExtractionResult } from "@/lib/anthropic/types";
import type { BuyBoxRead } from "@/lib/buy-box-chip";
import { NOTE_CAP_TITLE, OWN_YIELD } from "@/lib/cap-slot";
import { type CapSlotProvenance, SHARE_CAP_WORDS, UNDER_WATER_WORDS } from "@/lib/compare-interest";
import { type DealStrategy, FORWARD_READING, type PlanSummary, STRATEGY_READING } from "@/lib/deal-strategy";
import { locatedPage } from "@/lib/facts";
import type { FigureHow, HeroFigure } from "@/lib/hero-figure";
import { PLAN_YOC_TITLE, planFacts } from "@/lib/plan-facts";

/** A row a reader found: its label as the memorandum states it, its value,
 *  and the page the extraction cited for it. */
export interface HowRow {
  label: string;
  value: string;
  page?: string;
}

export interface HeroHowInput {
  extraction: ExtractionResult | null;
  strategy: DealStrategy;
  plan: PlanSummary | null;
  /** the price slot: the row `findPriceMetric` found, the price as stated
   *  (the row's, else the first read's), the tile `priceFigureOf` drew and
   *  what the price buys (lib/interest `interestTag`) */
  price: { row: HowRow | null; stated: string | null; figure: HeroFigure; tag: string | null };
  /** the size slot: the area row (`buildingSfRow`), the count row
   *  (`unitCountRow`) and the figure the tile prints */
  size: { sfRow: HowRow | null; unitsRow: HowRow | null; value: string | null };
  /** the cap slot on a deal with no plan: the row `findGoingInCap` found,
   *  and the tile `goingInCapFigure` drew with its provenance */
  cap: { row: HowRow | null; figure: HeroFigure & { provenance?: CapSlotProvenance } } | null;
  /** the deal type as the tile prints it (`dealTypeLabel`) */
  dealType: string | null;
}

/** The four figures' words, in the tiles' order. */
export interface HeroHow {
  price: FigureHow;
  size: FigureHow;
  ret: FigureHow;
  dealType: FigureHow;
}

const quote = (s: string) => `“${s.trim()}”`;

/** "the memorandum's “Asking price” row, page 12" — the page only where it
 *  parses and falls inside the memorandum (lib/facts, the absolute rule). */
function cite(row: { label: string; page?: string }, extraction: ExtractionResult | null, what = "row"): string {
  const page = locatedPage(row.page, extraction?.totalPages ?? null);
  return `the memorandum's ${quote(row.label)} ${what}${page != null ? `, page ${page}` : " (page not located)"}`;
}

const fromRow = (row: HowRow, extraction: ExtractionResult | null): string => `From ${cite(row, extraction)}.`;

/** A figure read before the extraction, or beside an extraction whose rows
 *  state none: the first read's. */
function fromFirstRead(extraction: ExtractionResult | null, none: string): string {
  return extraction
    ? `From the first read of the memorandum: its extracted terms state no ${none}.`
    : "From the first read of the memorandum, before its terms are extracted.";
}

function notRead(extraction: ExtractionResult | null, none: string): string {
  return extraction ? `The memorandum states no ${none} the screen reads.` : "Not read yet: the memorandum's terms are not extracted.";
}

const withAny = (how: FigureHow): FigureHow => ({
  source: how.source,
  ...(how.inputs?.length ? { inputs: how.inputs } : {}),
  ...(how.notes?.length ? { notes: how.notes } : {}),
});

function priceHow(input: HeroHowInput): FigureHow {
  const { extraction, plan } = input;
  const { row, stated, figure, tag } = input.price;
  const source = row
    ? fromRow(row, extraction)
    : stated
      ? fromFirstRead(extraction, "price")
      : notRead(extraction, "price");
  const inputs: { label: string; value: string }[] = [];
  if (stated) inputs.push({ label: "As stated", value: stated.trim() });
  if (tag) inputs.push({ label: "What the price buys", value: tag });
  const notes: string[] = [];
  if (figure.title && stated && figure.value !== stated) notes.push("Stated as a range, drawn short in the tile.");
  if (plan?.priceLabel === "Land cost") notes.push("On a development the land or site cost is what is being bought, so the tile reads it as the land cost.");
  if (plan?.priceWithheld) notes.push(plan.priceWithheld);
  return withAny({ source, inputs, notes });
}

function sizeHow(input: HeroHowInput): FigureHow {
  const { extraction } = input;
  const { sfRow, unitsRow, value } = input.size;
  if (sfRow) return withAny({ source: fromRow(sfRow, extraction), inputs: [{ label: "As stated", value: sfRow.value.trim() }] });
  if (unitsRow) {
    const bare = /^[\d,]+$/.test(unitsRow.value.trim());
    return withAny({
      source: fromRow(unitsRow, extraction),
      inputs: [{ label: "As stated", value: unitsRow.value.trim() }],
      notes: [
        "The memorandum states no area the screen reads as the building's, so the tile shows its count.",
        ...(bare ? ["A bare count is said in its row's own noun, else the asset class's."] : []),
      ],
    });
  }
  return value
    ? withAny({ source: fromFirstRead(extraction, "size"), inputs: [{ label: "As read", value }] })
    : { source: notRead(extraction, "size") };
}

function capHow(input: HeroHowInput): FigureHow {
  const { extraction } = input;
  const cap = input.cap!;
  const { figure, row } = cap;
  const atPrice = input.price.stated ? [{ label: "At its price", value: input.price.stated.trim() }] : [];
  switch (figure.provenance) {
    case "note_yield":
      return withAny({
        source: "The note's yield to maturity at its price, solved on the loan's terms the memorandum states.",
        inputs: [...atPrice, ...(figure.value ? [{ label: "Yield to maturity", value: figure.value }] : [])],
        notes: [NOTE_CAP_TITLE],
      });
    case "position_yield":
      return withAny({
        source: "The position's yield to redemption at its price, solved on the terms the memorandum states.",
        inputs: [...atPrice, ...(figure.value ? [{ label: "Yield to redemption", value: figure.value }] : [])],
        notes: [OWN_YIELD.position.title],
      });
    case "note_withheld":
      return withAny({ source: "Withheld: no yield to maturity stands for this note.", inputs: atPrice, notes: [NOTE_CAP_TITLE] });
    case "position_withheld":
      return withAny({ source: "Withheld: no yield to redemption stands for this position.", inputs: atPrice, notes: [OWN_YIELD.position.title] });
    case "under_water":
      return withAny({ source: "Withheld: the note is under water.", inputs: atPrice, notes: [UNDER_WATER_WORDS.title] });
    case "share":
      return { source: "Withheld: what the price buys is a share.", notes: [SHARE_CAP_WORDS.title] };
    default:
      if (row) return withAny({ source: fromRow(row, extraction), inputs: [{ label: "As stated", value: row.value.trim() }] });
      return figure.value
        ? withAny({ source: fromFirstRead(extraction, "going-in cap"), inputs: [{ label: "As read", value: figure.value }] })
        : { source: notRead(extraction, "going-in cap") };
  }
}

function yieldHow(input: HeroHowInput): FigureHow {
  const { extraction } = input;
  const plan = input.plan!;
  const facts = planFacts(plan);
  // The plan's own facts, as its strip prints them: the NOI, the price, the
  // budget, the total cost and the yield (never the basis a unit).
  const inputs = facts.slice(0, 5).map(([label, value]) => ({ label, value }));
  const notes: string[] = [];
  const noi = plan.stabilizedNoi;
  if (noi) notes.push(`The NOI is ${cite(noi, extraction)}.`);
  if (plan.budget) {
    notes.push(
      plan.budget.program
        ? `The budget is ${plan.budget.label}.`
        : `The budget is ${cite(plan.budget, extraction, "line")}${plan.budget.allIn ? ", less the price" : ""}.`,
    );
  }
  if (plan.costWithheld) notes.push(plan.costWithheld);
  notes.push(PLAN_YOC_TITLE);
  const source =
    plan.yieldOnCost != null
      ? plan.forward
        ? "Derived: the NOI the memorandum states at delivery, over the price, the buyer's whole cost."
        : "Derived: the stabilized NOI the memorandum states, over the plan's total cost."
      : plan.yieldWithheld
        ? "Withheld: the plan's figures do not tie."
        : "Not struck: the yield needs both a stabilized NOI and a total cost the memorandum states.";
  if (plan.yieldWithheld && plan.yieldOnCost == null) notes.unshift(plan.yieldWithheld);
  return withAny({ source, inputs, notes });
}

function dealTypeHow(input: HeroHowInput): FigureHow {
  const { strategy, extraction, plan } = input;
  if (strategy.kind === "unknown" || !input.dealType) {
    return { source: extraction ? "The memorandum names no plan the screen reads." : "Not read yet: the memorandum's terms are not extracted." };
  }
  // What the kind means for the figures — but not beside a cap slot that
  // holds a note's or a position's yield, or a share's withheld cap: there
  // the price buys no building to strike a cap on.
  const capOwn = input.cap?.figure.provenance;
  const reading = capOwn && capOwn !== "stated" ? "" : plan?.forward ? FORWARD_READING : STRATEGY_READING[strategy.kind];
  const summary = strategy.summary.trim();
  return withAny({
    source:
      strategy.source === "extraction"
        ? "From the memorandum's own words: the extraction read the plan as stated."
        : "Inferred: the memorandum names no plan, so the screen reads it off the memorandum's words and its rows.",
    inputs: summary && summary !== reading ? [{ label: strategy.source === "extraction" ? "In its words" : "Read as", value: summary }] : [],
    notes: reading ? [reading] : [],
  });
}

/** The words of the header's four figures' "how this is read". */
export function heroHow(input: HeroHowInput): HeroHow {
  return {
    price: priceHow(input),
    size: sizeHow(input),
    ret: input.plan ? yieldHow(input) : input.cap ? capHow(input) : { source: notRead(input.extraction, "going-in cap") },
    dealType: dealTypeHow(input),
  };
}

/**
 * The buy-box fit's "how this is read": the score's meaning where there is
 * one, each criterion the box sets with the line its check says (lib/
 * criteria `evaluateBuyBox`'s `detail`), and the chip's own note (lib/
 * fit-label `checkedSentence`) where the box could not be judged whole.
 */
export function fitHow(read: BuyBoxRead): FigureHow {
  const score = read.mandate?.score;
  const notes: string[] = [];
  if (/Outside box/.test(read.chip.label)) notes.push("A criterion missed outright reads “Outside box”, whatever the score's call.");
  if (read.mandate?.dealbreakerTripped) notes.push("A red line the buy box sets is crossed.");
  if (read.chip.note) notes.push(read.chip.note);
  return withAny({
    source:
      score != null
        ? `Fit ${score} is the mandate-fit score out of 100, over the buy box's criteria the screen could read.`
        : "Your buy box's criteria, each set against what the screen read.",
    inputs: read.checks.map((c) => ({ label: c.label, value: c.detail })),
    notes,
  });
}
