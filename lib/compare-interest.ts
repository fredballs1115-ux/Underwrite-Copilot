// What the compare table's model figures mean where the price is not the
// building's (#423). The table reads each deal's document-generated model,
// which runs at the price the documents state — and on a note that is a
// loan's price, on a share the share's. The model's cap and returns then
// set a building's income against a price that did not buy the building,
// and the table printed them in a row beside deals whose price did.
//
// Pure: the extraction and the model's own figures come in.
//
// Three rules, each the deal page's own (lib/interest):
//
//   A NOTE HAS NO CAP. The collateral's NOI over a loan's price is a cap
//   nobody earns, so the cap row says the note's yield to maturity at its
//   price instead — only where the note pays or may, since a yield nobody
//   earns is not a figure to compare on — and the model's returns are
//   withheld: they are the collateral's, bought outright, not the note's.
//
//   A SHARE'S PRICE IS FOR THE SHARE. The cap is struck on the whole the
//   share's price implies (`buildingPriceOf`), the building's figure beside
//   other buildings'. The returns stand only where the model already ran at
//   that whole — within 2% of it; run at the share's price they set the
//   whole building's cash flows against a fraction of its cost. Beside a
//   loan its entity carries, the share grossed up is the equity's whole, no
//   building's price: no cap is struck and the returns are withheld. A share
//   of the general partner's interest is a share of a share (research pass
//   37): nothing grosses it up, so its cap and returns are withheld as a
//   share's of no stated percentage are, each cell "n/a — share".
//
//   A PREFERRED EQUITY POSITION HAS NO CAP EITHER (lib/position). Its price
//   buys a rate and a redemption, never a slice of the building: the cap row
//   says its yield to redemption at its price — only where its redemption
//   date has not gone by — and the model's returns are withheld as the
//   building's, bought outright, not the position's.
//
//   A LEASE THAT ENDS INSIDE THE HOLD HAS NO SALE (research pass 38). A
//   leasehold's model sells the building at the hold's end; where its lease
//   ends first — the ground lease, or a sandwich position's master lease —
//   the building has reverted by then, so the returns are withheld with the
//   leasehold card's own sentence (lib/leasehold-exit `leaseEndInHold`),
//   read against the hold of the model handed in. The cap stands: year 1 is
//   inside the lease.
//
//   EVERYTHING ELSE STANDS, as the model runs it. A leasehold's model runs
//   the lease's building at the leasehold's price. A leased fee's runs at
//   the land's price but reads no ground rent as its income
//   (lib/underwrite/inputs): year 1 runs on the NOI a building's model reads
//   (a statement's or the memorandum's, else the price × the stated cap,
//   else an assumed 6%), with a building's assumptions, and its price note
//   names the stated ground rent beside it. The price row says which
//   interest it is, with the years to the lease's end.
//
// The first rule reaches past the table (the audit of 2026-09-30): the deal
// header, the pipeline card and the meeting workbook printed a note's
// collateral cap as its going-in cap, and the deal page's leverage read ran
// on it. `noteCapSlot` and `goingInCapFigure` say it for them.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { findGoingInCap, parsePct } from "@/lib/criteria";
import { askingPriceOf, buildingPriceOf, signalGoingInCap } from "@/lib/deal-strategy";
import { interestOf, interestTag, isGpStake, isWholeShare, leaseholdTermOf, readInterest } from "@/lib/interest";
import { leaseEndInHold, type LeaseEndInHold } from "@/lib/leasehold-exit";

export interface CompareModel {
  purchasePrice?: number | null;
  /** year-1 NOI, $ */
  year1Noi?: number | null;
  /** the model's going-in cap, percent */
  goingInCapPct?: number | null;
  /** the model's hold, whole years: a leasehold whose lease ends inside it
   *  has its returns withheld (research pass 38); absent, they stand */
  holdYears?: number | null;
}

