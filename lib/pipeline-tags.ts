// The tags a pipeline deal carries beside its figures — a flood zone, how
// it is sold, what the price buys, the seller's loan, a covenant on the
// rents, the one lease, the listed tenants, a renovation program, a tax
// abatement, a hotel's contracts, the third-party reports, and the reads of
// a student building, a park and a storage facility — in ONE order, each
// with its tone and its tooltip, so the list row and the card draw one list
// (lib/pipeline-slots reads each slot). And the card's rule for which of
// them its picture carries: a chip there is never cut, so one that cannot
// fit whole on a picture as wide as its card's waits on the card's own
// line under the figures. Pure: no I/O, no LLM.
import type { PipelineSlots } from "@/lib/pipeline-slots";
import { PERSONAL_CHIP, PERSONAL_TITLE } from "@/lib/personal-deal";

/** A tag's tone: the brand's for what the deal page reads, caution and kill
 *  for what warns, and muted for what is about the pipeline, not the deal. */
export type TagTone = "brand" | "caution" | "kill" | "muted";

/**
 * A deal in the reader's own pipeline while the reader is on a team
 * (lib/personal-deal): their teammates do not see it. Not one of
 * `dealTags` — it says who sees the deal, not what the memorandum says — so
 * it rides on the card's line under the figures and the row's tag line, at
 * every width, and never on the picture.
 */
export const PERSONAL_TAG: DealTag = { key: "personal", text: PERSONAL_CHIP, tone: "muted", title: PERSONAL_TITLE };

export interface DealTag {
  /** the slot it comes from, stable for a React key */
  key: string;
  text: string;
  tone: TagTone;
  /** what it means and where the deal page reads it */
  title: string;
}

/**
 * A deal's tags in the order they are read: the site's hazard first, then
 * what qualifies the price (how it is sold, what it buys), the financing a
 * buyer can take over, the income's terms, the reports, and the reads a
 * class of its own carries. A slot the memorandum does not fill is no tag.
 */
export function dealTags(slots: PipelineSlots, flood?: { tag: string | null } | null): DealTag[] {
  const tag = (key: string, text: string | null | undefined, tone: TagTone, why: string): DealTag | null =>
    text ? { key, text, tone, title: `${text}: ${why}` } : null;
  return [
    // A Special Flood Hazard Area (#426): a cost and a lender's condition.
    tag("flood", flood?.tag, "kill", "FEMA's Special Flood Hazard Area — a federally backed loan requires flood insurance; the deal page draws the map"),
    // An auction's figure is where the bidding opens; a court's or a
    // lender's sale is as-is (#456).
    tag("sale", slots.sale, "caution", "the figure is where the bidding opens or the seller is not an owner — the deal page reads the sale"),
    // A share's price, a note's, the land's under a ground lease (#415).
    tag("interest", slots.interest, "brand", "the price does not buy the building outright — the deal page says what it buys"),
    // The seller's loan, offered for assumption (#419).
    tag("debt", slots.debt, "brand", "the seller's loan is offered for assumption — the deal page prices it against today's rate"),
    // A note the seller will carry (#462).
    tag("sellerNote", slots.sellerNote, "brand", "the seller offers to carry financing — the deal page prices the note against today's rate"),
    // A covenant or a contract that sets the rents (#453).
    tag("affordable", slots.affordable, "brand", "a covenant or a contract sets these rents — the deal page says until when"),
    // One tenant leases the whole property (#454).
    tag("tenancy", slots.tenancy, "brand", "one lease is the whole income — the deal page reads its guarantor, its term and its increases"),
    // An anchor not in the sale, a roll before the model's sale (#457).
    tag("roster", slots.roster, "caution", "the listed tenants against the model's sale — the deal page reads the roll, the anchors and their rights"),
    // A renovation program's premium and its return on cost (#460).
    tag("valueAdd", slots.valueAdd, "brand", "the renovation program as stated — the deal page reads its proof, its pace and what the model does not carry"),
    // The NOI is on an abated tax bill that ends (#461).
    tag("abatement", slots.abatement, "caution", "the NOI is on an abated tax bill — the deal page reads when it ends and what it is worth"),
    // What a hotel is sold with (#455).
    tag("hotel", slots.hotel, "brand", "what the hotel is sold with — the deal page reads the flag, the manager and the PIP"),
    // The most serious thing the third-party reports found (#465).
    tag("reports", slots.reports, "caution", "from the third-party reports the memorandum cites — the deal page reads them"),
    // Pre-leasing behind last year's, or a drive to campus, warns (#468).
    tag(
      "student",
      slots.student,
      slots.student && /−|Drive-to/.test(slots.student) ? "caution" : "brand",
      "a student building's leasing for the coming year — the deal page reads the pace, the beds and the walk to campus",
    ),
    // A private water or sewer system warns (#470).
    tag(
      "mh",
      slots.mh,
      slots.mh && /Private/.test(slots.mh) ? "caution" : "brand",
      "a manufactured-housing park — the deal page reads the lot rent against the market's, the park-owned homes and the water and sewer",
    ),
    // A lease-up warns (#471).
    tag(
      "storage",
      slots.storage,
      slots.storage && /Lease-up/.test(slots.storage) ? "caution" : "brand",
      "a self-storage facility — the deal page reads its two occupancies and the rent sitting tenants pay against the street rate",
    ),
  ].filter((t): t is DealTag => t !== null);
}

