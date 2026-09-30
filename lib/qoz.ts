import "server-only";
// The designated Qualified Opportunity Zone tracts (#473): the CDFI Fund's
// list of every tract designated, keyed by the 2010 tract numbers the
// designations were made on, read from the Fund's own workbook on the runner
// (scripts/fetch-qoz-tracts.mjs, the cbsa-counties workflow's `qoz` job) and
// vendored as data/qoz-tracts.json. Server-only: the list is some 120 KB and
// only the site flags' lookup reads it.
//
// It answers for every state and territory at once, where the registry the
// ingest loads (incentive_zones) holds Maryland's zones alone unless a
// national layer is set — so with it, a tract off the list is off the list
// wherever the deal is, not "not checked" outside Maryland.

import list from "@/data/qoz-tracts.json";

/** Named on the card where a tract is on the list: whose list, and as of. */
export const QOZ_DATASET = "CDFI Fund list of designated Opportunity Zones (updated Dec 14, 2018)";

const LIC = new Set<string>(list.lic);
const CONTIGUOUS = new Set<string>(list.contiguous);

/** A designated tract's type as the list gives it — a low-income community,
 *  or a tract contiguous to one — or null for a tract not on the list (and
 *  for anything that is not an eleven-digit tract number). */
export function designatedTract(geoid: string | null | undefined): "lic" | "contiguous" | null {
  const g = String(geoid ?? "");
  if (!/^\d{11}$/.test(g)) return null;
  return LIC.has(g) ? "lic" : CONTIGUOUS.has(g) ? "contiguous" : null;
}

/** How many tracts the list holds (8,764 designated). */
export const QOZ_COUNT = LIC.size + CONTIGUOUS.size;

const BY_STATE = new Map<string, number>();
for (const g of [...LIC, ...CONTIGUOUS]) BY_STATE.set(g.slice(0, 2), (BY_STATE.get(g.slice(0, 2)) ?? 0) + 1);

/** How many designated tracts the list holds in a state, by its two-digit
 *  FIPS code — every state, the District and the territories have some, so
 *  a tract off the list in any of them is off it. */
export function designatedInState(stateFips: string): number {
  return BY_STATE.get(stateFips) ?? 0;
}
