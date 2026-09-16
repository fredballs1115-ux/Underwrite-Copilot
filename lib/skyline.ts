// The photograph each covered market is known by — PURE.
//
// The operator's rule (2026-09-16): "I need beautiful professional skyline
// photos of each market." An overhead aerial answers "where is it"; a
// skyline answers "what is it". On a market brief, a coverage tile or a
// page's opening band, the second question is the one the reader is
// asking, so those surfaces show a skyline. The overhead stays only where
// the subject is one specific building — a deal's header, the memo cover,
// the shared screen — because there the roof IS the asset.
//
// WHY WIKIMEDIA COMMONS. The site needs one photograph per market that we
// may publish commercially, that costs nothing per view, that needs no key,
// and that we can point at by name rather than by a signed URL that
// expires. Commons is the only source meeting all four. Each entry below
// names a specific file, its photographer and its licence, because every
// licence here except public domain REQUIRES visible attribution — that is
// what `credit` and `licenseUrl` are for, and why `SkylinePhoto` renders
// them beside the picture rather than burying them in a footer.
//
// EVERY FILE IS VERIFIED BEFORE IT LANDS. The sandbox these entries are
// written in cannot reach any image host (commons.wikimedia.org answers 403
// through its egress proxy), so a filename typed from memory would be a
// guess. live-verify's "SKYLINE" step resolves each file from the GitHub
// runner and prints its status, byte count and pixel size; an entry only
// joins this table after that run showed it resolving to a real image.
// `scripts/probe-skylines.mjs` is that probe — run it before adding a market.

/** One market's photograph, with everything its licence obliges us to show. */
export interface SkylineShot {
  /** exact Commons filename, no "File:" prefix — the route resolves it */
  file: string;
  /** what the photograph shows, for the alt text and the caption */
  place: string;
  /** the photographer, exactly as the licence requires them to be named */
  credit: string;
  /** the licence's short name, e.g. "CC BY-SA 4.0" or "Public domain" */
  license: string;
  /** where the licence text lives; empty for public domain */
  licenseUrl: string;
}

/**
 * Keyed by the `id` in data/research/metros.json. A market with no entry
 * is not a bug — it falls back to its overhead frame, which is why the
 * table can grow one verified photograph at a time.
 *
 * Every row below was printed by the probe running on the GitHub runner on
 * 2026-09-16: the filename, the pixel size, the media type, the
 * photographer and the licence are all what Commons itself returned, not
 * what anybody remembered. A credit written from memory is a licence breach
 * with a name attached, which is why this is the one table in the codebase
 * that may never be edited from the sandbox alone.
 *
 * WHAT IS NOT HERE, and why. Prince George's County, Montgomery County and
 * Northern Virginia have no entry: they are suburban submarkets, and a
 * submarket does not have a skyline the way a city does. The overhead frame
 * is the more honest picture of a place whose shape is the shape of its
 * land, so those three keep it rather than being given a photograph of some
 * arbitrary building that happens to stand there.
 */
export const SKYLINES: Record<string, SkylineShot> = {
  // The Height Act means Washington's skyline is the Mall, not a wall of
  // towers — so this is the picture the city is actually known by.
  dc: {
    file: "Aerial view National Mall 12 2014 DC 711.JPG",
    place: "The National Mall, Washington",
    credit: "Mariordo (Mario Roberto Durán Ortiz)",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  baltimore: {
    file: "Baltimore, Maryland skyline (cropped).jpg",
    place: "Baltimore",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  richmond: {
    file: "Skyline of Richmond, Virginia.jpg",
    place: "Richmond",
    credit: "Jim",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
  },
  norfolk_hampton_roads: {
    file: "Downtown Norfolk at Dusk.jpg",
    place: "Downtown Norfolk",
    credit: "Bruce Emmerling",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // The sample deal's own city, so this one carries /demo as well.
  philadelphia: {
    file: "Philadelphia skyline 20240528 (cropped).jpg",
    place: "Center City Philadelphia",
    credit: "颐园居",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  newark_jc: {
    file: "Jersey City Skyline September 2025 038 (cropped).jpg",
    place: "Jersey City",
    credit: "Kidfly182",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  nyc: {
    file: "View of Empire State Building from Rockefeller Center New York City dllu (cropped).jpg",
    place: "Midtown Manhattan",
    credit: "Dllu",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  boston: {
    file: "Boston skyline from Longfellow Bridge September 2017 panorama 2.jpg",
    place: "Back Bay, Boston",
    credit: "King of Hearts",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  chicago: {
    file: "Chicago Skyline in September 2023 pano.jpg",
    place: "Chicago",
    credit: "TheWxResearcher",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  los_angeles: {
    file: "Skyline of Los Angeles, Downtown Los Angeles, California 13.jpg",
    place: "Downtown Los Angeles",
    credit: "Levi Clancy",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  san_francisco: {
    file: "SF From Marin Highlands3.jpg",
    place: "San Francisco from the Marin Headlands",
    credit: "Paul.h",
    license: "Public domain",
    licenseUrl: "",
  },
  seattle: {
    file: "View of Downtown Seattle from Ella Bailey Park (27305770463).jpg",
    place: "Downtown Seattle",
    credit: "Tiffany Von Arnim",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
  },
  // Brickell rather than the whole bay: it is the submarket a CRE reader
  // means when they say Miami.
  miami: {
    file: "Brickell neighborhood skyline (60062p).jpg",
    place: "Brickell, Miami",
    credit: "Rhododendrites",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  atlanta: {
    file: "Atlanta, Georgia Skyline.jpg",
    place: "Atlanta",
    credit: "Shawn M. Kent",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // The better-looking Dallas candidate is a 6000px PNG, and a PNG
  // photograph at 1600px is megabytes where a JPEG is hundreds of
  // kilobytes. Page weight wins on a tile nobody stops to admire.
  dallas: {
    file: "IMAG2591-dallas-downtown.jpg",
    place: "Downtown Dallas",
    credit: "alfred twu",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  },
};

export function skylineFor(id: string): SkylineShot | null {
  return SKYLINES[id] ?? null;
}

/** Does this market have a verified photograph yet? */
export function hasSkyline(id: string): boolean {
  return id in SKYLINES;
}

/**
 * The widths the route will serve. A request for anything else is clamped,
 * so a caller cannot ask Commons for a 12000px render of every tile.
 */
export const SKYLINE_WIDTH = { min: 320, max: 2400, default: 1600 } as const;

/**
 * Where the bytes come from. `Special:FilePath` is Commons' stable
 * by-name redirect: it takes a filename and a width and answers with the
 * rendered thumbnail, so nothing here depends on the hashed storage path
 * that `upload.wikimedia.org` URLs carry (those change when a file is
 * re-uploaded; the name does not).
 */
export function commonsUrl(file: string, width: number): string {
  const w = Math.min(
    SKYLINE_WIDTH.max,
    Math.max(SKYLINE_WIDTH.min, Math.round(width) || SKYLINE_WIDTH.default),
  );
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
}

/** The page that documents the file, for the credit link. */
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}

/**
 * The one sentence a licence obliges us to print. Kept here rather than in
 * the component so the wording is identical everywhere it appears — on a
 * page, in the memo, and in any export that ever embeds one of these.
 */
export function creditLine(shot: SkylineShot): string {
  const author = shot.credit && shot.credit !== "unknown" ? shot.credit : "Wikimedia Commons";
  return `${shot.place} · ${author} · ${shot.license}`;
}