/**
 * Each character's advance in a chip's type (Geist semibold at 11px), in
 * px, by class: each class's figure is at least its widest member as
 * Chromium drew it (2026-10-01). lib/pipeline-tags.test.ts holds every
 * printable character to its class, and the sums to the widths Chromium
 * drew for the tags the site writes, so an estimate runs a few percent
 * over the width drawn and never under it. A character not listed ("—",
 * "@", "W", anything past ASCII) counts as a full em.
 */
const ADVANCE: readonly (readonly [string, number])[] = [
  ["',.·", 2.5],
  [" ", 2.7],
  ["!i`I|jl():;", 3.4],
  ['ftr1[]"\\', 4.3],
  ["{}/-*^", 5],
  ["~−<=>#_+?–sczyakevnxohuLZFTJ7", 6.6],
  ["gbdpqE69", 6.8],
  ["Y3248P", 7.1],
  ["K5$XS&BR0VUHA", 7.8],
  ["DCGNQO", 8.4],
  ["%wmM", 9.8],
];
const WIDEST = 11;
/** A chip's own padding: 8px a side (`px-2`). */
const CHIP_PADDING = 16;

/** A chip's width on the picture, in px — an estimate never under what the
 *  browser draws (see ADVANCE). */
export function chipWidth(text: string): number {
  let w = CHIP_PADDING;
  for (const ch of text) w += ADVANCE.find(([set]) => set.includes(ch))?.[1] ?? WIDEST;
  return Math.round(w * 10) / 10;
}

/**
 * The picture widths a card's chips are placed for, in px, narrowest first:
 * a card's picture is at least the first, and each tier holds from its
 * width up to the next's. The card component asks the same widths of its
 * own picture (container queries, `@min-[278px]/card`, `@min-[348px]/card`).
 *  - 222: the narrowest the grid draws — two columns beside the 240px
 *    sidebar at 768px wide (768 − 240 − 2 × 32 of page padding leaves 464,
 *    less the 16px gap, over two is a 224px card), less the card's 1px
 *    border a side;
 *  - 278: a phone's card from 320px wide, two columns from 640 (beside the
 *    sidebar from 880), three from 1280 and four from 1536;
 *  - 348: a phone's card from 390px wide, two columns beside the sidebar
 *    from 1020, three from 1386.
 */
export const PICTURE_TIERS = [222, 278, 348] as const;

/** The room a chip has on a picture of a width: 58% of it, since the call
 *  sits on the picture's other side. */
export function pictureRoom(width: number): number {
  return Math.floor(width * 0.58);
}

/** How many chips a picture carries, stacked down its corner, before they
 *  would run into its caption and its arrows on the narrowest card. */
export const PICTURE_CHIPS = 2;

/**
 * Which tags ride on a card's picture of a width and which wait on the
 * card's line under the figures: the first two, in order, that fit whole
 * ride on the picture; every other tag keeps its order on the line. A tag
 * is never cut wherever it is.
 */
export function placeTags(tags: readonly DealTag[], width: number = PICTURE_TIERS[0]): { picture: DealTag[]; line: DealTag[] } {
  const room = pictureRoom(width);
  const picture: DealTag[] = [];
  const line: DealTag[] = [];
  for (const t of tags) {
    if (picture.length < PICTURE_CHIPS && chipWidth(t.text) <= room) picture.push(t);
    else line.push(t);
  }
  return { picture, line };
}

/** Each tag, in order, with whether it rides on the picture at each of the
 *  `PICTURE_TIERS` (narrowest first). */
export function placeTagsByTier(tags: readonly DealTag[]): { tag: DealTag; onPicture: boolean[] }[] {
  const onPicture = PICTURE_TIERS.map((w) => new Set(placeTags(tags, w).picture.map((t) => t.key)));
  return tags.map((tag) => ({ tag, onPicture: onPicture.map((keys) => keys.has(tag.key)) }));
}
