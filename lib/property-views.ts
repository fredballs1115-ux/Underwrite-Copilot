// What sits on which of the deal page's picture views (app/(app)/deals/[id]/
// property-visual.tsx, research pass 29). Pure and import-free, so the rules
// are tested without a page to click through and the client component
// carries nothing with them.

/** A view's id, as PropertyVisual names them: "photo", "g1"…, "street",
 *  "market", "satellite", "aerial", "flood", "map". */
export type PictureView = string;

/**
 * Whether the reader's photo control sits on the view on screen.
 *
 * "Replace photo" replaces the deal's own photograph, so where the deal has
 * one it sits on the photographs only: the cover, a gallery photograph, and
 * the mosaic's cover tile, which carries its own (`mosaic`, while the cover
 * is the view on screen). Over FEMA's flood map it read as "replace this
 * map", and over the aerial much the same. Where the deal has no photograph
 * of its own on screen, the control reads "Add photo" and is the only way to
 * put one there, so it stays on the picture that leads (the market's
 * photograph, Street View, the aerial) — never over the flood map, and never
 * over the map, whose corner is its own controls'.
 */
export function photoControlOn(
  view: PictureView,
  f: { photos: readonly PictureView[]; ownPhoto: boolean; mosaic: boolean },
): boolean {
  if (view === "map" || view === "flood") return false;
  if (!f.ownPhoto) return true;
  return f.photos.includes(view) && !(f.mosaic && view === "photo");
}

/**
 * The views the filmstrip leaves out from the header's @2xl, where the
 * mosaic draws the cover and the two photographs beside it (`mosaic`, the
 * cover first): a listing shows a photograph once, and the strip had shown
 * Photo 1–3 again under the mosaic. Only while the mosaic is the view on
 * screen — with another view open the mosaic is not drawn, and the strip
 * keeps every photograph, the way back to them included. Every other view
 * stays; below @2xl, where there is no mosaic, the page shows the strip
 * whole whatever this says.
 */
export function mosaicRepeats(
  views: readonly PictureView[],
  f: { mosaic: readonly PictureView[]; active: PictureView },
): Set<PictureView> {
  const onScreen = f.mosaic.length > 0 && f.active === f.mosaic[0];
  return new Set(onScreen ? views.filter((v) => f.mosaic.includes(v)) : []);
}
