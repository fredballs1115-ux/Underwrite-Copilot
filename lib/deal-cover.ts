// The picture a deal wears in the pipeline when there is no photograph of it
// to show (#442).
//
// The operator's rule for the pipeline is pictures, not maps. A card leads
// with the building's own photograph, then Street View, then the photograph
// its market is known by (#438); before this, a deal with none of those fell
// to the USGS overhead, which at card size reads as a map, and the list's
// thumbnails were overheads for every deal without a photograph. The last
// resort is now a COVER: a deep gradient of its own, the building type drawn
// in line art, and the place named at the foot. It is plainly a cover, not a
// photograph, so it can never pass for the building, or for another one; the
// overhead stays on the deal page, one step along its filmstrip.
//
// Pure: the page resolves the facts server-side (the class through
// lib/asset-words, so its table stays out of the browser bundle) and hands
// the component plain data.

import type { StructuredAddress } from "@/lib/address";
import { assetClassKey } from "@/lib/asset-words";

/** What the line art draws: the building types a pipeline holds. */
export type CoverKind = "housing" | "office" | "industrial" | "retail" | "hotel" | "storage" | "land" | "building";

export interface DealCoverFacts {
  kind: CoverKind;
  /** the gradient's two stops, light to dark */
  tone: readonly [string, string];
  /** where the deal is, as a card names it: "Waco, TX" — null where nothing says */
  place: string | null;
}

/**
 * The gradients, each a deep pair that white words read on at AAA over the
 * whole frame (held by the test). Dusk, harbour, forest, slate, plum, brick,
 * teal, bronze: the pipeline's cards get told apart by colour without any
 * one of them shouting over the photographs beside it.
 */
export const COVER_TONES: readonly (readonly [string, string])[] = [
  ["#1f5f5b", "#0b2e2c"],
  ["#2f5d8a", "#12263d"],
  ["#3d6b45", "#172c1b"],
  ["#4b5a6e", "#1c2430"],
  ["#6a4c7d", "#2a1c33"],
  ["#8a4f3d", "#3a1d14"],
  ["#2d6f86", "#0f2c38"],
  ["#7a6036", "#302310"],
];

/** Which drawing a class gets. */
const KIND_BY_CLASS: Record<string, CoverKind> = {
  multifamily: "housing",
  sfr_btr: "housing",
  student_housing: "housing",
  senior_housing: "housing",
  manufactured_housing: "housing",
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

/** A deal's gradient: the same deal always wears the same one. */
export function coverToneFor(seed: string): readonly [string, string] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return COVER_TONES[(h >>> 0) % COVER_TONES.length];
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
  return { kind: coverKindFor(opts.assetClass), tone: coverToneFor(opts.seed), place: opts.place ?? null };
}
