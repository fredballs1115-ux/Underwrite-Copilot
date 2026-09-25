// The pipeline on one map (#431): which deals can be drawn now, which are
// still to be placed, and how each pin and its hover card look. Pure and
// universal, so the client map and its tests read one set of rules.
//
// A deal is drawn only where its location has been resolved — the one
// geocode lib/deal-location caches for the aerial, the Street View and the
// deal page's map alike, so every pin sits exactly where the deal's own
// pictures were taken. A deal with an address and no location yet is placed
// on the map's first view through the same cached route (a bounded number,
// a few at a time); a deal no geocoder could place, or with no address,
// is counted and never guessed at.

export type LocationPrecision = "street" | "block" | "area";

export interface MapPlace {
  lat: number;
  lng: number;
  precision: LocationPrecision;
}

export interface MapDeal {
  id: string;
  name: string;
  /** "pass" | "caution" | "pass_on" | null */
  verdict: string | null;
  price: string | null;
  /** the cap, or a plan deal's yield on cost, already labelled */
  figure: string | null;
  /** the resolved location; null while none is cached */
  place: MapPlace | null;
  /** a geocoder definitively found nothing for the address */
  placeMiss?: boolean;
  hasAddress: boolean;
}

export interface MapPartition {
  placed: MapDeal[];
  /** an address and no location yet: placed on the map's first view */
  toPlace: MapDeal[];
  /** no address, or an address no geocoder could place */
  unplaceable: MapDeal[];
}

/** Deals asked of the location route on one view — the rest wait for their
 *  own page's first view, which places them for next time. */
export const MAX_TO_PLACE = 24;

export function partitionForMap(deals: MapDeal[]): MapPartition {
  const out: MapPartition = { placed: [], toPlace: [], unplaceable: [] };
  for (const d of deals) {
    if (d.place) out.placed.push(d);
    else if (d.hasAddress && !d.placeMiss) out.toPlace.push(d);
    else out.unplaceable.push(d);
  }
  return out;
}

/** A pin a call: the verdict's own colour, the neutral grey for a deal the
 *  screen has not called — the same four the pipeline's split bar draws. */
export const PIN_COLOR: Record<string, string> = {
  pass: "#1b7a5e",
  caution: "#a05a1c",
  pass_on: "#b23a30",
};
export const PIN_UNSCREENED = "#5f6b69";

export function pinColor(verdict: string | null): string {
  return (verdict && PIN_COLOR[verdict]) || PIN_UNSCREENED;
}

export const PIN_LABEL: Record<string, string> = { pass: "Go", caution: "Caution", pass_on: "No-go" };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The pin: a disc in the call's colour with a white ring, legible on a
 *  photograph and a street map alike; a placement vaguer than a street is
 *  hollow, since its centre is a district's, not a building's. A deal picked
 *  for comparison wears a second, brand-coloured ring. */
export function pinHtml(verdict: string | null, precision: LocationPrecision, selected = false): string {
  const c = pinColor(verdict);
  const street = precision === "street";
  const size = selected ? 30 : 22;
  const mid = size / 2;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    (selected ? `<circle cx="${mid}" cy="${mid}" r="${mid - 1.5}" fill="none" stroke="#114e54" stroke-width="3"/>` : "") +
    `<circle cx="${mid}" cy="${mid}" r="9" fill="${street ? c : "#ffffff"}" stroke="${street ? "#ffffff" : c}" stroke-width="2.5"/>` +
    `<circle cx="${mid}" cy="${mid}" r="2.6" fill="${street ? "#ffffff" : c}"/>` +
    `</svg>`
  );
}

/** The hover card: the building's picture, its name, its call and figures —
 *  every string escaped, since a deal's name is whatever its owner typed. */
export function tooltipHtml(d: MapDeal): string {
  const call = d.verdict && PIN_LABEL[d.verdict] ? PIN_LABEL[d.verdict] : "Not screened";
  const figures = [d.price, d.figure].filter((x): x is string => !!x).map(escapeHtml).join(" · ");
  const img = `/api/deals/${encodeURIComponent(d.id)}/image?w=96&amp;h=96`;
  return (
    `<div class="uc-maptip">` +
    `<img src="${img}" alt="" width="48" height="48" class="uc-maptip-img"/>` +
    `<div class="uc-maptip-body">` +
    `<div class="uc-maptip-name">${escapeHtml(d.name)}</div>` +
    `<div class="uc-maptip-meta"><span style="color:${pinColor(d.verdict)};font-weight:600">${call}</span>${figures ? ` · ${figures}` : ""}</div>` +
    `</div></div>`
  );
}

/** The counts said under the map, in plain words: every deal the filters
 *  leave is in exactly one of the four. */
export function placementLine(p: { placed: number; placing: number; later: number; unplaceable: number }): string {
  const total = p.placed + p.placing + p.later + p.unplaceable;
  const parts = [`${p.placed} of ${total} ${total === 1 ? "deal" : "deals"} on the map`];
  if (p.placing > 0) parts.push(`${p.placing} being placed`);
  if (p.later > 0) parts.push(`${p.later} placed when first opened`);
  if (p.unplaceable > 0) parts.push(`${p.unplaceable} with no address a geocoder could place`);
  return parts.join(" · ");
}
