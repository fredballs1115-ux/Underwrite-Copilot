// A stored photograph's point of interest — where its frame is held when a
// page crops it.
//
// Every stored photograph is drawn cropped somewhere: a 16:10 card, the deal
// header's 21:9 band, a mosaic tile, the shared screen's 12:5 strip. Held at
// the centre, a building standing left of the middle loses its roofline to a
// wide band and its entrance to a tall tile. So when a photograph's
// derivatives are made, sharp's attention crop — the same analysis that cuts
// its 240px thumbnail (luminance frequency, saturation, skin) — says where
// its subject is, and the point is kept with the picture's record as a share
// of the whole frame (lib/deal-picture `focusOf`). Wherever the page crops
// the whole frame, it is the frame's `object-position`, and the blur-up
// preview's `background-position` beside it: the point keeps the same place
// in every frame it is cropped to (a subject a fifth of the way in stands a
// fifth of the way into the card, the band and the tile), so no crop the
// page makes ever cuts it out. A picture with no point keeps the centre.
//
// Pure and universal: the point is found server-side with sharp; this only
// checks one and says it in CSS.

/** Where a photograph's subject is: shares of its whole frame's width and
 *  height, from its top left (0 to 1). */
export interface PhotoFocus {
  x: number;
  y: number;
}

/** Whether a value is a point this site kept: two finite shares, each 0 to
 *  1 — it goes into a style attribute. */
export function isFocus(v: unknown): v is PhotoFocus {
  if (!v || typeof v !== "object") return false;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;

/** The point as a CSS position ("20.3% 28.1%"), for `object-position` and
 *  `background-position`; undefined where there is none, which is the
 *  centre. */
export function focusPosition(focus: unknown): string | undefined {
  return isFocus(focus) ? `${pct(focus.x)} ${pct(focus.y)}` : undefined;
}

/** The style that holds a cropped photograph at its point; undefined where
 *  it has none. */
export function focusStyle(focus: unknown): { objectPosition: string } | undefined {
  const at = focusPosition(focus);
  return at ? { objectPosition: at } : undefined;
}

/**
 * The point inside the photograph's 240px thumbnail, which sharp cut as a
 * square around the same point — so a thumbnail a page crops again (the deal
 * page's filmstrip is wider than it is tall) is held where its subject is.
 * The square keeps the photograph's short side whole and centres the long
 * side's window on the point, stopping at the edges: along the short side
 * the point is where it was; along the long side it is the point's place in
 * that window. Undefined where there is no point or no size.
 */
export function thumbFocus(
  focus: unknown,
  size: { width?: number | null; height?: number | null } | null | undefined,
): PhotoFocus | undefined {
  if (!isFocus(focus)) return undefined;
  const w = size?.width ?? 0;
  const h = size?.height ?? 0;
  if (!(w > 0 && h > 0)) return undefined;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const round = (v: number) => Math.round(clamp(v, 0, 1) * 1000) / 1000;
  if (w > h) {
    // The window is the height's width: a share h / w of the frame across.
    const win = h / w;
    const left = clamp(focus.x - win / 2, 0, 1 - win);
    return { x: round((focus.x - left) / win), y: focus.y };
  }
  if (h > w) {
    const win = w / h;
    const top = clamp(focus.y - win / 2, 0, 1 - win);
    return { x: focus.x, y: round((focus.y - top) / win) };
  }
  return { x: focus.x, y: focus.y };
}
