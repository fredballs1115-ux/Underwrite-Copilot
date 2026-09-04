// Which real picture of a building wins, and what credit travels with it.
// PURE and universal — no I/O, no server-only import — so the product rule
// is testable on its own and the client can render the right attribution.
// The fetching lives in lib/imagery.ts, which re-exports all of this.

export type ImageSource = "streetview" | "aerial";

export interface ImagePlanInput {
  /** a street-level address; anything vaguer can't be photographed honestly */
  hasStreetAddress: boolean;
  /** GOOGLE_MAPS_API_KEY is set in this deployment */
  streetViewConfigured: boolean;
}

/**
 * Sources to try, best first.
 *
 * Street View is first because a photograph of the building's front is what
 * "a picture of this property" means to anyone in this business — but it
 * needs both a key and a street-level address, since Street View at a
 * neighborhood centroid returns some arbitrary block.
 *
 * The aerial is always last and always present: it needs no key and covers
 * every US address, which is what makes "every deal has a real picture" true
 * rather than conditional on someone buying a Google key.
 *
 * There is deliberately no third entry. A stock photo, an AI-generated
 * building or a scraped listing shot would all be a picture of something
 * that is not this property, which is worse than no picture.
 */
export function imagePlan(opts: ImagePlanInput): ImageSource[] {
  const plan: ImageSource[] = [];
  if (opts.hasStreetAddress && opts.streetViewConfigured) plan.push("streetview");
  plan.push("aerial");
  return plan;
}

/** Attribution that must travel with each source, wherever it is rendered. */
export const IMAGE_CREDIT: Record<ImageSource, string> = {
  streetview: "Street View imagery © Google",
  aerial: "Imagery: USGS The National Map",
};
