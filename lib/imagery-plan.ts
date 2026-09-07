// Which real picture of a building wins, how tightly to frame it, and what
// credit travels with it. PURE and universal — no I/O, no server-only import
// — so the product rules are testable on their own and the client can render
// the right attribution. Fetching lives in lib/imagery.ts, which re-exports
// all of this.

export type ImageSource = "streetview" | "satellite" | "aerial";

export interface ImagePlanInput {
  /** a street-level address; anything vaguer can't be photographed honestly */
  hasStreetAddress: boolean;
  /** GOOGLE_MAPS_API_KEY is set in this deployment */
  googleConfigured: boolean;
}

/**
 * Sources to try, best first.
 *
 *  1. STREET VIEW — an actual photograph of the building's front. Needs a key
 *     AND a street-level address, since Street View at a neighborhood
 *     centroid returns some arbitrary block.
 *  2. GOOGLE SATELLITE — ~0.15 m/px in cities, which is what makes a building
 *     legible from above. Needs the same key (Maps Static API enabled).
 *  3. USGS AERIAL — public domain, no key, so every US address gets SOMETHING
 *     real. But NAIP is natively 0.6-1.0 m/px, so it can frame a site and not
 *     much tighter (see MAX_SOURCE_ZOOM). It is the floor, not the goal.
 *
 * There is deliberately no fourth entry. A stock photo, an AI-generated
 * building or a scraped listing shot are all pictures of something that is
 * not this property, which is worse than no picture.
 */
export function imagePlan(opts: ImagePlanInput): ImageSource[] {
  const plan: ImageSource[] = [];
  if (opts.hasStreetAddress && opts.googleConfigured) plan.push("streetview");
  if (opts.googleConfigured) plan.push("satellite");
  plan.push("aerial");
  return plan;
}

/** Overhead sources only, best first — backs the "Aerial" tab, which means
 *  "the view from above" rather than "whatever picture we can find". */
export function aerialPlan(opts: { googleConfigured: boolean }): ImageSource[] {
  return opts.googleConfigured ? ["satellite", "aerial"] : ["aerial"];
}

/**
 * How much the geocoder actually pinned down — read off the geocoder's
 * RESULT, never assumed from the input (lib/geocode).
 *
 *   street — an address point or a Census address-range match: the right
 *            building's side of the right street. Frame the building.
 *   block  — the street centreline only: the right road, house number not
 *            in the map data. Frame the block; never call it the building.
 *   area   — a city, district or postcode. Frame the district.
 */
export type LocationPrecision = "street" | "block" | "area";

/** Metres of projected space per pixel at zoom 0, 256px tiles. */
const RES_Z0 = (2 * Math.PI * 6378137) / 256;

/**
 * How wide a frame each precision deserves, in metres of ground.
 *
 * A street address gets ~140m: a building, its parking and enough of the
 * neighbours to read the context. A block-level placement gets ~400m — a
 * few parcels either way of a point that is somewhere along the right road.
 * An area-level placement gets ~1.5km, which is a district — the most such a
 * placement can honestly claim.
 */
export const FRAME_METRES: Record<LocationPrecision, number> = {
  street: 140,
  block: 400,
  area: 1500,
};

/** The deepest zoom each source can actually serve without inventing detail. */
export const MAX_SOURCE_ZOOM: Record<ImageSource, number> = {
  // Google's satellite runs ~0.15 m/px in cities.
  satellite: 20,
  // USGS is fetched through the National Map's bbox EXPORT endpoint, which
  // resamples from the best orthoimagery it holds for that spot. Nationally
  // that is NAIP at 0.6–1.0 m/px, but across the metros this product covers
  // the service carries high-resolution orthos at 0.3 m/px and finer. Capping
  // at z18 (~0.6 m/px) threw that away everywhere it existed, which is why
  // every aerial looked like a soft NAIP frame even downtown. z19 asks for
  // ~0.3 m/px: sharp where the data is there, and where it is not the server
  // returns the same NAIP it would have anyway.
  aerial: 19,
  // Not an overhead source; present so the record is total.
  streetview: 20,
};

/**
 * Initial compass bearing from one point to another, in degrees clockwise
 * from north — the `heading` a Street View camera at `from` needs to look at
 * `to`. Standard great-circle formula; fine at the scale of one street.
 */
export function bearingDeg(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const MIN_ZOOM = 12;

/**
 * The zoom that frames `frameMetres` of ground across an image `widthPx`
 * wide, clamped to what the source can actually serve.
 *
 * This has to depend on the pixel width, which the first cut got wrong: with
 * a FIXED zoom, a 96px thumbnail at z20 covers about 7 metres — a patch of
 * roof — while a 1280px hero at the same zoom covers 150m. Same zoom, wildly
 * different pictures. Ground coverage is what should stay constant.
 */
export function frameZoom(opts: {
  widthPx: number;
  /** latitude, because Mercator's scale stretches with cos(lat) */
  lat: number;
  precision: LocationPrecision;
  source: ImageSource;
  /** override the default frame width for this precision */
  frameMetres?: number;
}): number {
  const metres = opts.frameMetres ?? FRAME_METRES[opts.precision];
  const cos = Math.cos((Math.max(-85, Math.min(85, opts.lat)) * Math.PI) / 180);
  // widthPx * (RES_Z0 / 2^z) * cos(lat) = metres  →  solve for z
  const z = Math.log2((RES_Z0 * cos * Math.max(1, opts.widthPx)) / metres);
  const capped = Math.min(z, MAX_SOURCE_ZOOM[opts.source]);
  return Math.max(MIN_ZOOM, Math.round(capped));
}

/** Attribution that must travel with each source, wherever it is rendered. */
export const IMAGE_CREDIT: Record<ImageSource, string> = {
  streetview: "Street View imagery © Google",
  satellite: "Satellite imagery © Google",
  aerial: "Imagery: USGS The National Map",
};
