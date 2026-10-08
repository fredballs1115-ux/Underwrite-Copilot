// The picture a deal wears in the pipeline when there is no photograph of it
// to show (#442).
//
// The operator's rule for the pipeline is pictures, not maps. A card leads
// with the building's own photograph, then Street View, then the photograph
// its market is known by (#438); before this, a deal with none of those fell
// to the USGS overhead, which at card size reads as a map, and the list's
// thumbnails were overheads for every deal without a photograph. The last
// resort is now a COVER: an illustration of the deal's kind of building
// under a sky of its own, and the place named at the foot. It is plainly an
// illustration, not a photograph, so it can never pass for the building, or
// for another one; the overhead stays on the deal page, one step along its
// filmstrip.
//
// Pure: the page resolves the facts server-side (the class through
// lib/asset-words) and hands the component plain data — a kind, a sky's
// number and a draw, never the colours themselves; the drawing is
// lib/deal-cover-art, which the image route and the emails draw their cover
// from too (#443, #464), so every surface shows one cover for one deal.

import type { StructuredAddress } from "@/lib/address";
import { assetClassKey } from "@/lib/asset-words";
import { COVER_TONES, type CoverKind, type CoverScene } from "@/lib/deal-cover-art";

export type { CoverKind };
export { COVER_TONES };

export interface DealCoverFacts extends CoverScene {
  /** where the deal is, as a card names it: "Waco, TX" — null where nothing says */
  place: string | null;
}

/** Which drawing a class gets. */
const KIND_BY_CLASS: Record<string, CoverKind> = {
  multifamily: "housing",
  // A scattered-site or build-to-rent portfolio and a park are homes, not
  // an apartment block (#470).
  sfr_btr: "homes",
  student_housing: "housing",
  senior_housing: "housing",
  manufactured_housing: "homes",
  office: "office",
  medical_office: "office",
  mixed_use: "office",
  data_center: "industrial",
  industrial: "industrial",
  retail: "retail",
  net_lease: "retail",
  hospitality_str: "hotel",
  self_storage: "storage",
  land_infill: "land",
  parking: "building",
};

/** The drawing for a deal's class, as the deck or its owner names it. */
export function coverKindFor(assetClass: string | null | undefined): CoverKind {
  const key = assetClassKey(assetClass ?? "");
  return (key && KIND_BY_CLASS[key]) || "building";
}

/** FNV-1a over the deal's id: the one hash its cover is drawn from. */
function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The skies a deal could wear before research pass 29 added four. */
const FIRST_SKIES = 8;

/**
 * A deal's sky, as its number in `COVER_TONES`: the same deal always wears
 * the same one. Of the twelve, a deal wears the one it wore among the first
 * eight (its hash's own eighth, the one its gradient had before the drawing)
 * two times in three, and one of the four added the third time — two of the
 * old eight to each — so each of the twelve is worn as often, and most of a
 * pipeline keeps the sky it had.
 */
export function coverToneFor(seed: string): number {
  const h = hashOf(seed);
  const old = h % FIRST_SKIES;
  const added = COVER_TONES.length - FIRST_SKIES;
  return added > 0 && (h >>> 3) % 3 === 0 ? FIRST_SKIES + (old % added) : old;
}

/** A deal's own draw of its cover (lib/deal-cover-art `coverDraw`): its hour
 *  and its light's side, where the building stands and what stands beside
 *  it, where the sun sits, which windows are lit — mixed from the same hash
 *  so it varies apart from the sky: two deals under one sky still differ. */
export function coverVariantFor(seed: string): number {
  let h = hashOf(seed);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Where a card says the deal is: the address's city and state, else the
 * market the site placed it in, else the market the memorandum names —
 * cut to a card's line — else nothing.
 */
export function coverPlace(
  address: Partial<StructuredAddress> | null | undefined,
  marketName?: string | null,
  marketText?: string | null,
): string | null {
  const city = address?.city?.trim();
  const state = address?.state?.trim();
  if (city && state) return `${city}, ${state}`;
  if (marketName?.trim()) return marketName.trim();
  const text = marketText?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 40 ? `${text.slice(0, 39).trimEnd()}…` : text;
}

/** The cover a deal wears where there is no photograph of it. */
export function coverFor(opts: {
  seed: string;
  assetClass?: string | null;
  place?: string | null;
}): DealCoverFacts {
  return {
    kind: coverKindFor(opts.assetClass),
    tone: coverToneFor(opts.seed),
    variant: coverVariantFor(opts.seed),
    place: opts.place ?? null,
  };
}
