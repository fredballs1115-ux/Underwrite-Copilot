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

import { PIPELINE_MAP_PICTURE } from "@/lib/image-frames";

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

/** The card's inside, shared by the hover card and the touch preview. */
function cardBody(d: MapDeal): string {
  const call = d.verdict && PIN_LABEL[d.verdict] ? PIN_LABEL[d.verdict] : "Not screened";
  const figures = [d.price, d.figure].filter((x): x is string => !!x).map(escapeHtml).join(" · ");
  // The route's own frame for the card (lib/image-frames), twice its 48px —
  // never a Google picture, since the card sits over a non-Google map
  // (Google's terms: no Street View beside one; lib/imagery-plan `google`).
  const img = `/api/deals/${encodeURIComponent(d.id)}/image?w=${PIPELINE_MAP_PICTURE.w}&amp;h=${PIPELINE_MAP_PICTURE.h}&amp;fallback=cover&amp;google=0`;
  return (
    `<img src="${img}" alt="" width="48" height="48" class="uc-maptip-img"/>` +
    `<div class="uc-maptip-body">` +
    `<div class="uc-maptip-name">${escapeHtml(d.name)}</div>` +
    `<div class="uc-maptip-meta"><span style="color:${pinColor(d.verdict)};font-weight:600">${call}</span>${figures ? ` · ${figures}` : ""}</div>` +
    `</div>`
  );
}

/** The hover card: the building's picture, its name, its call and figures —
 *  every string escaped, since a deal's name is whatever its owner typed.
 *  The picture is the building's photograph or the deal's cover, never an
 *  overhead (#443): the map is already the view from above. */
export function tooltipHtml(d: MapDeal): string {
  return `<div class="uc-maptip">${cardBody(d)}</div>`;
}

/** The same card on a touch screen, which has no hover: a pin's first tap
 *  opens it as a popup, and the whole card is a link into the deal, its
 *  chevron saying so. Escaped as the hover card is; the id is encoded. */
export function previewHtml(d: MapDeal): string {
  return (
    `<a class="uc-maptip" href="/deals/${encodeURIComponent(d.id)}" data-maptip-link>` +
    cardBody(d) +
    `<svg class="uc-maptip-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>` +
    `</a>`
  );
}

/**
 * What a click on a pin does. On a device whose main pointer is a mouse the
 * card shows on hover and a click opens the deal — or picks it, in compare
 * mode. A touch screen (a coarse pointer) has no hover, so a finger's first
 * tap on a pin shows the card, and a second tap — on the same pin, or on the
 * card — opens the deal. A click with no finger behind it (a keyboard, a
 * screen reader, a mouse on a touch-first tablet, which gets no hover card)
 * opens at once, and compare mode picks at once, with no card, as it always
 * has.
 */
export function pinTapAction(t: {
  /** the device's main pointer is coarse: `(pointer: coarse)` */
  coarse: boolean;
  compare: boolean;
  /** the pointer that pressed this pin ("touch", "mouse", "pen"), or null */
  pointer: string | null;
  /** this pin's card was already open when the finger came down */
  previewOpen: boolean;
}): "preview" | "open" {
  if (!t.coarse || t.compare) return "open";
  return t.pointer === "touch" && !t.previewOpen ? "preview" : "open";
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