export interface CompareInterest {
  /** what the price buys, beside it — "Note", "49% share", "Leasehold, 45
   *  yrs left", "Leased fee" — null on a fee simple */
  tag: string | null;
  /** the going-in cap on the building's price, percent — null on a note,
   *  which has none, and on a share with no stated percentage or beside the
   *  loan its entity carries (`buildingPriceOf` has no building's price) */
  cap: number | null;
  /** the buyer's own yield at the price, percent: a note's to maturity
   *  where it pays or may, a preferred equity position's to redemption
   *  where the date has not gone by; null otherwise */
  noteYtmPct: number | null;
  /** why the model's returns are withheld; null where they stand */
  withheld: "note" | "share" | "position" | "lease" | null;
  /** where they are withheld for the lease: the year of the model's hold it
   *  ends in and the leasehold card's own sentence; absent otherwise */
  leaseEnd?: LeaseEndInHold | null;
}

/**
 * What a withheld return says after "n/a — ", in one place for every
 * surface that withholds one: what the price buys ("note", "share",
 * "position"), or where the lease ends inside the hold, when — "lease ends
 * in year 3", "master lease ends in year 3", "lease has ended". Null where
 * the returns stand.
 */
export function withheldWord(ci: Pick<CompareInterest, "withheld" | "leaseEnd">): string | null {
  if (ci.withheld !== "lease") return ci.withheld;
  const e = ci.leaseEnd;
  const lease = e?.lease === "master lease" ? "master lease" : "lease";
  return e == null ? lease : e.passed ? `${lease} has ended` : `${lease} ends in year ${e.year}`;
}

/** What has a yield of its own in the cap slot, where the price buys no
 *  building's cap: a note, a preferred equity position. */
export type OwnYield = "note" | "position";

/** The words each says in a cap slot: the yield's label, the end it runs
 *  to, and the slot where no yield can be stated. */
export const OWN_YIELD_WORDS: Record<OwnYield, { label: string; to: string; na: string }> = {
  note: { label: "Yield to maturity", to: "to maturity", na: "n/a — note" },
  position: { label: "Yield to redemption", to: "to redemption", na: "n/a — position" },
};

/** A note's or a position's own yield as every summary prints it in the cap
 *  slot — the deal header, the pipeline card and its CSV, the meeting
 *  workbook: one decimal, "17.0%". */
export const ownYieldText = (pct: number): string => `${pct.toFixed(1)}%`;

/** How near the model's price must be to the whole's for its returns to be
 *  the whole asset's rather than a share's price against a building. */
const SAME_PRICE = 0.02;

export function compareInterest(
  ex: ExtractionResult | null | undefined,
  model: CompareModel | null | undefined,
  asOf: Date = new Date(),
): CompareInterest {
  const tag = ex ? interestTag(ex, asOf) : null;
  const modelCap = model?.goingInCapPct ?? null;
  if (!ex) return { tag, cap: modelCap, noteYtmPct: null, withheld: null };
  const { kind } = interestOf(ex);

  if (kind === "note") {
    const n = readInterest(ex, askingPriceOf(ex), asOf)?.note ?? null;
    const pays = n != null && !n.matured && n.terms.status !== "non_performing";
    return { tag, cap: null, noteYtmPct: pays ? n.ytmPct : null, withheld: "note" };
  }

  if (kind === "preferred_equity") {
    const p = readInterest(ex, askingPriceOf(ex), asOf)?.position ?? null;
    return { tag, cap: null, noteYtmPct: p && !p.redeemedPast ? p.yieldPct : null, withheld: "position" };
  }

  if (kind === "partial_interest") {
    const whole = buildingPriceOf(ex, askingPriceOf(ex));
    const noi = model?.year1Noi ?? null;
    const cap = whole != null && noi != null && noi > 0 ? (noi / whole) * 100 : null;
    const price = model?.purchasePrice ?? null;
    const atWhole = whole != null && price != null && price > 0 && Math.abs(price - whole) / whole <= SAME_PRICE;
    return { tag, cap, noteYtmPct: null, withheld: atWhole ? null : "share" };
  }

  // A lease that ends inside the model's hold: the sale the returns are
  // built on is of a building that has reverted.
  const hold = model?.holdYears ?? null;
  if (kind === "leasehold" && hold != null && hold > 0) {
    const { term, lease } = leaseholdTermOf(ex, asOf);
    const leaseEnd = term ? leaseEndInHold(term, lease, hold) : null;
    if (leaseEnd) return { tag, cap: modelCap, noteYtmPct: null, withheld: "lease", leaseEnd };
  }

  return { tag, cap: modelCap, noteYtmPct: null, withheld: null };
}

