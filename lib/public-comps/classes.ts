// The classes a recorded-sales search can be held to: those the property
// database files its sales under (lib/ingest/normalize `NormalizedClass`),
// each named by the site's own class key (lib/asset-class), so a search's
// filter and a deal's class (lib/asset-words `dealClassKey`) are one word.
// A class the database files under a name of its own is mapped here, ours to
// ours: "retail" is the database's "commercial_retail", a hotel its
// "hospitality", land its "land". The database's "specialty" and "other"
// are no class a deal is filed under, so a search is never held to them.
//
// Pure, no runtime imports beyond the label map.

import { ASSET_CLASS_LABEL } from "@/lib/asset-class";
import type { NormalizedClass } from "@/lib/ingest/normalize";

/** The site's class key → the class the property database files it under. */
export const DB_CLASS_FOR: Readonly<Record<string, NormalizedClass>> = {
  multifamily: "multifamily",
  mixed_use: "mixed_use",
  retail: "commercial_retail",
  office: "office",
  industrial: "industrial",
  hospitality_str: "hospitality",
  land_infill: "land",
};

/** The class select's options on /comps: [key, label], the label map's own
 *  words, in its order. */
export const COMPS_CLASS_OPTIONS: readonly (readonly [string, string])[] = Object.keys(ASSET_CLASS_LABEL)
  .filter((k) => k in DB_CLASS_FOR)
  .map((k) => [k, ASSET_CLASS_LABEL[k]] as const);

/** A search's class key read from what a caller hands it ("Multifamily",
 *  "multifamily", "retail"), or "" for all sales and for a class the
 *  database does not file. */
export function compsClassKey(raw: string | null | undefined): string {
  const k = (raw ?? "").trim().toLowerCase();
  return k in DB_CLASS_FOR ? k : "";
}

/** How a class filter reads in the scope line: "multifamily", "office",
 *  "mixed-use". */
export function classFilterText(key: string): string {
  return (ASSET_CLASS_LABEL[key] ?? key).toLowerCase();
}