/**
 * The deal page's Model tab under the same rules: the first-draft model it
 * draws is the one this table reads, run at the documents' price, and it
 * printed a note's or a share's cap and returns as figures beside the very
 * deals whose returns this table withholds. Its rule and why, in one
 * sentence the tab prints over the withheld figures — null where they stand.
 */
export interface ModelReturnsRead extends CompareInterest {
  /** a share of the owning entity: its cap is the whole's, said so */
  share: boolean;
  /** what a withheld return says after "n/a — " (`withheldWord`) */
  word: string | null;
  line: string | null;
}

export function modelReturnsRead(
  ex: ExtractionResult | null | undefined,
  model: CompareModel | null | undefined,
  asOf: Date = new Date(),
): ModelReturnsRead {
  const ci = compareInterest(ex, model, asOf);
  const line =
    ci.withheld === "note"
      ? "A note's price is a loan's: this model runs the collateral as if bought outright at it, so its cap and returns are the collateral's, not the note's, and are withheld."
      : ci.withheld === "position"
        ? "A preferred equity position's price is a position's: this model runs the whole building as if bought outright at it, so its cap and returns are the building's, not the position's, and are withheld."
        : ci.withheld === "share"
          ? isGpStake(ex)
            ? // A share of a share (research pass 37): no figure grosses its
              // price up to the building's, so nothing of the model's stands.
              "A share of the general partner's interest is a share of a share: this model ran the whole building's cash flows at its price, so its cap and returns are withheld."
            : ci.cap != null
              ? "A share's price is for the share: this model ran the whole building's cash flows at it rather than at the whole the price implies, so its returns are withheld, and the cap is struck on that whole."
              : interestOf(ex).entityLoan != null
                ? isWholeShare(interestOf(ex).sharePct)
                  ? // All of the entity's interests (a stated 100%, research pass 28).
                    "This price buys all of the entity's interests, and beside the loan the entity carries it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
                  : "A share's price is for the share, and grossed up beside the loan its entity carries it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
                : "A share's price is for the share, and the memorandum states no percentage to gross it up by: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
          : ci.withheld === "lease"
            ? // The leasehold card's own sentence (lib/leasehold-exit).
              (ci.leaseEnd?.sentence ?? null)
            : null;
  return { ...ci, share: !!ex && interestOf(ex).kind === "partial_interest", word: withheldWord(ci), line };
}

/**
 * A note's going-in cap slot, by the first rule above, wherever a deal's
 * figures are summarized — the deal header, the pipeline card and the
 * meeting workbook withhold the cap this table withholds: the collateral's
 * income over a loan's price is a cap nobody earns. In its place, the
 * note's yield to maturity at its price, where the note pays or may. Null on
 * anything but a note, whose cap slot stands.
 */
export function noteCapSlot(
  ex: ExtractionResult | null | undefined,
  asOf: Date = new Date(),
): { ytmPct: number | null; of: OwnYield } | null {
  if (!ex) return null;
  const kind = interestOf(ex).kind;
  if (kind !== "note" && kind !== "preferred_equity") return null;
  return { ytmPct: compareInterest(ex, null, asOf).noteYtmPct, of: kind === "note" ? "note" : "position" };
}

/** Why a deal's going-in cap slot holds no cap: its price buys a loan or a
 *  position, which have a yield of their own (`OwnYield`), or a share beside
 *  the loan its entity carries. */
export type CapWithheld = OwnYield | "share";

/** A share's withheld cap, in the words every surface says it in. */
export const SHARE_CAP_WORDS = {
  na: "n/a — share",
  title:
    "Beside the loan its entity carries, a share's price grossed up is the equity's whole, not the building's: a cap stated against that price is on a basis the memorandum never says, so no cap is shown.",
} as const;

/**
 * Whether the memorandum's stated going-in cap may fill a deal's cap slot,
 * read ONE way wherever the slot is drawn: the deal header and the bar that
 * repeats it, the research panel's leverage check, the pipeline card, its
 * list and its CSV, the meeting workbook and the compare table. Null where
 * the stated cap stands; else why it is withheld:
 *   - "note" and "position": the price buys a loan or a preferred equity
 *     position, and its own yield takes the slot (`noteCapSlot`);
 *   - "share": a share beside the loan its entity carries (lib/interest
 *     `entityLoan`), whose price grossed up is the equity's whole, not the
 *     building's — no cap is struck on it (the audit of 2026-10-04), and
 *     one the memorandum states is on a basis it never says.
 * Every other share keeps the memorandum's cap, as the header has always
 * printed it; the compare table had left it blank where no model ran.
 */
export function capSlotWithheld(ex: ExtractionResult | null | undefined): CapWithheld | null {
  if (!ex) return null;
  const { kind, entityLoan } = interestOf(ex);
  if (kind === "note") return "note";
  if (kind === "preferred_equity") return "position";
  if (kind === "partial_interest" && entityLoan != null) return "share";
  return null;
}

/**
 * The going-in cap the memorandum states, as a deal's cap slot shows it —
 * and where the extraction states none, or has not landed yet, the first
 * signal's, where it can be a cap on the price at all (lib/deal-strategy
 * `signalGoingInCap`): the deal header's own fallback, and lib/model-vs-
 * market's `dealGoingInCap`'s, so a cap the header prints is never a dash on
 * the card. None on a plan deal, which is judged on its yield on total cost
 * (its slot carries that), and none where the slot is withheld
 * (`capSlotWithheld`): a note's and a position's carry their own yield, and
 * a share's beside the loan its entity carries says why. As the text the
 * slot prints and the figure it reads — the figure null where the text names
 * none — so the memories that pool a cap (the internal comps, the market
 * memory, the analytics) pool the one the header prints.
 */
export function statedCapRead(
  extraction: ExtractionResult | null | undefined,
  planDeal: boolean,
  signal?: { goingInCap?: string | null } | null,
): { text: string; pct: number | null } | null {
  if (planDeal || capSlotWithheld(extraction)) return null;
  const row = findGoingInCap(extraction?.metrics ?? []);
  if (row) return { text: row.value, pct: parsePct(row.value) };
  const fromSignal = signalGoingInCap(signal);
  return fromSignal ? { text: fromSignal.text, pct: fromSignal.pct } : null;
}

/**
 * The going-in cap a pipeline row's Cap slot shows (`statedCapRead`'s text):
 * the compare table reads it where a deal's model has no cap
 * (lib/compare-figures), and the meeting workbook's row reads it too, so
 * every surface shows one figure. lib/pipeline-slots re-exports it.
 */
export function statedCapSlot(
  extraction: ExtractionResult | null,
  planDeal: boolean,
  signal?: { goingInCap?: string | null } | null,
): string | null {
  return statedCapRead(extraction, planDeal, signal)?.text ?? null;
}

/**
 * The going-in cap slot beside a deal's price in its header (and the bar
 * that repeats it): the cap as the memorandum states it — or, on a note,
 * its yield to maturity at its price where it pays or may, else the cap
 * withheld ("n/a — note", the compare table's words); and beside the loan
 * a share's entity carries, the cap withheld (`capSlotWithheld`).
 */
export function goingInCapFigure(
  ex: ExtractionResult | null | undefined,
  statedCap: string | null,
  asOf: Date = new Date(),
): { label: string; value: string | null; title?: string } {
  const own = noteCapSlot(ex, asOf);
  if (!own) {
    return capSlotWithheld(ex) === "share"
      ? { label: "Going-in cap", value: SHARE_CAP_WORDS.na, title: SHARE_CAP_WORDS.title }
      : { label: "Going-in cap", value: statedCap };
  }
  const words = OWN_YIELD_WORDS[own.of];
  return own.ytmPct != null
    ? { label: words.label, value: ownYieldText(own.ytmPct) }
    : { label: "Going-in cap", value: words.na };
}
